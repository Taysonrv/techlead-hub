import { prisma } from "../database/prisma";
import { SIMER_CLIENTS, SUPPORT_ANALYSTS, SUPPORT_COORDINATOR, azureOperationalScope, ticketOperationalScope } from "../domain/OperationalScope";
import { microsoftKnowledgeService } from "./MicrosoftKnowledgeService";

const OPEN_TICKET_STATES = ["New", "InAttendance", "Stopped"];
const CLOSED_WORK_ITEM_STATES = ["Closed", "Resolved", "Concluído", "Concluido", "Done", "Removed"];

export class CoordinationService {
  async summary(userId: number) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 72 * 60 * 60 * 1_000);
    const nextSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);

    const ticketScope = ticketOperationalScope();
    const azureScope = azureOperationalScope();

    const [
      openTickets,
      criticalTickets,
      staleTickets,
      dueSoon,
      blockedItems,
      unassignedItems,
      ticketOwners,
      workItemOwners,
    ] = await Promise.all([
      prisma.ticket.count({
        where: { AND: [ticketScope, { isDeleted: false, baseStatus: { in: OPEN_TICKET_STATES } }] },
      }),
      prisma.ticket.count({
        where: { AND: [ticketScope, { isDeleted: false, urgency: "Crítica", baseStatus: { in: OPEN_TICKET_STATES } }] },
      }),
      prisma.ticket.count({
        where: {
          AND: [
            ticketScope,
            {
              isDeleted: false,
              baseStatus: { in: OPEN_TICKET_STATES },
              OR: [{ lastUpdate: { lt: staleBefore } }, { lastUpdate: null }],
            },
          ],
        },
      }),
      prisma.ticket.count({
        where: {
          AND: [
            ticketScope,
            {
              isDeleted: false,
              baseStatus: { in: OPEN_TICKET_STATES },
              dueDate: { gte: now, lte: nextSevenDays },
            },
          ],
        },
      }),
      prisma.azureWorkItem.count({
        where: { AND: [azureScope, { blockedProcess: true, state: { notIn: CLOSED_WORK_ITEM_STATES } }] },
      }),
      prisma.azureWorkItem.count({
        where: { AND: [azureScope, { assignedToName: null, state: { notIn: CLOSED_WORK_ITEM_STATES } }] },
      }),
      prisma.ticket.groupBy({
        by: ["owner"],
        where: {
          AND: [
            ticketScope,
            {
              isDeleted: false,
              baseStatus: { in: OPEN_TICKET_STATES },
              owner: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" },
            },
          ],
        },
        _count: { id: true },
      }),
      prisma.azureWorkItem.groupBy({
        by: ["createdByName"],
        where: {
          AND: [
            azureScope,
            {
              state: { notIn: CLOSED_WORK_ITEM_STATES },
              createdByName: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" },
            },
          ],
        },
        _count: { id: true },
      }),
    ]);

    const workload = new Map<string, { analyst: string; tickets: number; workItems: number }>(
      SUPPORT_ANALYSTS.map((analyst) => [analyst, { analyst, tickets: 0, workItems: 0 }]),
    );

    for (const row of ticketOwners) {
      if (!row.owner) continue;
      const analyst = SUPPORT_ANALYSTS.find(
        (name) => name.localeCompare(row.owner!, "pt-BR", { sensitivity: "base" }) === 0,
      );
      if (!analyst) continue;
      workload.get(analyst)!.tickets += row._count.id;
    }

    for (const row of workItemOwners) {
      if (!row.createdByName) continue;
      const analyst = SUPPORT_ANALYSTS.find(
        (name) => name.localeCompare(row.createdByName!, "pt-BR", { sensitivity: "base" }) === 0,
      );
      if (!analyst) continue;
      workload.get(analyst)!.workItems += row._count.id;
    }

    const microsoft = await microsoftKnowledgeService
      .coordinationSnapshot(userId)
      .catch(() => ({
        connected: false,
        plannerTasks: [],
        events: [],
        teams: [],
        warnings: ["Microsoft 365 temporariamente indisponível."],
      }));

    return {
      generatedAt: now,
      indicators: {
        openTickets,
        criticalTickets,
        staleTickets,
        dueSoon,
        blockedItems,
        unassignedItems,
      },
      workload: [...workload.values()]
        .filter((item) => item.tickets > 0 || item.workItems > 0)
        .map((item) => ({ ...item, total: item.tickets + item.workItems }))
        .sort((a, b) => b.total - a.total || a.analyst.localeCompare(b.analyst, "pt-BR")),
      scope: {
        coordinator: SUPPORT_COORDINATOR,
        analysts: [...SUPPORT_ANALYSTS],
        clients: [...SIMER_CLIENTS],
      },
      integrations: {
        planner: {
          configured: Boolean(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID),
          connected: microsoft.connected,
          items: microsoft.plannerTasks.length,
        },
        outlook: {
          configured: Boolean(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID),
          connected: microsoft.connected,
          items: microsoft.events.length,
        },
        teams: {
          configured: Boolean(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID),
          connected: microsoft.connected,
          items: microsoft.teams.length,
        },
      },
      microsoft,
    };
  }
}

export const coordinationService = new CoordinationService();
