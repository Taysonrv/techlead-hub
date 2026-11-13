/**
 * Read-only reconciliation of an official Movidesk XLSX export against local DB.
 * Usage: npm run metrics:reconcile -- "C:\\exports\\pendentes.xlsx"
 * No remote API calls, no mutations and no automatic expansion of access scope.
 */
import ExcelJS from "exceljs";
import { prisma } from "../src/database/prisma";
import { movideskDashboardScope } from "../src/domain/OperationalScope";

function valueOf(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value) return String(value.text ?? "").trim();
  if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
  return String(value).trim();
}
function canonicalStatus(value: string): string {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim().replace(/[ _-]+/g, " ");
  const aliases: Record<string, string> = {
    "new": "new", "novo": "new",
    "inattendance": "inattendance", "em atendimento": "inattendance", "em andamento": "inattendance",
    "waiting": "waiting", "aguardando": "waiting",
    "stopped": "stopped", "paused": "stopped", "pausado": "stopped",
    "waitinginternal": "waitinginternal", "aguardando interno": "waitinginternal",
    "resolved": "resolved", "resolvido": "resolved",
    "closed": "closed", "fechado": "closed",
    "canceled": "canceled", "cancelled": "canceled", "cancelado": "canceled",
  };
  return aliases[normalized.replace(/\s/g, "")] ?? aliases[normalized] ?? normalized;
}
function csv(value: unknown): string {
  const text = String(value ?? "");
  return '"' + text.replace(/"/g, '""') + '"';
}
async function main() {
  const filename = process.argv[2];
  if (!filename || !/\.xlsx$/i.test(filename)) {
    throw new Error('Informe um arquivo Movidesk .xlsx: npm run metrics:reconcile -- "arquivo.xlsx"');
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Planilha sem abas.");
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => headers.set(valueOf(cell).toLocaleLowerCase("pt-BR"), column));
  const numberColumn = headers.get("número");
  if (!numberColumn) throw new Error('Coluna "Número" não encontrada.');
  const statusColumn = headers.get("status");
  const clientColumn = headers.get("cliente (completo)");
  const ownerColumn = headers.get("responsável");
  const expected = new Map<number, { status: string; client: string; owner: string }>();
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const id = Number(valueOf(row.getCell(numberColumn)));
    if (!Number.isSafeInteger(id) || id <= 0) return;
    expected.set(id, {
      status: statusColumn ? valueOf(row.getCell(statusColumn)) : "",
      client: clientColumn ? valueOf(row.getCell(clientColumn)) : "",
      owner: ownerColumn ? valueOf(row.getCell(ownerColumn)) : "",
    });
  });
  const ids = [...expected.keys()];
  const [present, visible] = await Promise.all([
    prisma.ticket.findMany({
      where: { movideskId: { in: ids } },
      select: { movideskId: true, baseStatus: true, status: true, client: true, owner: true, service: true, createdDate: true, resolvedDate: true, closedDate: true, importedAt: true, isDeleted: true },
    }),
    prisma.ticket.findMany({
      where: { AND: [movideskDashboardScope(), { movideskId: { in: ids } }] },
      select: { movideskId: true },
    }),
  ]);
  const byId = new Map(present.map((ticket) => [ticket.movideskId, ticket]));
  const visibleIds = new Set(visible.map((ticket) => ticket.movideskId));
  const counters: Record<string, number> = {};
  const lines = ["id,classificacao,status_movidesk,status_hub,cliente_movidesk,cliente_hub,responsavel_movidesk,responsavel_hub,servico_hub,importado_em"];
  for (const [id, row] of expected) {
    const ticket = byId.get(id);
    const statusHub = ticket?.baseStatus || ticket?.status || "";
    const classification = !ticket ? "NAO_SINCRONIZADO"
      : !visibleIds.has(id) ? "EXCLUIDO_PELO_ESCOPO"
      : row.status && canonicalStatus(row.status) !== canonicalStatus(statusHub) ? "STATUS_DIVERGENTE"
      : "CONTABILIZAVEL";
    counters[classification] = (counters[classification] ?? 0) + 1;
    lines.push([id, classification, row.status, statusHub, row.client, ticket?.client, row.owner, ticket?.owner, ticket?.service, ticket?.importedAt?.toISOString()].map(csv).join(","));
  }
  process.stdout.write(lines.join("\n") + "\n");
  process.stderr.write("Conciliação (IDs únicos): " + JSON.stringify({ totalMovidesk: ids.length, ...counters }) + "\n");
}
main().catch((error: unknown) => {
  process.stderr.write("Falha na conciliação: " + (error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
