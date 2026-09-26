import {
  prisma,
} from "../database/prisma";
import { SUPPORT_ANALYSTS, SUPPORT_COORDINATOR, SUPPORT_TEAMS, type SupportTeamName } from "../domain/OperationalScope";
import { MovideskService } from "./MovideskService";
import { AnalystProductivityService } from "./AnalystProductivityService";
import { DataQualityService } from "./DataQualityService";
import { TechnicalLeadershipService } from "./TechnicalLeadershipService";

const TERMINAL = ["Concluído", "Concluido", "Closed", "Done", "Resolved", "Cancelado", "Canceled"];
const normalizedWords = (value: string) => value
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLocaleUpperCase("pt-BR").split(/\s+/).filter((word) => word.length > 2);

function compareVersions(left: string, right: string) {
  const leftParts = left.match(/\\d+/g)?.map(Number) ?? [];
  const rightParts = right.match(/\\d+/g)?.map(Number) ?? [];
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.localeCompare(right, "pt-BR", { numeric: true });
}

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
    return new AnalystProductivityService().analyze(params);
  }

  public async technicalLeadership(params: {
    client?: string | null;
    user?: string | null;
    days?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  } = {}) {
    return new TechnicalLeadershipService().analyze(params);
  }

  public async dataQuality(params: {
    type?: string | null;
    client?: string | null;
    user?: string | null;
    issue?: string | null;
    search?: string | null;
  } = {}) {
    return new DataQualityService().analyze(params);
  }

}
