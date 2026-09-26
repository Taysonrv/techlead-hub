import type { Prisma } from "@prisma/client";

export const COORDINATION_OPEN_TICKET_STATES = ["New", "InAttendance", "Stopped"] as const;
export const COORDINATION_CLOSED_WORK_ITEM_STATES = ["Closed", "Resolved", "Concluído", "Concluido", "Done", "Removed"] as const;

export type CoordinationPriorityKind = "backlog" | "critical" | "stale" | "dueSoon" | "overdue";
export type CoordinationAzureKind = "blocked" | "unassigned";

export function coordinationOpenTicketPredicate(): Prisma.TicketWhereInput {
  return {
    isDeleted: false,
    baseStatus: { in: [...COORDINATION_OPEN_TICKET_STATES] },
  };
}

export function coordinationTicketPriorityPredicate(
  kind: CoordinationPriorityKind,
  now = new Date(),
): Prisma.TicketWhereInput {
  const staleBefore = new Date(now.getTime() - 72 * 60 * 60 * 1_000);
  const nextSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);

  const extra: Prisma.TicketWhereInput =
    kind === "critical" ? { urgency: "Crítica" } :
    kind === "stale" ? { OR: [{ lastUpdate: { lt: staleBefore } }, { lastUpdate: null }] } :
    kind === "dueSoon" ? { dueDate: { gte: now, lte: nextSevenDays } } :
    kind === "overdue" ? { dueDate: { lt: now } } :
    {};

  return { AND: [coordinationOpenTicketPredicate(), extra] };
}

export function coordinationOpenAzurePredicate(): Prisma.AzureWorkItemWhereInput {
  return { state: { notIn: [...COORDINATION_CLOSED_WORK_ITEM_STATES] } };
}

export function coordinationAzurePriorityPredicate(kind: CoordinationAzureKind): Prisma.AzureWorkItemWhereInput {
  return {
    AND: [
      coordinationOpenAzurePredicate(),
      kind === "blocked" ? { blockedProcess: true } : { assignedToName: null },
    ],
  };
}
