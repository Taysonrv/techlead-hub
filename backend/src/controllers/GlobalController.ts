import type { Request, Response } from "express";
import { prisma } from "../database/prisma";

const workItemPath = (type: string) => {
  const value = type.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (value.includes("apoio")) return "/apoios";
  if (value.includes("evolucao")) return "/evolucoes";
  return "/correcoes";
};

export class GlobalController {
  search = async (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2) return res.json({ items: [] });
    const numeric = Number(query);
    const [tickets, workItems, versions] = await Promise.all([
      prisma.ticket.findMany({
        where: { OR: [
          { subject: { contains: query, mode: "insensitive" } },
          { client: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
          { service: { contains: query, mode: "insensitive" } },
          ...(Number.isSafeInteger(numeric) ? [{ movideskId: numeric }] : []),
        ] },
        select: { movideskId: true, subject: true, client: true, status: true },
        orderBy: { createdDate: "desc" }, take: 8,
      }),
      prisma.azureWorkItem.findMany({
        where: { OR: [
          { title: { contains: query, mode: "insensitive" } },
          { client: { contains: query, mode: "insensitive" } },
          { module: { contains: query, mode: "insensitive" } },
          { process: { contains: query, mode: "insensitive" } },
          ...(Number.isSafeInteger(numeric) ? [{ id: numeric }] : []),
        ] },
        select: { id: true, title: true, workItemType: true, state: true, client: true },
        orderBy: { azureChangedAt: "desc" }, take: 8,
      }),
      prisma.azureWorkItem.findMany({
        where: { deliveredVersion: { contains: query, mode: "insensitive" } },
        select: { deliveredVersion: true }, distinct: ["deliveredVersion"], take: 6,
      }),
    ]);

    return res.json({ items: [
      ...tickets.map((item) => ({ id: `ticket-${item.movideskId}`, type: "Ticket", title: `#${item.movideskId} · ${item.subject}`, subtitle: [item.client, item.status].filter(Boolean).join(" · "), path: `/tickets?movidesk=${item.movideskId}` })),
      ...workItems.map((item) => ({ id: `task-${item.id}`, type: item.workItemType, title: `#${item.id} · ${item.title}`, subtitle: [item.client, item.state].filter(Boolean).join(" · "), path: `${workItemPath(item.workItemType)}?task=${item.id}` })),
      ...versions.filter((item) => item.deliveredVersion).map((item) => ({ id: `version-${item.deliveredVersion}`, type: "Versão", title: item.deliveredVersion!, subtitle: "Versão entregue em Work Items", path: `/versoes?search=${encodeURIComponent(item.deliveredVersion!)}` })),
    ] });
  };

  calendar = async (req: Request, res: Response) => {
    const start = new Date(String(req.query.start ?? ""));
    const end = new Date(String(req.query.end ?? ""));
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return res.status(400).json({ message: "Período inválido." });

    const [tickets, workItems] = await Promise.all([
      prisma.ticket.findMany({
        where: { OR: ["createdDate", "resolvedDate", "closedDate"].map((field) => ({ [field]: { gte: start, lt: end } })) },
        select: { movideskId: true, subject: true, createdDate: true, resolvedDate: true, closedDate: true }, take: 500,
      }),
      prisma.azureWorkItem.findMany({
        where: { OR: ["azureCreatedAt", "stateChangedAt", "azureClosedAt"].map((field) => ({ [field]: { gte: start, lt: end } })) },
        select: { id: true, title: true, workItemType: true, azureCreatedAt: true, stateChangedAt: true, azureClosedAt: true, deliveredVersion: true }, take: 500,
      }),
    ]);

    const inRange = (date: Date | null) => date && date >= start && date < end;
    const events: Array<Record<string, unknown>> = [];
    tickets.forEach((item) => {
      if (inRange(item.createdDate)) events.push({ id: `to-${item.movideskId}`, date: item.createdDate, kind: "ticket-opened", title: `Ticket #${item.movideskId} aberto`, subtitle: item.subject, path: `/tickets?movidesk=${item.movideskId}` });
      if (inRange(item.resolvedDate)) events.push({ id: `tr-${item.movideskId}`, date: item.resolvedDate, kind: "ticket-resolved", title: `Ticket #${item.movideskId} resolvido`, subtitle: item.subject, path: `/tickets?movidesk=${item.movideskId}` });
      if (inRange(item.closedDate)) events.push({ id: `tc-${item.movideskId}`, date: item.closedDate, kind: "ticket-closed", title: `Ticket #${item.movideskId} fechado`, subtitle: item.subject, path: `/tickets?movidesk=${item.movideskId}` });
    });
    workItems.forEach((item) => {
      const path = `${workItemPath(item.workItemType)}?task=${item.id}`;
      if (inRange(item.azureCreatedAt)) events.push({ id: `wo-${item.id}`, date: item.azureCreatedAt, kind: "work-item-opened", title: `${item.workItemType} #${item.id} criada`, subtitle: item.title, path });
      if (inRange(item.stateChangedAt)) events.push({ id: `ws-${item.id}`, date: item.stateChangedAt, kind: "work-item-changed", title: `${item.workItemType} #${item.id} movimentada`, subtitle: item.title, path });
      if (inRange(item.azureClosedAt)) events.push({ id: `wc-${item.id}`, date: item.azureClosedAt, kind: "work-item-closed", title: `${item.workItemType} #${item.id} concluída`, subtitle: item.deliveredVersion ? `${item.title} · ${item.deliveredVersion}` : item.title, path });
    });

    const years = Array.from(new Set([start.getUTCFullYear(), end.getUTCFullYear()]));
    const holidays = years.flatMap(brazilianHolidays).filter((item) => item.date >= start && item.date < end);
    return res.json({ events, holidays });
  };
}

function brazilianHolidays(year: number) {
  const easter = easterDate(year);
  const relative = (days: number, name: string) => { const date = new Date(easter); date.setUTCDate(date.getUTCDate() + days); return { date, name }; };
  return [
    { date: new Date(Date.UTC(year, 0, 1)), name: "Confraternização Universal" },
    relative(-48, "Carnaval"), relative(-47, "Carnaval"), relative(-2, "Paixão de Cristo"),
    { date: new Date(Date.UTC(year, 3, 21)), name: "Tiradentes" },
    { date: new Date(Date.UTC(year, 4, 1)), name: "Dia do Trabalho" }, relative(60, "Corpus Christi"),
    { date: new Date(Date.UTC(year, 8, 7)), name: "Independência do Brasil" },
    { date: new Date(Date.UTC(year, 9, 12)), name: "Nossa Senhora Aparecida" },
    { date: new Date(Date.UTC(year, 10, 2)), name: "Finados" },
    { date: new Date(Date.UTC(year, 10, 15)), name: "Proclamação da República" },
    { date: new Date(Date.UTC(year, 10, 20)), name: "Consciência Negra" },
    { date: new Date(Date.UTC(year, 11, 25)), name: "Natal" },
  ];
}

function easterDate(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}
