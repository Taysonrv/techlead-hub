import crypto from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma";

type JsonObject = Record<string, unknown>;

type ImportResult = {
  batchId: string;
  totalRows: number;
  created: number;
  updated: number;
  ignored: number;
  errors: number;
  analysts: string[];
  clients: string[];
  categories: string[];
  services: string[];
  errorDetails: { row: number; message: string }[];
};

type CustomField = {
  customFieldId?: number | string | null;
  value?: unknown;
  items?: Array<{
    customFieldItem?: unknown;
    personId?: unknown;
    clientId?: unknown;
    team?: unknown;
  }> | null;
};

const CUSTOM_FIELDS = {
  registeredVersion: 45621,
  cause: 52401,
  causeDetail: 52413,
  taskNumber: 84851,
  taskStatus: 170521,
  taskRequestType: 170529,
  taskTitle: 178747,
  taskType: 178749,
  taskUrl: 178974,
  deliveredVersion: 178975,
  businessArea: 207467,
} as const;

export class MovideskJsonImportService {
  async execute(
    fileBuffer: Buffer,
    options: { fileName?: string | null; userId?: number | null } = {},
  ): Promise<ImportResult> {
    if (!fileBuffer?.length) {
      throw new Error("O arquivo JSON enviado está vazio.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fileBuffer.toString("utf8").replace(/^\uFEFF/, ""));
    } catch {
      throw new Error("O arquivo não contém um JSON válido.");
    }

    const rows = this.resolveRows(parsed);
    if (!rows.length) {
      throw new Error("O JSON não possui tickets para importar.");
    }
    if (rows.length > 10_000) {
      throw new Error("O arquivo excede o limite de 10.000 tickets por lote.");
    }

    const batchId = crypto.randomUUID();
    const importRun = await prisma.importRun.create({
      data: {
        batch: batchId,
        source: "MOVIDESK_JSON",
        fileName: options.fileName ?? null,
        userId: options.userId ?? null,
        status: "PROCESSING",
        totalRows: rows.length,
      },
    });

    let created = 0;
    let updated = 0;
    let ignored = 0;
    let errors = 0;
    const analysts = new Set<string>();
    const clients = new Set<string>();
    const categories = new Set<string>();
    const services = new Set<string>();
    const errorDetails: { row: number; message: string }[] = [];
    const seen = new Set<number>();

    for (let index = 0; index < rows.length; index += 1) {
      try {
        const ticket = this.mapTicket(rows[index]!);
        if (seen.has(ticket.movideskId)) {
          ignored += 1;
          errorDetails.push({
            row: index + 1,
            message: `Ticket ${ticket.movideskId} duplicado no arquivo e ignorado.`,
          });
          continue;
        }
        seen.add(ticket.movideskId);

        if (ticket.owner) analysts.add(ticket.owner);
        if (ticket.client) clients.add(ticket.client);
        if (ticket.category) categories.add(ticket.category);
        if (ticket.service) services.add(ticket.service);

        const existing = await prisma.ticket.findUnique({
          where: { movideskId: ticket.movideskId },
          select: { id: true },
        });

        await prisma.ticket.upsert({
          where: { movideskId: ticket.movideskId },
          create: {
            ...ticket,
            importSource: "MOVIDESK_JSON",
            importBatch: batchId,
            importedAt: new Date(),
            importRunId: importRun.id,
          },
          update: {
            ...ticket,
            importSource: "MOVIDESK_JSON",
            importBatch: batchId,
            importedAt: new Date(),
            importRunId: importRun.id,
          },
        });

        if (existing) updated += 1;
        else created += 1;
      } catch (error) {
        errors += 1;
        errorDetails.push({
          row: index + 1,
          message: error instanceof Error ? error.message : "Erro desconhecido.",
        });
      }
    }

    const status = errors > 0 ? "PARTIAL" : "SUCCESS";
    await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        status,
        insertedRows: created,
        updatedRows: updated,
        skippedRows: ignored,
        errorRows: errors,
        finishedAt: new Date(),
        message:
          errors > 0
            ? `Importação JSON concluída com ${errors} erro(s).`
            : ignored > 0
              ? `Importação JSON concluída com ${ignored} registro(s) ignorado(s).`
              : "Importação JSON concluída com sucesso.",
      },
    });

    return {
      batchId,
      totalRows: rows.length,
      created,
      updated,
      ignored,
      errors,
      analysts: [...analysts].sort(),
      clients: [...clients].sort(),
      categories: [...categories].sort(),
      services: [...services].sort(),
      errorDetails: errorDetails.slice(0, 100),
    };
  }

  private resolveRows(parsed: unknown): JsonObject[] {
    if (Array.isArray(parsed)) {
      return parsed.filter(this.isObject);
    }
    if (!this.isObject(parsed)) return [];
    const candidates = [parsed.items, parsed.tickets, parsed.data, parsed.value];
    const rows = candidates.find(Array.isArray);
    return Array.isArray(rows) ? rows.filter(this.isObject) : [];
  }

  private isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private mapTicket(row: JsonObject) {
    const movideskId = this.toInteger(row.id);
    if (!movideskId) throw new Error("Ticket sem identificador válido.");

    const subject = this.toText(row.subject);
    if (!subject) throw new Error(`Ticket ${movideskId}: assunto não informado.`);

    const createdDate = this.toDate(row.createdDate);
    if (!createdDate) throw new Error(`Ticket ${movideskId}: data de abertura inválida.`);

    const owner = this.personName(row.owner);
    const createdBy = this.personName(row.createdBy);
    const clientInfo = this.primaryClient(row.clients);
    const status = this.toText(row.status) ?? "Não informado";
    const customFields = Array.isArray(row.customFieldValues)
      ? row.customFieldValues.filter(this.isObject) as CustomField[]
      : [];

    return {
      movideskId,
      protocol: this.toText(row.protocol) ?? String(movideskId),
      subject,
      category: this.toText(row.category),
      cause: this.customValue(customFields, CUSTOM_FIELDS.cause),
      causeDetail: this.customValue(customFields, CUSTOM_FIELDS.causeDetail),
      urgency: this.toText(row.urgency),
      status,
      baseStatus: this.toText(row.baseStatus) ?? this.mapBaseStatus(status),
      justification: this.toText(row.justification),
      client: clientInfo.organization,
      contact: clientInfo.contact,
      owner,
      ownerTeam: this.toText(row.ownerTeam),
      service: this.toText(row.serviceSecondLevel),
      department: this.toText(row.serviceFirstLevel),
      serviceFirstLevel: this.toText(row.serviceFirstLevel),
      serviceSecondLevel: this.toText(row.serviceSecondLevel),
      serviceThirdLevel: this.toText(row.serviceThirdLevel),
      businessArea: this.customValue(customFields, CUSTOM_FIELDS.businessArea),
      origin: this.toInteger(row.origin),
      isDeleted: Boolean(row.isDeleted),
      createdBy,
      createdDate,
      dueDate: this.toDate(row.slaSolutionDate),
      firstResponseDueDate: this.toDate(row.slaResponseDate),
      firstResponseDate: this.toDate(row.slaRealResponseDate),
      resolvedDate: this.toDate(row.resolvedIn),
      closedDate: this.toDate(row.closedIn),
      canceledDate: this.toDate(row.canceledIn),
      reopenedDate: this.toDate(row.reopenedIn),
      lastActionDate: this.toDate(row.lastActionDate),
      lastUpdate: this.toDate(row.lastUpdate),
      actionCount: this.toInteger(row.actionCount),
      resolvedInFirstCall:
        typeof row.resolvedInFirstCall === "boolean" ? row.resolvedInFirstCall : null,
      lifetimeMinutes: this.toInteger(row.lifeTimeWorkingTime),
      stoppedMinutes: this.toInteger(row.stoppedTime),
      stoppedWorkingMinutes: this.toInteger(row.stoppedTimeWorkingTime),
      slaAgreement: this.toText(row.slaAgreement),
      slaAgreementRule: this.toText(row.slaAgreementRule),
      slaSolutionTimeMinutes: this.toInteger(row.slaSolutionTime),
      slaResponseTimeMinutes: this.toInteger(row.slaResponseTime),
      slaSolutionDueDate: this.toDate(row.slaSolutionDate),
      slaResponseDueDate: this.toDate(row.slaResponseDate),
      slaRealResponseDate: this.toDate(row.slaRealResponseDate),
      slaPaused:
        typeof row.slaSolutionDateIsPaused === "boolean"
          ? row.slaSolutionDateIsPaused
          : null,
      taskNumber: this.toInteger(this.customValue(customFields, CUSTOM_FIELDS.taskNumber)),
      taskStatus: this.customValue(customFields, CUSTOM_FIELDS.taskStatus),
      taskTitle: this.customValue(customFields, CUSTOM_FIELDS.taskTitle),
      taskType:
        this.customValue(customFields, CUSTOM_FIELDS.taskType) ??
        this.customValue(customFields, CUSTOM_FIELDS.taskRequestType),
      taskUrl: this.customValue(customFields, CUSTOM_FIELDS.taskUrl),
      registeredVersion: this.customValue(customFields, CUSTOM_FIELDS.registeredVersion),
      deliveredVersion: this.customValue(customFields, CUSTOM_FIELDS.deliveredVersion),
      rawData: row as Prisma.InputJsonValue,
    };
  }

  private primaryClient(value: unknown) {
    const clients = Array.isArray(value) ? value.filter(this.isObject) : [];
    const first = clients[0];
    if (!first) return { organization: null, contact: null };
    const organization = this.isObject(first.organization)
      ? this.toText(first.organization.businessName)
      : null;
    return {
      organization: organization ?? this.toText(first.businessName),
      contact: organization ? this.toText(first.businessName) : null,
    };
  }

  private personName(value: unknown) {
    return this.isObject(value) ? this.toText(value.businessName) : null;
  }

  private customValue(fields: CustomField[], id: number) {
    const matches = fields.filter((field) => Number(field.customFieldId) === id);
    const values: string[] = [];
    for (const field of matches) {
      const direct = this.toText(field.value);
      if (direct) values.push(direct);
      for (const item of field.items ?? []) {
        const value =
          this.toText(item.customFieldItem) ??
          this.toText(item.personId) ??
          this.toText(item.clientId) ??
          this.toText(item.team);
        if (value) values.push(value);
      }
    }
    return [...new Set(values)].join("; ") || null;
  }

  private toText(value: unknown) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
  }

  private toInteger(value: unknown) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  private toDate(value: unknown) {
    const text = this.toText(value);
    if (!text) return null;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private mapBaseStatus(status: string) {
    const normalized = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (normalized.includes("cancel")) return "Canceled";
    if (normalized.includes("fech")) return "Closed";
    if (normalized.includes("resolv") || normalized.includes("conclu")) return "Resolved";
    if (normalized.includes("aguard") || normalized.includes("paus")) return "Stopped";
    return "New";
  }
}
