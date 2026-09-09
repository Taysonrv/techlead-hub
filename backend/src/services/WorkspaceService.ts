import {
  prisma,
} from "../database/prisma";
import type { Prisma } from "@prisma/client";
import { SIMER_CLIENTS, SUPPORT_ANALYSTS, ticketOperationalScope } from "../domain/OperationalScope";

const TERMINAL = ["Concluído", "Concluido", "Closed", "Done", "Resolved", "Cancelado", "Canceled"];

export class WorkspaceService {
  public async myOperation(userId: number, params: {
    client?: string | null; type?: string | null; search?: string | null;
  } = {}) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) throw new Error("Usuário não encontrado.");

    const tickets = await prisma.ticket.findMany({
      where: { AND: [
        { owner: { equals: user.name, mode: "insensitive" } },
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
    const identity = {
      OR: [
        { createdByName: { equals: user.name, mode: "insensitive" as const } },
        { assignedToName: { equals: user.name, mode: "insensitive" as const } },
        ...(user.email ? [
          { createdByEmail: { equals: user.email, mode: "insensitive" as const } },
          { assignedToEmail: { equals: user.email, mode: "insensitive" as const } },
        ] : []),
        ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
      ],
    };

    const workItems = await prisma.azureWorkItem.findMany({
        where: { AND: [
          identity,
          ...(params.client ? [{ OR: [
            { client: { equals: params.client, mode: "insensitive" as const } },
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
          blockedProcess: true, deliveredVersion: true,
          movideskTicket: true, azureChangedAt: true,
        },
      });

    const isTerminal = (state: string) => TERMINAL.some((item) => item.toLocaleLowerCase("pt-BR") === state.toLocaleLowerCase("pt-BR"));
    const openWorkItems = workItems.filter((item) => !isTerminal(item.state)).length;
    const concludedRecently = workItems.filter((item) => isTerminal(item.state) && item.azureChangedAt && item.azureChangedAt >= new Date(Date.now() - 30 * 86400000)).length;
    const prioritized = workItems.filter((item) => item.prioritized && !isTerminal(item.state)).length;
    const blocked = workItems.filter((item) => item.blockedProcess && !isTerminal(item.state)).length;

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
      filters: {
        clients: [...new Set([...tickets.map((item) => item.client).filter((value): value is string => Boolean(value)), ...workItems.map((item) => item.client).filter((value): value is string => Boolean(value))])].sort(),
        types: ["Correção Clientes", "Evolução", "APOIO"],
      },
    };
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
            ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
            ...(movideskIds.length ? [{ movideskTicket: { in: movideskIds } }] : []),
          ],
        },
        ...(params.type ? [{ workItemType: { equals: params.type, mode: "insensitive" as const } }] : []),
        ...(params.client ? [{ OR: [
          { client: { equals: params.client, mode: "insensitive" as const } },
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

    const issueWhere = (issue: string): Prisma.AzureWorkItemWhereInput => {
      if (issue === "withoutTicket") return { movideskTicket: null };
      if (issue === "withoutClient") return { client: null };
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
          { movideskTicket: null }, { client: null }, { module: null },
          { assignedToName: null },
          { state: { in: TERMINAL }, deliveredVersion: null },
        ],
      }] },
      orderBy: { azureChangedAt: "desc" },
      take: 50,
      select: {
        id: true, workItemType: true, title: true, state: true,
        client: true, module: true, assignedToName: true,
        movideskTicket: true, deliveredVersion: true,
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
