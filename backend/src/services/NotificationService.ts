import {
  prisma,
} from "../database/prisma";

export type AppNotification = {
  key: string;
  kind: "SIMER_VERSION" | "AZURE_COMPLETED" | "AZURE_UPDATED";
  title: string;
  message: string;
  occurredAt: Date;
  path: string;
  workItemId?: number;
};

const TERMINAL_STATES = [
  "Concluído",
  "Concluido",
  "Closed",
  "Done",
  "Resolved",
];

export class NotificationService {
  public async listForUser(
    userId: number,
  ): Promise<AppNotification[]> {
    const user =
      await prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
        },
      });

    if (!user) {
      return [];
    }

    const since = new Date();
    since.setDate(since.getDate() - 45);

    const relatedTickets =
      await prisma.ticket.findMany({
        where: {
          owner: {
            equals: user.name,
            mode: "insensitive",
          },
        },
        select: {
          taskNumber: true,
          movideskId: true,
        },
      });

    const taskIds = relatedTickets
      .map((ticket) => ticket.taskNumber)
      .filter((value): value is number => value !== null);

    const movideskIds = relatedTickets
      .map((ticket) => ticket.movideskId)
      .filter((value): value is number => value !== null);

    const identities = [
      {
        createdByName: {
          equals: user.name,
          mode: "insensitive" as const,
        },
      },
      {
        assignedToName: {
          equals: user.name,
          mode: "insensitive" as const,
        },
      },
      ...(user.email
        ? [
            {
              createdByEmail: {
                equals: user.email,
                mode: "insensitive" as const,
              },
            },
            {
              assignedToEmail: {
                equals: user.email,
                mode: "insensitive" as const,
              },
            },
          ]
        : []),
      ...(taskIds.length > 0
        ? [{ id: { in: taskIds } }]
        : []),
      ...(movideskIds.length > 0
        ? [{ movideskTicket: { in: movideskIds } }]
        : []),
    ];

    const [workItems, versions] =
      await Promise.all([
        prisma.azureWorkItem.findMany({
          where: {
            AND: [
              { OR: identities },
              {
                azureChangedAt: {
                  gte: since,
                },
              },
            ],
          },
          orderBy: {
            azureChangedAt: "desc",
          },
          take: 40,
          select: {
            id: true,
            workItemType: true,
            title: true,
            state: true,
            azureChangedAt: true,
            updatedAt: true,
          },
        }),
        prisma.azureWorkItem.findMany({
          where: {
            deliveredVersion: { not: null },
            azureChangedAt: { gte: since },
          },
          distinct: ["deliveredVersion"],
          orderBy: { azureChangedAt: "desc" },
          take: 8,
          select: {
            deliveredVersion: true,
            azureChangedAt: true,
            updatedAt: true,
          },
        }),
      ]);

    const itemNotifications = workItems.map((item) => {
      const completed = TERMINAL_STATES.some(
        (state) => state.toLocaleLowerCase("pt-BR") ===
          item.state.trim().toLocaleLowerCase("pt-BR"),
      );
      const route = this.routeForType(item.workItemType);
      const occurredAt = item.azureChangedAt ?? item.updatedAt;

      return {
        key: `azure:${item.id}:${item.state}:${occurredAt.toISOString()}`,
        kind: completed ? "AZURE_COMPLETED" : "AZURE_UPDATED",
        title: completed
          ? `${item.workItemType} concluída`
          : `${item.workItemType} atualizada`,
        message: `#${item.id} · ${item.title}`,
        occurredAt,
        path: `${route}?task=${item.id}`,
        workItemId: item.id,
      } satisfies AppNotification;
    });

    const versionNotifications = versions
      .filter((item) => Boolean(item.deliveredVersion?.trim()))
      .map((item) => {
        const version = item.deliveredVersion!.trim();
        const occurredAt = item.azureChangedAt ?? item.updatedAt;
        return {
          key: `simer-version:${version}`,
          kind: "SIMER_VERSION",
          title: "Nova versão do SIMER",
          message: `A versão ${version} foi identificada nas entregas.`,
          occurredAt,
          path: `/versoes?versao=${encodeURIComponent(version)}`,
        } satisfies AppNotification;
      });

    return [...itemNotifications, ...versionNotifications]
      .sort((left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime(),
      )
      .slice(0, 50);
  }

  private routeForType(type: string) {
    const normalized = type.trim().toLocaleLowerCase("pt-BR");
    if (normalized.includes("apoio")) return "/apoios";
    if (normalized.includes("evolu")) return "/evolucoes";
    return "/correcoes";
  }
}
