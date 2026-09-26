import { prisma } from "../database/prisma";
import type { Prisma } from "@prisma/client";
import { SIMER_CLIENTS, SUPPORT_ANALYSTS, ticketOperationalScope } from "../domain/OperationalScope";

const TERMINAL = ["Concluído", "Concluido", "Closed", "Done", "Resolved", "Cancelado", "Canceled"];
const technicalLeadershipCache = new Map<string, { expiresAt: number; value: unknown }>();

export type TechnicalLeadershipParams = {
  client?: string | null;
  user?: string | null;
  days?: number | null;
  startDate?: string | null;
  endDate?: string | null;
};

export class TechnicalLeadershipService {
  public async analyze(params: {
    client?: string | null;
    user?: string | null;
    days?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  } = {}) {
    const cacheKey = JSON.stringify(params);
    const cached = technicalLeadershipCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (technicalLeadershipCache.size > 30) technicalLeadershipCache.clear();

    const requestedDays = Math.min(Math.max(params.days ?? 30, 1), 3660);
    const now = new Date();
    const parsedStart = params.startDate ? new Date(`${params.startDate}T00:00:00`) : null;
    const parsedEnd = params.endDate ? new Date(`${params.endDate}T23:59:59.999`) : null;
    const customRange = Boolean(parsedStart && parsedEnd && !Number.isNaN(parsedStart.getTime()) && !Number.isNaN(parsedEnd.getTime()) && parsedStart <= parsedEnd);
    const periodStart = customRange ? parsedStart! : new Date(now.getTime() - requestedDays * 86400000);
    const periodEnd = customRange ? parsedEnd! : now;
    const days = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000));
    const previousStart = new Date(periodStart.getTime() - days * 86400000);
    const stale3d = new Date(now.getTime() - 3 * 86400000);
    const stale5d = new Date(now.getTime() - 5 * 86400000);
    const stale7d = new Date(now.getTime() - 7 * 86400000);
    const stale30d = new Date(now.getTime() - 30 * 86400000);
    const normalize = (value: string | null | undefined) => (value ?? "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
    const openTicket = (ticket: { baseStatus: string | null; status: string }) => {
      const status = normalize(ticket.status);
      return !/conclu|fechad|encerrad|resolvid|cancelad/.test(status)
        && (["New", "InAttendance", "Stopped"].includes(ticket.baseStatus ?? "") || /novo|andamento|aguard|paus|parad|desenvolvimento/.test(status));
    };
    const terminalTask = (state: string) => TERMINAL.some((value) => normalize(value) === normalize(state));
    const ticketWhere: Prisma.TicketWhereInput = {
      AND: [
        ticketOperationalScope(),
        { isDeleted: false },
        ...(params.client ? [{ client: { equals: params.client, mode: "insensitive" as const } }] : []),
        ...(params.user ? [{ owner: { equals: params.user, mode: "insensitive" as const } }] : []),
      ],
    };
    const tickets = await prisma.ticket.findMany({
      where: ticketWhere,
      orderBy: [{ lastUpdate: "asc" }, { createdDate: "asc" }],
      take: 5000,
      select: {
        id: true, movideskId: true, subject: true, category: true, cause: true, urgency: true,
        status: true, baseStatus: true, client: true, owner: true, service: true,
        serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true,
        createdDate: true, dueDate: true, lastUpdate: true, lastActionDate: true,
        resolvedDate: true, closedDate: true, canceledDate: true, reopenedDate: true, firstResponseDate: true,
        contact: true, resolvedInFirstCall: true, lifetimeMinutes: true, stoppedMinutes: true,
        taskNumber: true, solutionSlaIndicator: true, responseSlaIndicator: true,
      },
    });
    const ticketIds = tickets.map((ticket) => ticket.movideskId);
    const taskIds = tickets.map((ticket) => ticket.taskNumber).filter((id): id is number => id !== null);
    const tasks = await prisma.azureWorkItem.findMany({
      where: {
        OR: [
          { createdByName: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" } },
          { assignedToName: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" } },
          { client: { in: [...SIMER_CLIENTS], mode: "insensitive" } },
          ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
          ...(ticketIds.length ? [{ movideskTicket: { in: ticketIds } }] : []),
        ],
      },
      orderBy: [{ azureChangedAt: "asc" }, { id: "asc" }],
      take: 5000,
      select: {
        id: true, workItemType: true, title: true, state: true, client: true, module: true,
        createdByName: true, assignedToName: true, criticality: true, prioritized: true,
        blockedProcess: true, movideskTicket: true, registeredVersion: true, deliveredVersion: true,
        azureCreatedAt: true, azureChangedAt: true, remoteUrl: true,
      },
    });
    const openTickets = tickets.filter(openTicket);
    const openTasks = tasks.filter((task) => !terminalTask(task.state));
    const movement = (ticket: (typeof tickets)[number]) => ticket.lastActionDate ?? ticket.lastUpdate ?? ticket.createdDate;
    const newTooLong = openTickets.filter((ticket) => /novo|new/.test(normalize(ticket.status)) && ticket.createdDate < stale7d);
    const pausedTooLong = openTickets.filter((ticket) => /paus|parad|stopped/.test(normalize(ticket.status)) && movement(ticket) < stale5d);
    const noMovement = openTickets.filter((ticket) => movement(ticket) < stale3d);
    const slaOverdue = openTickets.filter((ticket) =>
      Boolean(ticket.dueDate && ticket.dueDate < now)
      || /venc|viol|fora|estour/.test(normalize(ticket.solutionSlaIndicator)),
    );
    const slaSoon = openTickets.filter((ticket) => ticket.dueDate && ticket.dueDate >= now && ticket.dueDate <= new Date(now.getTime() + 86400000));
    const blocked = openTasks.filter((task) => task.blockedProcess);
    const taskStale = openTasks.filter((task) => (task.azureChangedAt ?? task.azureCreatedAt ?? now) < stale5d);
    const unassigned = openTasks.filter((task) => !task.assignedToName);
    const ticketByTask = new Map(tickets.filter((t) => t.taskNumber).map((t) => [t.taskNumber!, t]));
    const taskByTicket = new Map(tasks.filter((t) => t.movideskTicket).map((t) => [t.movideskTicket!, t]));
    const linkedTask = (ticket: (typeof tickets)[number]) => (ticket.taskNumber ? tasks.find((t) => t.id === ticket.taskNumber) : undefined) ?? taskByTicket.get(ticket.movideskId);
    const closedTicketActiveTask = tickets.filter((ticket) => !openTicket(ticket) && linkedTask(ticket) && !terminalTask(linkedTask(ticket)!.state));
    const openTicketFinishedTask = openTickets.filter((ticket) => linkedTask(ticket) && terminalTask(linkedTask(ticket)!.state));

    const periodTickets = tickets.filter((ticket) => ticket.createdDate >= periodStart && ticket.createdDate <= periodEnd);
    const classificationAudit = periodTickets.filter((ticket) => {
      const category = normalize(ticket.category);
      const cause = normalize(ticket.cause);
      if (!category || !cause || ["outros", "outro", "-", "nao informado"].includes(category) || ["outros", "outro", "-", "nao informado"].includes(cause)) return true;
      return (/duvida|orientacao/.test(category) && /bug|erro|falha|configuracao|operacional/.test(cause))
        || (/problema|erro|incidente/.test(category) && /duvida|orientacao|treinamento/.test(cause));
    });
    const auditSignals = [
      ...classificationAudit.map((ticket) => ({ ticket, reason: "Possível divergência entre categoria e causa", score: 4, source: "Movidesk" })),
      ...noMovement.map((ticket) => ({ ticket, reason: "Sem movimentação há mais de 72h", score: 3, source: "Movidesk" })),
      ...slaOverdue.map((ticket) => ({ ticket, reason: "SLA/prazo vencido", score: 5, source: "Movidesk" })),
      ...closedTicketActiveTask.map((ticket) => ({ ticket, reason: "Ticket encerrado com Task Azure ainda ativa", score: 7, source: "Movidesk + Azure" })),
      ...openTicketFinishedTask.map((ticket) => ({ ticket, reason: "Ticket aberto com Task Azure concluída", score: 6, source: "Movidesk + Azure" })),
    ];
    const auditMap = new Map<number, { ticket: (typeof tickets)[number]; reasons: string[]; sources: Set<string>; score: number }>();
    auditSignals.forEach(({ ticket, reason, score, source }) => {
      const current = auditMap.get(ticket.id) ?? { ticket, reasons: [], sources: new Set<string>(), score: 0 };
      if (!current.reasons.includes(reason)) current.reasons.push(reason);
      current.sources.add(source);
      current.score += score;
      auditMap.set(ticket.id, current);
    });
    const auditSample = [...auditMap.values()]
      .sort((a, b) => b.score - a.score || b.reasons.length - a.reasons.length)
      .slice(0, 15)
      .map(({ ticket, reasons, sources, score }) => ({
        ...ticket, reason: reasons[0], reasons, evidenceCount: reasons.length, sources: [...sources], auditScore: score,
        confidence: sources.has("Movidesk + Azure") || reasons.length >= 2 ? "ALTA" : "MÉDIA",
      }));

    const recurrenceKey = (ticket: (typeof tickets)[number]) => {
      const generic = new Set(["simer", "siagri simer", "atendimento ao cliente", "outros", "outro", "nao informado", "sem classificacao"]);
      const candidates = [ticket.serviceThirdLevel, ticket.serviceSecondLevel, ticket.serviceFirstLevel, ticket.service, ticket.category, ticket.cause]
        .map((value) => normalize(value))
        .filter((value) => value.length >= 4 && !generic.has(value));
      return candidates[0] ?? "sem classificacao";
    };
    const currentTickets = periodTickets;
    const previousTickets = tickets.filter((ticket) => ticket.createdDate >= previousStart && ticket.createdDate < periodStart);
    const aggregate = (items: typeof tickets) => {
      const map = new Map<string, { count: number; clients: Set<string>; analysts: Set<string>; examples: typeof tickets }>();
      items.forEach((ticket) => {
        const key = recurrenceKey(ticket);
        const entry = map.get(key) ?? { count: 0, clients: new Set<string>(), analysts: new Set<string>(), examples: [] };
        entry.count += 1;
        if (ticket.client) entry.clients.add(ticket.client);
        if (ticket.owner) entry.analysts.add(ticket.owner);
        entry.examples.push(ticket);
        map.set(key, entry);
      });
      return map;
    };
    const currentAgg = aggregate(currentTickets);
    const previousAgg = aggregate(previousTickets);
    const recurrences = [...currentAgg.entries()]
      .filter(([topic, value]) => topic !== "sem classificacao" && value.count >= 3)
      .map(([topic, value]) => {
        const previous = previousAgg.get(topic)?.count ?? 0;
        const changePct = previous > 0 ? Math.round(((value.count - previous) / previous) * 100) : null;
        const action = value.analysts.size >= 2
          ? "Avaliar treinamento interno e padronização do diagnóstico."
          : value.clients.size === 1 && value.count >= 5
          ? "Avaliar orientação ou treinamento direcionado ao cliente."
          : "Avaliar causa raiz e recorrência com Produto/Desenvolvimento.";
        const linkedExamples = value.examples.filter((ticket) => Boolean(linkedTask(ticket))).length;
        const confidence = value.count >= 5 && (value.clients.size >= 2 || value.analysts.size >= 2) ? "ALTA" : "MÉDIA";
        const clientCounts = new Map<string, number>(); value.examples.forEach((ticket) => { if (ticket.client) clientCounts.set(ticket.client, (clientCounts.get(ticket.client) ?? 0) + 1); });
        const topClient = [...clientCounts.entries()].sort((a,b) => b[1]-a[1])[0] ?? null;
        const modules = value.examples.map((ticket) => linkedTask(ticket)?.module).filter((module): module is string => Boolean(module?.trim()));
        const moduleCounts = new Map<string, number>(); modules.forEach((module) => moduleCounts.set(module, (moduleCounts.get(module) ?? 0) + 1));
        const topModule = [...moduleCounts.entries()].sort((a,b) => b[1]-a[1])[0] ?? null;
        return { topic, count: value.count, previous, changePct, clients: [...value.clients], analysts: [...value.analysts], action, examples: value.examples.slice(0, 50), linkedExamples, confidence,
          concentration: { topClient: topClient?.[0] ?? null, topClientCount: topClient?.[1] ?? 0, topModule: topModule?.[0] ?? null, topModuleCount: topModule?.[1] ?? 0, clientSharePct: topClient ? Math.round(topClient[1] / Math.max(1, value.examples.length) * 100) : 0 }
        };
      }).sort((a, b) => b.count - a.count).slice(0, 12);

    const analystDevelopment = SUPPORT_ANALYSTS.map((analyst) => {
      const analystTickets = currentTickets.filter((ticket) => normalize(ticket.owner) === normalize(analyst));
      const stale = analystTickets.filter((ticket) => openTicket(ticket) && movement(ticket) < stale3d).length;
      const themes = [...aggregate(analystTickets).entries()].filter(([topic]) => topic !== "sem classificacao").sort((a, b) => b[1].count - a[1].count).slice(0, 3)
        .map(([topic, value]) => ({ topic, count: value.count }));
      const linked = analystTickets.map(linkedTask).filter((task): task is NonNullable<ReturnType<typeof linkedTask>> => Boolean(task));
      const blockedTasks = linked.filter((task) => Boolean(task.blockedProcess)).length;
      const finishedTasks = linked.filter((task) => terminalTask(task.state)).length;
      return { analyst, tickets: analystTickets.length, stale, themes, linkedTasks: linked.length, blockedTasks, finishedTasks, examples: analystTickets.slice(0, 100) };
    }).filter((item) => item.tickets > 0 || item.stale > 0);

    const gaps = [
      ...recurrences.filter((item) => item.count >= 5).slice(0, 6).map((item, index) => {
        const linked = item.examples.map((ticket) => ({ ticket, task: linkedTask(ticket) })).filter((entry) => Boolean(entry.task));
        const blockedLinked = linked.filter((entry) => Boolean(entry.task?.blockedProcess)).length;
        const deliveredLinked = linked.filter((entry) => Boolean(entry.task?.deliveredVersion?.trim())).length;
        const confidence = item.confidence === "ALTA" && linked.length > 0 ? "Alta" : linked.length > 0 ? "Média" : "Baixa";
        return {
          id: `GAP-R${String(index + 1).padStart(2, "0")}`, type: "Recorrência", title: item.topic,
          evidence: `${item.count} tickets em ${days} dias · ${linked.length} exemplo(s) vinculados ao Azure${blockedLinked ? ` · ${blockedLinked} bloqueado(s)` : ""}${deliveredLinked ? ` · ${deliveredLinked} com versão entregue` : ""}`,
          impact: item.count >= 10 && confidence !== "Baixa" ? "Alto" : "Médio",
          action: item.action, status: confidence === "Baixa" ? "Validar evidências" : "Identificado",
          confidence, ticketCount: item.count, azureLinked: linked.length, blockedLinked, deliveredLinked,
          examples: item.examples.slice(0, 25), tasks: linked.map((entry) => entry.task).filter(Boolean).slice(0, 25),
        };
      }),
      ...(blocked.length ? [{
        id: "GAP-B01", type: "Fluxo", title: "Work Items bloqueados",
        evidence: `${blocked.length} item(ns) Azure ativo(s) bloqueado(s) · ${blocked.filter((task) => Boolean(task.movideskTicket || ticketByTask.has(task.id))).length} com vínculo de atendimento identificado`,
        impact: blocked.length >= 5 ? "Alto" : "Médio", action: "Revisar impedimentos, responsável e atendimento relacionado antes de escalar para Produto/Desenvolvimento.", status: "Identificado",
        confidence: "Alta", ticketCount: blocked.filter((task) => Boolean(task.movideskTicket || ticketByTask.has(task.id))).length, azureLinked: blocked.length,
        blockedLinked: blocked.length, deliveredLinked: 0, examples: [] as typeof tickets,
      }] : []),
      ...(classificationAudit.length ? [{
        id: "GAP-Q01", type: "Qualidade", title: "Classificações para auditoria",
        evidence: `${classificationAudit.length} ticket(s) com ausência ou possível divergência entre categoria e causa; exige revisão humana antes de confirmar o gap`,
        impact: classificationAudit.length >= 10 ? "Alto" : "Médio", action: "Revisar a amostra priorizada e confirmar somente divergências reais antes de orientar ajustes.", status: "Validar evidências",
        confidence: "Média", ticketCount: classificationAudit.length, azureLinked: classificationAudit.filter((ticket) => Boolean(linkedTask(ticket))).length,
        blockedLinked: 0, deliveredLinked: 0, examples: classificationAudit.slice(0, 3),
      }] : []),
    ];

    const previousOpen = previousTickets.filter(openTicket).length;

    // Indicadores gerenciais equivalentes aos painéis operacionais do Movidesk,
    // calculados sobre a mesma base filtrada da Central de Liderança.
    const inRange = (value: Date | null | undefined) => Boolean(value && value >= periodStart && value <= periodEnd);
    const dateKey = (value: Date) => {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, "0");
      const d = String(value.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };
    const daySeries: Array<{ date: string; opened: number; resolved: number; closed: number; reopened: number; pending: number }> = [];
    for (let cursor = new Date(periodStart); cursor <= periodEnd; cursor.setDate(cursor.getDate() + 1)) {
      const startDay = new Date(cursor); startDay.setHours(0, 0, 0, 0);
      const endDay = new Date(cursor); endDay.setHours(23, 59, 59, 999);
      const opened = tickets.filter((ticket) => ticket.createdDate >= startDay && ticket.createdDate <= endDay).length;
      const resolved = tickets.filter((ticket) => Boolean(ticket.resolvedDate && ticket.resolvedDate >= startDay && ticket.resolvedDate <= endDay)).length;
      const closed = tickets.filter((ticket) => Boolean(ticket.closedDate && ticket.closedDate >= startDay && ticket.closedDate <= endDay)).length;
      const reopened = tickets.filter((ticket) => Boolean(ticket.reopenedDate && ticket.reopenedDate >= startDay && ticket.reopenedDate <= endDay)).length;
      const pending = tickets.filter((ticket) =>
        ticket.createdDate <= endDay
        && (!ticket.resolvedDate || ticket.resolvedDate > endDay)
        && (!ticket.closedDate || ticket.closedDate > endDay)
        && (!ticket.canceledDate || ticket.canceledDate > endDay)
      ).length;
      daySeries.push({ date: dateKey(startDay), opened, resolved, closed, reopened, pending });
    }

    const slaBucket = (value: string | null | undefined): "within" | "outside" | "unmeasured" => {
      const normalized = normalize(value);
      if (!normalized || /sem sla|nao defin|nao med|n\/a/.test(normalized)) return "unmeasured";
      if (/fora|venc|viol|estour|atras/.test(normalized)) return "outside";
      return "within";
    };
    const resolvedPeriod = tickets.filter((ticket) => inRange(ticket.resolvedDate) || inRange(ticket.closedDate));
    const resolutionSla = resolvedPeriod.reduce((acc, ticket) => {
      acc[slaBucket(ticket.solutionSlaIndicator)] += 1; return acc;
    }, { within: 0, outside: 0, unmeasured: 0 });
    const responsePeriod = tickets.filter((ticket) => inRange(ticket.firstResponseDate) || (ticket.createdDate >= periodStart && ticket.createdDate <= periodEnd));
    const responseSla = responsePeriod.reduce((acc, ticket) => {
      acc[slaBucket(ticket.responseSlaIndicator)] += 1; return acc;
    }, { within: 0, outside: 0, unmeasured: 0 });

    const reopenedPeriod = tickets.filter((ticket) => inRange(ticket.reopenedDate));
    const byOwner = [...SUPPORT_ANALYSTS].map((analyst) => {
      const ownedResolved = resolvedPeriod.filter((ticket) => normalize(ticket.owner) === normalize(analyst));
      const ownedReopened = reopenedPeriod.filter((ticket) => normalize(ticket.owner) === normalize(analyst));
      const accepted = ownedResolved.filter((ticket) => ticket.baseStatus === "Closed" || Boolean(ticket.closedDate)).length;
      const within = ownedResolved.filter((ticket) => slaBucket(ticket.solutionSlaIndicator) === "within").length;
      const outside = ownedResolved.filter((ticket) => slaBucket(ticket.solutionSlaIndicator) === "outside").length;
      return { analyst, resolved: ownedResolved.length, reopened: ownedReopened.length, accepted, within, outside };
    }).filter((row) => row.resolved || row.reopened);

    const responseByOwner = [...SUPPORT_ANALYSTS].map((analyst) => {
      const owned = responsePeriod.filter((ticket) => normalize(ticket.owner) === normalize(analyst));
      return {
        analyst,
        total: owned.length,
        within: owned.filter((ticket) => slaBucket(ticket.responseSlaIndicator) === "within").length,
        outside: owned.filter((ticket) => slaBucket(ticket.responseSlaIndicator) === "outside").length,
        unmeasured: owned.filter((ticket) => slaBucket(ticket.responseSlaIndicator) === "unmeasured").length,
      };
    }).filter((row) => row.total);

    const ranking = (values: Array<string | null>, fallback: string) => {
      const map = new Map<string, number>();
      values.forEach((value) => { const key = value?.trim() || fallback; map.set(key, (map.get(key) ?? 0) + 1); });
      return [...map.entries()].map(([label, total]) => ({ label, total })).sort((a,b) => b.total - a.total).slice(0, 12);
    };
    const categoryDistribution = ranking(currentTickets.map((ticket) => ticket.category), "Sem categoria");
    const contactDistribution = ranking(currentTickets.map((ticket) => ticket.contact), "Sem contato");
    const clientDistribution = ranking(currentTickets.map((ticket) => ticket.client), "Sem cliente");

    const ageHours = (ticket: (typeof tickets)[number]) => Math.max(0, (now.getTime() - ticket.createdDate.getTime()) / 3600000);
    const aging = [
      { label: "Até 24h", total: openTickets.filter((ticket) => ageHours(ticket) <= 24).length },
      { label: "1–3 dias", total: openTickets.filter((ticket) => ageHours(ticket) > 24 && ageHours(ticket) <= 72).length },
      { label: "4–7 dias", total: openTickets.filter((ticket) => ageHours(ticket) > 72 && ageHours(ticket) <= 168).length },
      { label: "8–15 dias", total: openTickets.filter((ticket) => ageHours(ticket) > 168 && ageHours(ticket) <= 360).length },
      { label: "+15 dias", total: openTickets.filter((ticket) => ageHours(ticket) > 360).length },
    ];
    const reopenedCount = reopenedPeriod.length;
    const fcrCount = resolvedPeriod.filter((ticket) => ticket.resolvedInFirstCall).length;
    const measuredResolution = resolutionSla.within + resolutionSla.outside;
    const measuredResponse = responseSla.within + responseSla.outside;
    const operational = {
      reopenRate: resolvedPeriod.length ? Number((reopenedCount / resolvedPeriod.length * 100).toFixed(1)) : null,
      firstContactResolutionRate: resolvedPeriod.length ? Number((fcrCount / resolvedPeriod.length * 100).toFixed(1)) : null,
      resolutionSlaRate: measuredResolution ? Number((resolutionSla.within / measuredResolution * 100).toFixed(1)) : null,
      responseSlaRate: measuredResponse ? Number((responseSla.within / measuredResponse * 100).toFixed(1)) : null,
      flowBalance: currentTickets.length ? Number(((resolvedPeriod.length - currentTickets.length) / currentTickets.length * 100).toFixed(1)) : null,
      criticalAging: aging.filter((item) => item.label === "+15 dias")[0]?.total ?? 0,
    };
    const analytics = {
      daily: daySeries,
      resolutionSla,
      responseSla,
      byOwner,
      responseByOwner,
      categoryDistribution,
      contactDistribution,
      clientDistribution,
      aging,
      operational,
      samples: {
        opened: currentTickets.slice(0, 100),
        backlog: openTickets.slice(0, 100),
        resolved: resolvedPeriod.slice(0, 100),
        reopened: tickets.filter((ticket) => inRange(ticket.reopenedDate)).slice(0, 100),
        responseOutside: responsePeriod.filter((ticket) => slaBucket(ticket.responseSlaIndicator) === "outside").slice(0, 100),
        resolutionOutside: resolvedPeriod.filter((ticket) => slaBucket(ticket.solutionSlaIndicator) === "outside").slice(0, 100),
        criticalAging: openTickets.filter((ticket) => ageHours(ticket) > 360).slice(0, 100),
        firstContact: resolvedPeriod.filter((ticket) => ticket.resolvedInFirstCall).slice(0, 100),
        aging: {
          "Até 24h": openTickets.filter((ticket) => ageHours(ticket) <= 24).slice(0, 100),
          "1–3 dias": openTickets.filter((ticket) => ageHours(ticket) > 24 && ageHours(ticket) <= 72).slice(0, 100),
          "4–7 dias": openTickets.filter((ticket) => ageHours(ticket) > 72 && ageHours(ticket) <= 168).slice(0, 100),
          "8–15 dias": openTickets.filter((ticket) => ageHours(ticket) > 168 && ageHours(ticket) <= 360).slice(0, 100),
          "+15 dias": openTickets.filter((ticket) => ageHours(ticket) > 360).slice(0, 100),
        },
        categories: Object.fromEntries(categoryDistribution.map((row) => [row.label, currentTickets.filter((ticket) => (ticket.category?.trim() || "Sem categoria") === row.label).slice(0, 100)])),
        clients: Object.fromEntries(clientDistribution.map((row) => [row.label, currentTickets.filter((ticket) => (ticket.client?.trim() || "Sem cliente") === row.label).slice(0, 100)])),
        contacts: Object.fromEntries(contactDistribution.map((row) => [row.label, currentTickets.filter((ticket) => (ticket.contact?.trim() || "Sem contato") === row.label).slice(0, 100)])),
      },
    };

    const weekly = {
      current: currentTickets.length,
      previous: previousTickets.length,
      changePct: previousTickets.length ? Math.round(((currentTickets.length - previousTickets.length) / previousTickets.length) * 100) : null,
      open: openTickets.length,
      previousOpen,
      overdue: slaOverdue.length,
      paused: pausedTooLong.length,
      stale: noMovement.length,
      blocked: blocked.length,
    };
    const recommendations = [
      ...(slaOverdue.length ? [`Priorizar revisão de ${slaOverdue.length} atendimento(s) com SLA/prazo vencido.`] : []),
      ...(newTooLong.length ? [`Direcionar ${newTooLong.length} atendimento(s) ainda como Novo há mais de 7 dias.`] : []),
      ...(pausedTooLong.length ? [`Revisar motivo e próximo passo de ${pausedTooLong.length} atendimento(s) pausado(s) há mais de 5 dias.`] : []),
      ...(classificationAudit.length ? [`Auditar a amostra semanal de ${Math.min(10, auditSample.length)} ticket(s) com maior sinal de inconsistência.`] : []),
      ...(recurrences.length ? [`Avaliar ${recurrences.length} tema(s) recorrente(s) para treinamento ou atuação de causa raiz.`] : []),
      ...(blocked.length ? [`Atuar sobre ${blocked.length} Work Item(s) bloqueado(s) com as áreas responsáveis.`] : []),
    ].slice(0, 6);

    const result = {
      generatedAt: now,
      periodDays: days,
      radar: {
        newTooLong: newTooLong.length, pausedTooLong: pausedTooLong.length, noMovement: noMovement.length,
        slaOverdue: slaOverdue.length, slaSoon: slaSoon.length, blocked: blocked.length,
        taskStale: taskStale.length, unassigned: unassigned.length,
        closedTicketActiveTask: closedTicketActiveTask.length, openTicketFinishedTask: openTicketFinishedTask.length,
      },
      radarSamples: {
        newTooLong: newTooLong.slice(0, 50), pausedTooLong: pausedTooLong.slice(0, 50), noMovement: noMovement.slice(0, 50),
        slaOverdue: slaOverdue.slice(0, 50), slaSoon: slaSoon.slice(0, 50),
        closedTicketActiveTask: closedTicketActiveTask.slice(0, 50), openTicketFinishedTask: openTicketFinishedTask.slice(0, 50),
        blocked: blocked.slice(0, 50), taskStale: taskStale.slice(0, 50), unassigned: unassigned.slice(0, 50),
      },
      audit: { candidates: new Set([...classificationAudit, ...noMovement, ...slaOverdue, ...closedTicketActiveTask, ...openTicketFinishedTask].map((ticket) => ticket.id)).size, sample: auditSample },
      recurrences,
      gaps,
      development: analystDevelopment,
      weekly,
      analytics,
      recommendations,
      filters: { clients: [...SIMER_CLIENTS], users: [...SUPPORT_ANALYSTS] },
    };
    technicalLeadershipCache.set(cacheKey, { expiresAt: Date.now() + 30_000, value: result });
    return result;
  }


}
