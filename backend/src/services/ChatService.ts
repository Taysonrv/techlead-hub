import { prisma } from "../database/prisma";
import { Prisma } from "@prisma/client";
import { dataProtectionService } from "./DataProtectionService";
import { chatEventBus } from "./ChatEventBus";

const memberUserSelect = { id: true, name: true, username: true, role: true, avatarUpdatedAt: true } as const;

export class ChatService {
  async updatePresence(userId: number, input: Record<string, unknown>) {
    const requested = String(input.status ?? "ONLINE").toUpperCase();
    const status = ["ONLINE", "AWAY", "BUSY"].includes(requested) ? requested : "ONLINE";
    const statusMessage = dataProtectionService.normalizeText(input.statusMessage, 160) || null;
    const globalHeartbeat = input.source === "global";
    // Uma transição real OFFLINE → ONLINE gera um evento por usuário.
    // O lock transacional evita duplicação com múltiplas abas/servidores.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(716345, ${userId}::integer)::text AS lock_acquired`;
      const previous = await tx.$queryRaw<Array<{ status: string; statusMessage: string | null; lastSeenAt: Date }>>`
        SELECT "status", "statusMessage", "lastSeenAt" FROM "ChatPresence" WHERE "userId" = ${userId}
      `;
      const lastPresence = previous[0];
      const wasOffline = !lastPresence ||
        Date.now() - new Date(lastPresence.lastSeenAt).getTime() > 90_000;
      const preserveManualStatus = globalHeartbeat && !!lastPresence && !wasOffline;
      const nextStatus = preserveManualStatus ? lastPresence.status : status;
      const nextMessage = preserveManualStatus ? lastPresence.statusMessage : statusMessage;
      await tx.$executeRaw`
        INSERT INTO "ChatPresence" ("userId","status","statusMessage","lastSeenAt","updatedAt")
        VALUES (${userId},${nextStatus},${nextMessage},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT ("userId") DO UPDATE SET
          "status"=EXCLUDED."status","statusMessage"=EXCLUDED."statusMessage",
          "lastSeenAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
      `;
      if (wasOffline && nextStatus === "ONLINE") {
        await tx.$executeRaw`
          INSERT INTO "ChatOnlineEvent" ("userId","occurredAt") VALUES (${userId},CURRENT_TIMESTAMP)
        `;
      }
    });
    return { status, statusMessage };
  }

  async setTyping(userId: number, channelId: number, active: boolean) {
    await this.assertMember(userId, channelId);
    if (!active) {
      await prisma.$executeRawUnsafe(`DELETE FROM "ChatTyping" WHERE "channelId"=$1 AND "userId"=$2`, channelId, userId);
      await this.notifyChannel(channelId);
      return;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ChatTyping" ("channelId","userId","expiresAt") VALUES ($1,$2,CURRENT_TIMESTAMP + INTERVAL '4 seconds')
       ON CONFLICT ("channelId","userId") DO UPDATE SET "expiresAt"=EXCLUDED."expiresAt"`,
      channelId, userId,
    );
    await this.notifyChannel(channelId);
  }

  async realtimeSnapshot(userId: number) {
    const channels = await prisma.chatChannelMember.findMany({
      where: { userId, channel: { archivedAt: null } },
      select: { channelId: true },
    });
    const channelIds = channels.map(({ channelId }) => channelId);
    const [presence, typing, latest] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ userId: number; status: string; statusMessage: string | null; lastSeenAt: Date; name: string; username: string }>>(
        `SELECT p."userId",p."status",p."statusMessage",p."lastSeenAt",u."name",u."username"
         FROM "ChatPresence" p JOIN "User" u ON u."id"=p."userId"
         WHERE u."active"=TRUE AND u."approvalStatus"='APPROVED'`,
      ),
      channelIds.length ? prisma.$queryRawUnsafe<Array<{ channelId: number; userId: number; name: string }>>(
        `SELECT t."channelId",t."userId",u."name" FROM "ChatTyping" t JOIN "User" u ON u."id"=t."userId"
         WHERE t."expiresAt">CURRENT_TIMESTAMP AND t."userId"<>$1 AND t."channelId" = ANY($2::int[])`,
        userId, channelIds,
      ) : Promise.resolve([]),
      channelIds.length ? prisma.chatMessage.findFirst({
        where: { channelId: { in: channelIds }, deletedAt: null },
        orderBy: { id: "desc" },
        select: { id: true, channelId: true, authorId: true },
      }) : Promise.resolve(null),
    ]);
    const now = Date.now();
    return {
      presence: presence.map((item) => ({ ...item, effectiveStatus: now - new Date(item.lastSeenAt).getTime() > 90_000 ? "OFFLINE" : item.status })),
      typing,
      latestMessage: latest,
    };
  }

  async listParticipants() {
    return prisma.user.findMany({
      where: {
        active: true,
        approvalStatus: "APPROVED",
      },
      orderBy: { name: "asc" },
      select: memberUserSelect,
    });
  }

  async listChannels(userId: number) {
    const memberships = await prisma.chatChannelMember.findMany({
      where: { userId, channel: { archivedAt: null } },
      orderBy: { channel: { updatedAt: "desc" } },
      include: {
        channel: {
          include: {
            members: { include: { user: { select: memberUserSelect } } },
            messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, include: { author: { select: memberUserSelect } } },
          },
        },
      },
    });
    if (!memberships.length) return [];

    const unreadRows = await prisma.$queryRaw<Array<{ channelId: number; unread: bigint }>>`
      SELECT m."channelId", COUNT(msg."id")::bigint AS unread
      FROM "ChatChannelMember" m
      LEFT JOIN "ChatMessage" msg
        ON msg."channelId" = m."channelId"
       AND msg."deletedAt" IS NULL
       AND msg."authorId" <> ${userId}
       AND msg."createdAt" > COALESCE(m."lastReadAt", m."joinedAt")
      WHERE m."userId" = ${userId}
        AND m."channelId" IN (${Prisma.join(memberships.map(({ channel }) => channel.id))})
      GROUP BY m."channelId"
    `;
    const unreadByChannel = new Map(unreadRows.map((row) => [row.channelId, Number(row.unread)]));

    return memberships.map(({ channel, lastReadAt }) => ({
      ...channel,
      lastReadAt,
      unread: unreadByChannel.get(channel.id) ?? 0,
    }));
  }

  async openDirectChannel(userId: number, targetUserId: number) {
    if (userId === targetUserId) throw Object.assign(new Error("Selecione outro usuário para iniciar a conversa."), { statusCode: 400 });
    const target = await prisma.user.findFirst({ where: { id: targetUserId, active: true, approvalStatus: "APPROVED" }, select: memberUserSelect });
    if (!target) throw Object.assign(new Error("Usuário não localizado ou indisponível."), { statusCode: 404 });

    const firstId = Math.min(userId, targetUserId);
    const secondId = Math.max(userId, targetUserId);
    const channel = await prisma.$transaction(async (tx) => {
      // Serializa a criação por par de usuários e elimina a corrida de dois cliques/abas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${firstId}::int, ${secondId}::int)`;
      const candidates = await tx.chatChannel.findMany({
        where: {
          type: "DIRECT",
          archivedAt: null,
          AND: [
            { members: { some: { userId } } },
            { members: { some: { userId: targetUserId } } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        include: { members: { include: { user: { select: memberUserSelect } } } },
      });
      const existing = candidates.find((item) =>
        item.members.length === 2 &&
        item.members.every((member) => member.userId === userId || member.userId === targetUserId),
      );
      if (existing) return existing;

      return tx.chatChannel.create({
        data: {
          name: target.name,
          type: "DIRECT",
          description: "Conversa privada",
          members: { create: [{ userId }, { userId: targetUserId }] },
        },
        include: { members: { include: { user: { select: memberUserSelect } } } },
      });
    });

    const current = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    await this.audit(userId, "CHAT_DIRECT_OPENED", "ChatChannel", channel.id, { targetUserId, participants: [current?.name, target.name].filter(Boolean) });
    return channel;
  }

  async createChannel(userId: number, role: string, input: Record<string, unknown>) {
    const name = dataProtectionService.normalizeText(input.name, 120);
    if (name.length < 3) throw Object.assign(new Error("Informe um nome com ao menos 3 caracteres."), { statusCode: 400 });
    const requestedMembers = Array.isArray(input.memberIds) ? input.memberIds.map(Number).filter(Number.isSafeInteger) : [];
    const memberIds = [...new Set([userId, ...requestedMembers])];
    if (role === "ANALISTA" && memberIds.length > 20) throw Object.assign(new Error("O canal excede o limite de membros permitido."), { statusCode: 403 });
    const validMembers = await prisma.user.findMany({
      where: {
        id: { in: memberIds },
        active: true,
        approvalStatus: "APPROVED",
      },
      select: { id: true },
    });
    if (validMembers.length !== memberIds.length) {
      throw Object.assign(new Error("Um ou mais participantes não estão ativos ou aprovados."), { statusCode: 400 });
    }
    const type = ["DIRECT", "TEAM", "CLIENT", "CONTEXT"].includes(String(input.type)) ? String(input.type) as "DIRECT" | "TEAM" | "CLIENT" | "CONTEXT" : "TEAM";
    const channel = await prisma.chatChannel.create({
      data: {
        name,
        type,
        description: dataProtectionService.normalizeText(input.description, 500) || null,
        contextType: dataProtectionService.normalizeText(input.contextType, 40) || null,
        contextId: dataProtectionService.normalizeText(input.contextId, 120) || null,
        clientName: dataProtectionService.normalizeText(input.clientName, 160) || null,
        members: { create: memberIds.map((memberId) => ({ userId: memberId })) },
      },
      include: { members: { include: { user: { select: memberUserSelect } } } },
    });
    await this.audit(userId, "CHAT_CHANNEL_CREATED", "ChatChannel", channel.id, { type, memberCount: memberIds.length });
    return channel;
  }

  async listMessages(userId: number, channelId: number, beforeId?: number) {
    await this.assertMember(userId, channelId);
    const messages = await prisma.chatMessage.findMany({
      where: { channelId, deletedAt: null, ...(beforeId ? { id: { lt: beforeId } } : {}) },
      orderBy: { id: "desc" },
      take: 100,
      include: { author: { select: memberUserSelect } },
    });
    return messages.reverse();
  }

  async sendAttachment(userId: number, channelId: number, input: Record<string, unknown>) {
    await this.assertMember(userId, channelId);
    const name = dataProtectionService.normalizeText(input.name, 180);
    const mimeType = dataProtectionService.normalizeText(input.mimeType, 100) || "application/octet-stream";
    const data = String(input.data ?? "");
    if (!name || !data) throw Object.assign(new Error("Anexo inválido."), { statusCode: 400 });
    const match = data.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw Object.assign(new Error("Formato do anexo inválido."), { statusCode: 400 });
    const encoded = match[2];
    if (!encoded) throw Object.assign(new Error("Conteúdo do anexo inválido."), { statusCode: 400 });
    const bytes = Buffer.from(encoded, "base64");
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw Object.assign(new Error("O anexo deve ter no máximo 8 MB."), { statusCode: 400 });
    const blocked = ["application/x-msdownload", "application/x-msdos-program", "application/x-sh", "application/x-bat"];
    if (blocked.includes(mimeType)) throw Object.assign(new Error("Este tipo de arquivo não é permitido."), { statusCode: 400 });
    const safeName = name.replace(/[\\/:*?"<>|\r\n]/g, "_");
    const content = `[anexo] ${safeName}|${mimeType}|${bytes.length}|${match[2]}`;
    if (content.length > 12_000_000) throw Object.assign(new Error("Anexo excede o limite permitido."), { statusCode: 400 });
    const message = await prisma.chatMessage.create({
      data: { channelId, authorId: userId, content },
      include: { author: { select: memberUserSelect } },
    });
    await prisma.chatChannel.update({ where: { id: channelId }, data: { updatedAt: new Date() } });
    await this.audit(userId, "CHAT_ATTACHMENT_CREATED", "ChatMessage", message.id, { channelId, name: safeName, mimeType, size: bytes.length });
    await this.notifyChannel(channelId);
    return message;
  }

  async markRead(userId: number, channelId: number) {
    await this.assertMember(userId, channelId);
    await prisma.chatChannelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: { lastReadAt: new Date() },
    });
    await this.notifyChannel(channelId);
    return { ok: true };
  }

  async openContextChannel(userId: number, input: Record<string, unknown>) {
    const contextType = String(input.contextType ?? "").toUpperCase();
    if (!["TICKET", "TASK"].includes(contextType)) {
      throw Object.assign(new Error("Tipo de contexto inválido."), { statusCode: 400 });
    }
    const contextId = dataProtectionService.normalizeText(input.contextId, 120);
    if (!contextId || !/^[a-zA-Z0-9_-]{1,120}$/.test(contextId)) {
      throw Object.assign(new Error("Identificador de contexto inválido."), { statusCode: 400 });
    }
    const numericId = Number(contextId);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      throw Object.assign(new Error("Identificador do registro inválido."), { statusCode: 400 });
    }
    const source = contextType === "TICKET"
      ? await prisma.ticket.findUnique({ where: { movideskId: numericId }, select: { subject: true, client: true, isDeleted: true } })
      : await prisma.azureWorkItem.findUnique({ where: { id: numericId }, select: { title: true, client: true } });
    if (!source || ("isDeleted" in source && source.isDeleted)) {
      throw Object.assign(new Error("Registro de origem não localizado."), { statusCode: 404 });
    }
    // Nome e cliente vêm da fonte persistida, nunca do texto enviado pelo navegador.
    const title = dataProtectionService.normalizeText("subject" in source ? source.subject : source.title, 120);
    const clientName = dataProtectionService.normalizeText(source.client, 160) || null;
    // Inclusão de outros membros exige uma política de acesso por registro;
    // até ela existir, a sala nasce restrita ao solicitante.
    const requested = [userId];
    const members = await prisma.user.findMany({
      where: { id: { in: requested }, active: true, approvalStatus: "APPROVED" },
      select: { id: true },
    });
    if (members.length !== requested.length) throw Object.assign(new Error("Há participantes não aprovados ou inativos."), { statusCode: 400 });
    const channel = await prisma.$transaction(async (tx) => {
      // Serializa a criação para impedir salas duplicadas em requisições simultâneas.
      const lockKey = `chat-context:${contextType}:${contextId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const existing = await tx.chatChannel.findFirst({
        where: { type: "CONTEXT", contextType, contextId, archivedAt: null },
        include: { members: { include: { user: { select: memberUserSelect } } } },
      });
      if (existing) {
        if (!existing.members.some((member) => member.userId === userId)) {
          // Não revela nem adiciona membros a uma sala já existente sem autorização.
          throw Object.assign(new Error("Sala existente. Solicite acesso à coordenação."), { statusCode: 403 });
        }
        return existing;
      }
      const created = await tx.chatChannel.create({
        data: {
          name: title || `${contextType} #${contextId}`,
          type: "CONTEXT",
          description: `Sala de acompanhamento de ${contextType.toLowerCase()}`,
          contextType, contextId, clientName,
          members: { create: requested.map((memberId) => ({ userId: memberId })) },
        },
        include: { members: { include: { user: { select: memberUserSelect } } } },
      });
      await tx.chatMessage.create({
        data: {
          channelId: created.id, authorId: userId, kind: "SYSTEM",
          content: `Sala criada para ${contextType} #${contextId}. Registre decisões e próximos passos neste canal.`,
          payload: { contextType, contextId },
        },
      });
      return created;
    });
    await this.audit(userId, "CHAT_CONTEXT_OPENED", "ChatChannel", channel.id, { contextType, contextId });
    await this.notifyChannel(channel.id);
    return channel;
  }

  async sendMessage(userId: number, channelId: number, input: Record<string, unknown>) {
    await this.assertMember(userId, channelId);
    const content = dataProtectionService.normalizeText(input.content);
    const requestedKind = String(input.kind ?? "TEXT").toUpperCase();
    const kind = ["TEXT", "RECORD_CARD", "SYSTEM"].includes(requestedKind) ? requestedKind : "TEXT";
    if (kind === "SYSTEM") throw Object.assign(new Error("Mensagens de sistema são reservadas ao servidor."), { statusCode: 403 });
    const clientMessageId = typeof input.clientMessageId === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(input.clientMessageId)
      ? input.clientMessageId : null;
    if (clientMessageId) {
      const previous = await prisma.chatMessage.findUnique({
        where: { channelId_authorId_clientMessageId: { channelId, authorId: userId, clientMessageId } },
        include: { author: { select: memberUserSelect } },
      });
      if (previous) return { ...previous, mentions: [] };
    }
    const payload = kind === "RECORD_CARD" && input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
      ? input.payload as Record<string, unknown> : null;
    if (kind === "RECORD_CARD" && (!payload || !["ticket", "task"].includes(String(payload.type ?? "").toLowerCase()))) {
      throw Object.assign(new Error("Card de registro inválido."), { statusCode: 400 });
    }
    if (!content) throw Object.assign(new Error("A mensagem não pode ficar vazia."), { statusCode: 400 });
    dataProtectionService.assertNoSecrets(content);
    const parentId = Number(input.parentId) || null;
    if (parentId) {
      const parent = await prisma.chatMessage.findFirst({ where: { id: parentId, channelId, deletedAt: null }, select: { id: true } });
      if (!parent) throw Object.assign(new Error("Mensagem respondida não foi localizada."), { statusCode: 404 });
    }
    const message = await prisma.chatMessage.create({
      data: { channelId, authorId: userId, parentId, content, kind, payload: payload as Prisma.InputJsonValue | undefined ?? undefined, clientMessageId },
      include: { author: { select: memberUserSelect } },
    });
    await prisma.chatChannel.update({ where: { id: channelId }, data: { updatedAt: new Date() } });
    const usernames = dataProtectionService.mentionUsernames(content);
    const mentionedMembers = usernames.length
      ? await prisma.chatChannelMember.findMany({
          where: {
            channelId,
            userId: { not: userId },
            user: {
              username: { in: usernames, mode: "insensitive" },
              active: true,
            },
          },
          select: { user: { select: memberUserSelect } },
        })
      : [];
    const mentions = mentionedMembers.map(({ user }) => user);
    await this.audit(userId, "CHAT_MESSAGE_CREATED", "ChatMessage", message.id, {
      channelId,
      length: content.length,
      mentionCount: mentions.length,
    });
    await this.notifyChannel(channelId);
    return { ...message, mentions };
  }

  async deleteChannel(userId: number, role: string, channelId: number) {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      select: { id: true, name: true, type: true, archivedAt: true, members: { select: { userId: true } } },
    });
    if (!channel || channel.archivedAt || !channel.members.some((member) => member.userId === userId)) {
      throw Object.assign(new Error("Conversa não localizada ou já foi removida."), { statusCode: 404 });
    }
    if (channel.type !== "DIRECT" && !["COORDENADOR", "ADMIN"].includes(role)) {
      throw Object.assign(new Error("Somente coordenação ou administração pode excluir canais da equipe."), { statusCode: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM "ChatTyping" WHERE "channelId"=$1`, channelId);
      await tx.chatChannel.update({ where: { id: channelId }, data: { archivedAt: new Date() } });
    });
    // A exclusão já foi concluída; falha de auditoria não deve devolver falso erro ao usuário.
    await this.audit(userId, "CHAT_CHANNEL_DELETED", "ChatChannel", channelId, { type: channel.type, name: channel.name }).catch((error) => {
      console.error("[chat] Falha ao auditar exclusão de conversa:", error);
    });
  }

  async consolidateDirectDuplicates(userId: number, role: string) {
    if (!["COORDENADOR", "ADMIN"].includes(role)) {
      throw Object.assign(new Error("Somente coordenação ou administração pode executar a manutenção do chat."), { statusCode: 403 });
    }
    const directs = await prisma.chatChannel.findMany({
      where: { type: "DIRECT", archivedAt: null },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: { members: { select: { userId: true, lastReadAt: true, joinedAt: true } }, _count: { select: { messages: true } } },
    });

    const groups = new Map<string, typeof directs>();
    for (const channel of directs) {
      if (channel.members.length !== 2) continue;
      const pair = channel.members.map((member) => member.userId).sort((x, y) => x - y).join(":");
      const current = groups.get(pair) ?? [];
      current.push(channel);
      groups.set(pair, current);
    }

    let duplicateChannels = 0;
    let movedMessages = 0;
    const consolidated: Array<{ keptChannelId: number; archivedChannelIds: number[]; messagesMoved: number }> = [];

    for (const channels of groups.values()) {
      if (channels.length < 2) continue;
      const canonical = channels[0]!;
      const duplicates = channels.slice(1);
      const duplicateIds = duplicates.map((item) => item.id);
      const messageCount = duplicates.reduce((sum, item) => sum + item._count.messages, 0);

      await prisma.$transaction(async (tx) => {
        // Mantém todo o histórico no canal canônico; IDs e relações de resposta permanecem intactos.
        await tx.chatMessage.updateMany({ where: { channelId: { in: duplicateIds } }, data: { channelId: canonical.id } });
        for (const member of canonical.members) {
          const related = duplicates.flatMap((item) => item.members).filter((item) => item.userId === member.userId);
          const readTimes = [member.lastReadAt, ...related.map((item) => item.lastReadAt)].filter((value): value is Date => Boolean(value));
          if (readTimes.length) {
            const lastReadAt = new Date(Math.max(...readTimes.map((value) => value.getTime())));
            await tx.chatChannelMember.update({ where: { channelId_userId: { channelId: canonical.id, userId: member.userId } }, data: { lastReadAt } });
          }
        }
        await tx.$executeRawUnsafe(`DELETE FROM "ChatTyping" WHERE "channelId" = ANY($1::int[])`, duplicateIds);
        await tx.chatChannel.updateMany({ where: { id: { in: duplicateIds } }, data: { archivedAt: new Date() } });
        await tx.chatChannel.update({ where: { id: canonical.id }, data: { updatedAt: new Date() } });
      });

      duplicateChannels += duplicateIds.length;
      movedMessages += messageCount;
      consolidated.push({ keptChannelId: canonical.id, archivedChannelIds: duplicateIds, messagesMoved: messageCount });
    }

    const result = { groupsConsolidated: consolidated.length, duplicateChannels, movedMessages, consolidated };
    await this.audit(userId, "CHAT_DIRECT_DUPLICATES_CONSOLIDATED", "ChatChannel", 0, result).catch((error) => {
      console.error("[chat] Falha ao auditar consolidação de conversas:", error);
    });
    return result;
  }

  async deleteMessage(userId: number, role: string, messageId: number) {
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { id: true, authorId: true, channelId: true } });
    if (!message) throw Object.assign(new Error("Mensagem não localizada."), { statusCode: 404 });
    await this.assertMember(userId, message.channelId);
    if (message.authorId !== userId && role === "ANALISTA") throw Object.assign(new Error("Você não pode remover esta mensagem."), { statusCode: 403 });
    await prisma.chatMessage.update({ where: { id: messageId }, data: { content: "[mensagem removida]", deletedAt: new Date() } });
    await this.audit(userId, "CHAT_MESSAGE_DELETED", "ChatMessage", messageId, { channelId: message.channelId });
  }

  async listIncidentActions(userId: number, channelId: number) {
    await this.assertMember(userId, channelId);
    return prisma.chatIncidentAction.findMany({
      where: { channelId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        author: { select: memberUserSelect },
        assignee: { select: memberUserSelect },
      },
    });
  }

  async createIncidentAction(userId: number, channelId: number, input: Record<string, unknown>) {
    await this.assertMember(userId, channelId);
    const channel = await prisma.chatChannel.findUnique({ where: { id: channelId }, select: { type: true, archivedAt: true } });
    if (!channel || channel.archivedAt || channel.type !== "CONTEXT") {
      throw Object.assign(new Error("Ações operacionais exigem uma sala de incidente ativa."), { statusCode: 400 });
    }
    const kind = String(input.kind ?? "").toUpperCase();
    if (!["DECISION", "ESCALATION", "HANDOFF", "ACTION"].includes(kind)) {
      throw Object.assign(new Error("Tipo de ação inválido."), { statusCode: 400 });
    }
    const title = dataProtectionService.normalizeText(input.title, 200);
    const details = dataProtectionService.normalizeText(input.details, 2000);
    if (title.length < 4) throw Object.assign(new Error("Descreva a ação em ao menos 4 caracteres."), { statusCode: 400 });
    const assigneeId = input.assigneeId == null ? null : Number(input.assigneeId);
    if (assigneeId !== null) {
      if (!Number.isSafeInteger(assigneeId) || assigneeId <= 0) {
        throw Object.assign(new Error("Responsável inválido."), { statusCode: 400 });
      }
      await this.assertMember(assigneeId, channelId);
    }
    const dueAt = typeof input.dueAt === "string" && input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && !Number.isFinite(dueAt.getTime())) {
      throw Object.assign(new Error("Prazo inválido."), { statusCode: 400 });
    }
    const action = await prisma.chatIncidentAction.create({
      data: { channelId, authorId: userId, kind, title, details: details || null, assigneeId, dueAt },
      include: { author: { select: memberUserSelect }, assignee: { select: memberUserSelect } },
    });
    await this.audit(userId, "CHAT_INCIDENT_ACTION_CREATED", "ChatIncidentAction", action.id, { channelId, kind });
    await this.notifyChannel(channelId);
    return action;
  }

  async updateIncidentAction(userId: number, channelId: number, actionId: number, input: Record<string, unknown>) {
    await this.assertMember(userId, channelId);
    const current = await prisma.chatIncidentAction.findFirst({ where: { id: actionId, channelId } });
    if (!current) throw Object.assign(new Error("Ação não localizada."), { statusCode: 404 });
    if (current.authorId !== userId && current.assigneeId !== userId) {
      throw Object.assign(new Error("Somente autor ou responsável pode atualizar a ação."), { statusCode: 403 });
    }
    const status = String(input.status ?? "").toUpperCase();
    if (!["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"].includes(status)) {
      throw Object.assign(new Error("Situação inválida."), { statusCode: 400 });
    }
    const action = await prisma.chatIncidentAction.update({
      where: { id: actionId },
      data: { status, closedAt: ["DONE", "CANCELLED"].includes(status) ? new Date() : null },
      include: { author: { select: memberUserSelect }, assignee: { select: memberUserSelect } },
    });
    await this.audit(userId, "CHAT_INCIDENT_ACTION_UPDATED", "ChatIncidentAction", action.id, { channelId, status });
    await this.notifyChannel(channelId);
    return action;
  }

  private async notifyChannel(channelId: number) {
    const members = await prisma.chatChannelMember.findMany({ where: { channelId }, select: { userId: true } });
    chatEventBus.publish(members.map((member) => member.userId));
  }

  private async assertMember(userId: number, channelId: number) {
    const member = await prisma.chatChannelMember.findUnique({ where: { channelId_userId: { channelId, userId } }, select: { userId: true } });
    if (!member) throw Object.assign(new Error("Canal não localizado ou acesso não autorizado."), { statusCode: 404 });
  }

  private async audit(userId: number, action: string, entity: string, entityId: number, metadata: Record<string, unknown>) {
    await prisma.auditLog.create({ data: { userId, action, entity, entityId: String(entityId), metadata: metadata as Prisma.InputJsonValue } });
  }
}

export const chatService = new ChatService();
