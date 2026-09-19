import { prisma } from "../database/prisma";
import type { Prisma } from "@prisma/client";
import { dataProtectionService } from "./DataProtectionService";

const memberUserSelect = { id: true, name: true, username: true, role: true, avatarUpdatedAt: true } as const;

export class ChatService {
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
    return Promise.all(memberships.map(async ({ channel, lastReadAt, joinedAt }) => ({
      ...channel,
      lastReadAt,
      unread: await prisma.chatMessage.count({
        where: {
          channelId: channel.id,
          deletedAt: null,
          authorId: { not: userId },
          createdAt: { gt: lastReadAt ?? joinedAt },
        },
      }),
    })));
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
    await prisma.chatChannelMember.update({ where: { channelId_userId: { channelId, userId } }, data: { lastReadAt: new Date() } });
    return messages.reverse();
  }

  async sendMessage(userId: number, channelId: number, input: Record<string, unknown>) {
    await this.assertMember(userId, channelId);
    const content = dataProtectionService.normalizeText(input.content);
    if (!content) throw Object.assign(new Error("A mensagem não pode ficar vazia."), { statusCode: 400 });
    dataProtectionService.assertNoSecrets(content);
    const parentId = Number(input.parentId) || null;
    if (parentId) {
      const parent = await prisma.chatMessage.findFirst({ where: { id: parentId, channelId, deletedAt: null }, select: { id: true } });
      if (!parent) throw Object.assign(new Error("Mensagem respondida não foi localizada."), { statusCode: 404 });
    }
    const message = await prisma.chatMessage.create({
      data: { channelId, authorId: userId, parentId, content },
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
    return { ...message, mentions };
  }

  async deleteMessage(userId: number, role: string, messageId: number) {
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { id: true, authorId: true, channelId: true } });
    if (!message) throw Object.assign(new Error("Mensagem não localizada."), { statusCode: 404 });
    await this.assertMember(userId, message.channelId);
    if (message.authorId !== userId && role === "ANALISTA") throw Object.assign(new Error("Você não pode remover esta mensagem."), { statusCode: 403 });
    await prisma.chatMessage.update({ where: { id: messageId }, data: { content: "[mensagem removida]", deletedAt: new Date() } });
    await this.audit(userId, "CHAT_MESSAGE_DELETED", "ChatMessage", messageId, { channelId: message.channelId });
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
