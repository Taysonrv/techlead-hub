import axios from "axios";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { MovideskJsonImportService } from "./MovideskJsonImportService";
import { isSimerClient, SIMER_CLIENTS } from "../domain/OperationalScope";

const PAGE_SIZE = 50;
const REQUEST_INTERVAL_MS = 6_200;
const INCREMENTAL_OVERLAP_MINUTES = 10;
const REQUEST_RETRY_ATTEMPTS = 6;
const REQUEST_RETRY_BASE_MS = 2_000;
const OFFSET_TO_CURSOR_THRESHOLD = 9_000;
const BASELINE_CHECKPOINT_ACTION = "MOVIDESK_SCOPED_BASELINE_CHECKPOINT_2026_V4";
const BASELINE_COMPLETED_ACTION = "MOVIDESK_SCOPED_BASELINE_COMPLETED_2026_V4";
const SYNC_SCOPE_START = new Date("2026-01-01T00:00:00.000Z");
const BASELINE_FAILED_ACTION = "MOVIDESK_BASELINE_FAILED";

function normalizeMovideskDateTimeOffset(value: string) {
  const trimmed = value.trim();
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed) ? trimmed : `${trimmed}Z`;
  const parsed = new Date(withTimezone);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Data/hora inválida recebida do Movidesk para cursor: ${value}`);
  }
  return parsed.toISOString();
}

function normalizeMovideskToken(raw?: string | null) {
  if (!raw) return "";
  let value = raw.trim();

  // Aceita tanto o token puro quanto valores copiados como "token=..." ou
  // a URL completa de uma chamada da API. O segredo nunca é registrado.
  const urlToken = value.match(/[?&]token=([^&#\s]+)/i)?.[1];
  if (urlToken) value = urlToken;

  value = value.replace(/^token\s*=\s*/i, "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value;
}

const TICKET_SELECT = [
  "id", "protocol", "subject", "category", "urgency", "status", "baseStatus",
  "justification", "createdDate", "lastUpdate", "lastActionDate", "resolvedIn",
  "closedIn", "canceledIn", "reopenedIn", "actionCount", "resolvedInFirstCall",
  "ownerTeam", "serviceFirstLevel", "serviceSecondLevel", "serviceThirdLevel",
  "slaAgreement", "slaAgreementRule", "slaSolutionTime", "slaResponseTime",
  "slaSolutionDate", "slaResponseDate", "slaRealResponseDate",
  "slaSolutionDateIsPaused", "lifeTimeWorkingTime", "stoppedTime",
  "stoppedTimeWorkingTime", "origin", "isDeleted"
].join(",");

// O baseline operacional usa somente expansões necessárias ao modelo atual.
 // Ações/históricos/satisfação serão enriquecidos em fluxo separado para evitar
 // respostas muito grandes e ECONNRESET na API do Movidesk.
const TICKET_EXPAND = [
  "owner", "createdBy", "clients($expand=organization)", "customFieldValues"
].join(",");

type SyncSummary = {
  mode: "FULL" | "INCREMENTAL";
  pages: number;
  totalRows: number;
  created: number;
  updated: number;
  ignored: number;
  errors: number;
  since: string | null;
};

type BaselineState = {
  status: "IDLE" | "RUNNING" | "SUCCESS" | "ERROR";
  startedAt: string | null;
  finishedAt: string | null;
  result: SyncSummary | null;
  error: string | null;
  progress: {
    nextSkip: number;
    pages: number;
    processedRows: number;
    created: number;
    updated: number;
    ignored: number;
    errors: number;
    resumed: boolean;
  } | null;
};

let baselineState: BaselineState = {
  status: "IDLE",
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
  progress: null,
};
let baselinePromise: Promise<void> | null = null;

export class MovideskService {
  private readonly url = process.env.MOVIDESK_URL?.trim() || "https://api.movidesk.com/public/v1";

  private token() {
    const token = normalizeMovideskToken(process.env.MOVIDESK_TOKEN);
    if (!token) throw new Error("Movidesk não configurado. Informe o token em Configurações > Movidesk.");
    return token;
  }

  private odataString(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private remoteClientScopeFilter() {
    const clients = SIMER_CLIENTS.map(
      (client) => `c/organization/businessName eq ${this.odataString(client)}`,
    ).join(" or ");
    return `clients/any(c: ${clients})`;
  }

  private remoteScopeFilter(extra?: string | null) {
    const filters = [
      `createdDate ge ${SYNC_SCOPE_START.toISOString()}`,
      this.remoteClientScopeFilter(),
      extra?.trim() || null,
    ].filter((value): value is string => Boolean(value));
    return filters.map((value) => `(${value})`).join(" and ");
  }

  private async validateRemoteScopeFilter() {
    const filter = this.remoteScopeFilter();
    try {
      const response = await this.getWithRetry(`${this.url}/tickets`, {
        params: {
          token: this.token(),
          $select: "id,createdDate",
          $expand: "clients($expand=organization)",
          $orderby: "lastUpdate asc,id asc",
          $top: 1,
          $filter: filter,
        },
        timeout: 120_000,
      }, "pré-validação do escopo remoto SIMER");
      if (!Array.isArray(response.data)) {
        throw new Error("Resposta inesperada da API Movidesk na pré-validação do escopo.");
      }
      console.info(`[movidesk-sync] Escopo remoto validado | início=${SYNC_SCOPE_START.toISOString()} | clientes=${SIMER_CLIENTS.length}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "falha desconhecida";
      throw new Error(
        `O FULL foi bloqueado antes da varredura porque o endpoint de tickets não aceitou o filtro remoto de clientes SIMER. Nenhum fallback para toda a base será executado. Detalhe: ${message}`,
      );
    }
  }

  private async getWithRetry(url: string, config: Parameters<typeof axios.get>[1], context: string) {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= REQUEST_RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await axios.get(url, config);
      } catch (error) {
        lastError = error;
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const code = axios.isAxiosError(error) ? error.code : undefined;
        const retryable = code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNABORTED" || status === 429 || (typeof status === "number" && status >= 500);
        if (!retryable || attempt === REQUEST_RETRY_ATTEMPTS) {
          const remoteMessage = axios.isAxiosError(error)
            ? typeof error.response?.data === "string"
              ? error.response.data.slice(0, 300)
              : error.response?.data
                ? JSON.stringify(error.response.data).slice(0, 300)
                : error.message
            : error instanceof Error ? error.message : "falha desconhecida";
          throw new Error(`${context}: falha após ${attempt} tentativa(s) (${code ?? status ?? "rede"}). ${remoteMessage}`);
        }
        const retryAfterSeconds = axios.isAxiosError(error) ? Number(error.response?.headers?.["retry-after"]) : NaN;
        const delay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : REQUEST_RETRY_BASE_MS * 2 ** (attempt - 1);
        console.warn(`[movidesk-api] ${context}: tentativa ${attempt}/${REQUEST_RETRY_ATTEMPTS} falhou (${code ?? status ?? "rede"}). Nova tentativa em ${Math.round(delay / 1000)}s.`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  async testConnection() {
    const token = this.token();
    const tokenDiagnostic = {
      length: token.length,
      fingerprint: crypto.createHash("sha256").update(token, "utf8").digest("hex").slice(0, 12),
    };
    const request = async (mode: "BEARER" | "QUERY") => {
      const query = new URLSearchParams();
      query.set("$select", "id,lastUpdate");
      query.set("$top", "1");
      if (mode === "QUERY") query.set("token", token);
      return axios.get(`${this.url}/tickets?${query.toString()}`, {
        headers: mode === "BEARER" ? { Authorization: `Bearer ${token}` } : undefined,
        timeout: 30_000,
      });
    };

    let bearerError: unknown = null;
    try {
      const response = await request("BEARER");
      return { ok: true, endpoint: this.url, authentication: "BEARER", sampleCount: Array.isArray(response.data) ? response.data.length : 0 };
    } catch (error) {
      bearerError = error;
      if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error;
    }

    try {
      const response = await request("QUERY");
      return { ok: true, endpoint: this.url, authentication: "QUERY", sampleCount: Array.isArray(response.data) ? response.data.length : 0 };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const remote = error.response?.data;
        const remoteMessage =
          typeof remote === "string"
            ? remote.slice(0, 500)
            : remote && typeof remote === "object"
              ? JSON.stringify(remote).slice(0, 500)
              : error.message;
        if (status === 401 && axios.isAxiosError(bearerError) && bearerError.response?.status === 401) {
          throw new Error(`Movidesk rejeitou a credencial nos dois formatos suportados (Bearer e parâmetro token), ambos com HTTP 401. Token carregado pelo backend: comprimento ${tokenDiagnostic.length}, fingerprint SHA-256 ${tokenDiagnostic.fingerprint}. Nenhum caractere do token foi exposto.`);
        }
        throw new Error(`Movidesk respondeu${status ? ` HTTP ${status}` : ""}: ${remoteMessage}`);
      }
      throw error;
    }
  }

  async analyticalMetadataTimeline(start: Date, end: Date) {
    const tickets = await prisma.ticket.findMany({
      where: {
        createdDate: { gte: start, lte: end },
        client: { in: [...SIMER_CLIENTS], mode: "insensitive" },
        isDeleted: false,
      },
      select: {
        movideskId: true, createdDate: true, category: true,
        cause: true, reason: true, businessArea: true,
      },
      orderBy: [{ createdDate: "asc" }, { movideskId: "asc" }],
    });

    const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const rows = new Map<string, { month:string; tickets:number; problems:number; causes:number; doubts:number; reasons:number; businessAreas:number }>();
    const ensure = (key: string) => {
      const existing = rows.get(key);
      if (existing) return existing;
      const created = { month:key, tickets:0, problems:0, causes:0, doubts:0, reasons:0, businessAreas:0 };
      rows.set(key, created);
      return created;
    };
    for (const ticket of tickets) {
      const row = ensure(monthKey(ticket.createdDate));
      row.tickets += 1;
      if (ticket.category?.trim().toLocaleLowerCase("pt-BR") === "problema") {
        row.problems += 1;
        if (ticket.cause?.trim()) row.causes += 1;
      }
      if (ticket.category?.trim().toLocaleLowerCase("pt-BR") === "dúvida" || ticket.category?.trim().toLocaleLowerCase("pt-BR") === "duvida") {
        row.doubts += 1;
        if (ticket.reason?.trim()) row.reasons += 1;
      }
      if (ticket.businessArea?.trim()) row.businessAreas += 1;
    }

    const pct = (value:number,total:number) => total ? Number((value / total * 100).toFixed(1)) : 0;
    const months = [...rows.values()].map((row) => ({
      ...row,
      causeCoveragePct: pct(row.causes, row.problems),
      reasonCoveragePct: pct(row.reasons, row.doubts),
      businessAreaCoveragePct: pct(row.businessAreas, row.tickets),
    }));

    const lastWith = (field: "cause"|"reason"|"businessArea") => {
      const found = [...tickets].reverse().find((ticket) => {
        if (!ticket[field]?.trim()) return false;
        const category = ticket.category?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
        if (field === "cause") return category === "problema";
        if (field === "reason") return category === "duvida";
        return true;
      });
      return found ? { movideskId: found.movideskId, createdDate: found.createdDate, value: found[field] } : null;
    };
    const firstMissingAfter = (last: { createdDate: Date } | null, field: "cause"|"reason"|"businessArea", category?: "problema"|"duvida") => {
      if (!last) return null;
      const found = tickets.find((ticket) => {
        if (ticket.createdDate <= last.createdDate || ticket[field]?.trim()) return false;
        const normalized = ticket.category?.trim().toLocaleLowerCase("pt-BR");
        return !category || (category === "problema" ? normalized === "problema" : normalized === "dúvida" || normalized === "duvida");
      });
      return found ? { movideskId: found.movideskId, createdDate: found.createdDate, category: found.category } : null;
    };
    const last = { cause: lastWith("cause"), reason: lastWith("reason"), businessArea: lastWith("businessArea") };

    return {
      readOnly: true,
      period: { start, end, tickets: tickets.length },
      months,
      lastKnown: last,
      firstMissingAfterLastKnown: {
        cause: firstMissingAfter(last.cause, "cause", "problema"),
        reason: firstMissingAfter(last.reason, "reason", "duvida"),
        businessArea: firstMissingAfter(last.businessArea, "businessArea"),
      },
      suggestedDiagnosticTickets: [...new Set([
        last.cause?.movideskId, last.reason?.movideskId, last.businessArea?.movideskId,
        firstMissingAfter(last.cause, "cause", "problema")?.movideskId,
        firstMissingAfter(last.reason, "reason", "duvida")?.movideskId,
        firstMissingAfter(last.businessArea, "businessArea")?.movideskId,
      ].filter((id): id is number => typeof id === "number"))].slice(0, 10),
      note: "Leitura local do escopo SIMER. Causa usa apenas Problema; Motivo usa apenas Dúvida; Área usa todos os tickets.",
    };
  }

  async diagnoseAnalyticalMetadata(ticketIds: number[]) {
    const ids = [...new Set(ticketIds.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 10);
    if (!ids.length) throw new Error("Informe ao menos um ticket válido para o diagnóstico.");

    const local = await prisma.ticket.findMany({
      where: {
        movideskId: { in: ids },
        createdDate: { gte: SYNC_SCOPE_START },
        client: { in: [...SIMER_CLIENTS], mode: "insensitive" },
      },
      select: {
        movideskId: true, createdDate: true, lastUpdate: true, category: true,
        client: true, cause: true, reason: true, businessArea: true, rawData: true,
      },
    });
    const localById = new Map(local.map((ticket) => [ticket.movideskId, ticket]));

    const sanitizeFields = (row: Record<string, unknown> | null) => {
      const fields = row && Array.isArray(row.customFieldValues) ? row.customFieldValues : [];
      return fields.flatMap((rawField) => {
        if (!rawField || typeof rawField !== "object" || Array.isArray(rawField)) return [];
        const field = rawField as Record<string, unknown>;
        const id = Number(field.customFieldId);
        const values = [
          typeof field.value === "string" ? field.value.trim() : null,
          ...(Array.isArray(field.items) ? field.items.map((item) =>
            item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).customFieldItem === "string"
              ? String((item as Record<string, unknown>).customFieldItem).trim()
              : null
          ) : []),
        ].filter((value): value is string => Boolean(value));
        if (!Number.isSafeInteger(id) || !values.length) return [];
        return [{ customFieldId: id, values: [...new Set(values)].slice(0, 8) }];
      });
    };

    const results = [];
    for (const id of ids) {
      const ticket = localById.get(id);
      if (!ticket) {
        results.push({ movideskId: id, foundLocally: false, error: "Ticket fora do escopo SIMER/2026 ou não sincronizado." });
        continue;
      }
      try {
        const response = await this.getWithRetry(`${this.url}/tickets`, {
          params: {
            token: this.token(),
            $select: "id,category,createdDate,lastUpdate",
            $expand: "customFieldValues",
            $top: 1,
            $filter: `id eq ${id}`,
          },
          timeout: 120_000,
        }, `diagnóstico de metadados ticket=${id}`);
        const remote = Array.isArray(response.data) && response.data[0] && typeof response.data[0] === "object"
          ? response.data[0] as Record<string, unknown>
          : null;
        const raw = ticket.rawData && typeof ticket.rawData === "object" && !Array.isArray(ticket.rawData)
          ? ticket.rawData as Record<string, unknown>
          : null;
        const remoteFields = sanitizeFields(remote);
        const rawFields = sanitizeFields(raw);
        results.push({
          movideskId: id,
          foundLocally: true,
          local: {
            createdDate: ticket.createdDate, lastUpdate: ticket.lastUpdate, category: ticket.category,
            client: ticket.client, cause: ticket.cause, reason: ticket.reason, businessArea: ticket.businessArea,
            rawCustomFields: rawFields,
          },
          remote: {
            found: Boolean(remote),
            category: typeof remote?.category === "string" ? remote.category : null,
            createdDate: remote?.createdDate ?? null,
            lastUpdate: remote?.lastUpdate ?? null,
            causeDetected: remote ? this.classificationFromRaw(remote, "cause") : null,
            reasonDetected: remote ? this.classificationFromRaw(remote, "reason") : null,
            customFields: remoteFields,
          },
          delta: {
            rawHasCustomFields: rawFields.length > 0,
            remoteHasCustomFields: remoteFields.length > 0,
            customFieldIdsOnlyRemote: remoteFields.map((field) => field.customFieldId).filter((fieldId) => !rawFields.some((field) => field.customFieldId === fieldId)),
          },
        });
      } catch (error) {
        results.push({
          movideskId: id, foundLocally: true,
          error: error instanceof Error ? error.message.replace(/token=[^&\\s]+/gi, "token=[REDACTED]").slice(0, 500) : "Falha desconhecida.",
        });
      }
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
    }

    return {
      readOnly: true,
      expectedCustomFields: { cause: 52401, reason: 52413, businessArea: 207467 },
      tickets: results,
      note: "Diagnóstico somente leitura: compara banco/rawData com o payload atual do Movidesk e não altera tickets.",
    };
  }

  async diagnoseApiCatalog() {
    const probes = [
      { resource: "persons", path: "/persons", params: { $select: "id,businessName,personType,profileType,isActive", $top: 1 } },
      { resource: "services", path: "/services", params: { $select: "id,name,parentServiceId,isActive,defaultCategory,defaultUrgency", $top: 1 } },
      { resource: "survey.questions", path: "/survey/questions", params: {} },
      { resource: "survey.responses.2026", path: "/survey/responses", params: { responseDateGreaterThan: "2026-01-01", limit: 1 } },
    ] as const;

    const results: Array<{
      resource: string;
      supported: boolean;
      shape: string | null;
      count: number | null;
      hasMore: boolean | null;
      keys: string[];
      sample: unknown;
      error: string | null;
    }> = [];

    const sanitize = (value: unknown, depth = 0): unknown => {
      if (depth > 2 || value === null || value === undefined) return value ?? null;
      if (Array.isArray(value)) return value.slice(0, 1).map((item) => sanitize(item, depth + 1));
      if (typeof value !== "object") return typeof value === "string" && value.length > 180 ? `${value.slice(0, 180)}…` : value;
      const output: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
        if (/token|password|email|phone|address|cpf|cnpj|cep/i.test(key)) continue;
        output[key] = sanitize(item, depth + 1);
      }
      return output;
    };

    for (const probe of probes) {
      try {
        const response = await this.getWithRetry(`${this.url}${probe.path}`, {
          params: { token: this.token(), ...probe.params },
          timeout: 120_000,
        }, `catálogo API ${probe.resource}`);
        const data = response.data as unknown;
        const objectData = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
        const items = Array.isArray(data)
          ? data
          : objectData && Array.isArray(objectData.items)
            ? objectData.items
            : [];
        const first = items[0] ?? (objectData && !("items" in objectData) ? objectData : null);
        const firstObject = first && typeof first === "object" && !Array.isArray(first) ? first as Record<string, unknown> : null;
        results.push({
          resource: probe.resource,
          supported: true,
          shape: Array.isArray(data) ? "array" : objectData && Array.isArray(objectData.items) ? "paged-object" : typeof data,
          count: items.length,
          hasMore: objectData && typeof objectData.hasMore === "boolean" ? objectData.hasMore : null,
          keys: firstObject ? Object.keys(firstObject).sort() : [],
          sample: sanitize(first),
          error: null,
        });
      } catch (error) {
        results.push({
          resource: probe.resource,
          supported: false,
          shape: null,
          count: null,
          hasMore: null,
          keys: [],
          sample: null,
          error: error instanceof Error ? error.message.replace(/token=[^&\\s]+/gi, "token=[REDACTED]").slice(0, 500) : "Falha desconhecida.",
        });
      }
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
    }

    return {
      readOnly: true,
      scope: { startDate: SYNC_SCOPE_START.toISOString(), clients: [...SIMER_CLIENTS] },
      results,
      note: "Sonda de catálogo: valida acesso e formato com amostras mínimas; não persiste dados.",
    };
  }

  async diagnoseTicketEnrichment(ticketId?: number | null) {
    const scopedTicket = ticketId
      ? await prisma.ticket.findFirst({
          where: { movideskId: ticketId, createdDate: { gte: SYNC_SCOPE_START }, client: { in: [...SIMER_CLIENTS], mode: "insensitive" } },
          select: { movideskId: true, client: true, contact: true },
        })
      : await prisma.ticket.findFirst({
          where: { createdDate: { gte: SYNC_SCOPE_START }, client: { in: [...SIMER_CLIENTS], mode: "insensitive" } },
          orderBy: { lastUpdate: "desc" },
          select: { movideskId: true, client: true, contact: true },
        });
    if (!scopedTicket) throw new Error("Nenhum ticket do escopo SIMER/2026 foi encontrado para diagnóstico.");

    const candidates = [
      { resource: "actions", expand: "actions" },
      { resource: "actions.createdBy", expand: "actions($expand=createdBy)" },
      { resource: "histories", expand: "histories" },
    ] as const;
    const capabilities: Array<{
      resource: string;
      supported: boolean;
      valueType: string | null;
      count: number | null;
      keys: string[];
      sample: unknown;
      error: string | null;
    }> = [];

    const sanitize = (value: unknown, depth = 0): unknown => {
      if (depth > 2 || value === null || value === undefined) return value ?? null;
      if (Array.isArray(value)) return value.slice(0, 1).map((item) => sanitize(item, depth + 1));
      if (typeof value !== "object") return typeof value === "string" && value.length > 240 ? `${value.slice(0, 240)}…` : value;
      const output: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
        if (/token|password|email|phone|address|cep/i.test(key)) continue;
        output[key] = sanitize(item, depth + 1);
      }
      return output;
    };

    for (const candidate of candidates) {
      try {
        const response = await this.getWithRetry(`${this.url}/tickets`, {
          params: {
            token: this.token(),
            $select: "id",
            $expand: candidate.expand,
            $top: 1,
            $filter: `id eq ${scopedTicket.movideskId}`,
          },
          timeout: 120_000,
        }, `diagnóstico de enriquecimento ${candidate.resource} ticket=${scopedTicket.movideskId}`);
        const row = Array.isArray(response.data) ? response.data[0] as Record<string, unknown> | undefined : undefined;
        const value = row?.actions;
        const first = Array.isArray(value) && value.length && value[0] && typeof value[0] === "object" && !Array.isArray(value[0])
          ? value[0] as Record<string, unknown>
          : value && typeof value === "object" && !Array.isArray(value)
            ? value as Record<string, unknown>
            : null;
        capabilities.push({
          resource: candidate.resource,
          supported: true,
          valueType: Array.isArray(value) ? "array" : value === null ? "null" : typeof value,
          count: Array.isArray(value) ? value.length : null,
          keys: first ? Object.keys(first).sort() : [],
          sample: sanitize(value),
          error: null,
        });
      } catch (error) {
        capabilities.push({
          resource: candidate.resource,
          supported: false,
          valueType: null,
          count: null,
          keys: [],
          sample: null,
          error: error instanceof Error ? error.message.replace(/token=[^&\\s]+/gi, "token=[REDACTED]").slice(0, 500) : "Falha desconhecida.",
        });
      }
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
    }

    return {
      readOnly: true,
      ticket: scopedTicket,
      capabilities,
      note: "A sonda valida apenas suporte e estrutura; nenhum histórico ou ação é persistido.",
    };
  }

  async diagnoseScopedClients(limit = 3) {
    const sampleSize = Math.min(Math.max(Math.trunc(limit) || 3, 1), 5);
    const response = await this.getWithRetry(`${this.url}/tickets`, {
      params: {
        token: this.token(),
        $select: "id,createdDate,lastUpdate",
        $expand: "clients($expand=organization)",
        $orderby: "lastUpdate desc,id desc",
        $top: sampleSize,
        $filter: this.remoteScopeFilter(),
      },
      timeout: 120_000,
    }, "diagnóstico do escopo remoto SIMER");
    if (!Array.isArray(response.data)) throw new Error("Resposta inesperada da API Movidesk no diagnóstico.");

    const rows = response.data as Array<Record<string, unknown>>;
    return {
      readOnly: true,
      filterAccepted: true,
      requested: sampleSize,
      returned: rows.length,
      samples: rows.map((row) => {
        const clients = Array.isArray(row.clients) ? row.clients : [];
        return {
          id: row.id ?? null,
          createdDate: row.createdDate ?? null,
          lastUpdate: row.lastUpdate ?? null,
          resolvedSimerClient: this.ticketClientName(row),
          clients: clients.map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return { type: typeof item };
            const client = item as Record<string, unknown>;
            const organization = client.organization;
            return {
              keys: Object.keys(client).sort(),
              businessName: typeof client.businessName === "string" ? client.businessName : null,
              organization: organization && typeof organization === "object" && !Array.isArray(organization)
                ? {
                    keys: Object.keys(organization as Record<string, unknown>).sort(),
                    businessName: typeof (organization as Record<string, unknown>).businessName === "string"
                      ? (organization as Record<string, unknown>).businessName
                      : null,
                  }
                : organization ?? null,
            };
          }),
        };
      }),
    };
  }

  async previewTickets(limit = 25) {
    const sampleSize = Math.min(Math.max(Math.trunc(limit) || 25, 1), 25);
    const token = this.token();
    const query = new URLSearchParams();
    query.set("token", token);
    query.set("$select", TICKET_SELECT);
    query.set("$expand", TICKET_EXPAND);
    query.set("$orderby", "lastUpdate desc");
    query.set("$top", String(sampleSize));

    const response = await this.getWithRetry(`${this.url}/tickets?${query.toString()}`, { timeout: 120_000 }, "pré-validação");
    if (!Array.isArray(response.data)) throw new Error("Resposta inesperada da API Movidesk.");

    const rows = response.data as Array<Record<string, unknown>>;
    const required = ["id", "subject", "createdDate"] as const;
    const observed = [
      "id", "subject", "createdDate", "lastUpdate", "owner", "clients", "category",
      "serviceFirstLevel", "serviceSecondLevel", "serviceThirdLevel", "status",
      "slaAgreement", "slaSolutionDate", "slaResponseDate", "customFieldValues",
    ] as const;
    const coverage = Object.fromEntries(observed.map((field) => [
      field,
      rows.filter((row) => {
        const value = row[field];
        return value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
      }).length,
    ]));
    const issues: Array<{ row: number; id: unknown; fields: string[] }> = [];
    rows.forEach((row, index) => {
      const missing = required.filter((field) => row[field] === null || row[field] === undefined || row[field] === "");
      if (missing.length) issues.push({ row: index + 1, id: row.id ?? null, fields: [...missing] });
    });

    return {
      readOnly: true,
      sampleSize: rows.length,
      requested: sampleSize,
      validForImport: issues.length === 0,
      requiredFields: required,
      coverage,
      issues,
      examples: rows.slice(0, 5).map((row) => ({
        id: row.id ?? null,
        subject: row.subject ?? null,
        createdDate: row.createdDate ?? null,
        lastUpdate: row.lastUpdate ?? null,
        status: row.status ?? null,
        ownerTeam: row.ownerTeam ?? null,
        serviceFirstLevel: row.serviceFirstLevel ?? null,
        serviceSecondLevel: row.serviceSecondLevel ?? null,
      })),
    };
  }

  async baselineStatus() {
    // Este endpoint é telemetria. Uma indisponibilidade transitória do banco
    // deve degradar somente o status exibido, nunca o job de sincronização.
    let completed = false;
    let tickets = 0;
    let scopedTickets = 0;
    let linkedTasks = 0;
    let lastImport: {
      id: number; status: string; totalRows: number; insertedRows: number;
      updatedRows: number; skippedRows: number; errorRows: number;
      startedAt: Date; finishedAt: Date | null; message: string | null;
    } | null = null;
    let databaseAvailable = true;
    let databaseError: string | null = null;
    try {
      completed = await this.hasCompletedBaseline();
      [tickets, scopedTickets, linkedTasks, lastImport] = await Promise.all([
        prisma.ticket.count(),
        prisma.ticket.count({ where: { createdDate: { gte: SYNC_SCOPE_START }, client: { in: [...SIMER_CLIENTS], mode: "insensitive" } } }),
        prisma.ticket.count({ where: { taskNumber: { not: null }, createdDate: { gte: SYNC_SCOPE_START }, client: { in: [...SIMER_CLIENTS], mode: "insensitive" } } }),
        prisma.importRun.findFirst({
          where: { source: "MOVIDESK_API" },
          orderBy: { startedAt: "desc" },
          select: { id: true, status: true, totalRows: true, insertedRows: true, updatedRows: true, skippedRows: true, errorRows: true, startedAt: true, finishedAt: true, message: true },
        }),
      ]);
    } catch (error) {
      databaseAvailable = false;
      databaseError = error instanceof Error ? (error.message.split("\n")[0] ?? error.message).slice(0, 240) : "Banco de dados temporariamente indisponível.";
      console.warn(`[movidesk-status] Telemetria indisponível temporariamente: ${databaseError}`);
    }
    const intervalMinutes = Number(process.env.MOVIDESK_SYNC_INTERVAL_MINUTES ?? 60);
    const schedulerEnabledRaw = process.env.MOVIDESK_SYNC_SCHEDULER_ENABLED?.trim().toLowerCase();
    const schedulerEnabled = Boolean(process.env.MOVIDESK_TOKEN?.trim()) && !["0","false","no","nao","não","off"].includes(schedulerEnabledRaw ?? "");
    const safeInterval = Number.isSafeInteger(intervalMinutes) && intervalMinutes >= 15 && intervalMinutes <= 1440 ? intervalMinutes : 60;
    const nextEstimatedAt = completed && lastImport?.finishedAt
      ? new Date(lastImport.finishedAt.getTime() + safeInterval * 60_000).toISOString()
      : null;
    return {
      ...baselineState,
      completed,
      database: { available: databaseAvailable, error: databaseError, tickets, scopedTickets, linkedTasks },
      scope: { startDate: SYNC_SCOPE_START.toISOString(), clients: [...SIMER_CLIENTS] },
      lastImport,
      scheduler: {
        enabled: schedulerEnabled,
        intervalMinutes: safeInterval,
        overlapMinutes: INCREMENTAL_OVERLAP_MINUTES,
        pageSize: PAGE_SIZE,
        phase: completed ? "INCREMENTAL" : baselineState.status === "RUNNING" ? "BASELINE_RUNNING" : "WAITING_BASELINE",
        nextEstimatedAt,
      },
    };
  }

  async startBaseline(userId?: number | null) {
    if (baselinePromise || baselineState.status === "RUNNING") {
      return { accepted: false, reason: "RUNNING", state: await this.baselineStatus() };
    }
    if (await this.hasCompletedBaseline()) {
      return { accepted: false, reason: "COMPLETED", state: await this.baselineStatus() };
    }

    await this.validateRemoteScopeFilter();

    const checkpoint = await this.loadBaselineCheckpoint();
    baselineState = {
      status: "RUNNING",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
      progress: checkpoint
        ? { nextSkip: checkpoint.nextSkip, pages: checkpoint.pages, processedRows: checkpoint.totalRows, created: checkpoint.created, updated: checkpoint.updated, ignored: checkpoint.ignored, errors: checkpoint.errors, resumed: checkpoint.nextSkip > 0 }
        : { nextSkip: 0, pages: 0, processedRows: 0, created: 0, updated: 0, ignored: 0, errors: 0, resumed: false },
    };
    baselinePromise = this.syncTickets(userId ?? null, true)
      .then((result) => {
        baselineState = { ...baselineState, status: result.errors === 0 ? "SUCCESS" : "ERROR", finishedAt: new Date().toISOString(), result, error: result.errors === 0 ? null : `Carga concluída com ${result.errors} erro(s).` };
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Falha desconhecida na carga FULL.";
        baselineState = { ...baselineState, status: "ERROR", finishedAt: new Date().toISOString(), result: null, error: message };
        void prisma.auditLog.create({ data: { userId: userId ?? null, action: BASELINE_FAILED_ACTION, entity: "Ticket", metadata: { message, progress: baselineState.progress ?? undefined } } }).catch(() => undefined);
      })
      .finally(() => { baselinePromise = null; });

    return { accepted: true, state: await this.baselineStatus() };
  }

  async recentEnrichments(limit = 10) {
    const safeLimit = Math.max(1, Math.min(50, Number.isSafeInteger(limit) ? limit : 10));
    const rows = await prisma.movideskTicketEnrichment.findMany({
      orderBy: [{ enrichedAt: "desc" }, { id: "desc" }],
      take: safeLimit,
      include: {
        ticket: {
          select: {
            id: true,
            movideskId: true,
            subject: true,
            client: true,
            lastUpdate: true,
            actions: {
              where: { isDeleted: false },
              select: {
                timeAppointments: { select: { accountedTime: true } },
              },
            },
          },
        },
      },
    });

    return {
      items: rows.map((row) => {
        const accountedHours = row.ticket.actions.reduce(
          (total, action) => total + action.timeAppointments.reduce(
            (actionTotal, appointment) => actionTotal + Number(appointment.accountedTime ?? 0),
            0,
          ),
          0,
        );
        const current = !row.lastError && Boolean(
          !row.ticket.lastUpdate ||
          (row.sourceLastUpdate && row.sourceLastUpdate.getTime() >= row.ticket.lastUpdate.getTime()),
        );
        return {
          ticketId: row.ticket.id,
          movideskId: row.ticket.movideskId,
          subject: row.ticket.subject,
          client: row.ticket.client,
          actions: row.actionsCount,
          timeAppointments: row.timeAppointmentsCount,
          accountedHours: Number(accountedHours.toFixed(2)),
          ownerHistories: row.ownerHistoriesCount,
          statusHistories: row.statusHistoriesCount,
          enrichedAt: row.enrichedAt,
          sourceLastUpdate: row.sourceLastUpdate,
          currentLastUpdate: row.ticket.lastUpdate,
          status: row.lastError ? "ERROR" : current ? "CURRENT" : "STALE",
          lastError: row.lastError,
        };
      }),
      generatedAt: new Date().toISOString(),
    };
  }

  private classificationFromRaw(row: Record<string, unknown>, kind: "cause" | "reason") {
    const fieldId = kind === "cause" ? 52401 : 52413;
    const fields = Array.isArray(row.customFieldValues) ? row.customFieldValues : [];
    for (const rawField of fields) {
      if (!rawField || typeof rawField !== "object" || Array.isArray(rawField)) continue;
      const field = rawField as Record<string, unknown>;
      if (Number(field.customFieldId) !== fieldId) continue;
      const values = [
        typeof field.value === "string" ? field.value.trim() : null,
        ...(Array.isArray(field.items) ? field.items.map((item) =>
          item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).customFieldItem === "string"
            ? String((item as Record<string, unknown>).customFieldItem).trim()
            : null
        ) : []),
      ].filter((value): value is string => Boolean(value));
      return values[0] ?? null;
    }
    return null;
  }

  private async refreshRecentClassifications() {
    // Causa/Motivo pertencem ao ticket base, não ao enriquecimento. Relemos
    // uma janela recente para corrigir tickets que não sofreram lastUpdate
    // depois da introdução das colunas locais.
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 62);
    let skip = 0;
    let scanned = 0;
    let updated = 0;
    for (let page = 0; page < 8; page += 1) {
      const response = await this.getWithRetry(`${this.url}/tickets`, {
        params: {
          token: this.token(),
          $select: "id,category,createdDate,lastUpdate",
          $expand: "customFieldValues",
          $orderby: "createdDate desc,id desc",
          $top: PAGE_SIZE,
          $skip: skip,
          $filter: this.remoteScopeFilter(`createdDate ge ${since.toISOString()}`),
        },
        timeout: 120_000,
      }, `classificações recentes página=${page + 1}`);
      if (!Array.isArray(response.data) || response.data.length === 0) break;
      const rows = response.data as Array<Record<string, unknown>>;
      scanned += rows.length;
      for (const row of rows) {
        const movideskId = Number(row.id);
        const category = typeof row.category === "string" ? row.category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR") : "";
        if (!Number.isSafeInteger(movideskId) || (category !== "problema" && category !== "duvida")) continue;
        const cause = category === "problema" ? this.classificationFromRaw(row, "cause") : null;
        const reason = category === "duvida" ? this.classificationFromRaw(row, "reason") : null;
        if (!cause && !reason) continue;
        const result = await prisma.ticket.updateMany({
          where: { movideskId },
          data: category === "problema" ? { cause, reason: null } : { reason, cause: null },
        });
        updated += result.count;
      }
      if (rows.length < PAGE_SIZE) break;
      skip += rows.length;
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
    }
    return { scanned, updated };
  }

  async backfillTicketCauses() {
    const remote = await this.refreshRecentClassifications();
    const candidates = await prisma.ticket.findMany({
      where: {
        AND: [
          { createdDate: { gte: SYNC_SCOPE_START } },
          { client: { in: [...SIMER_CLIENTS], mode: "insensitive" } },
          { category: { in: ["Problema", "Dúvida", "Duvida"], mode: "insensitive" } },
          { rawData: { not: Prisma.JsonNull } },
          { isDeleted: false },
        ],
      },
      select: { id: true, category: true, cause: true, reason: true, rawData: true },
    });
    let causesUpdated = 0;
    let reasonsUpdated = 0;
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
    for (const ticket of candidates) {
      if (!ticket.rawData || typeof ticket.rawData !== "object" || Array.isArray(ticket.rawData)) continue;
      const raw = ticket.rawData as Record<string, unknown>;
      const category = normalize(ticket.category ?? "");
      if (category === "problema") {
        const cause = this.classificationFromRaw(raw, "cause");
        if (cause && cause !== ticket.cause) {
          await prisma.ticket.update({ where: { id: ticket.id }, data: { cause, reason: null } });
          causesUpdated += 1;
        }
      } else if (category === "duvida") {
        const reason = this.classificationFromRaw(raw, "reason");
        if (reason && reason !== ticket.reason) {
          await prisma.ticket.update({ where: { id: ticket.id }, data: { reason, cause: null } });
          reasonsUpdated += 1;
        }
      }
    }
    return {
      scanned: candidates.length,
      updated: causesUpdated + reasonsUpdated + remote.updated,
      causesUpdated,
      reasonsUpdated,
      remoteScanned: remote.scanned,
      remoteUpdated: remote.updated,
      sourceFields: { cause: 52401, reason: 52413 },
      safeMode: true,
    };
  }

  async classificationCoverage() {
    const tickets = await prisma.ticket.findMany({
      where: {
        AND: [
          { createdDate: { gte: SYNC_SCOPE_START } },
          { client: { in: [...SIMER_CLIENTS], mode: "insensitive" } },
          { category: { in: ["Problema", "Dúvida", "Duvida"], mode: "insensitive" } },
          { isDeleted: false },
        ],
      },
      select: { movideskId: true, category: true, cause: true, reason: true, rawData: true },
    });
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
    const problems = tickets.filter((ticket) => normalize(ticket.category ?? "") === "problema");
    const doubts = tickets.filter((ticket) => normalize(ticket.category ?? "") === "duvida");
    const distribution = (values: Array<string | null>) => {
      const grouped = new Map<string, number>();
      values.filter((value): value is string => Boolean(value?.trim())).forEach((value) => grouped.set(value.trim(), (grouped.get(value.trim()) ?? 0) + 1));
      return [...grouped.entries()].map(([label, total]) => ({ label, total })).sort((a,b) => b.total - a.total);
    };
    const diagnosticFields = (subset: typeof tickets, field: "cause" | "reason") => {
      const aggregate = new Map<string, { customFieldId: number | null; values: Map<string, number>; tickets: Set<number> }>();
      for (const ticket of subset.filter((item) => !item[field])) {
        if (!ticket.rawData || typeof ticket.rawData !== "object" || Array.isArray(ticket.rawData)) continue;
        const raw = ticket.rawData as Record<string, unknown>;
        const fields = Array.isArray(raw.customFieldValues) ? raw.customFieldValues : [];
        for (const rawField of fields) {
          if (!rawField || typeof rawField !== "object" || Array.isArray(rawField)) continue;
          const item = rawField as Record<string, unknown>;
          const customFieldId = typeof item.customFieldId === "number" ? item.customFieldId : Number(item.customFieldId);
          const values: string[] = [];
          if (typeof item.value === "string" && item.value.trim()) values.push(item.value.trim());
          if (Array.isArray(item.items)) for (const child of item.items) {
            if (!child || typeof child !== "object" || Array.isArray(child)) continue;
            const value = (child as Record<string, unknown>).customFieldItem;
            if (typeof value === "string" && value.trim()) values.push(value.trim());
          }
          for (const value of values.filter((value) => value.length <= 100)) {
            const key = Number.isFinite(customFieldId) ? String(customFieldId) : "unknown";
            const current = aggregate.get(key) ?? { customFieldId: Number.isFinite(customFieldId) ? customFieldId : null, values: new Map<string, number>(), tickets: new Set<number>() };
            current.values.set(value, (current.values.get(value) ?? 0) + 1);
            current.tickets.add(ticket.movideskId);
            aggregate.set(key, current);
          }
        }
      }
      return [...aggregate.values()]
        .map((item) => ({
          customFieldId: item.customFieldId,
          tickets: item.tickets.size,
          values: [...item.values.entries()].map(([value,total]) => ({value,total})).sort((a,b)=>b.total-a.total).slice(0,12),
        }))
        .sort((a,b)=>b.tickets-a.tickets)
        .slice(0,20);
    };
    const problemWithCause = problems.filter((ticket) => Boolean(ticket.cause?.trim())).length;
    const doubtWithReason = doubts.filter((ticket) => Boolean(ticket.reason?.trim())).length;
    return {
      scope: { start: SYNC_SCOPE_START, tickets: tickets.length },
      problems: {
        total: problems.length,
        classified: problemWithCause,
        missing: problems.length - problemWithCause,
        coveragePct: problems.length ? Number((problemWithCause / problems.length * 100).toFixed(1)) : 0,
        distribution: distribution(problems.map((ticket) => ticket.cause)),
        unclassifiedCustomFields: diagnosticFields(problems, "cause"),
      },
      doubts: {
        total: doubts.length,
        classified: doubtWithReason,
        missing: doubts.length - doubtWithReason,
        coveragePct: doubts.length ? Number((doubtWithReason / doubts.length * 100).toFixed(1)) : 0,
        distribution: distribution(doubts.map((ticket) => ticket.reason)),
        unclassifiedCustomFields: diagnosticFields(doubts, "reason"),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async dataCoverage() {
    const total = await prisma.ticket.count();
    const fields = [
      "client", "contact", "owner", "ownerTeam", "category", "cause", "reason", "urgency",
      "serviceFirstLevel", "serviceSecondLevel", "serviceThirdLevel", "businessArea",
      "lastUpdate", "dueDate", "firstResponseDate", "resolvedDate", "closedDate",
      "slaAgreement", "taskNumber", "registeredVersion", "deliveredVersion",
    ] as const;
    const coverage: Record<string, number> = {};
    for (const field of fields) {
      coverage[field] = await prisma.ticket.count({ where: { [field]: { not: null } } });
    }
    const [deleted, withRawData, actionCount, appointmentCount, ownerHistoryCount, statusHistoryCount, ticketsWithActions, ticketsWithAppointments, enrichmentCheckpoints, enrichmentErrors] = await Promise.all([
      prisma.ticket.count({ where: { isDeleted: true } }),
      prisma.ticket.count({ where: { rawData: { not: Prisma.DbNull } } }),
      prisma.movideskTicketAction.count(),
      prisma.movideskTimeAppointment.count(),
      prisma.movideskOwnerHistory.count(),
      prisma.movideskStatusHistory.count(),
      prisma.ticket.count({ where: { actions: { some: {} } } }),
      prisma.ticket.count({ where: { actions: { some: { timeAppointments: { some: {} } } } } }),
      prisma.movideskTicketEnrichment.count(),
      prisma.movideskTicketEnrichment.count({ where: { lastError: { not: null } } }),
    ]);
    const enrichmentStates = await prisma.ticket.findMany({
      where: {
        createdDate: { gte: SYNC_SCOPE_START },
        client: { in: [...SIMER_CLIENTS], mode: "insensitive" },
        isDeleted: false,
      },
      select: {
        lastUpdate: true,
        movideskEnrichment: { select: { sourceLastUpdate: true, lastError: true } },
      },
    });
    const enrichmentPending = enrichmentStates.filter((ticket) => {
      const checkpoint = ticket.movideskEnrichment;
      if (!checkpoint || checkpoint.lastError || !checkpoint.sourceLastUpdate) return true;
      return Boolean(ticket.lastUpdate && ticket.lastUpdate.getTime() > checkpoint.sourceLastUpdate.getTime());
    }).length;
    const enrichmentScopeTotal = enrichmentStates.length;
    const enrichmentCurrent = enrichmentScopeTotal - enrichmentPending;
    return {
      total, coverage, deleted, withRawData,
      enrichment: {
        actions: actionCount,
        timeAppointments: appointmentCount,
        ownerHistories: ownerHistoryCount,
        statusHistories: statusHistoryCount,
        ticketsWithActions,
        ticketsWithAppointments,
        checkpoints: enrichmentCheckpoints,
        errors: enrichmentErrors,
        scopeTotal: enrichmentScopeTotal,
        current: enrichmentCurrent,
        pending: enrichmentPending,
        coveragePct: enrichmentScopeTotal ? Number((enrichmentCurrent / enrichmentScopeTotal * 100).toFixed(1)) : 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async loadBaselineCheckpoint() {
    const checkpoint = await prisma.auditLog.findFirst({
      where: { action: BASELINE_CHECKPOINT_ACTION },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    const metadata = checkpoint?.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const value = metadata as Record<string, unknown>;
    const numberValue = (key: string) => Number.isSafeInteger(Number(value[key])) ? Number(value[key]) : 0;
    return {
      nextSkip: numberValue("nextSkip"),
      pages: numberValue("pages"),
      totalRows: numberValue("totalRows"),
      created: numberValue("created"),
      updated: numberValue("updated"),
      ignored: numberValue("ignored"),
      errors: numberValue("errors"),
      cursorLastUpdate: typeof value.cursorLastUpdate === "string" ? value.cursorLastUpdate : null,
      cursorId: Number.isSafeInteger(Number(value.cursorId)) ? Number(value.cursorId) : null,
    };
  }

  private async saveBaselineCheckpoint(userId: number | null, summary: SyncSummary, nextSkip: number, cursor?: { lastUpdate: string; id: number } | null) {
    await prisma.auditLog.create({
      data: {
        userId,
        action: BASELINE_CHECKPOINT_ACTION,
        entity: "Ticket",
        metadata: {
          nextSkip,
          pages: summary.pages,
          totalRows: summary.totalRows,
          created: summary.created,
          updated: summary.updated,
          ignored: summary.ignored,
          errors: summary.errors,
          cursorLastUpdate: cursor?.lastUpdate ?? null,
          cursorId: cursor?.id ?? null,
          savedAt: new Date().toISOString(),
        },
      },
    });
  }

  async hasCompletedBaseline() {
    const baseline = await prisma.auditLog.findFirst({
      where: { action: BASELINE_COMPLETED_ACTION },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return Boolean(baseline);
  }

  private ticketClientName(row: unknown) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const clients = (row as Record<string, unknown>).clients;
    if (!Array.isArray(clients) || !clients.length) return null;

    const names: string[] = [];
    for (const item of clients) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const client = item as Record<string, unknown>;
      const organization = client.organization;
      if (organization && typeof organization === "object" && !Array.isArray(organization)) {
        const businessName = (organization as Record<string, unknown>).businessName;
        if (typeof businessName === "string" && businessName.trim()) names.push(businessName.trim());
      }
      if (typeof client.businessName === "string" && client.businessName.trim()) {
        names.push(client.businessName.trim());
      }
    }

    return names.find((name) => isSimerClient(name)) ?? null;
  }

  private async getPage(
    skip: number,
    since?: Date | null,
    cursor?: { lastUpdate: string; id: number } | null,
  ) {
    const cursorFilter = cursor
      ? `((lastUpdate gt ${normalizeMovideskDateTimeOffset(cursor.lastUpdate)}) or (lastUpdate eq ${normalizeMovideskDateTimeOffset(cursor.lastUpdate)} and id gt ${cursor.id}))`
      : since
        ? `lastUpdate gt ${since.toISOString()}`
        : null;
    const filter = this.remoteScopeFilter(cursorFilter);
    const response = await this.getWithRetry(`${this.url}/tickets`, {
      params: {
        token: this.token(),
        $select: TICKET_SELECT,
        $expand: TICKET_EXPAND,
        $orderby: "lastUpdate asc,id asc",
        $top: PAGE_SIZE,
        ...(cursor ? {} : { $skip: skip }),
        ...(filter ? { $filter: filter } : {}),
      },
      timeout: 120_000,
    }, cursor ? `página cursor após id=${cursor.id}` : `página skip=${skip}`);
    if (!Array.isArray(response.data)) throw new Error("Resposta inesperada da API Movidesk.");
    return response.data as unknown[];
  }

  private async reconstructFullCursor(nextSkip: number) {
    if (nextSkip <= 0) return null;
    const anchorSkip = Math.max(0, nextSkip - PAGE_SIZE);
    const response = await this.getWithRetry(`${this.url}/tickets`, {
      params: {
        token: this.token(),
        $select: "id,lastUpdate",
        $orderby: "lastUpdate asc,id asc",
        $top: PAGE_SIZE,
        $skip: anchorSkip,
        $filter: this.remoteScopeFilter(),
      },
      timeout: 120_000,
    }, `reconstrução do cursor skip=${anchorSkip}`);
    if (!Array.isArray(response.data) || response.data.length === 0) {
      throw new Error(`Não foi possível reconstruir o cursor do FULL antes do skip=${nextSkip}.`);
    }
    const last = response.data[response.data.length - 1] as { id?: unknown; lastUpdate?: unknown };
    const id = Number(last.id);
    const lastUpdate = typeof last.lastUpdate === "string" ? last.lastUpdate : "";
    if (!Number.isSafeInteger(id) || !lastUpdate) {
      throw new Error(`Cursor inválido ao reconstruir o FULL antes do skip=${nextSkip}.`);
    }
    return { id, lastUpdate: normalizeMovideskDateTimeOffset(lastUpdate) };
  }

  private async latestSuccessfulSyncDate() {
    // Só habilitamos incremental depois que uma carga FULL terminou por inteiro.
    // Assim, uma interrupção no meio do baseline nunca faz o próximo ciclo
    // saltar os tickets das páginas que ainda não foram importadas.
    const baseline = await prisma.auditLog.findFirst({
      where: { action: BASELINE_COMPLETED_ACTION },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!baseline) return null;

    // O cursor deve seguir o relógio do dado remoto (lastUpdate), e não o
    // horário local em que a importação terminou.
    const latest = await prisma.ticket.aggregate({
      where: {
        createdDate: { gte: SYNC_SCOPE_START },
        client: { in: [...SIMER_CLIENTS], mode: "insensitive" },
      },
      _max: { lastUpdate: true },
    });
    const cursor = latest._max.lastUpdate;
    if (!cursor) return null;
    return new Date(cursor.getTime() - INCREMENTAL_OVERLAP_MINUTES * 60_000);
  }

  async syncTickets(userId?: number | null, forceFull = false): Promise<SyncSummary> {
    const since = forceFull ? null : await this.latestSuccessfulSyncDate();
    const mode: SyncSummary["mode"] = since ? "INCREMENTAL" : "FULL";
    const checkpoint = mode === "FULL" ? await this.loadBaselineCheckpoint() : null;
    const summary: SyncSummary = {
      mode,
      pages: checkpoint?.pages ?? 0,
      totalRows: checkpoint?.totalRows ?? 0,
      created: checkpoint?.created ?? 0,
      updated: checkpoint?.updated ?? 0,
      ignored: checkpoint?.ignored ?? 0,
      errors: checkpoint?.errors ?? 0,
      since: since?.toISOString() ?? null,
    };
    const initialSkip = checkpoint?.nextSkip ?? 0;
    let fullCursor = mode === "FULL" && checkpoint?.cursorLastUpdate && checkpoint?.cursorId
      ? { lastUpdate: checkpoint.cursorLastUpdate, id: checkpoint.cursorId }
      : null;
    if (mode === "FULL" && initialSkip >= OFFSET_TO_CURSOR_THRESHOLD && !fullCursor) {
      const reconstructedCursor = await this.reconstructFullCursor(initialSkip);
      if (!reconstructedCursor) {
        throw new Error(`Não foi possível reconstruir o cursor do FULL no checkpoint skip=${initialSkip}.`);
      }
      fullCursor = reconstructedCursor;
      console.info(`[movidesk-sync] Cursor FULL reconstruído no checkpoint skip=${initialSkip} | id=${reconstructedCursor.id}.`);
    }
    if (mode === "FULL" && initialSkip > 0) {
      console.info(`[movidesk-sync] Retomando baseline FULL do checkpoint skip=${initialSkip} | páginas=${summary.pages} | processados=${summary.totalRows}.`);
    }

    for (let skip = initialSkip; ; skip += PAGE_SIZE) {
      const useCursor = mode === "FULL" && (skip >= OFFSET_TO_CURSOR_THRESHOLD || Boolean(fullCursor));
      const rows = await this.getPage(skip, since, useCursor ? fullCursor : null);
      if (!rows.length) break;

      const scopedRows = rows.filter((row) => isSimerClient(this.ticketClientName(row)));
      const result = scopedRows.length
        ? await new MovideskJsonImportService().execute(
            Buffer.from(JSON.stringify(scopedRows), "utf8"),
            { fileName: `API Movidesk · ${mode} · página ${summary.pages + 1}`, userId: userId ?? null, source: "MOVIDESK_API" },
          )
        : { totalRows: 0, created: 0, updated: 0, ignored: 0, errors: 0 };
      summary.pages += 1;
      summary.totalRows += result.totalRows;
      summary.created += result.created;
      summary.updated += result.updated;
      summary.ignored += result.ignored;
      summary.errors += result.errors;

      if (mode === "FULL") {
        const nextSkip = skip + rows.length;
        const lastRow = rows[rows.length - 1] as { id?: unknown; lastUpdate?: unknown };
        const lastId = Number(lastRow.id);
        const lastUpdate = typeof lastRow.lastUpdate === "string" ? lastRow.lastUpdate : "";
        if (Number.isSafeInteger(lastId) && lastUpdate) {
          fullCursor = { id: lastId, lastUpdate: normalizeMovideskDateTimeOffset(lastUpdate) };
        }
        await this.saveBaselineCheckpoint(userId ?? null, summary, nextSkip, fullCursor);
        baselineState.progress = {
          nextSkip,
          pages: summary.pages,
          processedRows: summary.totalRows,
          created: summary.created,
          updated: summary.updated,
          ignored: summary.ignored,
          errors: summary.errors,
          resumed: initialSkip > 0,
        };
        console.info(`[movidesk-sync] FULL página ${summary.pages} concluída | skip=${skip} | linhas=${rows.length} | próximo=${nextSkip} | processados=${summary.totalRows} | novos=${summary.created} | atualizados=${summary.updated} | erros=${summary.errors}.`);
      }

      if (rows.length < PAGE_SIZE) break;
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
    }

    if (mode === "FULL" && summary.errors === 0) {
      await prisma.auditLog.create({
        data: {
          userId: userId ?? null,
          action: BASELINE_COMPLETED_ACTION,
          entity: "Ticket",
          metadata: { pages: summary.pages, totalRows: summary.totalRows, errors: summary.errors, scopeStart: SYNC_SCOPE_START.toISOString(), scope: "SIMER_CLIENTS_REMOTE_FILTER_V4" },
        },
      });
      baselineState.progress = baselineState.progress
        ? { ...baselineState.progress, nextSkip: summary.totalRows, processedRows: summary.totalRows }
        : null;
    }

    return summary;
  }

  async syncTicketEnrichment(limit = 100) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 100, 1), 500);
    const enrichmentCandidates = await prisma.ticket.findMany({
      where: {
        createdDate: { gte: SYNC_SCOPE_START },
        client: { in: [...SIMER_CLIENTS], mode: "insensitive" },
        isDeleted: false,
      },
      orderBy: [{ lastUpdate: "desc" }, { movideskId: "desc" }],
      select: {
        id: true,
        movideskId: true,
        lastUpdate: true,
        movideskEnrichment: {
          select: { sourceLastUpdate: true, lastError: true, errorAt: true },
        },
      },
    });
    const isPendingEnrichment = (ticket: (typeof enrichmentCandidates)[number]) => {
      const checkpoint = ticket.movideskEnrichment;
      if (!checkpoint || checkpoint.lastError || !checkpoint.sourceLastUpdate) return true;
      if (!ticket.lastUpdate) return false;
      // Tolerância de 1 segundo evita reprocessamento causado apenas por
      // diferenças de precisão entre timestamps da API e do PostgreSQL.
      return ticket.lastUpdate.getTime() - checkpoint.sourceLastUpdate.getTime() > 1_000;
    };
    const pendingBeforeRun = enrichmentCandidates.filter(isPendingEnrichment).length;
    const tickets = enrichmentCandidates.filter(isPendingEnrichment).slice(0, safeLimit);

    let actions = 0;
    let appointments = 0;
    let ownerHistories = 0;
    let statusHistories = 0;
    let errors = 0;
    const errorDetails: Array<{ ticketId: number; message: string }> = [];

    const enrichmentStartedAt = Date.now();
    for (let index = 0; index < tickets.length; index += 1) {
      const ticket = tickets[index]!;
      try {
        const response = await this.getWithRetry(`${this.url}/tickets`, {
          params: {
            token: this.token(),
            id: ticket.movideskId,
            includeDeletedItems: true,
          },
          timeout: 120_000,
        }, `enriquecimento ticket=${ticket.movideskId}`);

        const row = response.data && typeof response.data === "object" && !Array.isArray(response.data)
          ? response.data as Record<string, unknown>
          : null;
        if (!row) throw new Error("Resposta do ticket não possui o formato esperado.");

        const textOf = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
        const objectOf = (value: unknown) => value && typeof value === "object" && !Array.isArray(value)
          ? value as Record<string, unknown>
          : null;
        const dateOf = (value: unknown) => {
          if (typeof value !== "string" || !value.trim()) return null;
          const parsed = new Date(value);
          return Number.isNaN(parsed.getTime()) ? null : parsed;
        };
        const numberOf = (value: unknown) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        };
        const remoteLastUpdate = dateOf(row.lastUpdate);
        const checkpointLastUpdate = remoteLastUpdate ?? ticket.lastUpdate;
        if (remoteLastUpdate && (!ticket.lastUpdate || remoteLastUpdate.getTime() > ticket.lastUpdate.getTime())) {
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { lastUpdate: remoteLastUpdate },
          });
        }
        const historyKey = (kind: string, index: number, changedDate: Date | null, primary: string | null, actorId: string | null) =>
          crypto.createHash("sha256").update([kind, String(index), changedDate?.toISOString() ?? "", primary ?? "", actorId ?? ""].join("|")).digest("hex");

        const remoteOwnerHistories = Array.isArray(row.ownerHistories) ? row.ownerHistories : [];
        for (let historyIndex = 0; historyIndex < remoteOwnerHistories.length; historyIndex += 1) {
          const rawHistory = remoteOwnerHistories[historyIndex];
          const history = objectOf(rawHistory);
          if (!history) continue;
          const owner = objectOf(history.owner);
          const changedBy = objectOf(history.changedBy);
          const changedDate = dateOf(history.changedDate);
          const ownerId = owner?.id != null ? String(owner.id) : null;
          const ownerName = textOf(owner?.businessName);
          const ownerTeam = textOf(history.ownerTeam);
          const sequenceKey = historyKey("owner", historyIndex, changedDate, ownerName ?? ownerTeam, ownerId);

          await prisma.movideskOwnerHistory.upsert({
            where: { ticketId_sequenceKey: { ticketId: ticket.id, sequenceKey } },
            create: {
              ticketId: ticket.id, sequenceKey, ownerTeam, ownerId, ownerName,
              changedById: changedBy?.id != null ? String(changedBy.id) : null,
              changedByName: textOf(changedBy?.businessName), changedDate,
              permanencyTimeFullSeconds: numberOf(history.permanencyTimeFullTime),
              permanencyTimeWorkingSeconds: numberOf(history.permanencyTimeWorkingTime),
              rawData: history as Prisma.InputJsonValue, syncedAt: new Date(),
            },
            update: {
              ownerTeam, ownerId, ownerName,
              changedById: changedBy?.id != null ? String(changedBy.id) : null,
              changedByName: textOf(changedBy?.businessName), changedDate,
              permanencyTimeFullSeconds: numberOf(history.permanencyTimeFullTime),
              permanencyTimeWorkingSeconds: numberOf(history.permanencyTimeWorkingTime),
              rawData: history as Prisma.InputJsonValue, syncedAt: new Date(),
            },
          });
          ownerHistories += 1;
        }

        const remoteStatusHistories = Array.isArray(row.statusHistories) ? row.statusHistories : [];
        for (let historyIndex = 0; historyIndex < remoteStatusHistories.length; historyIndex += 1) {
          const rawHistory = remoteStatusHistories[historyIndex];
          const history = objectOf(rawHistory);
          if (!history) continue;
          const status = textOf(history.status);
          if (!status) continue;
          const changedBy = objectOf(history.changedBy);
          const changedDate = dateOf(history.changedDate);
          const changedById = changedBy?.id != null ? String(changedBy.id) : null;
          const sequenceKey = historyKey("status", historyIndex, changedDate, status, changedById);

          await prisma.movideskStatusHistory.upsert({
            where: { ticketId_sequenceKey: { ticketId: ticket.id, sequenceKey } },
            create: {
              ticketId: ticket.id, sequenceKey, status,
              justification: textOf(history.justification), changedById,
              changedByName: textOf(changedBy?.businessName), changedDate,
              permanencyTimeFullSeconds: numberOf(history.permanencyTimeFullTime),
              permanencyTimeWorkingSeconds: numberOf(history.permanencyTimeWorkingTime),
              rawData: history as Prisma.InputJsonValue, syncedAt: new Date(),
            },
            update: {
              status, justification: textOf(history.justification), changedById,
              changedByName: textOf(changedBy?.businessName), changedDate,
              permanencyTimeFullSeconds: numberOf(history.permanencyTimeFullTime),
              permanencyTimeWorkingSeconds: numberOf(history.permanencyTimeWorkingTime),
              rawData: history as Prisma.InputJsonValue, syncedAt: new Date(),
            },
          });
          statusHistories += 1;
        }

        const remoteActions = Array.isArray(row.actions) ? row.actions : [];
        for (const rawAction of remoteActions) {
          if (!rawAction || typeof rawAction !== "object" || Array.isArray(rawAction)) continue;
          const action = rawAction as Record<string, unknown>;
          const movideskActionId = Number(action.id);
          if (!Number.isSafeInteger(movideskActionId) || movideskActionId <= 0) continue;

          const createdBy = action.createdBy && typeof action.createdBy === "object" && !Array.isArray(action.createdBy)
            ? action.createdBy as Record<string, unknown>
            : null;
          const createdDate = typeof action.createdDate === "string" ? new Date(action.createdDate) : null;

          const savedAction = await prisma.movideskTicketAction.upsert({
            where: { ticketId_movideskActionId: { ticketId: ticket.id, movideskActionId } },
            create: {
              ticketId: ticket.id,
              movideskActionId,
              type: Number.isSafeInteger(Number(action.type)) ? Number(action.type) : null,
              origin: Number.isSafeInteger(Number(action.origin)) ? Number(action.origin) : null,
              description: typeof action.description === "string" ? action.description : null,
              status: typeof action.status === "string" ? action.status : null,
              justification: typeof action.justification === "string" ? action.justification : null,
              createdDate: createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate : null,
              createdById: createdBy?.id != null ? String(createdBy.id) : null,
              createdByName: typeof createdBy?.businessName === "string" ? createdBy.businessName : null,
              isDeleted: action.isDeleted === true,
              rawData: action as Prisma.InputJsonValue,
              syncedAt: new Date(),
            },
            update: {
              type: Number.isSafeInteger(Number(action.type)) ? Number(action.type) : null,
              origin: Number.isSafeInteger(Number(action.origin)) ? Number(action.origin) : null,
              description: typeof action.description === "string" ? action.description : null,
              status: typeof action.status === "string" ? action.status : null,
              justification: typeof action.justification === "string" ? action.justification : null,
              createdDate: createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate : null,
              createdById: createdBy?.id != null ? String(createdBy.id) : null,
              createdByName: typeof createdBy?.businessName === "string" ? createdBy.businessName : null,
              isDeleted: action.isDeleted === true,
              rawData: action as Prisma.InputJsonValue,
              syncedAt: new Date(),
            },
          });
          actions += 1;

          const remoteAppointments = Array.isArray(action.timeAppointments) ? action.timeAppointments : [];
          for (const rawAppointment of remoteAppointments) {
            if (!rawAppointment || typeof rawAppointment !== "object" || Array.isArray(rawAppointment)) continue;
            const appointment = rawAppointment as Record<string, unknown>;
            const movideskAppointmentId = Number(appointment.id);
            if (!Number.isSafeInteger(movideskAppointmentId) || movideskAppointmentId <= 0) continue;

            const appointmentCreatedBy = appointment.createdBy && typeof appointment.createdBy === "object" && !Array.isArray(appointment.createdBy)
              ? appointment.createdBy as Record<string, unknown>
              : null;
            const createdByTeam = appointment.createdByTeam && typeof appointment.createdByTeam === "object" && !Array.isArray(appointment.createdByTeam)
              ? appointment.createdByTeam as Record<string, unknown>
              : null;
            const appointmentDate = typeof appointment.date === "string" ? new Date(appointment.date) : null;
            const accountedTime = Number(appointment.accountedTime);

            await prisma.movideskTimeAppointment.upsert({
              where: { actionId_movideskAppointmentId: { actionId: savedAction.id, movideskAppointmentId } },
              create: {
                actionId: savedAction.id,
                movideskAppointmentId,
                activity: typeof appointment.activity === "string" ? appointment.activity : null,
                date: appointmentDate && !Number.isNaN(appointmentDate.getTime()) ? appointmentDate : null,
                periodStart: typeof appointment.periodStart === "string" ? appointment.periodStart : null,
                periodEnd: typeof appointment.periodEnd === "string" ? appointment.periodEnd : null,
                workTime: typeof appointment.workTime === "string" ? appointment.workTime : null,
                accountedTime: Number.isFinite(accountedTime) ? new Prisma.Decimal(accountedTime) : null,
                workTypeName: typeof appointment.workTypeName === "string" ? appointment.workTypeName : null,
                createdById: appointmentCreatedBy?.id != null ? String(appointmentCreatedBy.id) : null,
                createdByName: typeof appointmentCreatedBy?.businessName === "string" ? appointmentCreatedBy.businessName : null,
                createdByTeamId: Number.isSafeInteger(Number(createdByTeam?.id)) ? Number(createdByTeam?.id) : null,
                createdByTeamName: typeof createdByTeam?.name === "string" ? createdByTeam.name : null,
                rawData: appointment as Prisma.InputJsonValue,
                syncedAt: new Date(),
              },
              update: {
                activity: typeof appointment.activity === "string" ? appointment.activity : null,
                date: appointmentDate && !Number.isNaN(appointmentDate.getTime()) ? appointmentDate : null,
                periodStart: typeof appointment.periodStart === "string" ? appointment.periodStart : null,
                periodEnd: typeof appointment.periodEnd === "string" ? appointment.periodEnd : null,
                workTime: typeof appointment.workTime === "string" ? appointment.workTime : null,
                accountedTime: Number.isFinite(accountedTime) ? new Prisma.Decimal(accountedTime) : null,
                workTypeName: typeof appointment.workTypeName === "string" ? appointment.workTypeName : null,
                createdById: appointmentCreatedBy?.id != null ? String(appointmentCreatedBy.id) : null,
                createdByName: typeof appointmentCreatedBy?.businessName === "string" ? appointmentCreatedBy.businessName : null,
                createdByTeamId: Number.isSafeInteger(Number(createdByTeam?.id)) ? Number(createdByTeam?.id) : null,
                createdByTeamName: typeof createdByTeam?.name === "string" ? createdByTeam.name : null,
                rawData: appointment as Prisma.InputJsonValue,
                syncedAt: new Date(),
              },
            });
            appointments += 1;
          }
        }

        await prisma.movideskTicketEnrichment.upsert({
          where: { ticketId: ticket.id },
          create: {
            ticketId: ticket.id,
            sourceLastUpdate: checkpointLastUpdate,
            enrichedAt: new Date(),
            actionsCount: remoteActions.length,
            timeAppointmentsCount: remoteActions.reduce((total, action) => total + (
              action && typeof action === "object" && !Array.isArray(action) && Array.isArray((action as Record<string, unknown>).timeAppointments)
                ? ((action as Record<string, unknown>).timeAppointments as unknown[]).length
                : 0
            ), 0),
            ownerHistoriesCount: remoteOwnerHistories.length,
            statusHistoriesCount: remoteStatusHistories.length,
            lastError: null,
            errorAt: null,
          },
          update: {
            sourceLastUpdate: checkpointLastUpdate,
            enrichedAt: new Date(),
            actionsCount: remoteActions.length,
            timeAppointmentsCount: remoteActions.reduce((total, action) => total + (
              action && typeof action === "object" && !Array.isArray(action) && Array.isArray((action as Record<string, unknown>).timeAppointments)
                ? ((action as Record<string, unknown>).timeAppointments as unknown[]).length
                : 0
            ), 0),
            ownerHistoriesCount: remoteOwnerHistories.length,
            statusHistoriesCount: remoteStatusHistories.length,
            lastError: null,
            errorAt: null,
          },
        });
      } catch (error) {
        errors += 1;
        const errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida.";
        await prisma.movideskTicketEnrichment.upsert({
          where: { ticketId: ticket.id },
          create: {
            ticketId: ticket.id,
            sourceLastUpdate: null,
            enrichedAt: new Date(0),
            lastError: errorMessage,
            errorAt: new Date(),
          },
          update: {
            lastError: errorMessage,
            errorAt: new Date(),
          },
        }).catch(() => undefined);
        errorDetails.push({
          ticketId: ticket.movideskId,
          message: errorMessage,
        });
      }

      if (index < tickets.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
      }
    }

    const processed = Math.max(0, tickets.length - errors);
    const pendingAfterRun = Math.max(0, pendingBeforeRun - processed);
    const elapsedMinutes = Math.max((Date.now() - enrichmentStartedAt) / 60_000, 1 / 60);
    const throughputPerMinute = processed / elapsedMinutes;
    const estimatedMinutesRemaining = throughputPerMinute > 0 && pendingAfterRun > 0 ? Math.ceil(pendingAfterRun / throughputPerMinute) : null;

    return {
      tickets: tickets.length,
      pendingBeforeRun,
      pendingAfterRun,
      actions,
      appointments,
      ownerHistories,
      statusHistories,
      errors,
      errorDetails: errorDetails.slice(0, 50),
      throughputPerMinute,
      estimatedMinutesRemaining,
      generatedAt: new Date().toISOString(),
    };
  }

  async updateTicketStatus(ticketId: number, status: string, justification?: string | null) {
    const response = await axios.patch(
      `${this.url}/tickets`,
      { status, ...(justification?.trim() ? { justification: justification.trim() } : {}) },
      { params: { token: this.token(), id: ticketId }, timeout: 30_000 },
    );
    return response.data;
  }
}
