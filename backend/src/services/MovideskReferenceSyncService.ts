import { Prisma } from "@prisma/client";
import axios, { AxiosError, type AxiosResponse } from "axios";
import { prisma } from "../database/prisma";

const API_URL = process.env.MOVIDESK_API_URL?.trim() || "https://api.movidesk.com/public/v1";
const WAIT_MS = 6200;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MovideskReferenceSyncService {
  private async get(path: string, params: Record<string, unknown>): Promise<AxiosResponse<unknown>> {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        return await axios.get(`${API_URL}${path}`, { params: { token: this.token(), ...params }, timeout: 120000 });
      } catch (error) {
        const err = error as AxiosError;
        const status = err.response?.status;
        const retryable = err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ECONNABORTED" || status === 429 || (status !== undefined && status >= 500);
        if (!retryable || attempt === 6) throw new Error(`Movidesk ${path}: falha após ${attempt} tentativa(s): ${err.message}`);
        const retryAfter = Number(err.response?.headers?.["retry-after"] ?? 0);
        const delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** (attempt - 1), 30000);
        console.warn(`[movidesk-reference] ${path} tentativa=${attempt}/6 falhou (${err.code ?? status ?? "erro"}); nova tentativa em ${Math.round(delay/1000)}s.`);
        await sleep(delay);
      }
    }
    throw new Error(`Movidesk ${path}: tentativas esgotadas.`);
  }

  private token() {
    const token = process.env.MOVIDESK_TOKEN?.trim();
    if (!token) throw new Error("MOVIDESK_TOKEN não configurado.");
    return token;
  }

  async syncCatalog() {
    let processed = 0;
    let pages = 0;
    for (let skip = 0; ; skip += 25) {
      pages += 1;
      if (pages > 500) throw new Error("Catálogo interrompido: limite de segurança de 500 páginas atingido.");
      const response = await this.get("/services", { $select: "id,name,parentServiceId,isActive,defaultCategory,defaultUrgency", $top: 25, $skip: skip, $orderby: "id asc" });
      const rows = Array.isArray(response.data) ? response.data as Array<Record<string, unknown>> : [];
      console.log(`[movidesk-catalog] página=${pages} skip=${skip} serviços=${rows.length} processados=${processed}`);
      const operations = rows.flatMap((row) => {
        const id = Number(row.id);
        const name = typeof row.name === "string" ? row.name.trim() : "";
        if (!Number.isSafeInteger(id) || !name) return [];
        const data = {
          name,
          parentServiceId: Number.isSafeInteger(Number(row.parentServiceId)) ? Number(row.parentServiceId) : null,
          isActive: typeof row.isActive === "boolean" ? row.isActive : true,
          defaultCategory: typeof row.defaultCategory === "string" ? row.defaultCategory : null,
          defaultUrgency: typeof row.defaultUrgency === "string" ? row.defaultUrgency : null,
          rawData: row as Prisma.InputJsonValue,
          syncedAt: new Date(),
        };
        return [prisma.movideskServiceCatalog.upsert({ where: { id }, create: { id, ...data }, update: data })];
      });
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          if (operations.length) await prisma.$transaction(operations, { timeout: 30000 });
          processed += operations.length;
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const transient = /P1017|connection|pool|Can't reach database|closed the connection|timed out/i.test(message);
          if (!transient || attempt === 5) throw error;
          const delay = Math.min(2000 * 2 ** (attempt - 1), 20000);
          console.warn(`[movidesk-catalog-db] página=${pages} tentativa=${attempt}/5; banco indisponível, nova tentativa em ${delay/1000}s.`);
          await sleep(delay);
        }
      }
      if (rows.length < 25) break;
      await sleep(WAIT_MS);
    }
    return { pages, processed, syncedAt: new Date().toISOString() };
  }

  async syncSurveyQuestions() {
    const response = await this.get("/survey/questions", {});
    const rows = Array.isArray(response.data) ? response.data as Array<Record<string, unknown>> : [];
    let processed = 0;
    for (const row of rows) {
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (!id) continue;
      const data = {
        type: Number.isSafeInteger(Number(row.type)) ? Number(row.type) : null,
        isActive: typeof row.isActive === "boolean" ? row.isActive : true,
        languages: Array.isArray(row.languages) ? row.languages as Prisma.InputJsonValue : Prisma.JsonNull,
        rawData: row as Prisma.InputJsonValue,
        syncedAt: new Date(),
      };
      await prisma.movideskSurveyQuestion.upsert({ where: { id }, create: { id, ...data }, update: data });
      processed += 1;
    }
    return { processed, syncedAt: new Date().toISOString() };
  }
}
