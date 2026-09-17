import { prisma } from "../database/prisma";
import { microsoftKnowledgeService } from "./MicrosoftKnowledgeService";

const OPEN_TICKET_STATES = ["New", "InAttendance", "Stopped"];
const CLOSED_WORK_ITEM_STATES = ["Closed", "Resolved", "Concluído", "Concluido", "Done", "Removed"];

export class CoordinationService {
  async summary(userId: number) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 72 * 60 * 60 * 1_000);
    const nextSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
    const [openTickets, criticalTickets, staleTickets, dueSoon, blockedItems, unassignedItems, ticketOwners, workItemOwners] = await Promise.all([
      prisma.ticket.count({ where: { isDeleted: false, baseStatus: { in: OPEN_TICKET_STATES } } }),
      prisma.ticket.count({ where: { isDeleted: false, urgency: "Crítica", baseStatus: { in: OPEN_TICKET_STATES } } }),
      prisma.ticket.count({ where: { isDeleted: false, baseStatus: { in: OPEN_TICKET_STATES }, OR: [{ lastUpdate: { lt: staleBefore } }, { lastUpdate: null }] } }),
      prisma.ticket.count({ where: { isDeleted: false, baseStatus: { in: OPEN_TICKET_STATES }, dueDate: { gte: now, lte: nextSevenDays } } }),
      prisma.azureWorkItem.count({ where: { blockedProcess: true, state: { notIn: CLOSED_WORK_ITEM_STATES } } }),
      prisma.azureWorkItem.count({ where: { assignedToName: null, state: { notIn: CLOSED_WORK_ITEM_STATES } } }),
      prisma.ticket.groupBy({ by: ["owner"], where: { isDeleted: false, baseStatus: { in: OPEN_TICKET_STATES }, owner: { not: null } }, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 20 }),
      prisma.azureWorkItem.groupBy({ by: ["assignedToName"], where: { state: { notIn: CLOSED_WORK_ITEM_STATES }, assignedToName: { not: null } }, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 20 }),
    ]);
    const workload = new Map<string, { analyst: string; tickets: number; workItems: number }>();
    for (const row of ticketOwners) if (row.owner) workload.set(row.owner, { analyst: row.owner, tickets: row._count.id, workItems: 0 });
    for (const row of workItemOwners) if (row.assignedToName) {
      const current = workload.get(row.assignedToName) ?? { analyst: row.assignedToName, tickets: 0, workItems: 0 };
      current.workItems = row._count.id;
      workload.set(row.assignedToName, current);
    }
    const microsoft = await microsoftKnowledgeService.coordinationSnapshot(userId).catch(() => ({ connected: false, plannerTasks: [], events: [], teams: [], warnings: ["Microsoft 365 temporariamente indisponível."] }));
    return {
      generatedAt: now,
      indicators: { openTickets, criticalTickets, staleTickets, dueSoon, blockedItems, unassignedItems },
      workload: [...workload.values()].map((item) => ({ ...item, total: item.tickets + item.workItems })).sort((a, b) => b.total - a.total),
      integrations: {
        planner: { configured: Boolean(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID), connected: microsoft.connected, items: microsoft.plannerTasks.length },
        outlook: { configured: Boolean(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID), connected: microsoft.connected, items: microsoft.events.length },
        teams: { configured: Boolean(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID), connected: microsoft.connected, items: microsoft.teams.length },
      },
      microsoft,
    };
  }
}

export const coordinationService = new CoordinationService();
