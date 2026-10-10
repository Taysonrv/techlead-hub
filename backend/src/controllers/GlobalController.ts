import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { prisma } from "../database/prisma";
import { azureOperationalScope, ticketOperationalScope } from "../domain/OperationalScope";
import { SimerMapService } from "../services/SimerMapService";
import { SystemRuleService } from "../services/SystemRuleService";
import { investigationIntelligenceService } from "../services/InvestigationIntelligenceService";
import { calendarMeetingService } from "../services/CalendarMeetingService";


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
  { id: "screen-intelligence", type: "Tela", title: "Central de Inteligência", subtitle: "Recorrências, anomalias, clusters e sinais operacionais", path: "/inteligencia", keywords: ["inteligencia","recorrencia","anomalias","clusters","dna tecnico","problemas conhecidos"] },
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
    const client = typeof req.query.client === "string" ? req.query.client.trim() : "";
    const clientScope = req.query.clientScope === "predominant" || req.query.clientScope === "others" ? req.query.clientScope : "all";
    const clientFilter = client && clientScope !== "all" ? (clientScope === "predominant" ? { client: { equals: client, mode: "insensitive" as const } } : { NOT: { client: { equals: client, mode: "insensitive" as const } } }) : {};
    const navigation = navigationItems.filter((item) => normalizeSearch([item.title, item.subtitle, ...item.keywords].join(" ")).includes(normalizedQuery)).slice(0, 10);
    const [tickets, workItems, versions] = await Promise.all([
      prisma.ticket.findMany({
        where: { AND: [ticketOperationalScope(), clientFilter, { OR: [
          { subject: { contains: query, mode: "insensitive" } },
          { client: { contains: query, mode: "insensitive" } },
          { category: { contains: query, mode: "insensitive" } },
          { service: { contains: query, mode: "insensitive" } },
          ...(Number.isSafeInteger(numeric) ? [{ movideskId: numeric }] : []),
        ] }] },
        select: { movideskId: true, subject: true, client: true, status: true },
        orderBy: { createdDate: "desc" }, take: 8,
      }),
      prisma.azureWorkItem.findMany({
        where: { AND: [azureOperationalScope(), clientFilter, { OR: [
          { title: { contains: query, mode: "insensitive" } },
          { client: { contains: query, mode: "insensitive" } },
          { module: { contains: query, mode: "insensitive" } },
          { process: { contains: query, mode: "insensitive" } },
          ...(Number.isSafeInteger(numeric) ? [{ id: numeric }] : []),
        ] }] },
        select: { id: true, title: true, workItemType: true, state: true, client: true },
        orderBy: { azureChangedAt: "desc" }, take: 8,
      }),
      prisma.azureWorkItem.findMany({
        where: { AND: [azureOperationalScope(), { deliveredVersion: { contains: query, mode: "insensitive" } }] },
        select: { deliveredVersion: true }, distinct: ["deliveredVersion"], take: 6,
      }),
    ]);

    const comparison = client ? await Promise.all([
      prisma.ticket.count({ where: { AND: [{ client: { equals: client, mode: "insensitive" } }, { OR: [
        { subject: { contains: query, mode: "insensitive" } },
        { category: { contains: query, mode: "insensitive" } },
        { service: { contains: query, mode: "insensitive" } },
      ] }] } }),
      prisma.ticket.count({ where: { AND: [{ NOT: { client: { equals: client, mode: "insensitive" } } }, { OR: [
        { subject: { contains: query, mode: "insensitive" } },
        { category: { contains: query, mode: "insensitive" } },
        { service: { contains: query, mode: "insensitive" } },
      ] }] } }),
      prisma.ticket.findMany({ where: { AND: [{ NOT: { client: { equals: client, mode: "insensitive" } } }, { OR: [
        { subject: { contains: query, mode: "insensitive" } },
        { category: { contains: query, mode: "insensitive" } },
        { service: { contains: query, mode: "insensitive" } },
      ] }] }, select: { client: true }, distinct: ["client"], take: 100 }),
    ]) : null;

    return res.json({ comparison: comparison ? {
      predominantTickets: comparison[0],
      otherTickets: comparison[1],
      otherClients: comparison[2].filter((item) => Boolean(item.client)).length,
    } : null, items: [
      ...navigation,
      ...tickets.map((item) => ({ id: `ticket-${item.movideskId}`, type: "Ticket", title: `#${item.movideskId} · ${item.subject}`, subtitle: [item.client, item.status].filter(Boolean).join(" · "), path: `/tickets?movidesk=${item.movideskId}` })),
      ...workItems.map((item) => ({ id: `task-${item.id}`, type: item.workItemType, title: `#${item.id} · ${item.title}`, subtitle: [item.client, item.state].filter(Boolean).join(" · "), path: `${workItemPath(item.workItemType)}?task=${item.id}` })),
      ...versions.filter((item) => item.deliveredVersion).map((item) => ({ id: `version-${item.deliveredVersion}`, type: "Versão", title: item.deliveredVersion!, subtitle: "Versão entregue em Work Items", path: `/versoes?search=${encodeURIComponent(item.deliveredVersion!)}` })),
    ] });
  };

  investigateTopic = async (req: Request, res: Response) => {
    const raw = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 240) : "";
    if (raw.length < 2) return res.status(400).json({ message: "Informe um assunto para investigação." });

    const stopWords=new Set(["com","sem","para","por","uma","uns","das","dos","que","esta","estao","ficou","fica","quando","onde","como","de","da","do","em","no","na","nos","nas","e","ou","a","o"]);
    const normalizedRaw=normalizeSearch(raw).replace(/[^a-z0-9]+/g," ").trim();
    const allWords=normalizedRaw.split(/\s+/).filter(Boolean);
    const concepts=[...new Set(allWords.filter((term)=>term.length>=3&&!stopWords.has(term)))].slice(0,10);
    const terms=concepts.length?concepts:[...new Set(allWords.filter((term)=>term.length>=2))].slice(0,8);
    const phrases=[normalizedRaw,...terms.slice(0,-1).map((term,index)=>`${term} ${terms[index+1]}`)].filter((value,index,list)=>value.length>=5&&list.indexOf(value)===index);
    const scoreText = (values: Array<string | null | undefined>) => {
      const haystack = normalizeSearch(values.filter(Boolean).join(" ")).replace(/[^a-z0-9]+/g," ");
      const matched = terms.filter((term) => haystack.includes(term));
      const matchedPhrases=phrases.filter((phrase)=>haystack.includes(phrase));
      const coverage=matched.length/Math.max(terms.length,1);
      const phraseBonus=matchedPhrases.length?Math.min(25,10+(matchedPhrases.length*5)):0;
      const allConcepts=terms.length>1&&matched.length===terms.length;
      const score=Math.min(100,Math.round((coverage*75)+phraseBonus+(allConcepts?10:0)));
      return { matched, matchedPhrases, allConcepts, score };
    };

    const ticketOr: any[] = terms.flatMap((term) => [
      { subject: { contains: term, mode: "insensitive" as const } },
      { client: { contains: term, mode: "insensitive" as const } },
      { category: { contains: term, mode: "insensitive" as const } },
      { cause: { contains: term, mode: "insensitive" as const } },
      { causeDetail: { contains: term, mode: "insensitive" as const } },
      { justification: { contains: term, mode: "insensitive" as const } },
      { service: { contains: term, mode: "insensitive" as const } },
      { serviceFirstLevel: { contains: term, mode: "insensitive" as const } },
      { serviceSecondLevel: { contains: term, mode: "insensitive" as const } },
      { serviceThirdLevel: { contains: term, mode: "insensitive" as const } },
    ]);
    const workItemOr: any[] = terms.flatMap((term) => [
      { title: { contains: term, mode: "insensitive" as const } },
      { client: { contains: term, mode: "insensitive" as const } },
      { module: { contains: term, mode: "insensitive" as const } },
      { process: { contains: term, mode: "insensitive" as const } },
      { reason: { contains: term, mode: "insensitive" as const } },
      { description: { contains: term, mode: "insensitive" as const } },
      { workaround: { contains: term, mode: "insensitive" as const } },
      { technicalSolution: { contains: term, mode: "insensitive" as const } },
      { tags: { contains: term, mode: "insensitive" as const } },
    ]);

    const [ticketRows, workItemRows, knownRows] = await Promise.all([
      prisma.ticket.findMany({
        where: { AND: [ticketOperationalScope(), { isDeleted: false }, { OR: ticketOr }] },
        select: { movideskId:true,subject:true,client:true,status:true,category:true,cause:true,causeDetail:true,justification:true,service:true,serviceFirstLevel:true,serviceSecondLevel:true,serviceThirdLevel:true,taskNumber:true,taskType:true,deliveredVersion:true,registeredVersion:true,createdDate:true,lastUpdate:true },
        orderBy: { lastUpdate: "desc" }, take: 120,
      }),
      prisma.azureWorkItem.findMany({
        where: { AND: [azureOperationalScope(), { OR: workItemOr }] },
        select: { id:true,title:true,workItemType:true,state:true,client:true,module:true,process:true,reason:true,description:true,workaround:true,technicalSolution:true,tags:true,movideskTicket:true,deliveredVersion:true,registeredVersion:true,azureChangedAt:true,remoteUrl:true },
        orderBy: { azureChangedAt: "desc" }, take: 100,
      }),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT * FROM "KnownProblem"
        WHERE "archived"=FALSE AND (
          LOWER(COALESCE("title",'')) LIKE ANY($1::text[]) OR
          LOWER(COALESCE("symptom",'')) LIKE ANY($1::text[]) OR
          LOWER(COALESCE("solution",'')) LIKE ANY($1::text[]) OR
          LOWER(COALESCE("cause",'')) LIKE ANY($1::text[]) OR
          LOWER(COALESCE("workaround",'')) LIKE ANY($1::text[]) OR
          LOWER(COALESCE("technicalSolution",'')) LIKE ANY($1::text[]) OR
          LOWER(COALESCE("service",'')) LIKE ANY($1::text[]) OR
          LOWER(COALESCE("tags",'')) LIKE ANY($1::text[])
        )
        ORDER BY "pinned" DESC, "updatedAt" DESC LIMIT 40
      `, terms.map((term) => `%${term}%`)),
    ]);

    const tickets = ticketRows.map((item) => {
      const match=scoreText([item.subject,item.client,item.category,item.cause,item.causeDetail,item.justification,item.service,item.serviceFirstLevel,item.serviceSecondLevel,item.serviceThirdLevel]);
      return {...item,score:match.score,matchedTerms:match.matched};
    }).sort((a,b)=>b.score-a.score||b.createdDate.getTime()-a.createdDate.getTime()).slice(0,24);
    const workItems = workItemRows.map((item) => {
      const match=scoreText([item.title,item.client,item.module,item.process,item.reason,item.description,item.workaround,item.technicalSolution,item.tags]);
      return {...item,score:match.score,matchedTerms:match.matched};
    }).sort((a,b)=>b.score-a.score).slice(0,24);
    const knownProblems = knownRows.map((item) => {
      const match=scoreText([item.title,item.symptom,item.solution,item.cause,item.workaround,item.technicalSolution,item.service,item.tags]);
      return {...item,score:match.score,matchedTerms:match.matched};
    }).sort((a,b)=>b.score-a.score).slice(0,16);

    const technicalText=[raw,...tickets.slice(0,8).map(x=>x.subject),...workItems.slice(0,8).map(x=>x.title)].join(" ");
    const mapService=new SimerMapService(); const ruleService=new SystemRuleService();
    const withTimeout=<T>(promise:Promise<T>,ms:number,fallback:T)=>Promise.race<T>([
      promise.catch(()=>fallback),
      new Promise<T>((resolve)=>setTimeout(()=>resolve(fallback),ms)),
    ]);
    const [mapItems,ruleItems]=await Promise.all([
      withTimeout(mapService.context(technicalText,18),2500,[]),
      withTimeout(ruleService.search(technicalText,18),2500,[]),
    ]);
    const correlations=await withTimeout(ruleService.correlate(technicalText,mapItems,12),2500,[]);
    const correlatedEvidence=correlations.slice(0,12).map((item:any)=>({id:item.id,title:item.nodeText??item.name??item.path,path:item.path??null,mapName:item.mapName??null,score:item.correlationScore??item.score??0,kind:item.nodeKind??"mapa"}));
    const ruleEvidence=ruleItems.slice(0,12).map((item:any)=>({id:item.id,title:item.name??item.processName??"Regra do sistema",path:item.folderPath??item.sourceFile??null,mapName:item.processName??null,score:item.score??0,kind:"regra"}));
    const mapEvidence=mapItems.slice(0,12).map((item:any)=>({id:item.id,title:item.nodeText??item.path??item.mapName??"Evidência do mapa",path:item.path??null,mapName:item.mapName??null,score:item.score??0,kind:item.nodeKind??"mapa"}));
    const evidence=[...correlatedEvidence,...ruleEvidence,...mapEvidence].filter((item,index,list)=>list.findIndex(x=>`${x.kind}:${x.id}`===`${item.kind}:${item.id}`)===index).sort((a,b)=>Number(b.score)-Number(a.score)).slice(0,12);

    const clients=new Set(tickets.map(x=>x.client).filter(Boolean));
    const versions=new Map<string,number>();
    [...tickets,...workItems].forEach((item:any)=>{const version=item.deliveredVersion??item.registeredVersion;if(version)versions.set(version,(versions.get(version)??0)+1)});
    const topVersions=[...versions.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([version,total])=>({version,total}));
    const recurrence=tickets.filter(x=>x.score>=50).length;
    const signals:string[]=[];
    if(recurrence>=3)signals.push(`${recurrence} tickets possuem aderência de 50% ou mais aos termos investigados.`);
    if(clients.size>1)signals.push(`O assunto aparece em ${clients.size} clientes no recorte encontrado.`);
    if(knownProblems.length)signals.push(`${knownProblems.length} problema(s) conhecido(s) possuem termos relacionados ao assunto.`);
    const leadingVersion=topVersions[0];
    if(leadingVersion && leadingVersion.total>=2)signals.push(`A versão ${leadingVersion.version} aparece em ${leadingVersion.total} evidências relacionadas.`);

    const context={
      original:raw,
      concepts:terms,
      phrases,
      interpretation:terms.length>1
        ? `Investigação contextual combinando ${terms.map((term)=>`“${term}”`).join(" + ")}; resultados que preservam mais conceitos e a frase recebem maior relevância.`
        : `Investigação pelo conceito “${terms[0]??raw}”, cruzando as fontes disponíveis.`,
      strategy:"contextual",
    };

    return res.json({
      query:raw,terms,context,
      summary:{tickets:tickets.length,workItems:workItems.length,knownProblems:knownProblems.length,evidence:evidence.length,rules:ruleItems.length,clients:clients.size,strongRecurrence:recurrence},
      tickets,workItems,knownProblems,evidence,ruleItems:ruleItems.slice(0,12),topVersions,signals,
    });
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
      where: { AND: [ticketOperationalScope(), { movideskId: { not: ticket.movideskId } }, { isDeleted: false }, { OR: similarOr }] },
      select: { movideskId: true, subject: true, client: true, category: true, cause: true, status: true, service: true, serviceThirdLevel: true, taskNumber: true, deliveredVersion: true, createdDate: true },
      orderBy: { createdDate: "desc" }, take: 80,
    }) : [];

    const norm=(v:string|null|undefined)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    const targetWords=new Set(words.map(norm));
    const similar=candidates.map((item)=>{
      let score=0; const reasons:string[]=[]; const signals:Array<{key:string;label:string;weight:number;matched:boolean;detail?:string}>=[];
      const add=(key:string,label:string,weight:number,matched:boolean,detail?:string)=>{signals.push({key,label,weight,matched,detail});if(matched){score+=weight;reasons.push(label.toLowerCase());}};
      add("client","Mesmo cliente",15,Boolean(ticket.client&&norm(item.client)===norm(ticket.client)),item.client??undefined);
      const targetService=norm(serviceValues[0]); const itemService=norm(item.serviceThirdLevel||item.service);
      add("service","Mesmo serviço",30,Boolean(targetService&&itemService===targetService),item.serviceThirdLevel||item.service||undefined);
      add("category","Mesma categoria",15,Boolean(ticket.category&&norm(item.category)===norm(ticket.category)),item.category??undefined);
      add("cause","Mesma causa",10,Boolean(ticket.cause&&norm(item.cause)===norm(ticket.cause)),item.cause??undefined);
      add("version","Mesma versão",10,Boolean(ticket.deliveredVersion&&norm(item.deliveredVersion)===norm(ticket.deliveredVersion)),item.deliveredVersion??undefined);
      const common=[...targetWords].filter((word)=>norm(item.subject).includes(word)).length;
      const subjectWeight=Math.min(20,common*5); signals.push({key:"subject",label:"Termos do assunto",weight:subjectWeight,matched:common>0,detail:common?`${common} termo(s) em comum`:undefined}); if(common){score+=subjectWeight;reasons.push(`${common} termo(s) do assunto`);}
      const matchedWeight=signals.filter(x=>x.matched).reduce((sum,x)=>sum+x.weight,0);
      return {...item,score,reasons,signals,explanation:{matchedSignals:signals.filter(x=>x.matched).length,matchedWeight,maxWeight:100}};
    }).filter((item)=>item.score>=15).sort((a,b)=>b.score-a.score||b.createdDate.getTime()-a.createdDate.getTime()).slice(0,12);

    const workItemIds=[ticket.taskNumber,...similar.map((x)=>x.taskNumber)].filter((v):v is number=>Number.isInteger(v));
    const workItems=workItemIds.length?await prisma.azureWorkItem.findMany({where:{AND:[azureOperationalScope(),{id:{in:[...new Set(workItemIds)]}}]},select:{id:true,title:true,workItemType:true,state:true,client:true,module:true,process:true,registeredVersion:true,deliveredVersion:true,azureCreatedAt:true,activatedAt:true,stateChangedAt:true,azureChangedAt:true,azureClosedAt:true,remoteUrl:true}}):[];
    const timeline=[
      {date:ticket.createdDate,kind:"ticket-opened",title:`Atendimento #${ticket.movideskId} aberto`,source:"Movidesk",status:ticket.status,path:`/tickets?movidesk=${ticket.movideskId}`},
      ...(ticket.lastUpdate?[{date:ticket.lastUpdate,kind:"ticket-updated",title:"Última atualização do atendimento",source:"Movidesk",status:ticket.status,path:`/tickets?movidesk=${ticket.movideskId}`}]:[]),
      ...(ticket.resolvedDate?[{date:ticket.resolvedDate,kind:"ticket-resolved",title:"Atendimento resolvido",source:"Movidesk",status:"Resolvido",path:`/tickets?movidesk=${ticket.movideskId}`}]:[]),
      ...workItems.flatMap(x=>{
        const path=`${workItemPath(x.workItemType)}?task=${x.id}`;
        const version=x.deliveredVersion??x.registeredVersion??null;
        return [
          ...(x.azureCreatedAt?[{date:x.azureCreatedAt,kind:"azure-created",title:`${x.workItemType} #${x.id} criada`,source:"Azure DevOps",status:x.state,path,version:null}]:[]),
          ...(x.activatedAt?[{date:x.activatedAt,kind:"azure-activated",title:`${x.workItemType} #${x.id} ativada`,source:"Azure DevOps",status:x.state,path,version:null}]:[]),
          ...(x.stateChangedAt?[{date:x.stateChangedAt,kind:"azure-state",title:`${x.workItemType} #${x.id} movimentada`,source:"Azure DevOps",status:x.state,path,version:null}]:[]),
          ...(x.azureClosedAt?[{date:x.azureClosedAt,kind:"azure-closed",title:`${x.workItemType} #${x.id} concluída`,source:"Azure DevOps",status:x.state,path,version}]:[]),
          ...(!x.azureClosedAt&&x.azureChangedAt?[{date:x.azureChangedAt,kind:"azure-updated",title:`${x.workItemType} #${x.id} atualizada`,source:"Azure DevOps",status:x.state,path,version}]:[])
        ];
      }),
    ].sort((a,b)=>a.date.getTime()-b.date.getTime());

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
    const strongCases=similar.filter(x=>x.score>=45);
    const strongClients=new Set(strongCases.map(x=>norm(x.client)).filter(Boolean));
    const knownProblemCandidate={
      eligible:strongCases.length>=3,
      level:strongCases.length>=6&&strongClients.size>=2?"high":strongCases.length>=3?"medium":"low",
      strongCases:strongCases.length,
      clients:strongClients.size,
      rationale:strongCases.length>=3
        ? `${strongCases.length} caso(s) com correlação forte${strongClients.size>=2?` em ${strongClients.size} clientes`:""}; recomenda-se revisão humana antes de registrar como Problema Conhecido.`
        : "A recorrência atual ainda não atingiu o critério mínimo de 3 casos com correlação forte.",
      suggestedTitle:ticket.subject,
      path:`/problemas-conhecidos?q=${encodeURIComponent(ticket.subject)}`,
    };
    const anomalyRadar=[
      {key:"recurrence",label:"Recorrência forte",value:strongCases.length,status:strongCases.length>=3?"attention":"normal",detail:"Casos semelhantes com score de correlação ≥45."},
      {key:"cross-client",label:"Transversalidade",value:strongClients.size,status:strongClients.size>=2?"attention":"normal",detail:"Quantidade de clientes distintos nos casos de correlação forte."},
      {key:"version",label:"Concentração por versão",value:intelligence.versionSignal?.cases??0,status:intelligence.versionSignal?"attention":"normal",detail:intelligence.versionSignal?.text??"Sem concentração de versão suficiente no recorte."},
      {key:"client-volume",label:"Pulso do cliente",value:intelligence.clientDna.serviceCases,status:intelligence.clientDna.serviceCases>=5?"attention":"normal",detail:`${intelligence.clientDna.serviceCases} ticket(s) do cliente no serviço atual no recorte analisado.`},
      {key:"data-quality",label:"Qualidade do contexto",value:Math.round((completeness/5)*100),status:completeness<4?"attention":"normal",detail:"Completude de cliente, categoria, responsável, serviço e vínculo de desenvolvimento."},
    ];
    const technicalDna={
      product:"SIMER",
      client:ticket.client??null,
      category:ticket.category??null,
      cause:ticket.cause??null,
      service:serviceValues[0]??null,
      subject:ticket.subject,
      version:ticket.deliveredVersion??ticket.registeredVersion??null,
      task:ticket.taskNumber??null,
      taskStatus:ticket.taskStatus??null,
      recurrence:strongCases.length>=6?"alta":strongCases.length>=3?"moderada":strongCases.length?"baixa":"não detectada",
      crossClient:strongClients.size>=2,
      knownProblemCandidate:knownProblemCandidate.eligible,
      evidenceCount:evidence.length,
      ruleCount:ruleItems.length,
    };
    const diagnosticPlan=[
      {key:"classification",title:"Validar classificação",status:ticket.category&&serviceValues[0]?"ready":"attention",detail:ticket.category&&serviceValues[0]?"Categoria e Serviço disponíveis para confronto.":"Categoria ou Serviço incompleto; revisar antes de concluir a causa."},
      {key:"rule",title:"Confrontar Regra do Sistema",status:ruleItems.length||evidence.length?"ready":"attention",detail:ruleItems.length||evidence.length?`${ruleItems.length} regra(s) e ${evidence.length} evidência(s) técnica(s) correlacionadas.`:"Nenhuma regra/evidência correlacionada automaticamente."},
      {key:"history",title:"Comparar recorrências",status:similar.length?"ready":"neutral",detail:similar.length?`${similar.length} caso(s) semelhante(s) localizado(s).`:"Sem recorrência relevante no recorte atual."},
      {key:"development",title:"Validar desenvolvimento",status:ticket.taskNumber?"ready":"neutral",detail:ticket.taskNumber?`Task #${ticket.taskNumber} vinculada ao atendimento.`:"Atendimento sem Task vinculada."},
      {key:"data",title:"Validar dados no banco",status:"neutral",detail:"Use consultas somente leitura e parametrizadas para confirmar a evidência funcional antes de qualquer intervenção."},
    ];
    return res.json({
      ticket, workItems, similar, timeline, evidence, ruleItems:ruleItems.slice(0,10), anomalies, diagnosticPlan, intelligence, technicalDna, knownProblemCandidate, anomalyRadar,
      quality: { score: Math.round((completeness/5)*100), checks: { client:Boolean(ticket.client), category:Boolean(ticket.category), owner:Boolean(ticket.owner), service:Boolean(serviceValues[0]), developmentLink:Boolean(ticket.taskNumber) } },
      summary: { similarCases: similar.length, relatedWorkItems: workItems.length, technicalEvidence:evidence.length, rules:ruleItems.length, service: serviceValues[0]??null, version: ticket.deliveredVersion??ticket.registeredVersion??null },
    });
  };

  calendar = async (req: AuthenticatedRequest, res: Response) => {
    const start = new Date(String(req.query.start ?? ""));
    const end = new Date(String(req.query.end ?? ""));
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return res.status(400).json({ message: "Período inválido." });

    const [tickets, workItems, meetings] = await Promise.all([
      prisma.ticket.findMany({
        where: { AND: [ticketOperationalScope(), { OR: ["createdDate", "resolvedDate", "closedDate"].map((field) => ({ [field]: { gte: start, lt: end } })) }] },
        select: { movideskId: true, subject: true, createdDate: true, resolvedDate: true, closedDate: true }, take: 500,
      }),
      prisma.azureWorkItem.findMany({
        where: { AND: [azureOperationalScope(), { OR: ["azureCreatedAt", "stateChangedAt", "azureClosedAt"].map((field) => ({ [field]: { gte: start, lt: end } })) }] },
        select: { id: true, title: true, workItemType: true, azureCreatedAt: true, stateChangedAt: true, azureClosedAt: true, deliveredVersion: true }, take: 500,
      }),
      calendarMeetingService.listForRange(req.auth!.userId, req.auth!.role, start, end),
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
    meetings.forEach((meeting) => {
      const startLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: meeting.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(meeting.startAt));
      const endLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: meeting.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(meeting.endAt));
      const participants = meeting.participants.map((person) => person.name);
      events.push({
        id: `meeting-${meeting.id}`,
        date: meeting.startAt,
        kind: "meeting",
        title: meeting.title,
        subtitle: [`${startLabel}–${endLabel}`, meeting.location, participants.length ? `${participants.length} participante(s)` : null].filter(Boolean).join(" · "),
        path: "",
        meeting,
      });
    });

    events.sort((left, right) => new Date(String(left.date)).getTime() - new Date(String(right.date)).getTime());
    const years = Array.from(new Set([start.getUTCFullYear(), end.getUTCFullYear()]));
    // Feriados são datas civis, não instantes operacionais. Não aplicamos o
    // recorte start/end por timestamp para evitar deslocamento no primeiro dia
    // do mês em fusos negativos (ex.: America/Sao_Paulo).
    const holidays = years.flatMap(brazilianHolidays);
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
