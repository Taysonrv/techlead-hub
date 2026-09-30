import axios from "axios";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { MovideskJsonImportService } from "./MovideskJsonImportService";

const PAGE_SIZE = 50;
const REQUEST_INTERVAL_MS = 6_200;
const INCREMENTAL_OVERLAP_MINUTES = 10;
const REQUEST_RETRY_ATTEMPTS = 4;
const REQUEST_RETRY_BASE_MS = 2_000;

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
};

let baselineState: BaselineState = {
  status: "IDLE",
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
};
let baselinePromise: Promise<void> | null = null;

export class MovideskService {
  private readonly url = process.env.MOVIDESK_URL?.trim() || "https://api.movidesk.com/public/v1";

  private token() {
    const token = normalizeMovideskToken(process.env.MOVIDESK_TOKEN);
    if (!token) throw new Error("Movidesk não configurado. Informe o token em Configurações > Movidesk.");
    return token;
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
        if (!retryable || attempt === REQUEST_RETRY_ATTEMPTS) throw error;
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
    const [tickets, linkedTasks, lastImport] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ where: { taskNumber: { not: null } } }),
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
      database: { tickets, linkedTasks },
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

    baselineState = { status: "RUNNING", startedAt: new Date().toISOString(), finishedAt: null, result: null, error: null };
    baselinePromise = this.syncTickets(userId ?? null, true)
      .then((result) => {
        baselineState = { ...baselineState, status: result.errors === 0 ? "SUCCESS" : "ERROR", finishedAt: new Date().toISOString(), result, error: result.errors === 0 ? null : `Carga concluída com ${result.errors} erro(s).` };
      })
      .catch((error) => {
        baselineState = { ...baselineState, status: "ERROR", finishedAt: new Date().toISOString(), result: null, error: error instanceof Error ? error.message : "Falha desconhecida na carga FULL." };
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

  async hasCompletedBaseline() {
    const baseline = await prisma.auditLog.findFirst({
      where: { action: "MOVIDESK_BASELINE_COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return Boolean(baseline);
  }

  private async getPage(skip: number, since?: Date | null) {
    const filter = since ? `lastUpdate gt ${since.toISOString()}` : undefined;
    const response = await this.getWithRetry(`${this.url}/tickets`, {
      params: {
        token: this.token(),
        $select: TICKET_SELECT,
        $expand: TICKET_EXPAND,
        $orderby: "lastUpdate asc,id asc",
        $top: PAGE_SIZE,
        $skip: skip,
        ...(filter ? { $filter: filter } : {}),
      },
      timeout: 120_000,
    }, `página skip=${skip}`);
    if (!Array.isArray(response.data)) throw new Error("Resposta inesperada da API Movidesk.");
    return response.data as unknown[];
  }

  private async latestSuccessfulSyncDate() {
    // Só habilitamos incremental depois que uma carga FULL terminou por inteiro.
    // Assim, uma interrupção no meio do baseline nunca faz o próximo ciclo
    // saltar os tickets das páginas que ainda não foram importadas.
    const baseline = await prisma.auditLog.findFirst({
      where: { action: "MOVIDESK_BASELINE_COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!baseline) return null;

    // O cursor deve seguir o relógio do dado remoto (lastUpdate), e não o
    // horário local em que a importação terminou.
    const latest = await prisma.ticket.aggregate({ _max: { lastUpdate: true } });
    const cursor = latest._max.lastUpdate;
    if (!cursor) return null;
    return new Date(cursor.getTime() - INCREMENTAL_OVERLAP_MINUTES * 60_000);
  }

  async syncTickets(userId?: number | null, forceFull = false): Promise<SyncSummary> {
    const since = forceFull ? null : await this.latestSuccessfulSyncDate();
    const mode: SyncSummary["mode"] = since ? "INCREMENTAL" : "FULL";
    const summary: SyncSummary = { mode, pages: 0, totalRows: 0, created: 0, updated: 0, ignored: 0, errors: 0, since: since?.toISOString() ?? null };

    for (let skip = 0; ; skip += PAGE_SIZE) {
      const rows = await this.getPage(skip, since);
      if (!rows.length) break;

      const result = await new MovideskJsonImportService().execute(
        Buffer.from(JSON.stringify(rows), "utf8"),
        { fileName: `API Movidesk · ${mode} · página ${summary.pages + 1}`, userId: userId ?? null, source: "MOVIDESK_API" },
      );
      summary.pages += 1;
      summary.totalRows += result.totalRows;
      summary.created += result.created;
      summary.updated += result.updated;
      summary.ignored += result.ignored;
      summary.errors += result.errors;

      if (rows.length < PAGE_SIZE) break;
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
    }

    if (mode === "FULL" && summary.errors === 0) {
      await prisma.auditLog.create({
        data: {
          userId: userId ?? null,
          action: "MOVIDESK_BASELINE_COMPLETED",
          entity: "Ticket",
          metadata: { pages: summary.pages, totalRows: summary.totalRows, errors: summary.errors },
        },
      });
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
