import {
  prisma,
} from "../database/prisma";

export type AppNotification = {
  key: string;
  kind: "SIMER_VERSION" | "AZURE_COMPLETED" | "AZURE_UPDATED" | "CHAT_MENTION" | "OPERATION_ALERT" | "KNOWN_PROBLEM" | "MEETING_REMINDER";
  title: string;
  message: string;
  occurredAt: Date;
  path: string;
  workItemId?: number;
  meetingId?: number;
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
  public async meetingNotificationsForUser(userId: number): Promise<AppNotification[]> {
    const now = new Date();
    const recent = new Date(now.getTime() - 10 * 60_000);
    const soon = new Date(now.getTime() + 15 * 60_000);

    const meetings = await prisma.calendarMeeting.findMany({
      where: {
        status: "SCHEDULED",
        AND: [
          {
            OR: [
              { createdById: userId },
              { participants: { some: { userId } } },
            ],
          },
          {
            OR: [
              { createdAt: { gte: recent } },
              { startAt: { gte: recent, lte: soon } },
            ],
          },
        ],
      },
      orderBy: { startAt: "asc" },
      take: 50,
      include: {
        createdBy: { select: { name: true } },
      },
    });

    const notifications: AppNotification[] = [];
    for (const meeting of meetings) {
      const startAt = meeting.startAt;
      const startIso = startAt.toISOString();
      const timeLabel = new Intl.DateTimeFormat("pt-BR", {
        timeZone: meeting.timezone || "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      }).format(startAt);

      if (meeting.createdAt >= recent && startAt > soon) {
        notifications.push({
          key: `meeting:scheduled:${meeting.id}:${meeting.createdAt.toISOString()}`,
          kind: "MEETING_REMINDER",
          title: "Reunião agendada",
          message: `${meeting.title} · ${timeLabel}`,
          occurredAt: meeting.createdAt,
          path: "/",
          meetingId: meeting.id,
        });
      }

      const reminderAt = new Date(startAt.getTime() - 15 * 60_000);
      if (now >= reminderAt && now < startAt) {
        const minutes = Math.max(1, Math.ceil((startAt.getTime() - now.getTime()) / 60_000));
        const effectiveOccurredAt = meeting.createdAt > reminderAt ? meeting.createdAt : reminderAt;
        notifications.push({
          key: `meeting:reminder:${meeting.id}:${startIso}`,
          kind: "MEETING_REMINDER",
          title: `Reunião em ${minutes} min`,
          message: `${meeting.title} · ${timeLabel} · Organizador: ${meeting.createdBy.name}`,
          occurredAt: effectiveOccurredAt,
          path: "/",
          meetingId: meeting.id,
        });
      }

      if (now >= startAt && now.getTime() - startAt.getTime() < 10 * 60_000) {
        notifications.push({
          key: `meeting:start:${meeting.id}:${startIso}`,
          kind: "MEETING_REMINDER",
          title: "Reunião começando agora",
          message: `${meeting.title} · ${timeLabel} · Organizador: ${meeting.createdBy.name}`,
          occurredAt: startAt,
          path: "/",
          meetingId: meeting.id,
        });
      }
    }

    return notifications
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, 30);
  }

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

    const [workItems, versions, chatMentions, knownProblems, meetingNotifications] =
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
          where: { deliveredVersion: { not: null } },
          orderBy: { azureChangedAt: "desc" },
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
        prisma.$queryRaw<Array<{ id: number; title: string; updatedAt: Date }>>`
          SELECT "id", "title", "updatedAt"
          FROM "KnownProblem"
          WHERE "archived" = FALSE AND "updatedAt" >= ${since}
          ORDER BY "updatedAt" DESC
          LIMIT 30
        `,
        this.meetingNotificationsForUser(userId),
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

    /*
     * Uma versão do SIMER é um evento de release, não um evento da Tarefa.
     * deliveredVersion pode conter mais de uma versão (ex.: "7.17.44-rc, 7.16.89-lts").
     * Consolidamos cada release individualmente e usamos a primeira ocorrência
     * sincronizada como data do lançamento observado. Alterações posteriores em
     * outras Tarefas da mesma versão não criam novas notificações.
     */
    const versionPattern = /\\b\\d+\\.\\d+(?:\\.\\d+)?(?:[-_.]?(?:rc|lte|lts|develop)(?:[-_.]?\\d+)?)?\\b/gi;
    const firstSeenByVersion = new Map<string, Date>();
    for (const item of versions) {
      const raw = item.deliveredVersion?.trim();
      if (!raw) continue;
      const matches = raw.match(versionPattern) ?? [raw];
      const observedAt = item.azureChangedAt ?? item.updatedAt;
      for (const candidate of matches) {
        const version = candidate.trim().toLocaleLowerCase("pt-BR");
        const current = firstSeenByVersion.get(version);
        if (!current || observedAt < current) firstSeenByVersion.set(version, observedAt);
      }
    }

    const versionNotifications = [...firstSeenByVersion.entries()]
      .filter(([, firstSeenAt]) => firstSeenAt >= since)
      .sort((left, right) => right[1].getTime() - left[1].getTime())
      .slice(0, 8)
      .map(([version, occurredAt]) => ({
        key: `simer-version:${version}`,
        kind: "SIMER_VERSION" as const,
        title: "Nova versão do SIMER",
        message: `Versão ${version} identificada pela primeira vez nas entregas.`,
        occurredAt,
        path: `/versoes?versao=${encodeURIComponent(version)}`,
      } satisfies AppNotification));

    const mentionNotifications = chatMentions.map((item) => ({
      key: `chat-mention:${item.id}`,
      kind: "CHAT_MENTION" as const,
      title: `Menção em ${item.channel.name}`,
      message: `${item.author.name}: ${item.content.slice(0, 180)}`,
      occurredAt: item.createdAt,
      path: `/chat?channel=${item.channelId}`,
    }));

    const knownProblemNotifications: AppNotification[] = knownProblems.map((item) => ({
      key: `known-problem:${item.id}:${item.updatedAt.toISOString()}`,
      kind: "KNOWN_PROBLEM",
      title: "Problema conhecido atualizado",
      message: item.title,
      occurredAt: item.updatedAt,
      path: "/problemas-conhecidos",
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

    const notifications = [...meetingNotifications, ...knownProblemNotifications, ...operationalAlerts, ...mentionNotifications, ...itemNotifications, ...versionNotifications]
      .filter((item) =>
        item.kind === "CHAT_MENTION" || item.kind === "OPERATION_ALERT" || item.kind === "KNOWN_PROBLEM" || item.kind === "MEETING_REMINDER"
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
