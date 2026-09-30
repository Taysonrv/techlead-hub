import axios from "axios";
import { prisma } from "../database/prisma";
import { MovideskJsonImportService } from "./MovideskJsonImportService";

const PAGE_SIZE = 100;
const REQUEST_INTERVAL_MS = 6_200;
const INCREMENTAL_OVERLAP_MINUTES = 10;

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
    const token = process.env.MOVIDESK_TOKEN?.trim();
    if (!token) throw new Error("Movidesk não configurado. Informe o token em Configurações > Movidesk.");
    return token;
  }

  async testConnection() {
    const response = await axios.get(`${this.url}/tickets`, {
      params: { token: this.token(), $select: "id,lastUpdate", $orderby: "id desc", $top: 1 },
      timeout: 30_000,
    });
    return { ok: true, endpoint: this.url, sampleCount: Array.isArray(response.data) ? response.data.length : 0 };
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
    const last = await prisma.importRun.findFirst({
      where: { source: "MOVIDESK_API", status: { in: ["SUCCESS", "PARTIAL"] } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });
    if (!last?.finishedAt) return null;
    return new Date(last.finishedAt.getTime() - INCREMENTAL_OVERLAP_MINUTES * 60_000);
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
