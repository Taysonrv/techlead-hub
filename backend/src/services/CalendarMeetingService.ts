import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";

type MeetingInput = {
  title?: unknown;
  description?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  timezone?: unknown;
  location?: unknown;
  meetingUrl?: unknown;
  participantIds?: unknown;
  externalAttendees?: unknown;
};

const meetingInclude = {
  createdBy: { select: { id: true, name: true, username: true, email: true, role: true } },
  participants: {
    include: { user: { select: { id: true, name: true, username: true, email: true, role: true } } },
    orderBy: { user: { name: "asc" as const } },
  },
} as const;

type MeetingWithRelations = Prisma.CalendarMeetingGetPayload<{ include: typeof meetingInclude }>;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalText(value: unknown, max: number) {
  const valueText = text(value, max);
  return valueText || null;
}

function parseDate(value: unknown, label: string) {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw Object.assign(new Error(`${label} inválido.`), { statusCode: 400 });
  }
  return parsed;
}

function externalEmails(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[;,\n]/)
      : [];
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emails = [...new Set(raw.map((item) => String(item).trim().toLocaleLowerCase("pt-BR")).filter(Boolean))].slice(0, 30);
  const invalid = emails.find((email) => !emailPattern.test(email));
  if (invalid) throw Object.assign(new Error(`E-mail externo inválido: ${invalid}`), { statusCode: 400 });
  return emails;
}

function participantIds(value: unknown, organizerId: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0 && id !== organizerId))].slice(0, 50);
}

function validateLink(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw Object.assign(new Error("Informe um link de reunião válido (http/https)."), { statusCode: 400 });
  }
}

export class CalendarMeetingService {
  private normalize(input: MeetingInput, organizerId: number) {
    const title = text(input.title, 180);
    if (title.length < 3) throw Object.assign(new Error("Informe um título com ao menos 3 caracteres."), { statusCode: 400 });
    const startAt = parseDate(input.startAt, "Data/hora inicial");
    const endAt = parseDate(input.endAt, "Data/hora final");
    if (endAt <= startAt) throw Object.assign(new Error("O término da reunião deve ser posterior ao início."), { statusCode: 400 });
    if (endAt.getTime() - startAt.getTime() > 24 * 60 * 60 * 1_000) {
      throw Object.assign(new Error("A reunião não pode ultrapassar 24 horas."), { statusCode: 400 });
    }

    const timezone = text(input.timezone, 80) || "America/Sao_Paulo";
    const description = optionalText(input.description, 4000);
    const location = optionalText(input.location, 240);
    const meetingUrl = validateLink(optionalText(input.meetingUrl, 2000));
    const participants = participantIds(input.participantIds, organizerId);
    const external = externalEmails(input.externalAttendees);

    return { title, startAt, endAt, timezone, description, location, meetingUrl, participants, external };
  }

  async participants() {
    return prisma.user.findMany({
      where: { active: true, approvalStatus: "APPROVED" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, username: true, email: true, role: true },
    });
  }

  async listForRange(userId: number, role: string, start: Date, end: Date) {
    const meetings = await prisma.calendarMeeting.findMany({
      where: {
        status: "SCHEDULED",
        startAt: { lt: end },
        endAt: { gt: start },
        OR: [
          { createdById: userId },
          { participants: { some: { userId } } },
          ...(role === "ADMIN" ? [{}] : []),
        ],
      },
      orderBy: { startAt: "asc" },
      include: meetingInclude,
      take: 500,
    });
    return meetings.map((meeting) => this.serialize(meeting, userId, role));
  }

  async get(userId: number, role: string, meetingId: number) {
    const meeting = await prisma.calendarMeeting.findUnique({ where: { id: meetingId }, include: meetingInclude });
    if (!meeting) throw Object.assign(new Error("Reunião não localizada."), { statusCode: 404 });
    const visible = role === "ADMIN" || meeting.createdById === userId || meeting.participants.some((item) => item.userId === userId);
    if (!visible) throw Object.assign(new Error("Você não possui acesso a esta reunião."), { statusCode: 403 });
    return this.serialize(meeting, userId, role);
  }

