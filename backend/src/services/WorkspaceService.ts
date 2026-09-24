import {
  prisma,
} from "../database/prisma";
import type { Prisma } from "@prisma/client";
import { SIMER_CLIENTS, SUPPORT_ANALYSTS, SUPPORT_COORDINATOR, SUPPORT_TEAMS, ticketOperationalScope, type SupportTeamName } from "../domain/OperationalScope";
import { MovideskService } from "./MovideskService";
import { analyzeMovideskIndicators, extractMovideskTimeEntries } from "./MovideskPayloadAnalytics";
import { SIMER_SERVICE_CATALOG, suggestSimerService, type SimerServiceCatalogItem } from "../domain/SimerServiceCatalog";

const TERMINAL = ["Concluído", "Concluido", "Closed", "Done", "Resolved", "Cancelado", "Canceled"];
const normalizedWords = (value: string) => value
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLocaleUpperCase("pt-BR").split(/\s+/).filter((word) => word.length > 2);

const dataQualityCache = new Map<string, { expiresAt: number; value: unknown }>();
const technicalLeadershipCache = new Map<string, { expiresAt: number; value: unknown }>();

export class WorkspaceService {
  public async myOperation(userId: number, params: {
    client?: string | null; type?: string | null; search?: string | null;
    analyst?: string | null; team?: string | null;
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
    const teamMembers = params.team && params.team in SUPPORT_TEAMS
      ? [...SUPPORT_TEAMS[params.team as SupportTeamName]]
      : [];
    const requestedOwners = params.analyst
      ? [params.analyst]
      : teamMembers.length
        ? teamMembers
        : [operationName];
    const allowedOwners = [...new Set(requestedOwners.filter((owner) =>
      SUPPORT_ANALYSTS.some((analyst) => analyst.localeCompare(owner, "pt-BR", { sensitivity: "base" }) === 0)
      || SUPPORT_COORDINATOR.localeCompare(owner, "pt-BR", { sensitivity: "base" }) === 0
    ))];
    const operationOwners = allowedOwners.length ? allowedOwners : [operationName];

    const tickets = await prisma.ticket.findMany({
      where: { AND: [
        { owner: { in: operationOwners, mode: "insensitive" } },
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
        { createdByName: { in: operationOwners, mode: "insensitive" as const } },
        { assignedToName: { in: operationOwners, mode: "insensitive" as const } },
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
      operationOwners.some((owner) => same(item.createdByName, owner))
      || operationOwners.some((owner) => same(item.assignedToName, owner))
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
        analysts: [...SUPPORT_ANALYSTS, SUPPORT_COORDINATOR],
        teams: Object.entries(SUPPORT_TEAMS).map(([name, members]) => ({ name, members: [...members] })),
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

  public async analystTimeProductivity(params: { startDate?: string | null; endDate?: string | null; analyst?: string | null } = {}) {
    const end = params.endDate ? new Date(`${params.endDate}T23:59:59.999`) : new Date();
    const start = params.startDate ? new Date(`${params.startDate}T00:00:00.000`) : new Date(end.getTime() - 27 * 86400000);
    const analysts = params.analyst ? [params.analyst] : [...SUPPORT_ANALYSTS];
    const tickets = await prisma.ticket.findMany({
      where: { AND: [ticketOperationalScope(), { isDeleted: false }, { owner: { in: analysts, mode: "insensitive" } }] },
      select: { movideskId: true, subject: true, owner: true, rawData: true },
    });
    const holidays = new Set((process.env.PRODUCTIVITY_HOLIDAYS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
    const hoursPerDay = Math.min(Math.max(Number(process.env.PRODUCTIVITY_HOURS_PER_DAY ?? 8) || 8, 1), 24);
    const dateKey = (value: Date) => {
      const year = value.getFullYear(); const month = String(value.getMonth() + 1).padStart(2, "0"); const day = String(value.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    const isBusinessDay = (value: Date) => value.getDay() !== 0 && value.getDay() !== 6 && !holidays.has(dateKey(value));
    const businessDays = (() => { let count = 0; const day = new Date(start); while (day <= end) { if (isBusinessDay(day)) count += 1; day.setDate(day.getDate() + 1); } return count; })();
    const expectedHours = businessDays * hoursPerDay;
    const same = (a: string | null, b: string) => Boolean(a && a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0);
    const weekKey = (value: Date) => {
      const day = new Date(value); day.setHours(0, 0, 0, 0);
      const mondayOffset = (day.getDay() + 6) % 7; day.setDate(day.getDate() - mondayOffset);
      return day.toISOString().slice(0, 10);
    };
    const weeks = new Map<string, { week: string; businessDays: number }>();
    for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
      const key = weekKey(day); const current = weeks.get(key) ?? { week: key, businessDays: 0 };
      if (isBusinessDay(day)) current.businessDays += 1;
      weeks.set(key, current);
    }
    const result = analysts.map((analyst) => {
      let registeredMinutes = 0; const ticketMinutes = new Map<number, number>(); const weeklyMinutes = new Map<string, number>();
      for (const ticket of tickets) for (const entry of extractMovideskTimeEntries(ticket.rawData)) {
        if (entry.date) { const entryDate = new Date(entry.date); if (entryDate < start || entryDate > end) continue; }
        const belongs = entry.analyst ? same(entry.analyst, analyst) : same(ticket.owner, analyst);
        if (!belongs) continue;
        registeredMinutes += entry.minutes;
        ticketMinutes.set(ticket.movideskId, (ticketMinutes.get(ticket.movideskId) ?? 0) + entry.minutes);
        if (entry.date) { const key = weekKey(new Date(entry.date)); weeklyMinutes.set(key, (weeklyMinutes.get(key) ?? 0) + entry.minutes); }
      }
      return {
        analyst, businessDays, expectedHours, registeredHours: Number((registeredMinutes / 60).toFixed(2)),
        coverageRate: expectedHours ? Number(((registeredMinutes / 60 / expectedHours) * 100).toFixed(1)) : null,
        ticketsWithTime: ticketMinutes.size,
        averageHoursPerTicket: ticketMinutes.size ? Number((registeredMinutes / 60 / ticketMinutes.size).toFixed(2)) : null,
        weekly: [...weeks.values()].map((week) => {
          const registeredHours = Number(((weeklyMinutes.get(week.week) ?? 0) / 60).toFixed(2));
          const expected = week.businessDays * hoursPerDay;
          return { week: week.week, businessDays: week.businessDays, expectedHours: expected, registeredHours, coverageRate: expected ? Number((registeredHours / expected * 100).toFixed(1)) : null };
        }),
        topTickets: [...ticketMinutes.entries()].sort((a,b) => b[1]-a[1]).slice(0,10).map(([movideskId, minutes]) => {
          const ticket = tickets.find((item) => item.movideskId === movideskId);
          return { movideskId, subject: ticket?.subject ?? "", hours: Number((minutes / 60).toFixed(2)) };
        }),
      };
    });
    const teams = Object.entries(SUPPORT_TEAMS).map(([team, members]) => {
      const rows = result.filter((row) => members.some((member) => same(row.analyst, member)));
      const teamExpected = rows.reduce((sum, row) => sum + row.expectedHours, 0);
      const teamRegistered = Number(rows.reduce((sum, row) => sum + row.registeredHours, 0).toFixed(2));
      return { team, analysts: rows.length, expectedHours: teamExpected, registeredHours: teamRegistered, coverageRate: teamExpected ? Number((teamRegistered / teamExpected * 100).toFixed(1)) : null };
    });
    const weekly = [...weeks.values()].map((week) => {
      const expectedHours = week.businessDays * hoursPerDay * result.length;
      const registeredHours = Number(result.reduce((sum, row) => sum + (row.weekly.find((item) => item.week === week.week)?.registeredHours ?? 0), 0).toFixed(2));
      return { week: week.week, expectedHours, registeredHours, coverageRate: expectedHours ? Number((registeredHours / expectedHours * 100).toFixed(1)) : null };
    });
    return {
      generatedAt: new Date().toISOString(), startDate: start.toISOString(), endDate: end.toISOString(),
      definition: { expectedHours: `${hoursPerDay} horas por dia útil (segunda a sexta), descontando ${holidays.size} feriado(s) configurado(s) no período de referência. Férias, afastamentos e jornadas individuais ainda devem ser tratados como ajustes de capacidade.`, registeredHours: "Soma dos apontamentos de tempo disponíveis no payload sincronizado do Movidesk.", coverageRate: "Horas registradas ÷ horas previstas × 100. Indicador de cobertura de apontamento, não avaliação isolada de desempenho." },
      analysts: result, teams, weekly, capacity: { hoursPerDay, configuredHolidays: [...holidays].sort() },
    };
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

    const byOwner = [...SUPPORT_ANALYSTS].map((analyst) => {
      const owned = resolvedPeriod.filter((ticket) => normalize(ticket.owner) === normalize(analyst));
      const reopened = owned.filter((ticket) => inRange(ticket.reopenedDate)).length;
      const accepted = owned.filter((ticket) => ticket.baseStatus === "Closed" || Boolean(ticket.closedDate)).length;
      const within = owned.filter((ticket) => slaBucket(ticket.solutionSlaIndicator) === "within").length;
      const outside = owned.filter((ticket) => slaBucket(ticket.solutionSlaIndicator) === "outside").length;
      return { analyst, resolved: owned.length, reopened, accepted, within, outside };
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
    const reopenedCount = resolvedPeriod.filter((ticket) => inRange(ticket.reopenedDate)).length;
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
        service: true, serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true,
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
    const completedWithoutVersionTasks = finishedLinkedTasks.filter((item) =>
      !isSupportTask(item) && !isCanceledTask(item.state) && !item.deliveredVersion?.trim(),
    );
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

    /*
     * Auditoria inicial do campo Serviço do Movidesk.
     *
     * Nesta primeira etapa não tentamos "adivinhar" automaticamente um
     * serviço específico. Identificamos classificações ausentes ou
     * excessivamente genéricas e expomos a hierarquia já sincronizada.
     * Isso cria uma base segura para, na próxima evolução, cruzar assunto,
     * categoria e catálogo oficial de serviços para sugerir o serviço correto.
     */
    const ticketServicePath = (ticket: (typeof scopedTickets)[number]) =>
      [ticket.serviceFirstLevel, ticket.serviceSecondLevel, ticket.serviceThirdLevel]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

    const hasNoService = (ticket: (typeof scopedTickets)[number]) =>
      !ticket.service?.trim() && ticketServicePath(ticket).length === 0;

    const isGenericSimerService = (ticket: (typeof scopedTickets)[number]) => {
      const path = ticketServicePath(ticket).map(normalizeStatus);
      const service = normalizeStatus(ticket.service ?? "");
      const values = [...path, service].filter(Boolean);
      if (!values.some((value) => /simer/.test(value))) return false;

      const specificValues = values.filter((value) =>
        !/^(atendimento ao cliente|siagri simer|simer|siagri)$/.test(value),
      );
      return specificValues.length === 0;
    };

    const withoutService = scopedTickets.filter((ticket) =>
      isTicketOpen(ticket) && hasNoService(ticket),
    );
    const genericSimerService = scopedTickets.filter((ticket) =>
      isTicketOpen(ticket) && !hasNoService(ticket) && isGenericSimerService(ticket),
    );

    /*
     * Catálogo vivo: usa todos os caminhos de Serviço já sincronizados do
     * Movidesk no escopo SIMER. Assim a cobertura cresce automaticamente
     * conforme a operação utiliza novos serviços, sem depender de deploy.
     */
    const dynamicServiceCatalog = new Map<string, SimerServiceCatalogItem>();
    for (const seed of SIMER_SERVICE_CATALOG) dynamicServiceCatalog.set(normalizeStatus(seed.path), seed);
    for (const ticket of scopedTickets) {
      const path = ticketServicePath(ticket).join(" » ") || ticket.service?.trim() || "";
      if (!path || !/simer/i.test(path)) continue;
      const segments = path.split("»").map((value) => value.trim()).filter(Boolean);
      const name = segments.at(-1) ?? path;
      const module = segments.find((value, index) =>
        index >= 2 && !/^(siagri simer|simer)$/i.test(value),
      ) ?? null;
      dynamicServiceCatalog.set(normalizeStatus(path), {
        id: `observed:${normalizeStatus(path)}`,
        path,
        name,
        module,
      });
    }
    const serviceCatalog = [...dynamicServiceCatalog.values()];

    const serviceSuggestionByTicketId = new Map(
      scopedTickets.map((ticket) => [
        ticket.id,
        suggestSimerService({
          subject: ticket.subject,
          category: ticket.category,
          cause: ticket.cause,
          currentService: ticket.service,
          serviceFirstLevel: ticket.serviceFirstLevel,
          serviceSecondLevel: ticket.serviceSecondLevel,
          serviceThirdLevel: ticket.serviceThirdLevel,
        }, serviceCatalog),
      ]),
    );

    const suspectedServiceMismatch = scopedTickets.filter((ticket) => {
      if (!isTicketOpen(ticket)) return false;
      const suggestion = serviceSuggestionByTicketId.get(ticket.id);
      if (!suggestion || suggestion.confidence === "LOW") return false;
      const current = normalizeStatus(ticketServicePath(ticket).join(" » ") || ticket.service || "");
      const suggested = normalizeStatus(suggestion.path);
      return Boolean(current && current !== suggested && !suggested.includes(current));
    });

    const derivedTicketIssues = ["danglingTaskTickets", "ticketOpenTaskFinished", "ticketOpenTaskWithoutDelivery", "ticketClosedTaskOpen", "clientMismatch", "supportLinkDivergence", "awaitingReturnWithoutCause", "awaitingReturnOverdue", "reopenedTickets", "excessiveOwnerHandoffs", "lowSatisfaction", "suspectedClassification", "withoutService", "genericSimerService", "suspectedServiceMismatch"];
    const matchesAzureIssue = (item: (typeof linkedTasks)[number]) => {
      if (params.issue === "duplicatedMovideskLinks") return Boolean(item.movideskTicket && duplicatedIds.includes(item.movideskTicket));
      if (params.issue === "withoutTicket") return !item.movideskTicket && !item.participantMovideskTickets && !linkedTaskIdSet.has(item.id);
      if (params.issue === "withoutClient") return !isSupportTask(item) && !item.client && !item.participantClients;
      if (params.issue === "completedWithoutVersion") return completedWithoutVersionTasks.some((task) => task.id === item.id);
      if (params.issue === "activeTaskWithVersion") return !isSupportTask(item) && !isTerminalTask(item.state) && Boolean(item.deliveredVersion);
      if (params.issue === "versionMismatch") return versionMismatches.some((task) => task.id === item.id);
      if (!params.issue) return (!item.movideskTicket && !item.participantMovideskTickets && !linkedTaskIdSet.has(item.id))
        || (!isSupportTask(item) && !item.client && !item.participantClients) || !item.module || !item.assignedToName
        || completedWithoutVersionTasks.some((task) => task.id === item.id)
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
      service: ticket.service,
      serviceFirstLevel: ticket.serviceFirstLevel,
      serviceSecondLevel: ticket.serviceSecondLevel,
      serviceThirdLevel: ticket.serviceThirdLevel,
      servicePath: ticketServicePath(ticket).join(" » ") || ticket.service || null,
      serviceSuggestion: serviceSuggestionByTicketId.get(ticket.id) ?? null,
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
      : params.issue === "withoutService"
      ? withoutService.slice(0, 100).map(toClassificationSample)
      : params.issue === "genericSimerService"
      ? genericSimerService.slice(0, 100).map(toClassificationSample)
      : params.issue === "suspectedServiceMismatch"
      ? suspectedServiceMismatch.slice(0, 100).map(toClassificationSample)
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
        completedWithoutVersion: completedWithoutVersionTasks.length,
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
        withoutService: withoutService.length,
        genericSimerService: genericSimerService.length,
        suspectedServiceMismatch: suspectedServiceMismatch.length,
        serviceCatalogSize: serviceCatalog.length,
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
