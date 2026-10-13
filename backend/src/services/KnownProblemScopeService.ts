import { prisma } from "../database/prisma";
import { resolveSimerClient, scopedAzureWhere, scopedTicketWhere } from "../domain/OperationalScope";

type ProblemScope = { client?: string | null; movideskTicket?: string | number | null; azureWorkItem?: string | number | null };
const numericId = (value: string | number | null | undefined) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export function knownProblemBelongsToScope(row: ProblemScope, tickets: ReadonlySet<number>, tasks: ReadonlySet<number>): boolean {
  if (row.client?.trim() && !resolveSimerClient(row.client)) return false;
  if (row.movideskTicket && !tickets.has(numericId(row.movideskTicket) ?? -1)) return false;
  if (row.azureWorkItem && !tasks.has(numericId(row.azureWorkItem) ?? -1)) return false;
  // Publicações gerais, sem cliente ou vínculo, são conhecimento compartilhado.
  return true;
}

export async function filterKnownProblemsToScope<T extends ProblemScope>(rows: T[]): Promise<T[]> {
  const ids = (field: "movideskTicket" | "azureWorkItem") => [...new Set(rows.map(row => numericId(row[field])).filter((id): id is number => id !== null))];
  const ticketIds = ids("movideskTicket");
  const taskIds = ids("azureWorkItem");
  const [tickets, tasks] = await Promise.all([
    ticketIds.length ? prisma.ticket.findMany({ where: scopedTicketWhere({ movideskId: { in: ticketIds } }), select: { movideskId: true } }) : [],
    taskIds.length ? prisma.azureWorkItem.findMany({ where: scopedAzureWhere({ id: { in: taskIds } }), select: { id: true } }) : [],
  ]);
  const allowedTickets = new Set(tickets.map(row => row.movideskId));
  const allowedTasks = new Set(tasks.map(row => row.id));
  return rows.filter(row => knownProblemBelongsToScope(row, allowedTickets, allowedTasks));
}
