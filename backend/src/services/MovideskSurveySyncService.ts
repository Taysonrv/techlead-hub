import { Prisma } from "@prisma/client";
import axios, { AxiosError, type AxiosResponse } from "axios";
import { prisma } from "../database/prisma";
import { SIMER_CLIENTS } from "../domain/OperationalScope";

const API_URL = process.env.MOVIDESK_API_URL?.trim() || "https://api.movidesk.com/public/v1";
const START = new Date("2026-01-01T00:00:00.000Z");
const WAIT_MS = 6200;
const CSAT_CHECKPOINT_ACTION = "MOVIDESK_CSAT_CHECKPOINT_V1";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MovideskSurveySyncService {
  private async getResponses(params: Record<string, unknown>): Promise<AxiosResponse<unknown>> {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        return await axios.get(`${API_URL}/survey/responses`, { params: { token: this.token(), ...params }, timeout: 120000 });
      } catch (error) {
        const err = error as AxiosError;
        const status = err.response?.status;
        const retryable = err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ECONNABORTED" || status === 429 || (status !== undefined && status >= 500);
        if (!retryable || attempt === 6) throw new Error(`Movidesk /survey/responses: falha após ${attempt} tentativa(s): ${err.message}`);
        const retryAfter = Number(err.response?.headers?.["retry-after"] ?? 0);
        const delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** (attempt - 1), 30000);
        console.warn(`[movidesk-csat] tentativa=${attempt}/6 falhou (${err.code ?? status ?? "erro"}); nova tentativa em ${Math.round(delay/1000)}s.`);
        await sleep(delay);
      }
    }
    throw new Error("Movidesk /survey/responses: tentativas esgotadas.");
  }

  private token() {
    const token = process.env.MOVIDESK_TOKEN?.trim();
    if (!token) throw new Error("MOVIDESK_TOKEN não configurado.");
    return token;
  }

  async syncResponses() {
    const checkpoint = await prisma.auditLog.findFirst({ where: { action: CSAT_CHECKPOINT_ACTION }, orderBy: { createdAt: "desc" }, select: { metadata: true } });
    const metadata = checkpoint?.metadata && typeof checkpoint.metadata === "object" && !Array.isArray(checkpoint.metadata) ? checkpoint.metadata as Record<string, unknown> : {};
    let cursor: string | null = typeof metadata.cursor === "string" && metadata.cursor ? metadata.cursor : null;
    console.log(`[movidesk-csat] início${cursor ? " a partir do checkpoint" : " desde 2026-01-01"}`);
    let processed = 0, upserted = 0, skippedOutsideScope = 0, pages = 0;
    const seenPages = new Set<string>();
    for (;;) {
      pages += 1;
      if (pages > 500) throw new Error("CSAT interrompido: limite de segurança de 500 páginas atingido.");
      const response = await this.getResponses({ responseDateGreaterThan: "2026-01-01", limit: 100, ...(cursor ? { startingAfter: cursor } : {}) });
      const body: Record<string, unknown> = response.data && typeof response.data === "object" && !Array.isArray(response.data) ? response.data as Record<string, unknown> : {};
      const rows = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
      if (!rows.length) break;
      const signature = rows.map((row) => String(row.id ?? "")).join("|");
      if (seenPages.has(signature)) throw new Error(`CSAT interrompido: API repetiu a página ${pages}; paginação não avançou.`);
      seenPages.add(signature);
      console.log(`[movidesk-csat] página=${pages} respostas=${rows.length} processadas=${processed} gravadas=${upserted}`);

      const ids = [...new Set(rows.map((row) => Number(row.ticketId)).filter(Number.isSafeInteger))];
      const tickets = ids.length ? await prisma.ticket.findMany({
        where: { movideskId: { in: ids }, createdDate: { gte: START }, client: { in: [...SIMER_CLIENTS], mode: "insensitive" } },
        select: { movideskId: true },
      }) : [];
      const scoped = new Set(tickets.map((ticket) => ticket.movideskId));

      const operations = rows.flatMap((row) => {
        processed += 1;
        const id = typeof row.id === "string" ? row.id.trim() : "";
        const ticketId = Number(row.ticketId);
        if (!id || !Number.isSafeInteger(ticketId) || !scoped.has(ticketId)) { skippedOutsideScope += 1; return []; }
        const parsedDate = typeof row.responseDate === "string" ? new Date(row.responseDate) : null;
        const data = {
          questionId: typeof row.questionId === "string" ? row.questionId : null,
          type: Number.isSafeInteger(Number(row.type)) ? Number(row.type) : null,
          clientId: typeof row.clientId === "string" ? row.clientId : null,
          ticketId,
          responseDate: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
          commentary: typeof row.commentary === "string" ? row.commentary : null,
          value: Number.isSafeInteger(Number(row.value)) ? Number(row.value) : null,
          rawData: row as Prisma.InputJsonValue,
          syncedAt: new Date(),
        };
        return [prisma.movideskSurveyResponse.upsert({ where: { id }, create: { id, ...data }, update: data })];
      });
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          if (operations.length) await prisma.$transaction(operations);
          upserted += operations.length;
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const transient = /P1017|connection|pool|Can't reach database|closed the connection|timed out/i.test(message);
          if (!transient || attempt === 5) throw error;
          const delay = Math.min(2000 * 2 ** (attempt - 1), 20000);
          console.warn(`[movidesk-csat-db] página=${pages} tentativa=${attempt}/5; banco indisponível, nova tentativa em ${delay/1000}s.`);
          await sleep(delay);
        }
      }

      if (body.hasMore !== true) break;
      const last = rows[rows.length - 1];
      const next: string | null = typeof body.startingAfter === "string" ? body.startingAfter :
        typeof body.nextStartingAfter === "string" ? body.nextStartingAfter :
        last && typeof last.id === "string" ? last.id : null;
      if (!next || next === cursor) break;
      cursor = next;
      await prisma.auditLog.create({ data: { action: CSAT_CHECKPOINT_ACTION, entityType: "MovideskSurveyResponse", metadata: { cursor, processedAt: new Date().toISOString() } } });
      await sleep(WAIT_MS);
    }
    return { pages, processed, upserted, skippedOutsideScope, syncedAt: new Date().toISOString() };
  }
}
