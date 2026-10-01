import { Prisma } from "@prisma/client";
import axios, { AxiosError, type AxiosResponse } from "axios";
import { prisma } from "../database/prisma";
import { simerClientTicketScope } from "../domain/OperationalScope";

const API_URL = process.env.MOVIDESK_API_URL?.trim() || "https://api.movidesk.com/public/v1";
const WAIT_MS = 6200;
const CATALOG_CHECKPOINT_ACTION = "MOVIDESK_CATALOG_CHECKPOINT_V1";
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
    const scopeStart = new Date("2026-01-01T00:00:00.000Z");
    const tickets = await prisma.ticket.findMany({
      where: { AND: [{ isDeleted: false, createdDate: { gte: scopeStart } }, simerClientTicketScope()] },
      select: { service: true, serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true },
    });

    // O catálogo remoto é apenas enriquecimento. A hierarquia operacional já
    // existe no Ticket; portanto buscamos somente o serviço mais específico
    // observado em cada atendimento, evitando consultar separadamente todos
    // os níveis pai (SIMER, módulo, rotina etc.).
    const names = [...new Set(
      tickets.map((ticket) =>
        ticket.serviceThirdLevel?.trim()
        || ticket.service?.trim()
        || ticket.serviceSecondLevel?.trim()
        || ticket.serviceFirstLevel?.trim()
        || null,
      ).filter((value): value is string => Boolean(value)),
    )].sort((a, b) => a.localeCompare(b, "pt-BR"));

    console.log(`[movidesk-catalog] escopo SIMER/2026 | tickets=${tickets.length} | serviços referenciados=${names.length}`);
    if (!names.length) {
      return { pages: 0, processed: 0, referenced: 0, removedOutsideScope: 0, syncedAt: new Date().toISOString() };
    }

    const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
    const rowsById = new Map<number, Record<string, unknown>>();
    const failedNames: string[] = [];
    let requests = 0;

    // O endpoint /services mostrou instabilidade com filtros OR extensos.
    // Consultamos um nome por vez: payload pequeno, resultado previsível e
    // nenhuma varredura do catálogo global. Nomes iguais podem existir em
    // ramos diferentes, por isso mantemos todos os IDs retornados.
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      if (!name) continue;
      requests += 1;
      try {
        const response = await this.get("/services", {
          $select: "id,name,parentServiceId,isActive,defaultCategory,defaultUrgency",
          $filter: `name eq ${quote(name)}`,
          $top: 50,
          $orderby: "id asc",
        });
        const rows = Array.isArray(response.data) ? response.data as Array<Record<string, unknown>> : [];
        for (const row of rows) {
          const id = Number(row.id);
          if (Number.isSafeInteger(id)) rowsById.set(id, row);
        }
        console.log(`[movidesk-catalog] SIMER/2026 | ${index + 1}/${names.length} | serviço="${name}" | encontrados=${rows.length} | únicos=${rowsById.size}`);
      } catch (error) {
        failedNames.push(name);
        console.warn(`[movidesk-catalog] serviço="${name}" não sincronizado nesta execução: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (index + 1 < names.length) await sleep(WAIT_MS);
    }

    const rows = [...rowsById.values()];
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
        if (operations.length) await prisma.$transaction(operations);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const transient = /P1017|connection|pool|Can't reach database|closed the connection|timed out/i.test(message);
        if (!transient || attempt === 5) throw error;
        const delay = Math.min(2000 * 2 ** (attempt - 1), 20000);
        console.warn(`[movidesk-catalog-db] tentativa=${attempt}/5; banco indisponível, nova tentativa em ${delay/1000}s.`);
        await sleep(delay);
      }
    }

    // A limpeza usa os nomes efetivamente referenciados pelos tickets, e não
    // somente os IDs retornados nesta execução. Assim uma resposta parcial da
    // API nunca apaga um serviço SIMER válido que já estava sincronizado.
    const removedOutsideScope = await prisma.movideskServiceCatalog.deleteMany({
      where: { name: { notIn: names } },
    });

    await prisma.auditLog.create({
      data: {
        action: CATALOG_CHECKPOINT_ACTION,
        metadata: {
          completed: true,
          scope: "SIMER_CLIENTS_2026",
          referencedNames: names.length,
          synchronizedServices: operations.length,
          requests,
          failedNames,
          removedOutsideScope: removedOutsideScope.count,
          completedAt: new Date().toISOString(),
        },
      },
    });

    console.log(`[movidesk-catalog] concluído | escopo=SIMER/2026 | referenciados=${names.length} | sincronizados=${operations.length} | falhas=${failedNames.length} | removidos fora do escopo=${removedOutsideScope.count}`);
    return { pages: requests, processed: operations.length, referenced: names.length, failed: failedNames.length, failedNames, removedOutsideScope: removedOutsideScope.count, syncedAt: new Date().toISOString() };
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
