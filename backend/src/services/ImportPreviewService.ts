import crypto from "node:crypto";
import ExcelJS from "exceljs";

import { prisma } from "../database/prisma";

type JsonObject = Record<string, unknown>;

export type ImportPreview = {
  fileName: string;
  format: "JSON" | "EXCEL";
  size: number;
  hash: string;
  totalRows: number;
  columns: string[];
  duplicate: null | {
    batchId: string;
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
  };
};

export class ImportPreviewService {
  public async inspect(file: Express.Multer.File): Promise<ImportPreview> {
    const name = file.originalname.toLowerCase();
    const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
    const metadata = name.endsWith(".json")
      ? this.inspectJson(file.buffer)
      : await this.inspectExcel(file.buffer);

    const previous = await prisma.importRun.findFirst({
      where: { fileHash: hash },
      orderBy: { startedAt: "desc" },
      select: { batch: true, status: true, startedAt: true, finishedAt: true },
    });

    return {
      fileName: file.originalname,
      size: file.size,
      hash,
      ...metadata,
      duplicate: previous
        ? {
            batchId: previous.batch,
            status: previous.status,
            startedAt: previous.startedAt,
            finishedAt: previous.finishedAt,
          }
        : null,
    };
  }

  private inspectJson(buffer: Buffer) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/, ""));
    } catch {
      throw new Error("O arquivo não contém um JSON válido.");
    }

    const rows = this.resolveJsonRows(parsed);
    if (!rows.length) throw new Error("O JSON não possui tickets para importar.");
    if (rows.length > 10_000) throw new Error("O arquivo excede o limite de 10.000 tickets por lote.");

    return {
      format: "JSON" as const,
      totalRows: rows.length,
      columns: Object.keys(rows[0] ?? {}).slice(0, 30),
    };
  }

  private async inspectExcel(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as never);
    } catch {
      throw new Error("Não foi possível abrir o Excel. Salve o relatório novamente como .xlsx.");
    }

    for (const worksheet of workbook.worksheets) {
      for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 30); rowNumber += 1) {
        const values = (worksheet.getRow(rowNumber).values as unknown[])
          .slice(1)
          .map((value) => this.cellText(value));
        const normalized = values.map((value) => this.normalize(value));
        if (
          normalized.includes("numero") &&
          normalized.includes("assunto") &&
          normalized.includes("aberto em")
        ) {
          const totalRows = Math.max(0, worksheet.rowCount - rowNumber);
          if (!totalRows) throw new Error("A planilha não possui linhas de atendimento.");
          return {
            format: "EXCEL" as const,
            totalRows,
            columns: values.filter(Boolean),
          };
        }
      }
    }

    throw new Error("O Excel precisa conter as colunas Número, Assunto e Aberto em.");
  }

  private resolveJsonRows(parsed: unknown): JsonObject[] {
    if (Array.isArray(parsed)) return parsed.filter(this.isObject);
    if (!this.isObject(parsed)) return [];
    const rows = [parsed.items, parsed.tickets, parsed.data, parsed.value].find(Array.isArray);
    return Array.isArray(rows) ? rows.filter(this.isObject) : [];
  }

  private isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private cellText(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "object" && "text" in value) return String((value as { text: unknown }).text ?? "").trim();
    if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "").trim();
    return String(value).trim();
  }

  private normalize(value: string) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  }
}
