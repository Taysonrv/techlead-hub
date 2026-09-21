import {
  prisma,
} from "../database/prisma";

export type AppNotification = {
  key: string;
  kind: "SIMER_VERSION" | "AZURE_COMPLETED" | "AZURE_UPDATED" | "CHAT_MENTION" | "OPERATION_ALERT";
  title: string;
  message: string;
  occurredAt: Date;
  path: string;
  workItemId?: number;
  read?: boolean;
};

export type NotificationPreferences = {
  appVersion: boolean;
  simerVersion: boolean;
  azureCompleted: boolean;
  azureUpdated: boolean;
  desktopAlerts: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  appVersion: true,
  simerVersion: true,
  azureCompleted: true,
  azureUpdated: true,
  desktopAlerts: true,
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
  ) {
    const user =
      await prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          username: true,
        },
      });

    if (!user) {
      return {
        notifications: [],
        preferences: DEFAULT_PREFERENCES,
      };
    }

    const since = new Date();
    since.setDate(since.getDate() - 45);

    const relatedTickets =
      await prisma.ticket.findMany({
        where: {
          AND: [
            {
              owner: {
                equals: user.name,
                mode: "insensitive",
              },
            },
            { isDeleted: false },
            { baseStatus: { in: ["New", "InAttendance", "Stopped"] } },
          ],
        },
        select: {
          taskNumber: true,
          movideskId: true,
          subject: true,
          dueDate: true,
          lastUpdate: true,
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
      ...movideskIds.map((id) => ({
        participantMovideskTickets: { contains: `,${id},` },
      })),
    ];

    const [workItems, versions, chatMentions] =
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
        prisma.chatMessage.findMany({
          where: {
            deletedAt: null,
            authorId: { not: userId },
            createdAt: { gte: since },
            content: {
              contains: `@${user.username}`,
              mode: "insensitive",
            },
            channel: {
              members: {
                some: { userId },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            content: true,
            createdAt: true,
            channelId: true,
            channel: { select: { name: true } },
            author: { select: { name: true } },
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

    const mentionNotifications = chatMentions.map((item) => ({
      key: `chat-mention:${item.id}`,
      kind: "CHAT_MENTION" as const,
      title: `Menção em ${item.channel.name}`,
      message: `${item.author.name}: ${item.content.slice(0, 180)}`,
      occurredAt: item.createdAt,
      path: `/chat?channel=${item.channelId}`,
    }));

    const now = new Date();
    const staleBefore = new Date(now.getTime() - 72 * 60 * 60 * 1_000);
    const operationalAlerts: AppNotification[] = relatedTickets.flatMap((ticket) => {
      const alerts: AppNotification[] = [];
      if (ticket.dueDate && ticket.dueDate < now) {
        alerts.push({
          key: `operation:overdue:${ticket.movideskId}:${ticket.dueDate.toISOString().slice(0, 10)}`,
          kind: "OPERATION_ALERT",
          title: "Prazo vencido na sua operação",
          message: `#${ticket.movideskId} · ${ticket.subject}`,
          occurredAt: ticket.dueDate,
          path: `/tickets?movidesk=${ticket.movideskId}`,
        });
      }
      if (ticket.lastUpdate && ticket.lastUpdate < staleBefore) {
        const occurredAt = ticket.lastUpdate;
        alerts.push({
          key: `operation:stale:${ticket.movideskId}:${occurredAt.toISOString().slice(0, 10)}`,
          kind: "OPERATION_ALERT",
          title: "Atendimento sem movimento há 72h",
          message: `#${ticket.movideskId} · ${ticket.subject}`,
          occurredAt,
          path: `/tickets?movidesk=${ticket.movideskId}`,
        });
      }
      return alerts;
    });

    const preferences = await this.preferences(userId);
    const readRows = await prisma.$queryRaw<Array<{
      notificationKey: string;
    }>>`
      SELECT "notificationKey"
      FROM "AppNotificationRead"
      WHERE "userId" = ${userId}
    `;
    const readKeys = new Set(readRows.map((row) => row.notificationKey));

    const notifications = [...operationalAlerts, ...mentionNotifications, ...itemNotifications, ...versionNotifications]
      .filter((item) =>
        item.kind === "CHAT_MENTION" || item.kind === "OPERATION_ALERT"
          ? true
          : item.kind === "SIMER_VERSION"
          ? preferences.simerVersion
          : item.kind === "AZURE_COMPLETED"
            ? preferences.azureCompleted
            : preferences.azureUpdated,
      )
      .sort((left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime(),
      )
      .slice(0, 50)
      .map((item) => ({
        ...item,
        read: readKeys.has(item.key),
      }));

    return { notifications, preferences };
  }

  public async markRead(userId: number, keys: string[]) {
    const validKeys = [...new Set(keys
      .map((key) => key.trim())
      .filter((key) => key.length > 0 && key.length <= 500))]
      .slice(0, 100);

    await Promise.all(validKeys.map((key) =>
      prisma.$executeRaw`
        INSERT INTO "AppNotificationRead" ("userId", "notificationKey", "readAt")
        VALUES (${userId}, ${key}, CURRENT_TIMESTAMP)
        ON CONFLICT ("userId", "notificationKey")
        DO UPDATE SET "readAt" = CURRENT_TIMESTAMP
      `,
    ));

    return validKeys.length;
  }

  public async preferences(userId: number): Promise<NotificationPreferences> {
    const rows = await prisma.$queryRaw<NotificationPreferences[]>`
      SELECT "appVersion", "simerVersion", "azureCompleted",
             "azureUpdated", "desktopAlerts"
      FROM "NotificationPreference"
      WHERE "userId" = ${userId}
    `;
    return rows[0] ?? DEFAULT_PREFERENCES;
  }

  public async savePreferences(
    userId: number,
    input: NotificationPreferences,
  ) {
    await prisma.$executeRaw`
      INSERT INTO "NotificationPreference"
        ("userId", "appVersion", "simerVersion", "azureCompleted",
         "azureUpdated", "desktopAlerts", "updatedAt")
      VALUES
        (${userId}, ${input.appVersion}, ${input.simerVersion},
         ${input.azureCompleted}, ${input.azureUpdated},
         ${input.desktopAlerts}, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId") DO UPDATE SET
        "appVersion" = EXCLUDED."appVersion",
        "simerVersion" = EXCLUDED."simerVersion",
        "azureCompleted" = EXCLUDED."azureCompleted",
        "azureUpdated" = EXCLUDED."azureUpdated",
        "desktopAlerts" = EXCLUDED."desktopAlerts",
        "updatedAt" = CURRENT_TIMESTAMP
    `;
    return input;
  }

  private routeForType(type: string) {
    const normalized = type.trim().toLocaleLowerCase("pt-BR");
    if (normalized.includes("apoio")) return "/apoios";
    if (normalized.includes("evolu")) return "/evolucoes";
    return "/correcoes";
  }
}
