import { prisma } from "../database/prisma";
import { SIMER_CLIENTS, SUPPORT_ANALYSTS, SUPPORT_COORDINATOR, azureOperationalScope, ticketOperationalScope } from "../domain/OperationalScope";
import { microsoftKnowledgeService } from "./MicrosoftKnowledgeService";
import { SIMER_SERVICE_CATALOG, suggestSimerService, type SimerServiceCatalogItem } from "../domain/SimerServiceCatalog";

const OPEN_TICKET_STATES = ["New", "InAttendance", "Stopped"];
const CLOSED_WORK_ITEM_STATES = ["Closed", "Resolved", "Concluído", "Concluido", "Done", "Removed"];

export class CoordinationService {
  async details(kind: string, analyst?: string, limit = 50, serviceModule?: string, serviceClient?: string) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 72 * 60 * 60 * 1_000);
    const nextSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const ticketScope = ticketOperationalScope();
    const azureScope = azureOperationalScope();

    const ticketExtra: Record<string, unknown> =
      kind === "critical" ? { urgency: "Crítica" } :
      kind === "stale" ? { OR: [{ lastUpdate: { lt: staleBefore } }, { lastUpdate: null }] } :
      kind === "dueSoon" ? { dueDate: { gte: now, lte: nextSevenDays } } :
      kind === "overdue" ? { dueDate: { lt: now } } :
      {};

    const azureExtra: Record<string, unknown> =
      kind === "blocked" ? { blockedProcess: true } :
      kind === "unassigned" ? { assignedToName: null } :
      {};

    const wantsTickets = ["backlog", "critical", "stale", "dueSoon", "overdue", "analyst", "serviceModule", "serviceClient", "serviceAnalyst"].includes(kind);
    const wantsAzure = ["blocked", "unassigned", "analyst"].includes(kind);

    const [tickets, workItems] = await Promise.all([
      wantsTickets
        ? prisma.ticket.findMany({
            where: {
              AND: [
                ticketScope,
                { isDeleted: false, baseStatus: { in: OPEN_TICKET_STATES } },
                ticketExtra,
                ...(analyst ? [{ owner: { equals: analyst, mode: "insensitive" as const } }] : []),
                ...(serviceClient ? [{ client: { equals: serviceClient, mode: "insensitive" as const } }] : []),
                ...(serviceModule ? [{
                  OR: [
                    { service: { contains: serviceModule, mode: "insensitive" as const } },
                    { serviceFirstLevel: { contains: serviceModule, mode: "insensitive" as const } },
                    { serviceSecondLevel: { contains: serviceModule, mode: "insensitive" as const } },
                    { serviceThirdLevel: { contains: serviceModule, mode: "insensitive" as const } },
                  ],
                }] : []),
              ],
            },
            orderBy: [{ urgency: "desc" }, { lastUpdate: "asc" }],
            take: safeLimit,
            select: {
              movideskId: true, subject: true, status: true, urgency: true, client: true,
              owner: true, lastUpdate: true, dueDate: true, taskNumber: true,
              registeredVersion: true, deliveredVersion: true,
              service: true, serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true,
              category: true, cause: true,
            },
          })
        : Promise.resolve([]),
      wantsAzure
        ? prisma.azureWorkItem.findMany({
            where: {
              AND: [
                azureScope,
                { state: { notIn: CLOSED_WORK_ITEM_STATES } },
                azureExtra,
                ...(analyst ? [{ createdByName: { equals: analyst, mode: "insensitive" as const } }] : []),
              ],
            },
            orderBy: [{ azureChangedAt: "asc" }],
            take: safeLimit,
            select: {
              id: true, workItemType: true, title: true, state: true, client: true,
              assignedToName: true, createdByName: true, criticality: true, blockedProcess: true,
              movideskTicket: true, registeredVersion: true, deliveredVersion: true,
              azureChangedAt: true, remoteUrl: true,
            },
          })
        : Promise.resolve([]),
    ]);

    return {
      kind,
      analyst: analyst ?? null,
      serviceModule: serviceModule ?? null,
      serviceClient: serviceClient ?? null,
      total: tickets.length + workItems.length,
      truncated: tickets.length === safeLimit || workItems.length === safeLimit,
      tickets,
      workItems,
    };
  }

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
      overdueTickets,
      blockedItems,
      unassignedItems,
      ticketOwners,
      workItemOwners,
      serviceTickets,
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
      prisma.ticket.count({
        where: {
          AND: [
            ticketScope,
            {
              isDeleted: false,
              baseStatus: { in: OPEN_TICKET_STATES },
              dueDate: { lt: now },
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
      prisma.ticket.findMany({
        where: { AND: [ticketScope, { isDeleted: false, baseStatus: { in: OPEN_TICKET_STATES } }] },
        select: {
          id: true, subject: true, category: true, cause: true, service: true, client: true, owner: true,
          serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true,
        },
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

    const workloadRows = [...workload.values()]
      .filter((item) => item.tickets > 0 || item.workItems > 0)
      .map((item) => ({ ...item, total: item.tickets + item.workItems }))
      .sort((a, b) => b.total - a.total || a.analyst.localeCompare(b.analyst, "pt-BR"));

    const normalize = (value: string) =>
      value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
    const servicePath = (ticket: (typeof serviceTickets)[number]) =>
      [ticket.serviceFirstLevel, ticket.serviceSecondLevel, ticket.serviceThirdLevel]
        .map((value) => value?.trim()).filter((value): value is string => Boolean(value))
        .join(" » ") || ticket.service?.trim() || "";

    const serviceCatalogMap = new Map<string, SimerServiceCatalogItem>();
    for (const item of SIMER_SERVICE_CATALOG) serviceCatalogMap.set(normalize(item.path), item);
    for (const ticket of serviceTickets) {
      const path = servicePath(ticket);
      if (!path || !/simer/i.test(path)) continue;
      const parts = path.split("»").map((value) => value.trim()).filter(Boolean);
      const name = parts.at(-1) ?? path;
      const module = parts.find((value, index) => index >= 2 && !/^(siagri simer|simer)$/i.test(value)) ?? null;
      serviceCatalogMap.set(normalize(path), { id: `observed:${normalize(path)}`, path, name, module });
    }
    const serviceCatalog = [...serviceCatalogMap.values()];
    const isGenericService = (path: string) => {
      const values = path.split("»").map((value) => normalize(value)).filter(Boolean);
      if (!values.some((value) => value.includes("simer"))) return false;
      return values.filter((value) => !/^(atendimento ao cliente|siagri simer|simer|siagri)$/.test(value)).length === 0;
    };
    let withoutService = 0;
    let genericService = 0;
    let suspectedMismatch = 0;
    const serviceCounts = new Map<string, number>();
    for (const ticket of serviceTickets) {
      const path = servicePath(ticket);
      if (!path) {
        withoutService += 1;
        continue;
      }
      serviceCounts.set(path, (serviceCounts.get(path) ?? 0) + 1);
      if (isGenericService(path)) genericService += 1;
      const suggestion = suggestSimerService({
        subject: ticket.subject,
        category: ticket.category,
        cause: ticket.cause,
        currentService: ticket.service,
        serviceFirstLevel: ticket.serviceFirstLevel,
        serviceSecondLevel: ticket.serviceSecondLevel,
        serviceThirdLevel: ticket.serviceThirdLevel,
      }, serviceCatalog);
      if (suggestion && suggestion.confidence !== "LOW") {
        const current = normalize(path);
        const suggested = normalize(suggestion.path);
        if (current !== suggested && !suggested.includes(current)) suspectedMismatch += 1;
      }
    }
    const serviceRanking = [...serviceCounts.entries()]
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count || a.service.localeCompare(b.service, "pt-BR"))
      .slice(0, 10);
    const serviceModuleCounts = new Map<string, number>();
    const serviceClientIssues = new Map<string, { total: number; issues: number }>();
    const serviceAnalystIssues = new Map<string, { total: number; issues: number }>();
    for (const ticket of serviceTickets) {
      const path = servicePath(ticket);
      const parts = path.split("»").map((value) => value.trim()).filter(Boolean);
      const module = parts.find((value, index) => index >= 2 && !/^(siagri simer|simer)$/i.test(value));
      if (module) serviceModuleCounts.set(module, (serviceModuleCounts.get(module) ?? 0) + 1);

      const suggestion = path ? suggestSimerService({
        subject: ticket.subject, category: ticket.category, cause: ticket.cause, currentService: ticket.service,
        serviceFirstLevel: ticket.serviceFirstLevel, serviceSecondLevel: ticket.serviceSecondLevel, serviceThirdLevel: ticket.serviceThirdLevel,
      }, serviceCatalog) : null;
      const mismatch = Boolean(path && suggestion && suggestion.confidence !== "LOW" && normalize(path) !== normalize(suggestion.path) && !normalize(suggestion.path).includes(normalize(path)));
      const issue = !path || isGenericService(path) || mismatch;

      if (ticket.client) {
        const row = serviceClientIssues.get(ticket.client) ?? { total: 0, issues: 0 };
        row.total += 1; if (issue) row.issues += 1; serviceClientIssues.set(ticket.client, row);
      }
      if (ticket.owner) {
        const row = serviceAnalystIssues.get(ticket.owner) ?? { total: 0, issues: 0 };
        row.total += 1; if (issue) row.issues += 1; serviceAnalystIssues.set(ticket.owner, row);
      }
    }
    const moduleRanking = [...serviceModuleCounts.entries()].map(([module, count]) => ({ module, count }))
      .sort((a, b) => b.count - a.count || a.module.localeCompare(b.module, "pt-BR")).slice(0, 10);
    const clientQuality = [...serviceClientIssues.entries()].map(([client, row]) => ({
      client, ...row, rate: row.total ? Math.round(((row.total - row.issues) / row.total) * 100) : 0,
    })).sort((a, b) => b.issues - a.issues || b.total - a.total).slice(0, 10);
    const analystQuality = [...serviceAnalystIssues.entries()].map(([analyst, row]) => ({
      analyst, ...row, rate: row.total ? Math.round(((row.total - row.issues) / row.total) * 100) : 0,
    })).sort((a, b) => b.issues - a.issues || b.total - a.total).slice(0, 10);
    const classifiedServices = Math.max(serviceTickets.length - withoutService, 0);
    const specificServices = Math.max(classifiedServices - genericService, 0);
    const classificationRate = serviceTickets.length
      ? Math.round((specificServices / serviceTickets.length) * 100)
      : 0;

    const sortedLoads = workloadRows.map((item) => item.total).sort((a, b) => a - b);
    let medianLoad = 0;
    if (sortedLoads.length > 0) {
      const middle = Math.floor(sortedLoads.length / 2);
      if (sortedLoads.length % 2 === 1) {
        medianLoad = sortedLoads[middle] ?? 0;
      } else {
        const lower = sortedLoads[middle - 1] ?? 0;
        const upper = sortedLoads[middle] ?? 0;
        medianLoad = Math.round((lower + upper) / 2);
      }
    }
    const overloadedAnalysts = workloadRows.filter((item) =>
      medianLoad > 0 && item.total >= Math.max(medianLoad * 1.5, medianLoad + 5),
    );

    const priorities = [
      {
        key: "overdue",
        kind: "overdue",
        severity: "critical",
        title: "Prazos vencidos",
        count: overdueTickets,
        description: "Atendimentos abertos cujo prazo já foi ultrapassado.",
        action: "Atuar primeiro nos itens vencidos e validar impedimentos.",
      },
      {
        key: "critical",
        kind: "critical",
        severity: "critical",
        title: "Atendimentos críticos",
        count: criticalTickets,
        description: "Itens críticos ainda em aberto no escopo da operação.",
        action: "Confirmar responsável, próximo passo e comunicação com o cliente.",
      },
      {
        key: "blocked",
        kind: "blocked",
        severity: "high",
        title: "Tarefas bloqueadas",
        count: blockedItems,
        description: "Work Items Azure com bloqueio de processo identificado.",
        action: "Remover impedimentos ou escalar o bloqueio para a área responsável.",
      },
      {
        key: "stale",
        kind: "stale",
        severity: "high",
        title: "Sem movimento há 72h",
        count: staleTickets,
        description: "Atendimentos sem atualização recente que podem estar perdendo tração.",
        action: "Revisar pendência, registrar avanço ou atualizar a expectativa.",
      },
      {
        key: "dueSoon",
        kind: "dueSoon",
        severity: "medium",
        title: "Prazos nos próximos 7 dias",
        count: dueSoon,
        description: "Itens que entrarão em zona de vencimento na próxima semana.",
        action: "Antecipar validações e dependências antes do vencimento.",
      },
      {
        key: "unassigned",
        kind: "unassigned",
        severity: "medium",
        title: "Itens sem responsável",
        count: unassignedItems,
        description: "Work Items Azure sem responsável identificado.",
        action: "Definir ownership para evitar itens órfãos na operação.",
      },
    ].filter((item) => item.count > 0);

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
        overdueTickets,
        blockedItems,
        unassignedItems,
      },
      workload: workloadRows,
      serviceAnalytics: {
        totalOpenTickets: serviceTickets.length,
        classifiedServices,
        specificServices,
        withoutService,
        genericService,
        suspectedMismatch,
        classificationRate,
        catalogSize: serviceCatalog.length,
        ranking: serviceRanking,
        moduleRanking,
        clientQuality,
        analystQuality,
      },
      intelligence: {
        priorities,
        medianLoad,
        overloadedAnalysts,
        health: priorities.some((item) => item.severity === "critical")
          ? "critical"
          : priorities.some((item) => item.severity === "high")
            ? "attention"
            : "stable",
      },
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
