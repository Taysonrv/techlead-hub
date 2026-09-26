import type { Request, Response } from "express";
import { prisma } from "../database/prisma";
import { SimerMapService } from "../services/SimerMapService";
import { SystemRuleService } from "../services/SystemRuleService";
import { investigationIntelligenceService } from "../services/InvestigationIntelligenceService";


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
  { id: "screen-investigation", type: "Tela", title: "Central de Investigação", subtitle: "Correlação de tickets, Azure, versões, regras e conhecimento", path: "/investigacao", keywords: ["investigacao","diagnostico","correlacao","casos semelhantes","anomalias","regra evidencia"] },
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

  investigate = async (req: Request, res: Response) => {
    const raw = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const numeric = Number(raw.replace(/^#/, ""));
    if (!raw || !Number.isSafeInteger(numeric)) return res.status(400).json({ message: "Informe o número do atendimento Movidesk." });

    const ticket = await prisma.ticket.findUnique({
      where: { movideskId: numeric },
      select: {
        movideskId: true, subject: true, status: true, baseStatus: true, category: true, cause: true, urgency: true,
        client: true, owner: true, service: true, serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true,
        createdDate: true, lastUpdate: true, resolvedDate: true, taskNumber: true, taskStatus: true, taskTitle: true,
        registeredVersion: true, deliveredVersion: true,
      },
    });
    if (!ticket) return res.status(404).json({ message: "Atendimento não encontrado na base local." });

    const serviceValues = [ticket.serviceThirdLevel, ticket.serviceSecondLevel, ticket.serviceFirstLevel, ticket.service].filter((v): v is string => Boolean(v?.trim()));
    const words = ticket.subject.normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\W+/).filter((w) => w.length >= 5).slice(0, 5);
    const similarOr: any[] = [
      ...(ticket.client ? [{ client: { equals: ticket.client, mode: "insensitive" as const } }] : []),
      ...(serviceValues.length ? serviceValues.map((value) => ({ serviceThirdLevel: { equals: value, mode: "insensitive" as const } })) : []),
      ...words.map((word) => ({ subject: { contains: word, mode: "insensitive" as const } })),
    ];
    const candidates = similarOr.length ? await prisma.ticket.findMany({
      where: { AND: [{ movideskId: { not: ticket.movideskId } }, { isDeleted: false }, { OR: similarOr }] },
      select: { movideskId: true, subject: true, client: true, category: true, cause: true, status: true, service: true, serviceThirdLevel: true, taskNumber: true, deliveredVersion: true, createdDate: true },
      orderBy: { createdDate: "desc" }, take: 80,
    }) : [];

    const norm=(v:string|null|undefined)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    const targetWords=new Set(words.map(norm));
    const similar=candidates.map((item)=>{
      let score=0; const reasons:string[]=[];
      if(ticket.client&&norm(item.client)===norm(ticket.client)){score+=15;reasons.push("mesmo cliente");}
      const targetService=norm(serviceValues[0]); const itemService=norm(item.serviceThirdLevel||item.service);
      if(targetService&&itemService===targetService){score+=30;reasons.push("mesmo serviço");}
      if(ticket.category&&norm(item.category)===norm(ticket.category)){score+=15;reasons.push("mesma categoria");}
      if(ticket.cause&&norm(item.cause)===norm(ticket.cause)){score+=10;reasons.push("mesma causa");}
      if(ticket.deliveredVersion&&norm(item.deliveredVersion)===norm(ticket.deliveredVersion)){score+=10;reasons.push("mesma versão");}
      const common=[...targetWords].filter((word)=>norm(item.subject).includes(word)).length;
      if(common){const pts=Math.min(20,common*5);score+=pts;reasons.push(`${common} termo(s) do assunto`);}
      return {...item,score,reasons};
    }).filter((item)=>item.score>=15).sort((a,b)=>b.score-a.score||b.createdDate.getTime()-a.createdDate.getTime()).slice(0,12);

    const workItemIds=[ticket.taskNumber,...similar.map((x)=>x.taskNumber)].filter((v):v is number=>Number.isInteger(v));
    const workItems=workItemIds.length?await prisma.azureWorkItem.findMany({where:{id:{in:[...new Set(workItemIds)]}},select:{id:true,title:true,workItemType:true,state:true,client:true,module:true,process:true,registeredVersion:true,deliveredVersion:true,azureChangedAt:true,remoteUrl:true}}):[];
    const timeline=[
      {date:ticket.createdDate,kind:"ticket",title:`Atendimento #${ticket.movideskId} aberto`},
      ...(ticket.lastUpdate?[{date:ticket.lastUpdate,kind:"update",title:"Última atualização do atendimento"}]:[]),
      ...(ticket.resolvedDate?[{date:ticket.resolvedDate,kind:"resolved",title:"Atendimento resolvido"}]:[]),
      ...workItems.filter(x=>x.azureChangedAt).map(x=>({date:x.azureChangedAt!,kind:"azure",title:`${x.workItemType} #${x.id} atualizada`})),
    ].sort((a,b)=>b.date.getTime()-a.date.getTime());

    const completeness=[ticket.client,ticket.category,ticket.owner,serviceValues[0],ticket.taskNumber||"no-task"].filter(Boolean).length;
    const technicalText=[ticket.subject,ticket.category,ticket.cause,...serviceValues,...workItems.map(x=>x.title)].filter(Boolean).join(" ");
    const mapService=new SimerMapService(); const ruleService=new SystemRuleService();
    const [mapItems,ruleItems]=await Promise.all([mapService.context(technicalText,18),ruleService.search(technicalText,18)]);
    const correlations=await ruleService.correlate(technicalText,mapItems,12);
    const evidence=correlations.slice(0,10).map((item:any)=>({
      id:item.id, title:item.nodeText??item.name??item.path, path:item.path??null, mapName:item.mapName??null,
      score:item.correlationScore??item.score??0, kind:item.nodeKind??"regra",
    }));
    const anomalies:string[]=[];
    if(similar.filter(x=>x.score>=45).length>=3) anomalies.push(`${similar.filter(x=>x.score>=45).length} casos possuem correlação forte com este atendimento.`);
    if(ticket.taskNumber&&!workItems.some(x=>x.id===ticket.taskNumber)) anomalies.push("O atendimento possui número de Task, mas o Work Item não foi localizado na base Azure.");
    if(!serviceValues[0]) anomalies.push("Serviço não classificado; a investigação técnica pode perder precisão.");
    if(mapItems.length&&!ruleItems.length) anomalies.push("Há evidências no Mapa SIMER, mas nenhuma Regra do Sistema foi correlacionada.");
    const intelligence=await investigationIntelligenceService.analyze(ticket,similar);
    intelligence.signals.forEach(signal=>{if(signal.severity==="warning"&&!anomalies.includes(signal.detail))anomalies.push(signal.detail)});
    const diagnosticPlan=[
      {key:"classification",title:"Validar classificação",status:ticket.category&&serviceValues[0]?"ready":"attention",detail:ticket.category&&serviceValues[0]?"Categoria e Serviço disponíveis para confronto.":"Categoria ou Serviço incompleto; revisar antes de concluir a causa."},
      {key:"rule",title:"Confrontar Regra do Sistema",status:ruleItems.length||evidence.length?"ready":"attention",detail:ruleItems.length||evidence.length?`${ruleItems.length} regra(s) e ${evidence.length} evidência(s) técnica(s) correlacionadas.`:"Nenhuma regra/evidência correlacionada automaticamente."},
      {key:"history",title:"Comparar recorrências",status:similar.length?"ready":"neutral",detail:similar.length?`${similar.length} caso(s) semelhante(s) localizado(s).`:"Sem recorrência relevante no recorte atual."},
      {key:"development",title:"Validar desenvolvimento",status:ticket.taskNumber?"ready":"neutral",detail:ticket.taskNumber?`Task #${ticket.taskNumber} vinculada ao atendimento.`:"Atendimento sem Task vinculada."},
      {key:"data",title:"Validar dados no banco",status:"neutral",detail:"Use consultas somente leitura e parametrizadas para confirmar a evidência funcional antes de qualquer intervenção."},
    ];
    return res.json({
      ticket, workItems, similar, timeline, evidence, ruleItems:ruleItems.slice(0,10), anomalies, diagnosticPlan, intelligence,
      quality: { score: Math.round((completeness/5)*100), checks: { client:Boolean(ticket.client), category:Boolean(ticket.category), owner:Boolean(ticket.owner), service:Boolean(serviceValues[0]), developmentLink:Boolean(ticket.taskNumber) } },
      summary: { similarCases: similar.length, relatedWorkItems: workItems.length, technicalEvidence:evidence.length, rules:ruleItems.length, service: serviceValues[0]??null, version: ticket.deliveredVersion??ticket.registeredVersion??null },
    });
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
