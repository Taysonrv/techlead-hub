import {
  prisma,
} from "../database/prisma";
import type { Prisma } from "@prisma/client";
import { SIMER_CLIENTS, SUPPORT_ANALYSTS, ticketOperationalScope } from "../domain/OperationalScope";
import { MovideskService } from "./MovideskService";

const TERMINAL = ["Concluído", "Concluido", "Closed", "Done", "Resolved", "Cancelado", "Canceled"];
const normalizedWords = (value: string) => value
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLocaleUpperCase("pt-BR").split(/\s+/).filter((word) => word.length > 2);

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
        ...ownedMovideskIds.map((id) => ({ participantMovideskTickets: { contains: `,${id},` } })),
      ],
    };

    const workItems = await prisma.azureWorkItem.findMany({
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
        take: 500,
        select: {
          id: true, workItemType: true, title: true, state: true,
          client: true, assignedToName: true, prioritized: true,
          participantClients: true,
          blockedProcess: true, deliveredVersion: true,
          movideskTicket: true, azureChangedAt: true,
          participantMovideskTickets: true,
        },
      });

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
        client: true, assignedToName: true, deliveredVersion: true,
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

  public async dataQuality(params: {
    type?: string | null;
    client?: string | null;
    user?: string | null;
    issue?: string | null;
    search?: string | null;
  } = {}) {
    const scopedTickets = await prisma.ticket.findMany({
      where: {
        AND: [
          ticketOperationalScope(),
          ...(params.client ? [{ client: { equals: params.client, mode: "insensitive" as const } }] : []),
          ...(params.user ? [{ owner: { equals: params.user, mode: "insensitive" as const } }] : []),
        ],
      },
      select: { id: true, taskNumber: true, movideskId: true, subject: true, status: true, client: true, owner: true },
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
            ...movideskIds.map((id) => ({ participantMovideskTickets: { contains: `,${id},` } })),
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

    const issueWhere = (issue: string): Prisma.AzureWorkItemWhereInput => {
      if (issue === "withoutTicket") return {
        AND: [
          { movideskTicket: null },
          { participantMovideskTickets: null },
          ...(linkedTaskIds.length ? [{ id: { notIn: linkedTaskIds } }] : []),
        ],
      };
      if (issue === "withoutClient") return { AND: [{ client: null }, { participantClients: null }] };
      if (issue === "withoutModule") return { module: null };
      if (issue === "withoutOwner") return { assignedToName: null };
      if (issue === "completedWithoutVersion") return { state: { in: TERMINAL }, deliveredVersion: null };
      return {};
    };

    const [
      withoutTicket, withoutClient, withoutModule, withoutOwner,
      completedWithoutVersion, existingTasks, duplicates,
    ] = await Promise.all([
      prisma.azureWorkItem.count({ where: { AND: [scope, issueWhere("withoutTicket")] } }),
      prisma.azureWorkItem.count({ where: { AND: [scope, issueWhere("withoutClient")] } }),
      prisma.azureWorkItem.count({ where: { AND: [scope, issueWhere("withoutModule")] } }),
      prisma.azureWorkItem.count({ where: { AND: [scope, issueWhere("withoutOwner")] } }),
      prisma.azureWorkItem.count({
        where: { AND: [scope, issueWhere("completedWithoutVersion")] },
      }),
      prisma.azureWorkItem.findMany({ where: { id: { in: taskIds } }, select: { id: true } }),
      prisma.azureWorkItem.groupBy({
        by: ["movideskTicket"],
        where: { AND: [scope, { movideskTicket: { not: null } }] },
        _count: { id: true },
        having: { id: { _count: { gt: 1 } } },
      }),
    ]);

    const existingTaskIds = new Set(existingTasks.map((item) => item.id));
    const danglingTickets = scopedTickets.filter((ticket) =>
      ticket.taskNumber !== null && !existingTaskIds.has(ticket.taskNumber),
    );
    const duplicatedIds = duplicates.map((item) => item.movideskTicket)
      .filter((value): value is number => value !== null);

    const azureSamples = params.issue === "danglingTaskTickets"
      ? []
      : await prisma.azureWorkItem.findMany({
      where: { AND: [scope, params.issue === "duplicatedMovideskLinks"
        ? { movideskTicket: { in: duplicatedIds } }
        : params.issue ? issueWhere(params.issue) : {
        OR: [
          issueWhere("withoutTicket"), { client: null }, { module: null },
          { assignedToName: null },
          { state: { in: TERMINAL }, deliveredVersion: null },
        ],
      }] },
      orderBy: { azureChangedAt: "desc" },
      take: 50,
      select: {
        id: true, workItemType: true, title: true, state: true,
        client: true, module: true, assignedToName: true,
        participantClients: true,
        movideskTicket: true, deliveredVersion: true,
        participantMovideskTickets: true,
      },
    });

    const samples = params.issue === "danglingTaskTickets"
      ? danglingTickets.slice(0, 50).map((ticket) => ({
          id: ticket.id,
          workItemType: "Ticket Movidesk",
          title: ticket.subject,
          state: ticket.status,
          client: ticket.client,
          module: null,
          assignedToName: ticket.owner,
          movideskTicket: ticket.movideskId,
          deliveredVersion: null,
          taskNumber: ticket.taskNumber,
          source: "MOVIDESK" as const,
        }))
      : azureSamples.map((item) => ({ ...item, taskNumber: item.id, source: "AZURE" as const }));

    return {
      summary: {
        withoutTicket, withoutClient, withoutModule, withoutOwner,
        completedWithoutVersion,
        danglingTaskTickets: danglingTickets.length,
        duplicatedMovideskLinks: duplicates.length,
      },
      samples,
      filters: {
        clients: [...SIMER_CLIENTS],
        users: [...SUPPORT_ANALYSTS],
        types: ["Correção Clientes", "Evolução", "APOIO"],
      },
    };
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