  async create(userId: number, role: string, input: MeetingInput) {
    const normalized = this.normalize(input, userId);
    await this.assertParticipants(normalized.participants);
    const meeting = await prisma.calendarMeeting.create({
      data: {
        title: normalized.title,
        description: normalized.description,
        startAt: normalized.startAt,
        endAt: normalized.endAt,
        timezone: normalized.timezone,
        location: normalized.location,
        meetingUrl: normalized.meetingUrl,
        externalAttendees: normalized.external,
        createdById: userId,
        participants: { create: normalized.participants.map((participantId) => ({ userId: participantId })) },
      },
      include: meetingInclude,
    });
    await prisma.auditLog.create({
      data: {
        userId,
        action: "CALENDAR_MEETING_CREATED",
        entity: "CalendarMeeting",
        entityId: String(meeting.id),
        metadata: { title: meeting.title, startAt: meeting.startAt, participantIds: normalized.participants, externalAttendees: normalized.external },
      },
    });
    return this.serialize(meeting, userId, role);
  }

  async update(userId: number, role: string, meetingId: number, input: MeetingInput) {
    const current = await prisma.calendarMeeting.findUnique({ where: { id: meetingId }, select: { id: true, createdById: true, status: true } });
    if (!current) throw Object.assign(new Error("Reunião não localizada."), { statusCode: 404 });
    if (!this.canManage(current.createdById, userId, role)) throw Object.assign(new Error("Somente o organizador ou um administrador pode editar a reunião."), { statusCode: 403 });
    if (current.status === "CANCELLED") throw Object.assign(new Error("Uma reunião cancelada não pode ser editada."), { statusCode: 409 });

    const normalized = this.normalize(input, current.createdById);
    await this.assertParticipants(normalized.participants);

    const meeting = await prisma.calendarMeeting.update({
      where: { id: meetingId },
      data: {
        title: normalized.title,
        description: normalized.description,
        startAt: normalized.startAt,
        endAt: normalized.endAt,
        timezone: normalized.timezone,
        location: normalized.location,
        meetingUrl: normalized.meetingUrl,
        externalAttendees: normalized.external,
        participants: {
          deleteMany: {},
          create: normalized.participants.map((participantId) => ({ userId: participantId })),
        },
      },
      include: meetingInclude,
    });
    await prisma.auditLog.create({
      data: {
        userId,
        action: "CALENDAR_MEETING_UPDATED",
        entity: "CalendarMeeting",
        entityId: String(meeting.id),
        metadata: { title: meeting.title, startAt: meeting.startAt, participantIds: normalized.participants },
      },
    });
    return this.serialize(meeting, userId, role);
  }

  async cancel(userId: number, role: string, meetingId: number) {
    const current = await prisma.calendarMeeting.findUnique({ where: { id: meetingId }, select: { id: true, title: true, createdById: true, status: true } });
    if (!current) throw Object.assign(new Error("Reunião não localizada."), { statusCode: 404 });
    if (!this.canManage(current.createdById, userId, role)) throw Object.assign(new Error("Somente o organizador ou um administrador pode cancelar a reunião."), { statusCode: 403 });
    if (current.status !== "CANCELLED") {
      await prisma.calendarMeeting.update({ where: { id: meetingId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      await prisma.auditLog.create({
        data: { userId, action: "CALENDAR_MEETING_CANCELLED", entity: "CalendarMeeting", entityId: String(meetingId), metadata: { title: current.title } },
      });
    }
  }

  private async assertParticipants(ids: number[]) {
    if (!ids.length) return;
    const count = await prisma.user.count({ where: { id: { in: ids }, active: true, approvalStatus: "APPROVED" } });
    if (count !== ids.length) throw Object.assign(new Error("Um ou mais participantes não estão ativos ou aprovados."), { statusCode: 400 });
  }

  private canManage(createdById: number, userId: number, role: string) {
    return createdById === userId || role === "ADMIN";
  }

  private serialize(meeting: MeetingWithRelations, userId: number, role: string) {
    const external = Array.isArray(meeting.externalAttendees) ? meeting.externalAttendees.map(String) : [];
    return {
      id: meeting.id,
      title: meeting.title,
      description: meeting.description,
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      timezone: meeting.timezone,
      location: meeting.location,
      meetingUrl: meeting.meetingUrl,
      externalAttendees: external,
      status: meeting.status,
      externalProvider: meeting.externalProvider,
      externalEventId: meeting.externalEventId,
      createdBy: meeting.createdBy,
      participants: meeting.participants.map((item) => item.user),
      canManage: this.canManage(meeting.createdById, userId, role),
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    };
  }
}

export const calendarMeetingService = new CalendarMeetingService();
