import { Prisma } from "@prisma/client";
import axios from "axios";
import { prisma } from "../database/prisma";

const API_URL = process.env.MOVIDESK_API_URL?.trim() || "https://api.movidesk.com/public/v1";
const WAIT_MS = 6200;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MovideskReferenceSyncService {
  private token() {
    const token = process.env.MOVIDESK_TOKEN?.trim();
    if (!token) throw new Error("MOVIDESK_TOKEN não configurado.");
    return token;
  }

  async syncCatalog() {
    let processed = 0;
    let pages = 0;
    for (let skip = 0; ; skip += 50) {
      pages += 1;
      if (pages > 500) throw new Error("Catálogo interrompido: limite de segurança de 500 páginas atingido.");
      const response = await axios.get(`${API_URL}/services`, {
        params: { token: this.token(), $select: "id,name,parentServiceId,isActive,defaultCategory,defaultUrgency", $top: 50, $skip: skip, $orderby: "id asc" },
        timeout: 120000,
      });
      const rows = Array.isArray(response.data) ? response.data as Array<Record<string, unknown>> : [];
      console.log(`[movidesk-catalog] página=${pages} skip=${skip} serviços=${rows.length} processados=${processed}`);
      for (const row of rows) {
        const id = Number(row.id);
        const name = typeof row.name === "string" ? row.name.trim() : "";
        if (!Number.isSafeInteger(id) || !name) continue;
        const data = {
          name,
          parentServiceId: Number.isSafeInteger(Number(row.parentServiceId)) ? Number(row.parentServiceId) : null,
          isActive: typeof row.isActive === "boolean" ? row.isActive : true,
          defaultCategory: typeof row.defaultCategory === "string" ? row.defaultCategory : null,
          defaultUrgency: typeof row.defaultUrgency === "string" ? row.defaultUrgency : null,
          rawData: row as Prisma.InputJsonValue,
          syncedAt: new Date(),
        };
        await prisma.movideskServiceCatalog.upsert({ where: { id }, create: { id, ...data }, update: data });
        processed += 1;
      }
      if (rows.length < 50) break;
      await sleep(WAIT_MS);
    }
    return { pages, processed, syncedAt: new Date().toISOString() };
  }

  async syncSurveyQuestions() {
    const response = await axios.get(`${API_URL}/survey/questions`, { params: { token: this.token() }, timeout: 120000 });
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
