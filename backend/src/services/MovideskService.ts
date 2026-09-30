import axios from "axios";
import { prisma } from "../database/prisma";
import { MovideskJsonImportService } from "./MovideskJsonImportService";

const PAGE_SIZE = 100;
const REQUEST_INTERVAL_MS = 6_200;
const INCREMENTAL_OVERLAP_MINUTES = 10;

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

const TICKET_EXPAND = [
  "owner", "createdBy", "clients", "actions", "ownerHistories",
  "statusHistories", "satisfactionSurveyResponses", "customFieldValues"
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

export class MovideskService {
  private readonly url = process.env.MOVIDESK_URL?.trim() || "https://api.movidesk.com/public/v1";

  private token() {
    const token = normalizeMovideskToken(process.env.MOVIDESK_TOKEN);
    if (!token) throw new Error("Movidesk não configurado. Informe o token em Configurações > Movidesk.");
    return token;
  }

  async testConnection() {
    try {
      const token = this.token();
      const query = new URLSearchParams();
      query.set("token", token);
      query.set("$select", "id,lastUpdate");
      query.set("$top", "1");
      const response = await axios.get(`${this.url}/tickets?${query.toString()}`, {
        timeout: 30_000,
      });
      return { ok: true, endpoint: this.url, sampleCount: Array.isArray(response.data) ? response.data.length : 0 };
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
        if (status === 401) {
          throw new Error("Movidesk rejeitou a credencial (HTTP 401). Revise o token salvo em Configurações > Movidesk; o endpoint respondeu normalmente, mas não autorizou a credencial enviada.");
        }
        throw new Error(`Movidesk respondeu${status ? ` HTTP ${status}` : ""}: ${remoteMessage}`);
      }
      throw error;
    }
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
    const response = await axios.get(`${this.url}/tickets`, {
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
    });
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
