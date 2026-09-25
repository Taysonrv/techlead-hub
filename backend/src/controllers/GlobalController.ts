import type { Request, Response } from "express";
import { prisma } from "../database/prisma";


const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

type NavigationItem = { id: string; type: "Tela" | "Rotina" | "Card"; title: string; subtitle: string; path: string; keywords: string[] };
const navigationItems: NavigationItem[] = [
  { id: "screen-dashboard", type: "Tela", title: "Dashboard", subtitle: "Visão executiva da operação", path: "/", keywords: ["dashboard","indicadores","executivo","saude da operacao"] },
  { id: "screen-my-operation", type: "Tela", title: "Minha Operação", subtitle: "Fila operacional, tickets e tarefas em execução", path: "/minha-operacao", keywords: ["minha operacao","kanban","fila","trabalho"] },
  { id: "screen-tickets", type: "Tela", title: "Tickets", subtitle: "Consulta e investigação de atendimentos Movidesk", path: "/tickets", keywords: ["tickets","atendimentos","movidesk"] },
  { id: "screen-attention", type: "Tela", title: "Pontos de Atenção", subtitle: "Riscos e criticidades da operação", path: "/atencao", keywords: ["atencao","riscos","criticos","sla"] },
  { id: "screen-quality", type: "Tela", title: "Pendências", subtitle: "Qualidade, vínculos e divergências entre fontes", path: "/qualidade-dados", keywords: ["pendencias","qualidade dos dados","governanca","inconsistencias"] },
  { id: "screen-performance", type: "Tela", title: "Desempenho", subtitle: "Produtividade e SLA", path: "/desempenho", keywords: ["desempenho","performance","produtividade","sla"] },
  { id: "screen-services", type: "Tela", title: "Serviços SIMER", subtitle: "Classificação e demanda por serviços", path: "/servicos", keywords: ["servicos","simer","classificacao","modulos"] },
  { id: "screen-coordination", type: "Tela", title: "Central da Coordenação", subtitle: "Cockpit operacional da coordenação", path: "/coordenacao", keywords: ["coordenacao","cockpit","gestao"] },
  { id: "screen-leadership", type: "Tela", title: "Central de Liderança Técnica", subtitle: "Recorrências, gaps, auditoria e desenvolvimento", path: "/lideranca-tecnica", keywords: ["lideranca tecnica","recorrencias","gaps","auditoria"] },
  { id: "screen-versions", type: "Tela", title: "Versões", subtitle: "Entregas e cobertura por versão", path: "/versoes", keywords: ["versoes","release","lte","lts","rc"] },
  { id: "screen-analysts", type: "Tela", title: "Analistas", subtitle: "Análise da equipe", path: "/analistas", keywords: ["analistas","equipe","responsaveis"] },
  { id: "screen-clients", type: "Tela", title: "Clientes", subtitle: "Análise por cliente", path: "/clientes", keywords: ["clientes","cooperativas","carteira"] },
  { id: "card-service-quality", type: "Card", title: "Qualidade da classificação por Serviço", subtitle: "Central da Coordenação · classificação dos atendimentos", path: "/coordenacao", keywords: ["qualidade da classificacao por servico","classificacao por servico","servicos classificados","servico generico"] },
  { id: "card-operational-load", type: "Card", title: "Distribuição da carga operacional", subtitle: "Central da Coordenação · carga por analista", path: "/coordenacao", keywords: ["distribuicao da carga operacional","carga operacional","carga por analista","capacidade"] },
  { id: "card-priorities", type: "Card", title: "Prioridades de atuação", subtitle: "Central da Coordenação · sinais que exigem atuação", path: "/coordenacao", keywords: ["prioridades de atuacao","prioridades","acao imediata"] },
  { id: "routine-corrections", type: "Rotina", title: "Correções", subtitle: "Bugs e correções no Azure DevOps", path: "/correcoes", keywords: ["correcoes","bugs","azure"] },
  { id: "routine-evolutions", type: "Rotina", title: "Evoluções", subtitle: "Melhorias e evoluções funcionais", path: "/evolucoes", keywords: ["evolucoes","melhorias","produto"] },
  { id: "routine-support", type: "Rotina", title: "Apoios", subtitle: "APOIOs vinculados à sustentação", path: "/apoios", keywords: ["apoios","apoio","azure"] },
  { id: "routine-knowledge", type: "Rotina", title: "Base de Conhecimento", subtitle: "Wiki, procedimentos e conhecimento operacional", path: "/conhecimento", keywords: ["conhecimento","wiki","procedimentos","regra do sistema"] },
  { id: "routine-sync", type: "Rotina", title: "Dados e Sincronizações", subtitle: "Sincronizações e cargas de dados", path: "/importar", keywords: ["dados","sincronizacoes","importar","azure","movidesk"] },
];

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
    const normalizedQuery = normalizeSearch(query);
    const navigation = navigationItems.filter((item) => normalizeSearch([item.title, item.subtitle, ...item.keywords].join(" ")).includes(normalizedQuery)).slice(0, 10);
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
      ...navigation,
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
