import {
  prisma,
} from "../database/prisma";

const TERMINAL = ["Concluído", "Concluido", "Closed", "Done", "Resolved", "Cancelado", "Canceled"];

export class WorkspaceService {
  public async myOperation(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) throw new Error("Usuário não encontrado.");

    const tickets = await prisma.ticket.findMany({
      where: { owner: { equals: user.name, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
      take: 100,
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

    const [workItems, openWorkItems, concludedRecently, prioritized, blocked] = await Promise.all([
      prisma.azureWorkItem.findMany({
        where: identity,
        orderBy: [{ azureChangedAt: "desc" }, { id: "desc" }],
        take: 100,
        select: {
          id: true, workItemType: true, title: true, state: true,
          client: true, assignedToName: true, prioritized: true,
          blockedProcess: true, deliveredVersion: true,
          movideskTicket: true, azureChangedAt: true,
        },
      }),
      prisma.azureWorkItem.count({ where: { AND: [identity, { state: { notIn: TERMINAL } }] } }),
      prisma.azureWorkItem.count({
        where: {
          AND: [identity, { state: { in: TERMINAL } }, {
            azureChangedAt: { gte: new Date(Date.now() - 30 * 86400000) },
          }],
        },
      }),
      prisma.azureWorkItem.count({ where: { AND: [identity, { prioritized: true }, { state: { notIn: TERMINAL } }] } }),
      prisma.azureWorkItem.count({ where: { AND: [identity, { blockedProcess: true }, { state: { notIn: TERMINAL } }] } }),
    ]);

    return {
      user,
      summary: {
        tickets: tickets.length,
        openWorkItems,
        concludedRecently,
        prioritized,
        blocked,
      },
      tickets: tickets.slice(0, 20),
      workItems: workItems.slice(0, 30),
    };
  }

  public async dataQuality() {
    const [
      withoutTicket, withoutClient, withoutModule, withoutOwner,
      completedWithoutVersion, danglingTaskTickets, duplicates,
    ] = await Promise.all([
      prisma.azureWorkItem.count({ where: { movideskTicket: null } }),
      prisma.azureWorkItem.count({ where: { client: null } }),
      prisma.azureWorkItem.count({ where: { module: null } }),
      prisma.azureWorkItem.count({ where: { assignedToName: null } }),
      prisma.azureWorkItem.count({
        where: { state: { in: TERMINAL }, deliveredVersion: null },
      }),
      prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) AS "total" FROM "Ticket" t
        WHERE t."taskNumber" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "AzureWorkItem" a WHERE a."id" = t."taskNumber")
      `,
      prisma.azureWorkItem.groupBy({
        by: ["movideskTicket"],
        where: { movideskTicket: { not: null } },
        _count: { id: true },
        having: { id: { _count: { gt: 1 } } },
      }),
    ]);

    const samples = await prisma.azureWorkItem.findMany({
      where: {
        OR: [
          { movideskTicket: null }, { client: null }, { module: null },
          { assignedToName: null },
          { state: { in: TERMINAL }, deliveredVersion: null },
        ],
      },
      orderBy: { azureChangedAt: "desc" },
      take: 50,
      select: {
        id: true, workItemType: true, title: true, state: true,
        client: true, module: true, assignedToName: true,
        movideskTicket: true, deliveredVersion: true,
      },
    });

    return {
      summary: {
        withoutTicket, withoutClient, withoutModule, withoutOwner,
        completedWithoutVersion,
        danglingTaskTickets: Number(danglingTaskTickets[0]?.total ?? 0),
        duplicatedMovideskLinks: duplicates.length,
      },
      samples,
    };
  }
}
