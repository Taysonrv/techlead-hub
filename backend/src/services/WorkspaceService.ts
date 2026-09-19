import {
  prisma,
} from "../database/prisma";
import type { Prisma } from "@prisma/client";
import { SIMER_CLIENTS, SUPPORT_ANALYSTS, ticketOperationalScope } from "../domain/OperationalScope";
import { MovideskService } from "./MovideskService";
import { analyzeMovideskIndicators } from "./MovideskPayloadAnalytics";

const TERMINAL = ["Concluído", "Concluido", "Closed", "Done", "Resolved", "Cancelado", "Canceled"];
const normalizedWords = (value: string) => value
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLocaleUpperCase("pt-BR").split(/\s+/).filter((word) => word.length > 2);

const dataQualityCache = new Map<string, { expiresAt: number; value: unknown }>();
const technicalLeadershipCache = new Map<string, { expiresAt: number; value: unknown }>();

export class WorkspaceService {
  public async myOperation(userId: number, params: {
    client?: string | null; type?: string | null; search?: string | null;
  } = {}) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) throw new Error("Usuário não encontrado.");
    const userWords = normalizedWords(user.name);
    const operationName = SUPPORT_ANALYSTS.find((analyst) => {
      const analystWords = normalizedWords(analyst);
      return userWords.every((word) => analystWords.includes(word));
    }) ?? user.name;

    const tickets = await prisma.ticket.findMany({
      where: { AND: [
        { owner: { equals: operationName, mode: "insensitive" } },
        ...(params.client ? [{ client: { equals: params.client, mode: "insensitive" as const } }] : []),
        ...(params.search ? [{ OR: [
          { subject: { contains: params.search, mode: "insensitive" as const } },
          ...(Number.isSafeInteger(Number(params.search)) ? [{ movideskId: Number(params.search) }] : []),
        ] }] : []),
      ] },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: {
        id: true,
        movideskId: true,
        subject: true,
        status: true,
        client: true,
        taskNumber: true,
        updatedAt: true,
      },
    });

    const taskIds = tickets.map((item) => item.taskNumber)
      .filter((value): value is number => value !== null);
    const ownedMovideskIds = tickets.map((item) => item.movideskId);
    const identity = {
      OR: [
        { createdByName: { equals: operationName, mode: "insensitive" as const } },
        { assignedToName: { equals: operationName, mode: "insensitive" as const } },
        ...(user.email ? [
          { createdByEmail: { equals: user.email, mode: "insensitive" as const } },
          { assignedToEmail: { equals: user.email, mode: "insensitive" as const } },
        ] : []),
        ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
        ...(ownedMovideskIds.length ? [{ movideskTicket: { in: ownedMovideskIds } }] : []),
        { participantMovideskTickets: { not: null } },
      ],
    };

    const workItemCandidates = await prisma.azureWorkItem.findMany({
        where: { AND: [
          identity,
          ...(params.client ? [{ OR: [
            { client: { equals: params.client, mode: "insensitive" as const } },
            { participantClients: { contains: params.client, mode: "insensitive" as const } },
            ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
          ] }] : []),
          ...(params.type ? [{ workItemType: { equals: params.type, mode: "insensitive" as const } }] : []),
          ...(params.search ? [{ OR: [
            { title: { contains: params.search, mode: "insensitive" as const } },
            ...(Number.isSafeInteger(Number(params.search)) ? [{ id: Number(params.search) }] : []),
          ] }] : []),
        ] },
        orderBy: [{ azureChangedAt: "desc" }, { id: "desc" }],
        take: 5000,
        select: {
          id: true, workItemType: true, title: true, state: true,
          createdByName: true, createdByEmail: true,
          client: true, assignedToName: true, prioritized: true,
          assignedToEmail: true,
          participantClients: true,
          blockedProcess: true, registeredVersion: true, deliveredVersion: true,
          movideskTicket: true, azureChangedAt: true,
          participantMovideskTickets: true,
        },
      });
    const ownedTicketSet = new Set(ownedMovideskIds);
    const taskIdSet = new Set(taskIds);
    const same = (left: string | null, right: string | null) =>
      Boolean(left && right && left.localeCompare(right, "pt-BR", { sensitivity: "base" }) === 0);
    const workItems = workItemCandidates.filter((item) =>
      same(item.createdByName, operationName)
      || same(item.assignedToName, operationName)
      || same(item.createdByEmail, user.email)
      || same(item.assignedToEmail, user.email)
      || taskIdSet.has(item.id)
      || Boolean(item.movideskTicket && ownedTicketSet.has(item.movideskTicket))
      || (item.participantMovideskTickets?.match(/\d+/g) ?? [])
        .some((id) => ownedTicketSet.has(Number(id))),
    );

    const isTerminal = (state: string) => TERMINAL.some((item) => item.toLocaleLowerCase("pt-BR") === state.toLocaleLowerCase("pt-BR"));
    const openWorkItems = workItems.filter((item) => !isTerminal(item.state)).length;
    const concludedRecently = workItems.filter((item) => isTerminal(item.state) && item.azureChangedAt && item.azureChangedAt >= new Date(Date.now() - 30 * 86400000)).length;
    const prioritized = workItems.filter((item) => item.prioritized && !isTerminal(item.state)).length;
    const blocked = workItems.filter((item) => item.blockedProcess && !isTerminal(item.state)).length;

    const versionItems = await prisma.azureWorkItem.findMany({
      where: {
        deliveredVersion: { not: null },
        workItemType: { in: ["Correção Clientes", "Evolução", "APOIO"], mode: "insensitive" },
      },
      orderBy: [{ azureChangedAt: "desc" }, { id: "desc" }],
      take: 1000,
      select: { id: true, workItemType: true, title: true, state: true, deliveredVersion: true },
    });
    const latestVersions = ["LTS", "LTE", "RC"].flatMap((channel) => {
      const matches = versionItems.filter((item) =>
        new RegExp(`(?:^|[._\\s-])${channel}(?:$|[._\\s-])`, "i").test(item.deliveredVersion ?? ""),
      ).sort((left, right) => compareVersions(right.deliveredVersion ?? "", left.deliveredVersion ?? ""));
      const version = matches[0]?.deliveredVersion;
      return version ? [{
        channel,
        version,
        tasks: matches.filter((item) => item.deliveredVersion === version).slice(0, 12),
      }] : [];
    });

    return {
      user,
      summary: {
        tickets: tickets.length,
        openWorkItems,
        concludedRecently,
        prioritized,
        blocked,
      },
      tickets,
      workItems,
      latestVersions,
      filters: {
        clients: [...new Set([...tickets.map((item) => item.client).filter((value): value is string => Boolean(value)), ...workItems.map((item) => item.client).filter((value): value is string => Boolean(value))])].sort(),
        types: ["Correção Clientes", "Evolução", "APOIO"],
      },
    };
  }

  public async ticketDetail(userId: number, ticketId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!user) throw new Error("Usuário não encontrado.");
    const userWords = normalizedWords(user.name);
    const operationName = SUPPORT_ANALYSTS.find((analyst) => {
      const analystWords = normalizedWords(analyst);
      return userWords.every((word) => analystWords.includes(word));
    }) ?? user.name;

    const ticket = await prisma.ticket.findFirst({
      where: {
        id: ticketId,
        owner: { equals: operationName, mode: "insensitive" },
      },
    });
    if (!ticket) throw new Error("Atendimento não encontrado na operação deste usuário.");

    const relatedWorkItems = await prisma.azureWorkItem.findMany({
      where: { OR: [
        ...(ticket.taskNumber ? [{ id: ticket.taskNumber }] : []),
        { movideskTicket: ticket.movideskId },
        { participantMovideskTickets: { contains: `,${ticket.movideskId},` } },
      ] },
      orderBy: [{ azureChangedAt: "desc" }, { id: "desc" }],
      select: {
        id: true, workItemType: true, title: true, state: true,
        client: true, assignedToName: true, registeredVersion: true, deliveredVersion: true,
        participantClients: true,
        movideskTicket: true, azureChangedAt: true,
        participantMovideskTickets: true,
      },
    });

    return { ticket, relatedWorkItems };
  }

  public async updateTicketStatus(
    userId: number,
    ticketId: number,
    status: string,
    justification?: string | null,
  ) {
    const detail = await this.ticketDetail(userId, ticketId);
    await new MovideskService().updateTicketStatus(
      detail.ticket.movideskId,
      status,
      justification ?? detail.ticket.justification,
    );
    const ticket = await prisma.ticket.update({
      where: { id: detail.ticket.id },
      data: { status, justification: justification ?? detail.ticket.justification },
    });
    return { ticket };
  }

  public async technicalLeadership(params: {
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

    const classificationAudit = tickets.filter((ticket) => {
      const category = normalize(ticket.category);
      const cause = normalize(ticket.cause);
      if (!category || !cause || ["outros", "outro", "-", "nao informado"].includes(category) || ["outros", "outro", "-", "nao informado"].includes(cause)) return true;
      return (/duvida|orientacao/.test(category) && /bug|erro|falha|configuracao|operacional/.test(cause))
        || (/problema|erro|incidente/.test(category) && /duvida|orientacao|treinamento/.test(cause));
    });
    const auditSample = [
      ...classificationAudit.map((ticket) => ({ ticket, reason: "Possível divergência entre categoria e causa", score: 4 })),
      ...noMovement.map((ticket) => ({ ticket, reason: "Sem movimentação há mais de 72h", score: 3 })),
      ...slaOverdue.map((ticket) => ({ ticket, reason: "SLA/prazo vencido", score: 5 })),
    ].sort((a, b) => b.score - a.score)
      .filter((item, index, all) => all.findIndex((other) => other.ticket.id === item.ticket.id) === index)
      .slice(0, 10)
      .map(({ ticket, reason }) => ({ ...ticket, reason }));

    const recurrenceKey = (ticket: (typeof tickets)[number]) =>
      [ticket.serviceSecondLevel, ticket.serviceFirstLevel, ticket.service, ticket.category, ticket.cause]
        .map((value) => normalize(value)).find((value) => value.length >= 4) ?? "sem classificacao";
    const currentTickets = tickets.filter((ticket) => ticket.createdDate >= periodStart && ticket.createdDate <= periodEnd);
    const previousTickets = tickets.filter((ticket) => ticket.createdDate >= previousStart && ticket.createdDate < periodStart);
    const aggregate = (items: typeof tickets) => {
      const map = new Map<string, { count: number; clients: Set<string>; analysts: Set<string>; examples: typeof tickets }>();
      items.forEach((ticket) => {
        const key = recurrenceKey(ticket);
        const entry = map.get(key) ?? { count: 0, clients: new Set<string>(), analysts: new Set<string>(), examples: [] };
        entry.count += 1;
        if (ticket.client) entry.clients.add(ticket.client);
        if (ticket.owner) entry.analysts.add(ticket.owner);
        if (entry.examples.length < 4) entry.examples.push(ticket);
        map.set(key, entry);
      });
      return map;
    };
    const currentAgg = aggregate(currentTickets);
    const previousAgg = aggregate(previousTickets);
    const recurrences = [...currentAgg.entries()]
      .filter(([, value]) => value.count >= 3)
      .map(([topic, value]) => {
        const previous = previousAgg.get(topic)?.count ?? 0;
        const changePct = previous > 0 ? Math.round(((value.count - previous) / previous) * 100) : null;
        const action = value.analysts.size >= 2
          ? "Avaliar treinamento interno e padronização do diagnóstico."
          : value.clients.size === 1 && value.count >= 5
          ? "Avaliar orientação ou treinamento direcionado ao cliente."
          : "Avaliar causa raiz e recorrência com Produto/Desenvolvimento.";
        return { topic, count: value.count, previous, changePct, clients: [...value.clients], analysts: [...value.analysts], action, examples: value.examples.slice(0, 3) };
      }).sort((a, b) => b.count - a.count).slice(0, 12);

    const analystDevelopment = SUPPORT_ANALYSTS.map((analyst) => {
      const analystTickets = currentTickets.filter((ticket) => normalize(ticket.owner) === normalize(analyst));
      const stale = analystTickets.filter((ticket) => openTicket(ticket) && movement(ticket) < stale3d).length;
      const themes = [...aggregate(analystTickets).entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 3)
        .map(([topic, value]) => ({ topic, count: value.count }));
      return { analyst, tickets: analystTickets.length, stale, themes };
    }).filter((item) => item.tickets > 0 || item.stale > 0);

    const gaps = [
      ...recurrences.filter((item) => item.count >= 5).slice(0, 6).map((item, index) => ({
        id: `GAP-R${String(index + 1).padStart(2, "0")}`, type: "Recorrência", title: item.topic,
        evidence: `${item.count} tickets em ${days} dias`, impact: item.count >= 10 ? "Alto" : "Médio",
        action: item.action, status: "Identificado",
      })),
      ...(blocked.length ? [{ id: "GAP-B01", type: "Fluxo", title: "Work Items bloqueados", evidence: `${blocked.length} itens ativos bloqueados`, impact: blocked.length >= 5 ? "Alto" : "Médio", action: "Revisar impedimentos e responsáveis com Produto/Desenvolvimento.", status: "Identificado" }] : []),
      ...(classificationAudit.length ? [{ id: "GAP-Q01", type: "Qualidade", title: "Classificações para auditoria", evidence: `${classificationAudit.length} tickets candidatos`, impact: classificationAudit.length >= 10 ? "Alto" : "Médio", action: "Executar amostragem semanal e orientar ajustes confirmados.", status: "Identificado" }] : []),
    ];

    const previousOpen = previousTickets.filter(openTicket).length;
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
      audit: { candidates: classificationAudit.length, sample: auditSample },
      recurrences,
      gaps,
      development: analystDevelopment,
      weekly,
      recommendations,
      filters: { clients: [...SIMER_CLIENTS], users: [...SUPPORT_ANALYSTS] },
    };
    technicalLeadershipCache.set(cacheKey, { expiresAt: Date.now() + 30_000, value: result });
    return result;
  }

  public async dataQuality(params: {
    type?: string | null;
    client?: string | null;
    user?: string | null;
    issue?: string | null;
    search?: string | null;
  } = {}) {
    const cacheKey = JSON.stringify(params);
    const cached = dataQualityCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (dataQualityCache.size > 40) dataQualityCache.clear();

    const scopedTickets = await prisma.ticket.findMany({
      where: {
        AND: [
          ticketOperationalScope(),
          ...(params.client ? [{ client: { equals: params.client, mode: "insensitive" as const } }] : []),
          ...(params.user ? [{ owner: { equals: params.user, mode: "insensitive" as const } }] : []),
        ],
      },
      select: {
        id: true, taskNumber: true, movideskId: true, subject: true,
        status: true, baseStatus: true, client: true, owner: true,
        category: true, cause: true, justification: true,
        deliveredVersion: true, lastActionDate: true, lastUpdate: true,
        reopenedDate: true, resolvedInFirstCall: true, rawData: true,
      },
    });
    const taskIds = scopedTickets.map((item) => item.taskNumber).filter((value): value is number => value !== null);
    const movideskIds = scopedTickets.map((item) => item.movideskId).filter((value): value is number => value !== null);

    const scope: Prisma.AzureWorkItemWhereInput = {
      AND: [
        {
          OR: [
            { createdByName: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" } },
            { assignedToName: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" } },
            { client: { in: [...SIMER_CLIENTS], mode: "insensitive" } },
            ...SIMER_CLIENTS.map((client) => ({ participantClients: { contains: client, mode: "insensitive" as const } })),
            ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
            ...(movideskIds.length ? [{ movideskTicket: { in: movideskIds } }] : []),
            { participantMovideskTickets: { not: null } },
          ],
        },
        ...(params.type ? [{ workItemType: { equals: params.type, mode: "insensitive" as const } }] : []),
        ...(params.client ? [{ OR: [
          { client: { equals: params.client, mode: "insensitive" as const } },
          { participantClients: { contains: params.client, mode: "insensitive" as const } },
          ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
        ] }] : []),
        ...(params.user ? [{ OR: [
          { createdByName: { equals: params.user, mode: "insensitive" as const } },
          { assignedToName: { equals: params.user, mode: "insensitive" as const } },
          ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
        ] }] : []),
        ...(params.search ? [{ OR: [
          { title: { contains: params.search, mode: "insensitive" as const } },
          ...(Number.isSafeInteger(Number(params.search)) ? [{ id: Number(params.search) }] : []),
        ] }] : []),
      ],
    };

    /*
     * O vínculo pode ter sido preenchido em qualquer lado da integração:
     * AzureWorkItem.movideskTicket ou Ticket.taskNumber. Para qualidade dos
     * dados, ambos são vínculos válidos, inclusive para Correção, Evolução e APOIO.
     */
    const allTicketLinks = await prisma.ticket.findMany({
      where: { taskNumber: { not: null } },
      select: { taskNumber: true },
    });
    const linkedTaskIds = [...new Set(allTicketLinks
      .map((item) => item.taskNumber)
      .filter((value): value is number => value !== null))];
    const linkedTaskIdSet = new Set(linkedTaskIds);

    /* Uma única leitura substitui cinco counts e duas listagens do mesmo escopo. */
    const linkedTaskCandidates = await prisma.azureWorkItem.findMany({
      where: { AND: [scope] },
      orderBy: [{ azureClosedAt: "desc" }, { azureChangedAt: "desc" }],
      select: {
        id: true, workItemType: true, title: true, state: true,
        createdByName: true,
        client: true, participantClients: true, assignedToName: true,
        module: true, registeredVersion: true, deliveredVersion: true,
        movideskTicket: true, participantMovideskTickets: true,
      },
    });
    const taskIdScope = new Set(taskIds);
    const movideskIdScope = new Set(movideskIds);
    const normalizeScopeValue = (value: string | null) => (value ?? "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    const belongsToOperationalScope = (item: (typeof linkedTaskCandidates)[number]) => {
      const people = [item.createdByName, item.assignedToName].map(normalizeScopeValue);
      const clients = [item.client, item.participantClients].map(normalizeScopeValue);
      return SUPPORT_ANALYSTS.some((analyst) => people.includes(normalizeScopeValue(analyst)))
        || SIMER_CLIENTS.some((client) => clients.some((value) => value.includes(normalizeScopeValue(client))))
        || taskIdScope.has(item.id)
        || Boolean(item.movideskTicket && movideskIdScope.has(item.movideskTicket))
        || (item.participantMovideskTickets?.match(/\d+/g) ?? [])
          .some((id) => movideskIdScope.has(Number(id)));
    };
    const linkedTasks = linkedTaskCandidates.filter(belongsToOperationalScope);

    const existingTaskIds = new Set(linkedTasks.map((item) => item.id));
    const danglingTickets = scopedTickets.filter((ticket) =>
      ticket.taskNumber !== null && !existingTaskIds.has(ticket.taskNumber),
    );
    const movideskLinkCounts = new Map<number, number>();
    linkedTasks.forEach((item) => {
      if (item.movideskTicket) {
        movideskLinkCounts.set(item.movideskTicket, (movideskLinkCounts.get(item.movideskTicket) ?? 0) + 1);
      }
    });
    const duplicatedIds = [...movideskLinkCounts.entries()]
      .filter(([, count]) => count > 1).map(([id]) => id);
    const withoutTicket = linkedTasks.filter((item) =>
      !item.movideskTicket && !item.participantMovideskTickets && !linkedTaskIdSet.has(item.id),
    ).length;
    const withoutClient = linkedTasks.filter((item) =>
      !/apoio/i.test(item.workItemType) && !item.client && !item.participantClients,
    ).length;
    const withoutModule = linkedTasks.filter((item) => !item.module).length;
    const withoutOwner = linkedTasks.filter((item) => !item.assignedToName).length;

    const normalizeStatus = (value: string) => value
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .trim().toLocaleLowerCase("pt-BR");
    const isTicketOpen = (ticket: { baseStatus: string | null; status: string }) => {
      const status = normalizeStatus(ticket.status);
      if (status === "aguardando validar versao") return false;
      if (/conclu|fechad|encerrad|resolvid|cancelad/.test(status)) return false;
      return ["New", "InAttendance", "Stopped"].includes(ticket.baseStatus ?? "") ||
        /novo|desenvolvimento|andamento|aguard|paus|parad/.test(status);
    };
    const isAwaitingReturn = (ticket: { status: string; justification?: string | null }) => {
      const status = normalizeStatus(ticket.status);
      const justification = normalizeStatus(ticket.justification ?? "");
      return /aguardando.*retorno|retorno.*cliente/.test(status)
        || /aguardando.*retorno|retorno.*cliente/.test(justification);
    };
    const isMissingClassification = (value: string | null) => {
      const normalized = normalizeStatus(value ?? "");
      return !normalized || ["nao informado", "sem causa", "sem categoria", "outros", "outro", "-"].includes(normalized);
    };
    const hasSuspiciousClassification = (ticket: { category: string | null; cause: string | null }) => {
      if (isMissingClassification(ticket.category) || isMissingClassification(ticket.cause)) return true;
      const category = normalizeStatus(ticket.category ?? "");
      const cause = normalizeStatus(ticket.cause ?? "");
      const doubtCategory = /duvida|orientacao/.test(category);
      const problemCategory = /problema|erro|incidente/.test(category);
      const doubtCause = /duvida|orientacao|treinamento/.test(cause);
      const problemCause = /bug|erro|falha|configuracao|operacional/.test(cause);
      return (doubtCategory && problemCause) || (problemCategory && doubtCause);
    };

    const isTicketFinalized = (ticket: { baseStatus: string | null; status: string }) => {
      const status = normalizeStatus(ticket.status);
      return ["Resolved", "Closed"].includes(ticket.baseStatus ?? "")
        || /conclu|fechad|encerrad|resolvid|cancelad/.test(status);
    };
    const sameClient = (left: string, right: string) => {
      const normalizedLeft = normalizeStatus(left).replace(/[^a-z0-9]+/g, " ").trim();
      const normalizedRight = normalizeStatus(right).replace(/[^a-z0-9]+/g, " ").trim();
      return normalizedLeft === normalizedRight
        || normalizedLeft.includes(normalizedRight)
        || normalizedRight.includes(normalizedLeft);
    };
    const isSupportTask = (task: { workItemType: string }) => normalizeStatus(task.workItemType).includes("apoio");
    const isCanceledTask = (state: string) => /cancelad|canceled/.test(normalizeStatus(state));
    const isTerminalTask = (state: string) => TERMINAL.some((value) => normalizeStatus(value) === normalizeStatus(state));
    const finishedLinkedTasks = linkedTasks.filter((item) => isTerminalTask(item.state));
    const activeLinkedTasks = linkedTasks.filter((item) => !isTerminalTask(item.state));
    const normalizeVersion = (value: string | null) => normalizeStatus(value ?? "").replace(/\s+/g, "");
    const versionMismatches = linkedTasks.filter((item) =>
      !isSupportTask(item)
      && Boolean(item.registeredVersion?.trim())
      && Boolean(item.deliveredVersion?.trim())
      && normalizeVersion(item.registeredVersion) !== normalizeVersion(item.deliveredVersion),
    );

    const createLinkIndex = (items: typeof linkedTasks) => {
      const byId = new Map(items.map((item) => [item.id, item]));
      const byTicket = new Map<number, (typeof items)[number]>();
      items.forEach((item) => {
        if (item.movideskTicket) byTicket.set(item.movideskTicket, item);
        (item.participantMovideskTickets?.match(/\d+/g) ?? [])
          .forEach((id) => byTicket.set(Number(id), item));
      });
      return { byId, byTicket };
    };
    const allLinks = createLinkIndex(linkedTasks);
    const finishedLinks = createLinkIndex(finishedLinkedTasks);
    const activeLinks = createLinkIndex(activeLinkedTasks);
    const findLinkedTask = (
      ticket: (typeof scopedTickets)[number],
      index: ReturnType<typeof createLinkIndex>,
    ) => (ticket.taskNumber ? index.byId.get(ticket.taskNumber) : undefined)
      ?? index.byTicket.get(ticket.movideskId);

    const ticketsAwaitingClosure = scopedTickets.flatMap((ticket) => {
      if (!isTicketOpen(ticket)) return [];
      const task = findLinkedTask(ticket, finishedLinks);
      if (task && isSupportTask(task)) return [];
      if (!task) return [];
      // A pendência de encerramento depende da entrega oficial da Tarefa no Azure.
      // Tarefas canceladas e tickets em "Aguardando validar versão" não entram neste recorte.
      const hasDeliveredVersion = Boolean(task.deliveredVersion?.trim());
      return !isCanceledTask(task.state) && hasDeliveredVersion ? [{ ticket, task }] : [];
    });
    const ticketsFinishedWithoutDelivery = scopedTickets.flatMap((ticket) => {
      if (!isTicketOpen(ticket)) return [];
      const task = findLinkedTask(ticket, finishedLinks);
      return task && !isSupportTask(task) && !isCanceledTask(task.state) && !task.deliveredVersion?.trim()
        ? [{ ticket, task }]
        : [];
    });
    const closedTicketsWithActiveTask = scopedTickets.flatMap((ticket) => {
      if (!isTicketFinalized(ticket)) return [];
      const task = findLinkedTask(ticket, activeLinks);
      return task && !isSupportTask(task) ? [{ ticket, task }] : [];
    });
    const clientMismatches = scopedTickets.flatMap((ticket) => {
      const task = findLinkedTask(ticket, allLinks);
      if (!task || !ticket.client || isSupportTask(task)) return [];
      const taskClients = [
        ...(task.client ? [task.client] : []),
        ...(task.participantClients?.split(/[;,\r\n]+/).map((value) => value.trim()).filter(Boolean) ?? []),
      ];
      if (!taskClients.length) return [];
      return taskClients.some((taskClient) => sameClient(taskClient, ticket.client!))
        ? []
        : [{ ticket, task }];
    });
    const scopedTicketByMovidesk = new Map(scopedTickets.map((ticket) => [ticket.movideskId, ticket]));
    const supportDivergences = linkedTasks.filter((task) => {
      if (!isSupportTask(task)) return false;
      const linkedIds = [
        ...(task.movideskTicket ? [task.movideskTicket] : []),
        ...(task.participantMovideskTickets?.match(/\d+/g) ?? []).map(Number),
      ];
      if (!linkedIds.length) return false;
      return linkedIds.some((id) => {
        const ticket = scopedTicketByMovidesk.get(id);
        return !ticket || (ticket.taskNumber !== null && ticket.taskNumber !== task.id);
      });
    });

    const analyticsByTicketId = new Map(scopedTickets.map((ticket) => [
      ticket.id,
      analyzeMovideskIndicators(ticket.rawData),
    ]));
    const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const lastMovement = (ticket: (typeof scopedTickets)[number]) =>
      ticket.lastActionDate ?? ticket.lastUpdate;
    const awaitingReturnWithoutCause = scopedTickets.filter((ticket) =>
      isTicketOpen(ticket) && isAwaitingReturn(ticket) && isMissingClassification(ticket.cause),
    );
    const awaitingReturnOverdue = scopedTickets.filter((ticket) => {
      const movement = lastMovement(ticket);
      return isTicketOpen(ticket) && isAwaitingReturn(ticket)
        && Boolean(movement && movement < staleThreshold);
    });
    const reopenedTickets = scopedTickets.filter((ticket) =>
      isTicketOpen(ticket) && (analyticsByTicketId.get(ticket.id)?.reopenCount ?? 0) > 0,
    );
    const excessiveOwnerHandoffs = scopedTickets.filter((ticket) =>
      isTicketOpen(ticket) && (analyticsByTicketId.get(ticket.id)?.ownerHandoffs ?? 0) >= 3,
    );
    const lowSatisfaction = scopedTickets.filter((ticket) => {
      const score = analyticsByTicketId.get(ticket.id)?.satisfactionScore;
      return score !== null && score !== undefined && score <= 2;
    });
    const suspectedClassification = scopedTickets.filter((ticket) =>
      isTicketOpen(ticket) && hasSuspiciousClassification(ticket),
    );

    const derivedTicketIssues = ["danglingTaskTickets", "ticketOpenTaskFinished", "ticketOpenTaskWithoutDelivery", "ticketClosedTaskOpen", "clientMismatch", "supportLinkDivergence", "awaitingReturnWithoutCause", "awaitingReturnOverdue", "reopenedTickets", "excessiveOwnerHandoffs", "lowSatisfaction", "suspectedClassification"];
    const matchesAzureIssue = (item: (typeof linkedTasks)[number]) => {
      if (params.issue === "duplicatedMovideskLinks") return Boolean(item.movideskTicket && duplicatedIds.includes(item.movideskTicket));
      if (params.issue === "withoutTicket") return !item.movideskTicket && !item.participantMovideskTickets && !linkedTaskIdSet.has(item.id);
      if (params.issue === "withoutClient") return !isSupportTask(item) && !item.client && !item.participantClients;
      if (params.issue === "completedWithoutVersion") return !isSupportTask(item) && isTerminalTask(item.state) && !item.deliveredVersion;
      if (params.issue === "activeTaskWithVersion") return !isSupportTask(item) && !isTerminalTask(item.state) && Boolean(item.deliveredVersion);
      if (params.issue === "versionMismatch") return versionMismatches.some((task) => task.id === item.id);
      if (!params.issue) return (!item.movideskTicket && !item.participantMovideskTickets)
        || !item.client || !item.module || !item.assignedToName
        || (isTerminalTask(item.state) && !item.deliveredVersion)
        || versionMismatches.some((task) => task.id === item.id);
      return true;
    };
    const azureSamples = params.issue === "supportLinkDivergence"
      ? supportDivergences.slice(0, 100)
      : params.issue && derivedTicketIssues.includes(params.issue)
      ? []
      : linkedTasks.filter(matchesAzureIssue).slice(0, 50);

    const toTicketSample = ({ ticket, task }: { ticket: (typeof scopedTickets)[number]; task: (typeof linkedTasks)[number] }) => ({
          id: ticket.id,
          workItemType: task.workItemType,
          title: ticket.subject,
          state: ticket.status,
          client: ticket.client,
          module: null,
          assignedToName: ticket.owner,
          movideskTicket: ticket.movideskId,
          registeredVersion: task.registeredVersion,
          deliveredVersion: task.deliveredVersion,
          taskNumber: task.id,
          taskState: task.state,
          taskTitle: task.title,
          taskClient: task.client,
          source: "MOVIDESK" as const,
        });
    const toClassificationSample = (ticket: (typeof scopedTickets)[number]) => ({
      id: ticket.id,
      workItemType: "Atendimento Movidesk",
      title: ticket.subject,
      state: ticket.status,
      client: ticket.client,
      module: null,
      assignedToName: ticket.owner,
      category: ticket.category,
      cause: ticket.cause,
      movideskTicket: ticket.movideskId,
      registeredVersion: null,
      deliveredVersion: ticket.deliveredVersion,
      taskNumber: ticket.taskNumber,
      lastMovement: lastMovement(ticket),
      resolvedInFirstCall: ticket.resolvedInFirstCall,
      ...analyticsByTicketId.get(ticket.id),
      source: "MOVIDESK" as const,
    });
    const samples = params.issue === "awaitingReturnWithoutCause"
      ? awaitingReturnWithoutCause.slice(0, 100).map(toClassificationSample)
      : params.issue === "awaitingReturnOverdue"
      ? awaitingReturnOverdue.slice(0, 100).map(toClassificationSample)
      : params.issue === "reopenedTickets"
      ? reopenedTickets.slice(0, 100).map(toClassificationSample)
      : params.issue === "excessiveOwnerHandoffs"
      ? excessiveOwnerHandoffs.slice(0, 100).map(toClassificationSample)
      : params.issue === "lowSatisfaction"
      ? lowSatisfaction.slice(0, 100).map(toClassificationSample)
      : params.issue === "suspectedClassification"
      ? suspectedClassification.slice(0, 100).map(toClassificationSample)
      : params.issue === "ticketOpenTaskFinished"
      ? ticketsAwaitingClosure.slice(0, 100).map(toTicketSample)
      : params.issue === "ticketOpenTaskWithoutDelivery"
      ? ticketsFinishedWithoutDelivery.slice(0, 100).map(toTicketSample)
      : params.issue === "ticketClosedTaskOpen"
      ? closedTicketsWithActiveTask.slice(0, 100).map(toTicketSample)
      : params.issue === "clientMismatch"
      ? clientMismatches.slice(0, 100).map(toTicketSample)
      : params.issue === "danglingTaskTickets"
      ? danglingTickets.slice(0, 50).map((ticket) => ({
          id: ticket.id,
          workItemType: "Ticket Movidesk",
          title: ticket.subject,
          state: ticket.status,
          client: ticket.client,
          module: null,
          assignedToName: ticket.owner,
          movideskTicket: ticket.movideskId,
          registeredVersion: null,
          deliveredVersion: null,
          taskNumber: ticket.taskNumber,
          source: "MOVIDESK" as const,
        }))
      : azureSamples.map((item) => ({ ...item, taskNumber: item.id, source: "AZURE" as const }));

    const result = {
      summary: {
        withoutTicket, withoutClient, withoutModule, withoutOwner,
        completedWithoutVersion: ticketsFinishedWithoutDelivery.length,
        danglingTaskTickets: danglingTickets.length,
        duplicatedMovideskLinks: duplicatedIds.length,
        ticketOpenTaskFinished: ticketsAwaitingClosure.length,
        ticketOpenTaskWithoutDelivery: ticketsFinishedWithoutDelivery.length,
        ticketClosedTaskOpen: closedTicketsWithActiveTask.length,
        clientMismatch: clientMismatches.length,
        supportLinkDivergence: supportDivergences.length,
        awaitingReturnWithoutCause: awaitingReturnWithoutCause.length,
        awaitingReturnOverdue: awaitingReturnOverdue.length,
        reopenedTickets: reopenedTickets.length,
        excessiveOwnerHandoffs: excessiveOwnerHandoffs.length,
        lowSatisfaction: lowSatisfaction.length,
        resolvedInFirstCall: scopedTickets.filter((ticket) => ticket.resolvedInFirstCall === true).length,
        notResolvedInFirstCall: scopedTickets.filter((ticket) => ticket.resolvedInFirstCall === false).length,
        suspectedClassification: suspectedClassification.length,
        activeTaskWithVersion: activeLinkedTasks.filter((task) =>
          !isSupportTask(task) && Boolean(task.deliveredVersion?.trim()),
        ).length,
        versionMismatch: versionMismatches.length,
      },
      samples,
      filters: {
        clients: [...SIMER_CLIENTS],
        users: [...SUPPORT_ANALYSTS],
        types: ["Correção Clientes", "Evolução", "APOIO"],
      },
    };
    dataQualityCache.set(cacheKey, { expiresAt: Date.now() + 30_000, value: result });
    return result;
  }
}

function compareVersions(left: string, right: string) {
  const leftParts = left.match(/\d+/g)?.map(Number) ?? [];
  const rightParts = right.match(/\d+/g)?.map(Number) ?? [];
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.localeCompare(right, "pt-BR", { numeric: true });
}
