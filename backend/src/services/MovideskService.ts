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
const BASELINE_CHECKPOINT_ACTION = "MOVIDESK_SCOPED_BASELINE_CHECKPOINT_2026_V3";
const BASELINE_COMPLETED_ACTION = "MOVIDESK_SCOPED_BASELINE_COMPLETED_2026_V3";
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
  "owner", "createdBy", "clients", "customFieldValues"
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
          $expand: "clients",
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
    const completed = await this.hasCompletedBaseline();
    const [tickets, scopedTickets, linkedTasks, lastImport] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ where: { createdDate: { gte: SYNC_SCOPE_START }, client: { in: [...SIMER_CLIENTS], mode: "insensitive" } } }),
      prisma.ticket.count({ where: { taskNumber: { not: null }, createdDate: { gte: SYNC_SCOPE_START }, client: { in: [...SIMER_CLIENTS], mode: "insensitive" } } }),
      prisma.importRun.findFirst({
        where: { source: "MOVIDESK_API" },
        orderBy: { startedAt: "desc" },
        select: { id: true, status: true, totalRows: true, insertedRows: true, updatedRows: true, skippedRows: true, errorRows: true, startedAt: true, finishedAt: true, message: true },
      }),
    ]);
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
      database: { tickets, scopedTickets, linkedTasks },
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

  async dataCoverage() {
    const total = await prisma.ticket.count();
    const fields = [
      "client", "contact", "owner", "ownerTeam", "category", "cause", "urgency",
      "serviceFirstLevel", "serviceSecondLevel", "serviceThirdLevel", "businessArea",
      "lastUpdate", "dueDate", "firstResponseDate", "resolvedDate", "closedDate",
      "slaAgreement", "taskNumber", "registeredVersion", "deliveredVersion",
    ] as const;
    const coverage: Record<string, number> = {};
    for (const field of fields) {
      coverage[field] = await prisma.ticket.count({ where: { [field]: { not: null } } });
    }
    const [deleted, withRawData] = await Promise.all([
      prisma.ticket.count({ where: { isDeleted: true } }),
      prisma.ticket.count({ where: { rawData: { not: Prisma.DbNull } } }),
    ]);
    return { total, coverage, deleted, withRawData, generatedAt: new Date().toISOString() };
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
          metadata: { pages: summary.pages, totalRows: summary.totalRows, errors: summary.errors, scopeStart: SYNC_SCOPE_START.toISOString(), scope: "SIMER_CLIENTS_REMOTE_FILTER_V2" },
        },
      });
      baselineState.progress = baselineState.progress
        ? { ...baselineState.progress, nextSkip: summary.totalRows, processedRows: summary.totalRows }
        : null;
    }

    return summary;
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
