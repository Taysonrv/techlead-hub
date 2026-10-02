import { isBug, isConcluded, mapPriority, SLA_PRIORITY } from "../domain/TicketClassificationRules";
import { slaBusinessMinutes } from "../domain/SlaCalendarRules";
import { prisma } from "../database/prisma";
import { SIMER_CLIENTS, SUPPORT_ANALYSTS, SUPPORT_COORDINATOR, coordinationAzureScope, coordinationTicketScope, simerClientTicketScope, ticketOperationalScope } from "../domain/OperationalScope";
import { SIMER_SERVICE_CATALOG, suggestSimerService, type SimerServiceCatalogItem } from "../domain/SimerServiceCatalog";
import { coordinationAzurePriorityPredicate, coordinationOpenAzurePredicate, coordinationOpenTicketPredicate, coordinationTicketPriorityPredicate, type CoordinationPriorityKind } from "../domain/CoordinationPredicates";
import { productivityExpectedHours, sameOperationalPerson } from "../domain/ProductivityRules";

type CoordinationCacheEntry = { expiresAt: number; value: unknown };
const coordinationCache = new Map<string, CoordinationCacheEntry>();
const cacheGet = <T>(key: string): T | null => {
  const entry = coordinationCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { coordinationCache.delete(key); return null; }
  return entry.value as T;
};
const cacheSet = <T>(key: string, value: T, ttlMs = 45_000): T => {
  coordinationCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (coordinationCache.size > 40) {
    for (const [cacheKey, entry] of coordinationCache) if (entry.expiresAt <= Date.now()) coordinationCache.delete(cacheKey);
  }
  return value;
};

export class CoordinationService {
  async details(kind: string, analyst?: string, limit = 50, serviceModule?: string, serviceClient?: string, serviceName?: string, serviceDays = 0) {
    const now = new Date();
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    // Busca um registro adicional para informar truncamento sem confundir "quantidade carregada" com total real.
    const fetchLimit = Math.min(safeLimit + 1, 501);
    const serviceSince = serviceDays > 0 ? new Date(now.getTime() - Math.min(serviceDays, 730) * 86400000) : null;
    const ticketScope = ticketOperationalScope();
    const azureScope = coordinationAzureScope();

    const priorityKinds: CoordinationPriorityKind[] = ["backlog", "critical", "stale", "dueSoon", "overdue"];
    const ticketPriority = priorityKinds.includes(kind as CoordinationPriorityKind)
      ? coordinationTicketPriorityPredicate(kind as CoordinationPriorityKind, now)
      : coordinationOpenTicketPredicate();
    const azurePriority = kind === "blocked" || kind === "unassigned"
      ? coordinationAzurePriorityPredicate(kind)
      : coordinationOpenAzurePredicate();

    const wantsTickets = ["backlog", "critical", "stale", "dueSoon", "overdue", "analyst", "service", "serviceThirdLevel", "serviceModule", "serviceClient", "serviceAnalyst"].includes(kind);
    const wantsAzure = ["blocked", "unassigned", "analyst"].includes(kind);

    const [tickets, workItems] = await Promise.all([
      wantsTickets
        ? prisma.ticket.findMany({
            where: {
              AND: [
                ticketScope,
                ticketPriority,
                ...(analyst ? [{ owner: { equals: analyst, mode: "insensitive" as const } }] : []),
                ...(serviceClient ? [{ client: { equals: serviceClient, mode: "insensitive" as const } }] : []),
                ...(serviceSince ? [{ createdDate: { gte: serviceSince } }] : []),
                ...(serviceModule ? [{
                  OR: [
                    { service: { contains: serviceModule, mode: "insensitive" as const } },
                    { serviceFirstLevel: { contains: serviceModule, mode: "insensitive" as const } },
                    { serviceSecondLevel: { contains: serviceModule, mode: "insensitive" as const } },
                    { serviceThirdLevel: { contains: serviceModule, mode: "insensitive" as const } },
                  ],
                }] : []),
              ],
            },
            orderBy: [{ urgency: "desc" }, { lastUpdate: "asc" }],
            take: fetchLimit,
            select: {
              movideskId: true, subject: true, status: true, urgency: true, client: true,
              owner: true, lastUpdate: true, dueDate: true, taskNumber: true,
              registeredVersion: true, deliveredVersion: true,
              service: true, serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true,
              category: true, cause: true,
            },
          })
        : Promise.resolve([]),
      wantsAzure
        ? prisma.azureWorkItem.findMany({
            where: {
              AND: [
                azureScope,
                azurePriority,
                ...(analyst ? [{ createdByName: { equals: analyst, mode: "insensitive" as const } }] : []),
                ...(serviceSince ? [{ azureCreatedAt: { gte: serviceSince } }] : []),
              ],
            },
            orderBy: [{ azureChangedAt: "asc" }],
            take: fetchLimit,
            select: {
              id: true, workItemType: true, title: true, state: true, client: true,
              assignedToName: true, createdByName: true, criticality: true, blockedProcess: true,
              movideskTicket: true, registeredVersion: true, deliveredVersion: true,
              azureChangedAt: true, remoteUrl: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const normalizeService = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
    const ticketServicePath = (ticket: (typeof tickets)[number]) =>
      ticket.serviceSecondLevel?.trim() || "";
    const serviceFilteredTickets = serviceName
      ? tickets.filter((ticket) => normalizeService(
          kind === "serviceThirdLevel" ? ticket.serviceThirdLevel?.trim() || "" : ticket.serviceSecondLevel?.trim() || ""
        ) === normalizeService(serviceName))
      : tickets;
    const ticketTruncated = serviceFilteredTickets.length > safeLimit;
    const workItemTruncated = workItems.length > safeLimit;
    const filteredTickets = serviceFilteredTickets.slice(0, safeLimit);
    const filteredWorkItems = workItems.slice(0, safeLimit);

    // O mesmo predicado usado no summary calcula o total do recorte. Assim o card e o drawer
    // permanecem consistentes mesmo quando a lista é paginada/limitada.
    const [ticketTotal, workItemTotal] = await Promise.all([
      wantsTickets ? prisma.ticket.count({ where: { AND: [
        ticketScope, ticketPriority,
        ...(analyst?[{owner:{equals:analyst,mode:"insensitive" as const}}]:[]),
        ...(serviceClient?[{client:{equals:serviceClient,mode:"insensitive" as const}}]:[]),
        ...(serviceSince?[{createdDate:{gte:serviceSince}}]:[]),
        ...(serviceModule?[{OR:[
          {service:{contains:serviceModule,mode:"insensitive" as const}},
          {serviceFirstLevel:{contains:serviceModule,mode:"insensitive" as const}},
          {serviceSecondLevel:{contains:serviceModule,mode:"insensitive" as const}},
          {serviceThirdLevel:{contains:serviceModule,mode:"insensitive" as const}},
        ]}]:[]),
      ] } }) : Promise.resolve(0),
      wantsAzure ? prisma.azureWorkItem.count({ where: { AND: [
        azureScope, azurePriority,
        ...(analyst?[{createdByName:{equals:analyst,mode:"insensitive" as const}}]:[]),
        ...(serviceSince?[{azureCreatedAt:{gte:serviceSince}}]:[]),
      ] } }) : Promise.resolve(0),
    ]);
    // Para Serviço exato o filtro é pós-query; nesse caso o total conhecido é o conjunto filtrado carregado.
    const total = serviceName ? serviceFilteredTickets.length + workItemTotal : ticketTotal + workItemTotal;

    return {
      kind, analyst:analyst??null, serviceModule:serviceModule??null, serviceClient:serviceClient??null, serviceName:serviceName??null,
      total, loaded:filteredTickets.length+filteredWorkItems.length,
      truncated:ticketTruncated||workItemTruncated||total>filteredTickets.length+filteredWorkItems.length,
      tickets:filteredTickets, workItems:filteredWorkItems,
    };
  }

  async integrationHealth(days = 30, startDate?: string, endDate?: string) {
    const safeDays = Math.min(Math.max(days || 730, 1), 730);
    const now = new Date();
    const parsedStart = startDate ? new Date(`${startDate}T00:00:00.000`) : null;
    const parsedEnd = endDate ? new Date(`${endDate}T23:59:59.999`) : null;
    const since = parsedStart && !Number.isNaN(parsedStart.getTime())
      ? parsedStart
      : days > 0 ? new Date(now.getTime() - (safeDays - 1) * 86400000) : new Date("2026-01-01T00:00:00.000Z");
    since.setHours(0, 0, 0, 0);
    const until = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : now;
    const ticketScope = ticketOperationalScope();
    const periodTicketScope = { AND: [ticketScope, { isDeleted: false }, { createdDate: { gte: since, lte: until } }] };
    const periodTickets = await prisma.ticket.findMany({
      where: periodTicketScope,
      select: { movideskId: true, taskNumber: true },
    });
    const ticketIds = periodTickets.map((ticket) => ticket.movideskId);
    const taskIds = periodTickets.map((ticket) => ticket.taskNumber).filter((id): id is number => id !== null);
    const [withService, withCause, withBusinessArea, azureItems, csat, services, latestCsat, latestCatalog] = await Promise.all([
      prisma.ticket.count({ where: { AND: [periodTicketScope, { OR:[{service:{not:null}},{serviceFirstLevel:{not:null}},{serviceSecondLevel:{not:null}},{serviceThirdLevel:{not:null}}] }] } }),
      prisma.ticket.count({ where: { AND: [periodTicketScope, { cause: { not:null } }] } }),
      prisma.ticket.count({ where: { AND: [periodTicketScope, { businessArea: { not:null } }] } }),
      taskIds.length ? prisma.azureWorkItem.count({ where: { id: { in: taskIds } } }) : Promise.resolve(0),
      ticketIds.length ? prisma.movideskSurveyResponse.count({ where:{ ticketId:{in:ticketIds}, type:2, responseDate:{gte:since,lte:until} } }) : Promise.resolve(0),
      prisma.movideskServiceCatalog.count({ where:{isActive:true} }),
      ticketIds.length ? prisma.movideskSurveyResponse.aggregate({ where:{ticketId:{in:ticketIds},type:2,responseDate:{gte:since,lte:until}}, _max: { syncedAt: true, responseDate: true } }) : Promise.resolve({_max:{syncedAt:null,responseDate:null}}),
      prisma.movideskServiceCatalog.aggregate({ _max: { syncedAt: true } }),
    ]);
    const tickets = periodTickets.length;
    const linkedTasks = taskIds.length;
    const pct=(value:number)=>tickets ? Math.round(value/tickets*1000)/10 : 0;
    return {
      periodDays: days || 0, period:{start:since,end:until},
      tickets, linkedTasks, azureItems, csatResponses: csat, catalogServices: services,
      taskLinkCoveragePct: pct(linkedTasks), serviceCoveragePct: pct(withService),
      causeCoveragePct: pct(withCause), businessAreaCoveragePct: pct(withBusinessArea),
      latestCsatSyncAt: latestCsat._max.syncedAt, latestCsatResponseAt: latestCsat._max.responseDate,
      latestCatalogSyncAt: latestCatalog._max.syncedAt,
      sources: { tickets: "Movidesk", tasks: "Azure DevOps", csat: "Movidesk Survey", services: "Movidesk Service Catalog" },
    };
  }

  async csatOverview(days = 180) {
    const safeDays = Math.min(Math.max(days, 30), 730);
    const since = new Date(Date.now() - safeDays * 86400000);
    const responses = await prisma.movideskSurveyResponse.findMany({
      where: { responseDate: { gte: since }, ticketId: { not: null }, type: 2 },
      orderBy: { responseDate: "desc" },
    });
    const ticketIds = [...new Set(responses.map((item) => item.ticketId).filter((id): id is number => id !== null))];
    const tickets = ticketIds.length ? await prisma.ticket.findMany({
      where: { AND: [{ movideskId: { in: ticketIds }, isDeleted: false }, ticketOperationalScope()] },
      select: { movideskId: true, subject: true, client: true, owner: true, service: true, serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true },
    }) : [];
    const byTicket = new Map(tickets.map((ticket) => [ticket.movideskId, ticket]));
    const scoped = responses.flatMap((response) => {
      const ticket = response.ticketId ? byTicket.get(response.ticketId) : undefined;
      if (!ticket || response.value === null) return [];
      const service = [ticket.serviceFirstLevel, ticket.serviceSecondLevel, ticket.serviceThirdLevel].map((value) => value?.trim()).filter(Boolean).join(" » ") || ticket.service || "Sem serviço";
      return [{ ...response, ticket, service }];
    });
    const average = (values: number[]) => values.length ? Math.round(values.reduce((a,b)=>a+b,0) / values.length * 100) / 100 : 0;
    const values = scoped.map((item) => item.value as number);
    const positive = values.filter((value) => value >= 4).length;
    const distribution = [1,2,3,4,5].map((value) => ({ value, count: values.filter((item) => item === value).length }));
    const group = (keyOf: (item: (typeof scoped)[number]) => string) => {
      const map = new Map<string, number[]>();
      for (const item of scoped) {
        const key = keyOf(item) || "Não informado";
        map.set(key, [...(map.get(key) ?? []), item.value as number]);
      }
      return [...map].map(([name, scores]) => ({ name, responses: scores.length, average: average(scores), positivePct: Math.round(scores.filter((value) => value >= 4).length / scores.length * 1000) / 10 })).sort((a,b) => b.responses-a.responses);
    };
    const monthlyMap = new Map<string, number[]>();
    for (const item of scoped) {
      if (!item.responseDate) continue;
      const month = item.responseDate.toISOString().slice(0,7);
      monthlyMap.set(month, [...(monthlyMap.get(month) ?? []), item.value as number]);
    }
    const monthly = [...monthlyMap].sort(([a],[b]) => a.localeCompare(b)).map(([month,scores]) => ({ month, responses: scores.length, average: average(scores), positivePct: Math.round(scores.filter((value) => value >= 4).length / scores.length * 1000) / 10 }));
    return {
      periodDays: safeDays,
      summary: { responses: scoped.length, average: average(values), positivePct: values.length ? Math.round(positive / values.length * 1000) / 10 : 0, comments: scoped.filter((item) => Boolean(item.commentary?.trim())).length },
      distribution,
      monthly,
      byClient: group((item) => item.ticket.client ?? "Sem cliente").slice(0,12),
      byAnalyst: group((item) => item.ticket.owner ?? "Sem responsável")
        .filter((item) => SUPPORT_ANALYSTS.some((analyst) => sameOperationalPerson(analyst, item.name)))
        .slice(0,12),
      byService: group((item) => item.service).slice(0,12),
      recent: scoped.slice(0,20).map((item) => ({ id:item.id, ticketId:item.ticketId, subject:item.ticket.subject, client:item.ticket.client, owner:item.ticket.owner, value:item.value, commentary:item.commentary, responseDate:item.responseDate, service:item.service })),
    };
  }

  async csatDetails(days = 180, filters: { client?: string; analyst?: string; service?: string; value?: number; minValue?: number; commentsOnly?: boolean } = {}) {
    const safeDays = Math.min(Math.max(days, 30), 730);
    const since = new Date(Date.now() - safeDays * 86400000);
    const responses = await prisma.movideskSurveyResponse.findMany({
      where: {
        responseDate: { gte: since },
        ticketId: { not: null },
        type: 2,
        ...(filters.value ? { value: filters.value } : {}),
        ...(filters.minValue ? { value: { gte: filters.minValue } } : {}),
      },
      orderBy: { responseDate: "desc" },
      take: 500,
    });
    const ids = [...new Set(responses.map((item) => item.ticketId).filter((id): id is number => id !== null))];
    const tickets = ids.length ? await prisma.ticket.findMany({
      where: { AND: [{ movideskId: { in: ids }, isDeleted: false }, ticketOperationalScope()] },
      select: { movideskId:true, subject:true, client:true, owner:true, service:true, serviceFirstLevel:true, serviceSecondLevel:true, serviceThirdLevel:true, taskNumber:true },
    }) : [];
    const byTicket = new Map(tickets.map((ticket) => [ticket.movideskId, ticket]));
    const normalize = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
    const items = responses.flatMap((response) => {
      const ticket = response.ticketId ? byTicket.get(response.ticketId) : undefined;
      if (!ticket) return [];
      const service = [ticket.serviceFirstLevel,ticket.serviceSecondLevel,ticket.serviceThirdLevel].map(v=>v?.trim()).filter(Boolean).join(" » ") || ticket.service || "Sem serviço";
      if (filters.client && normalize(ticket.client) !== normalize(filters.client)) return [];
      if (filters.analyst && normalize(ticket.owner) !== normalize(filters.analyst)) return [];
      if (filters.service && normalize(service) !== normalize(filters.service)) return [];
      if (filters.commentsOnly && !response.commentary?.trim()) return [];
      return [{ id:response.id, ticketId:response.ticketId, subject:ticket.subject, client:ticket.client, owner:ticket.owner, taskNumber:ticket.taskNumber, service, value:response.value, commentary:response.commentary, responseDate:response.responseDate }];
    });
    return { periodDays:safeDays, total:items.length, truncated:responses.length===500, items };
  }

  async slaDevelopmentFlow(days = 180, startDate?: string, endDate?: string) {
    const parseDate = (value?: string, endOfDay = false) => {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const customStart = parseDate(startDate);
    const customEnd = parseDate(endDate, true);
    const since = customStart ?? new Date(Date.now() - Math.min(Math.max(days, 1), 730) * 86400000);
    const until = customEnd ?? new Date();
    const tickets = await prisma.ticket.findMany({
      where: { AND: [{ isDeleted: false, createdDate: { gte: since, lte: until } }, simerClientTicketScope()] },
      select: { movideskId:true, subject:true, category:true, client:true, owner:true, urgency:true, createdDate:true, taskNumber:true, taskStatus:true, taskTitle:true, taskType:true }
    });
    const bugTickets=tickets.filter(t=>isBug(t.category,t.taskType));
    const ids=[...new Set(bugTickets.map(t=>t.taskNumber).filter((x):x is number=>Boolean(x)))];
    const movideskIds=bugTickets.map(t=>t.movideskId);
    const items=await prisma.azureWorkItem.findMany({
      where:{OR:[...(ids.length?[{id:{in:ids}}]:[]),...(movideskIds.length?[{movideskTicket:{in:movideskIds}}]:[])]},
      select:{id:true,state:true,azureCreatedAt:true,stateChangedAt:true,azureChangedAt:true,azureClosedAt:true,title:true,movideskTicket:true,criticality:true}
    });
    const byId=new Map(items.map(x=>[x.id,x]));
    const byTicket=new Map(items.filter(x=>x.movideskTicket).map(x=>[x.movideskTicket!,x]));
    let missingAzure=0,missingTaskCreatedAt=0,missingPriority=0,invalidTimeline=0;
    const rows=bugTickets.flatMap(t=>{const w=(t.taskNumber?byId.get(t.taskNumber):undefined)??byTicket.get(t.movideskId);if(!w){missingAzure++;return[]}if(!w.azureCreatedAt){missingTaskCreatedAt++;return[]}const p=mapPriority(t.urgency,w.criticality);if(!p){missingPriority++;return[]}const concluded=isConcluded(w.state,t.taskStatus);// Para o estado atual Concluída, stateChangedAt representa a transição que encerrou a Task.
      // azureClosedAt fica como fallback porque pode refletir outro marco de fechamento do Work Item.
      const end=concluded?(w.stateChangedAt??w.azureClosedAt??w.azureChangedAt):null;if(w.azureCreatedAt<t.createdDate||(end&&end<w.azureCreatedAt)){invalidTimeline++;return[]}const support=slaBusinessMinutes(t.createdDate,w.azureCreatedAt);const factoryEnd=end??until;const factory=slaBusinessMinutes(w.azureCreatedAt,factoryEnd);const total=support+factory;const rule=SLA_PRIORITY[p];const tg={support:rule.supportMinutes,factory:rule.factoryMinutes,total:rule.totalMinutes};const supportPct=Math.round(support/tg.support*1000)/10;const factoryPct=Math.round(factory/tg.factory*1000)/10;const totalPct=Math.round(total/tg.total*1000)/10;const bottleneck=factoryPct>supportPct?"Fábrica":"Suporte";return[{movideskId:t.movideskId,subject:t.subject,client:t.client,owner:t.owner??"Sem responsável",taskNumber:w.id,taskTitle:w.title??t.taskTitle,taskState:w.state??t.taskStatus,urgency:p,taskCreatedAt:w.azureCreatedAt,taskConcludedAt:end,supportMinutes:support,factoryMinutes:factory,totalMinutes:total,supportTargetMinutes:tg.support,factoryTargetMinutes:tg.factory,totalTargetMinutes:tg.total,supportPct,factoryPct,totalPct,bottleneck}]} );
    const done=rows.filter(r=>r.taskConcludedAt);
    const avg=(xs:number[])=>xs.length?Math.round(xs.reduce((a,b)=>a+b,0)/xs.length):0;
    const summarize=(group:any[])=>{const completed=group.filter(r=>r.taskConcludedAt);return{total:group.length,concluded:completed.length,openDevelopment:group.length-completed.length,avgSupportMinutes:avg(group.map(r=>r.supportMinutes)),avgFactoryMinutes:avg(group.map(r=>r.factoryMinutes!)),avgTotalMinutes:avg(group.map(r=>r.totalMinutes!)),supportWithinOla:group.filter(r=>r.supportPct<=100).length,factoryWithinOla:completed.filter(r=>(r.factoryPct??Infinity)<=100).length,totalWithinSla:completed.filter(r=>(r.totalPct??Infinity)<=100).length,supportBottleneck:group.filter(r=>r.bottleneck==="Suporte").length,factoryBottleneck:group.filter(r=>r.bottleneck==="Fábrica").length}};
    const outlierRows=rows.map(r=>{const supportOver=Math.max(0,r.supportPct-100);const factoryOver=r.factoryPct===null?0:Math.max(0,r.factoryPct-100);const totalOver=r.totalPct===null?0:Math.max(0,r.totalPct-100);const severity=Math.max(supportOver,factoryOver,totalOver);return{...r,severity,outlierStage:totalOver>=factoryOver&&totalOver>=supportOver?"SLA total":factoryOver>supportOver?"Fábrica":"Suporte"}}).filter(r=>r.severity>0).sort((a,b)=>b.severity-a.severity);
    const outliers={
      total:outlierRows.length,
      support:rows.filter(r=>r.supportPct>100).length,
      factory:rows.filter(r=>(r.factoryPct??0)>100).length,
      totalSla:done.filter(r=>(r.totalPct??0)>100).length,
      critical:outlierRows.filter(r=>r.severity>=100).length,
      top:outlierRows.slice(0,15).map(r=>({movideskId:r.movideskId,subject:r.subject,client:r.client,owner:r.owner,taskNumber:r.taskNumber,urgency:r.urgency,supportPct:r.supportPct,factoryPct:r.factoryPct,totalPct:r.totalPct,severity:r.severity,outlierStage:r.outlierStage,supportMinutes:r.supportMinutes,factoryMinutes:r.factoryMinutes,totalMinutes:r.totalMinutes}))
    };
    const byPriority=["P1","P2","P3","P4"].map(priority=>({priority,...summarize(rows.filter(r=>r.urgency===priority)),rows:rows.filter(r=>r.urgency===priority).map(r=>r.movideskId)}));
    const owners=[...new Set(rows.map(r=>r.owner))].map(owner=>({owner,...summarize(rows.filter(r=>r.owner===owner)),rows:rows.filter(r=>r.owner===owner).map(r=>r.movideskId)})).sort((a,b)=>b.total-a.total);
    const clients=[...new Set(rows.map(r=>r.client??"Sem cliente"))].map(client=>({client,...summarize(rows.filter(r=>(r.client??"Sem cliente")===client)),rows:rows.filter(r=>(r.client??"Sem cliente")===client).map(r=>r.movideskId)})).sort((a,b)=>b.total-a.total);
    const monthKey=(date:Date)=>date.toISOString().slice(0,7);
    const monthLabel=(key:string)=>{const [year,month]=key.split("-");return new Intl.DateTimeFormat("pt-BR",{month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(Date.UTC(Number(year),Number(month)-1,1))).replace(".","");};
    const monthly=[...new Set(rows.map(r=>monthKey(r.taskCreatedAt)))].sort().map(month=>{const group=rows.filter(r=>monthKey(r.taskCreatedAt)===month);const completed=group.filter(r=>r.taskConcludedAt);return{month,label:monthLabel(month),total:group.length,concluded:completed.length,avgSupportMinutes:avg(group.map(r=>r.supportMinutes)),avgFactoryMinutes:avg(completed.map(r=>r.factoryMinutes!)),avgTotalMinutes:avg(completed.map(r=>r.totalMinutes!)),supportWithinPct:group.length?Math.round(group.filter(r=>r.supportPct<=100).length/group.length*1000)/10:0,factoryWithinPct:completed.length?Math.round(completed.filter(r=>(r.factoryPct??Infinity)<=100).length/completed.length*1000)/10:0,totalWithinPct:completed.length?Math.round(completed.filter(r=>(r.totalPct??Infinity)<=100).length/completed.length*1000)/10:0}});
    return { periodDays: days, period:{start:since,end:until}, rule:{taskEndState:"Concluida",schedule:"Seg-Sex 08:00-18:00",profile:"PADRAO"}, dataQuality:{bugsInPeriod:bugTickets.length,linked:rows.length,missingAzure,missingTaskCreatedAt,missingPriority,invalidTimeline}, summary:{bugsWithTask:rows.length,concluded:done.length,openDevelopment:rows.length-done.length,avgSupportMinutes:avg(rows.map(r=>r.supportMinutes)),avgFactoryMinutes:avg(rows.map(r=>r.factoryMinutes!)),avgTotalMinutes:avg(rows.map(r=>r.totalMinutes!)),supportWithinOla:rows.filter(r=>r.supportPct<=100).length,factoryWithinOla:rows.filter(r=>(r.factoryPct??Infinity)<=100).length,totalWithinSla:rows.filter(r=>(r.totalPct??Infinity)<=100).length}, byPriority, owners, clients, monthly, outliers, rows };
  }

  async serviceIntelligence(filters: { client?: string; analyst?: string; months?: number } = {}) {
    const months = Math.min(Math.max(filters.months ?? 6, 3), 12);
    const cacheKey = `services:${months}:${filters.client?.toLocaleLowerCase("pt-BR") ?? ""}:${filters.analyst?.toLocaleLowerCase("pt-BR") ?? ""}`;
    const cached = cacheGet<any>(cacheKey);
    if (cached) return cached;
    const since = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1); since.setHours(0, 0, 0, 0);
    const previousSince = new Date(since);
    previousSince.setMonth(previousSince.getMonth() - months);
    const scope = simerClientTicketScope();
    const [allTickets, officialServices] = await Promise.all([prisma.ticket.findMany({
      where: {
        AND: [
          scope,
          { isDeleted: false, createdDate: { gte: previousSince } },
          ...(filters.client ? [{ client: { equals: filters.client, mode: "insensitive" as const } }] : []),
          ...(filters.analyst ? [{ owner: { equals: filters.analyst, mode: "insensitive" as const } }] : []),
        ],
      },
      select: {
        movideskId: true, subject: true, category: true, cause: true, client: true, owner: true,
        service: true, serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true,
        createdDate: true, baseStatus: true,
      },
      orderBy: { createdDate: "desc" },
    }), prisma.movideskServiceCatalog.findMany({
      where: { isActive: true },
      select: { id:true, name:true, parentServiceId:true },
    })]);
    const tickets = allTickets.filter((ticket) => ticket.createdDate >= since);
    const previousTickets = allTickets.filter((ticket) => ticket.createdDate >= previousSince && ticket.createdDate < since);
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
    const pathOf = (ticket: (typeof tickets)[number]) =>
      [ticket.serviceFirstLevel, ticket.serviceSecondLevel, ticket.serviceThirdLevel].map((v) => v?.trim()).filter((v): v is string => Boolean(v)).join(" » ") || ticket.service?.trim() || "";
    const generic = (path: string) => {
      const values = path.split("»").map(normalize).filter(Boolean);
      return values.some((v) => v.includes("simer")) && values.filter((v) => !/^(atendimento ao cliente|siagri simer|simer|siagri)$/.test(v)).length === 0;
    };
    const serviceLabel = (path: string) => {
      const parts = path.split("»").map((value) => value.trim()).filter(Boolean);
      return parts.at(-1) ?? path.trim();
    };
    const catalogMap = new Map<string, SimerServiceCatalogItem>();
    for (const item of SIMER_SERVICE_CATALOG) catalogMap.set(normalize(item.path), item);
    const officialById = new Map(officialServices.map((item) => [item.id, item]));
    const officialPath = (id:number) => {
      const names:string[]=[]; const seen=new Set<number>(); let current=officialById.get(id);
      while(current && !seen.has(current.id) && names.length < 8) {
        seen.add(current.id); names.unshift(current.name); current=current.parentServiceId ? officialById.get(current.parentServiceId) : undefined;
      }
      return names.join(" » ");
    };
    for (const item of officialServices) {
      const path=officialPath(item.id);
      if (!path || !/simer/i.test(path)) continue;
      const parts=path.split("»").map((value)=>value.trim()).filter(Boolean);
      catalogMap.set(normalize(path), { id:`movidesk:${item.id}`, path, name:item.name, module:parts.length >= 3 ? parts[2] ?? null : null });
    }
    for (const ticket of tickets) {
      const path = pathOf(ticket); if (!path || !/simer/i.test(path)) continue;
      const parts = path.split("»").map((v) => v.trim()).filter(Boolean);
      catalogMap.set(normalize(path), { id: `observed:${normalize(path)}`, path, name: parts.at(-1) ?? path, module: parts.length >= 3 ? parts[2] ?? null : null });
    }
    const catalog = [...catalogMap.values()];
    const monthsMap = new Map<string, { month: string; total: number; specific: number; generic: number; withoutService: number; suspected: number }>();
    const serviceCounts = new Map<string, number>(), moduleCounts = new Map<string, number>();
    let specific = 0, genericCount = 0, withoutService = 0, suspected = 0;
    const samples: Array<{ movideskId: number; subject: string; client: string | null; owner: string | null; currentService: string; suggestedService: string | null; confidence: string | null; evidence: string[]; createdDate: Date }> = [];
    for (const ticket of tickets) {
      const key = ticket.createdDate.toISOString().slice(0, 7);
      const month = monthsMap.get(key) ?? { month: key, total: 0, specific: 0, generic: 0, withoutService: 0, suspected: 0 };
      month.total += 1;
      const path = pathOf(ticket);
      if (!path) { withoutService += 1; month.withoutService += 1; }
      else {
        const label = serviceLabel(path);
      serviceCounts.set(label, (serviceCounts.get(label) ?? 0) + 1);
        const parts = path.split("»").map((v) => v.trim()).filter(Boolean);
        const module = parts.length >= 3 ? parts[2] : null;
        if (module) moduleCounts.set(module, (moduleCounts.get(module) ?? 0) + 1);
        if (generic(path)) { genericCount += 1; month.generic += 1; } else { specific += 1; month.specific += 1; }
      }
      const suggestion = suggestSimerService({
        subject: ticket.subject, category: ticket.category, cause: ticket.cause, currentService: ticket.service,
        serviceFirstLevel: ticket.serviceFirstLevel, serviceSecondLevel: ticket.serviceSecondLevel, serviceThirdLevel: ticket.serviceThirdLevel,
      }, catalog);
      const mismatch = Boolean(path && suggestion && suggestion.confidence !== "LOW" && normalize(path) !== normalize(suggestion.path) && !normalize(suggestion.path).includes(normalize(path)));
      if (mismatch) { suspected += 1; month.suspected += 1; }
      if ((!path || generic(path) || mismatch) && samples.length < 30) samples.push({
        movideskId: ticket.movideskId, subject: ticket.subject, client: ticket.client, owner: ticket.owner,
        currentService: path || "Sem serviço", suggestedService: suggestion?.path ?? null, confidence: suggestion?.confidence ?? null,
        evidence: suggestion?.evidence ?? [], createdDate: ticket.createdDate,
      });
      monthsMap.set(key, month);
    }
    const ranking = [...serviceCounts].map(([service, count]) => ({ service, count })).sort((a,b) => b.count-a.count).slice(0,12);
    const modules = [...moduleCounts].map(([module, count]) => ({ module, count })).sort((a,b) => b.count-a.count).slice(0,12);
    const causesMap = new Map<string, number>(), categoriesMap = new Map<string, number>();
    for (const ticket of tickets) {
      const cause = ticket.cause?.trim(); const category = ticket.category?.trim();
      if (cause) causesMap.set(cause, (causesMap.get(cause) ?? 0) + 1);
      if (category) categoriesMap.set(category, (categoriesMap.get(category) ?? 0) + 1);
    }
    const causes = [...causesMap].map(([cause, count]) => ({ cause, count })).sort((a,b) => b.count-a.count).slice(0,10);
    const categories = [...categoriesMap].map(([category, count]) => ({ category, count })).sort((a,b) => b.count-a.count).slice(0,10);
    const categoryServiceMap = new Map<string,{category:string;service:string;count:number}>();
    for (const ticket of tickets) {
      const category=ticket.category?.trim()||"Sem categoria"; const service=pathOf(ticket)||"Sem serviço";
      const key=`${category}::${service}`; const current=categoryServiceMap.get(key);
      categoryServiceMap.set(key,{category,service,count:(current?.count??0)+1});
    }
    const categoryServices=[...categoryServiceMap.values()].sort((a,b)=>b.count-a.count).slice(0,60);
    const previousTotal = previousTickets.length;
    const volumeDelta = previousTotal ? Math.round(((tickets.length - previousTotal) / previousTotal) * 100) : tickets.length ? 100 : 0;
    const previousSpecific = previousTickets.filter((ticket) => {
      const path = pathOf(ticket); return Boolean(path) && !generic(path);
    }).length;
    const previousRate = previousTotal ? Math.round((previousSpecific / previousTotal) * 100) : 0;
    const currentRate = tickets.length ? Math.round((specific / tickets.length) * 100) : 0;
    const classificationDelta = currentRate - previousRate;
    return cacheSet(cacheKey, {
      periodMonths: months, total: tickets.length, specific, generic: genericCount, withoutService, suspected,
      classificationRate: currentRate,
      catalogSize: catalog.length,
      officialCatalogSize: officialServices.length,
      simerCatalogSize: officialServices.filter((item)=>/simer/i.test(officialPath(item.id))).length,
      comparison: { previousTotal, volumeDelta, previousClassificationRate: previousRate, classificationDelta },
      trend: [...monthsMap.values()].sort((a,b) => a.month.localeCompare(b.month)),
      ranking, modules, causes, categories, categoryServices, samples,
      filters: {
        clients: [...new Set(tickets.map((t) => t.client).filter((v): v is string => Boolean(v)))].sort((a,b) => a.localeCompare(b,"pt-BR")),
        analysts: [...SUPPORT_ANALYSTS],
      },
    }, 60_000);
  }

  async productivityCapacity(days = 28) {
    const requestedDays = days > 0 ? Math.min(Math.max(days, 1), 730) : 0;
    const cacheKey = `capacity:${requestedDays || "all-2026"}`;
    const cached = cacheGet<any>(cacheKey);
    if (cached) return cached;
    const now = new Date();
    const start = requestedDays
      ? new Date(now.getTime() - (requestedDays - 1) * 86400000)
      : new Date("2026-01-01T00:00:00.000Z");
    start.setHours(0, 0, 0, 0);
    const { businessDays, hoursPerDay } = productivityExpectedHours(start, now);
    const appointments = await prisma.movideskTimeAppointment.findMany({
      where: {
        date: { gte: start, lte: now },
        action: { ticket: { AND: [simerClientTicketScope(), { isDeleted: false }] } },
      },
      select: { accountedTime: true, createdByName: true },
    });
    const analysts = SUPPORT_ANALYSTS.map((analyst) => {
      const registeredHours = Number(appointments.reduce((sum, entry) => {
        if (!entry.createdByName || !sameOperationalPerson(entry.createdByName, analyst)) return sum;
        const hours = Number(entry.accountedTime ?? 0);
        return sum + (Number.isFinite(hours) && hours > 0 ? hours : 0);
      }, 0).toFixed(2));
      const expectedHours = businessDays * hoursPerDay;
      return { analyst, expectedHours, registeredHours, coverageRate: expectedHours ? Number((registeredHours/expectedHours*100).toFixed(1)) : null };
    });
    const expectedHours = analysts.reduce((sum,row)=>sum+row.expectedHours,0);
    const registeredHours = Number(analysts.reduce((sum,row)=>sum+row.registeredHours,0).toFixed(2));
    return cacheSet(cacheKey, { days: requestedDays, period:{start,end:now}, businessDays, hoursPerDay, expectedHours, registeredHours, coverageRate: expectedHours ? Number((registeredHours/expectedHours*100).toFixed(1)) : null, dataSource: "Movidesk actions.timeAppointments.accountedTime", hasRegisteredTimeData: registeredHours > 0, appointments: appointments.length, analysts }, 60_000);
  }

  async summary(_userId: number, serviceDays = 0, startDate?: string, endDate?: string) {
    const cacheKey = `summary:${serviceDays}:${startDate ?? ""}:${endDate ?? ""}`;
    const cached = cacheGet<any>(cacheKey);
    if (cached) return cached;
    const now = new Date();
    const ticketScope = ticketOperationalScope();
    const parsedStart = startDate ? new Date(`${startDate}T00:00:00.000`) : null;
    const parsedEnd = endDate ? new Date(`${endDate}T23:59:59.999`) : null;
    const serviceSince = parsedStart && !Number.isNaN(parsedStart.getTime())
      ? parsedStart
      : serviceDays > 0 ? new Date(now.getTime() - Math.min(serviceDays, 730) * 86400000) : null;
    const serviceUntil = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : now;
    const periodTicketFilter = serviceSince ? [{ createdDate: { gte: serviceSince, lte: serviceUntil } }] : [];
    const periodAzureFilter = serviceSince ? [{ azureCreatedAt: { gte: serviceSince, lte: serviceUntil } }] : [];
    const azureScope = coordinationAzureScope();

    const [
      openTickets,
      criticalTickets,
      staleTickets,
      dueSoon,
      overdueTickets,
      blockedItems,
      unassignedItems,
      ticketOwners,
      workItemOwners,
      serviceTickets,
    ] = await Promise.all([
      prisma.ticket.count({
        where: { AND: [ticketScope, coordinationTicketPriorityPredicate("backlog", now), ...periodTicketFilter] },
      }),
      prisma.ticket.count({
        where: { AND: [ticketScope, coordinationTicketPriorityPredicate("critical", now), ...periodTicketFilter] },
      }),
      prisma.ticket.count({
        where: {
          AND: [ticketScope, coordinationTicketPriorityPredicate("stale", now), ...periodTicketFilter],
        },
      }),
      prisma.ticket.count({
        where: {
          AND: [ticketScope, coordinationTicketPriorityPredicate("dueSoon", now), ...periodTicketFilter],
        },
      }),
      prisma.ticket.count({
        where: {
          AND: [ticketScope, coordinationTicketPriorityPredicate("overdue", now), ...periodTicketFilter],
        },
      }),
      prisma.azureWorkItem.count({
        where: { AND: [azureScope, coordinationAzurePriorityPredicate("blocked"), ...periodAzureFilter] },
      }),
      prisma.azureWorkItem.count({
        where: { AND: [azureScope, coordinationAzurePriorityPredicate("unassigned"), ...periodAzureFilter] },
      }),
      prisma.ticket.groupBy({
        by: ["owner"],
        where: {
          AND: [
            ticketScope,
            {
              AND: [
                coordinationOpenTicketPredicate(),
                ...periodTicketFilter,
              ],
              owner: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" },
            },
          ],
        },
        _count: { id: true },
      }),
      prisma.azureWorkItem.groupBy({
        by: ["assignedToName"],
        where: {
          AND: [
            azureScope,
            {
              AND: [
                coordinationOpenAzurePredicate(),
                ...periodAzureFilter,
              ],
              assignedToName: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" },
            },
          ],
        },
        _count: { id: true },
      }),
      prisma.ticket.findMany({
        // Qualidade de Serviço pertence à carteira da squad: basta o ticket ser
        // de um cliente da squad OU estar com um analista da squad.
        where: { AND: [
          ticketOperationalScope(),
          coordinationOpenTicketPredicate(),
          ...periodTicketFilter,
        ] },
        select: {
          id: true, subject: true, category: true, cause: true, service: true, client: true, owner: true,
          serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true,
        },
      }),
    ]);

    const workload = new Map<string, { analyst: string; tickets: number; workItems: number }>(
      SUPPORT_ANALYSTS.map((analyst) => [analyst, { analyst, tickets: 0, workItems: 0 }]),
    );

    for (const row of ticketOwners) {
      if (!row.owner) continue;
      const analyst = SUPPORT_ANALYSTS.find(
        (name) => name.localeCompare(row.owner!, "pt-BR", { sensitivity: "base" }) === 0,
      );
      if (!analyst) continue;
      workload.get(analyst)!.tickets += row._count.id;
    }

    for (const row of workItemOwners) {
      if (!row.assignedToName) continue;
      const analyst = SUPPORT_ANALYSTS.find(
        (name) => name.localeCompare(row.assignedToName!, "pt-BR", { sensitivity: "base" }) === 0,
      );
      if (!analyst) continue;
      workload.get(analyst)!.workItems += row._count.id;
    }

    const workloadRows = [...workload.values()]
      .filter((item) => item.tickets > 0 || item.workItems > 0)
      .map((item) => ({ ...item, total: item.tickets + item.workItems }))
      .sort((a, b) => b.total - a.total || a.analyst.localeCompare(b.analyst, "pt-BR"));

    const normalize = (value: string) =>
      value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
    // Para a Central da Coordenação, "Serviço" é o 2º nível do Movidesk.
    // O 1º nível é apenas agrupador e o 3º nível permanece como detalhamento.
    const servicePath = (ticket: (typeof serviceTickets)[number]) =>
      ticket.serviceSecondLevel?.trim() || "";

    const serviceCatalogMap = new Map<string, SimerServiceCatalogItem>();
    for (const item of SIMER_SERVICE_CATALOG) serviceCatalogMap.set(normalize(item.path), item);
    for (const ticket of serviceTickets) {
      const path = servicePath(ticket);
      if (!path || !/simer/i.test(path)) continue;
      const parts = path.split("»").map((value) => value.trim()).filter(Boolean);
      const name = parts.at(-1) ?? path;
      const module = parts.find((value, index) => index >= 2 && !/^(siagri simer|simer)$/i.test(value)) ?? null;
      serviceCatalogMap.set(normalize(path), { id: `observed:${normalize(path)}`, path, name, module });
    }
    const serviceCatalog = [...serviceCatalogMap.values()];
    const genericServiceLevel = (value: string) =>
      /^(atendimento ao cliente|siagri simer|simer|siagri)$/i.test(normalize(value));
    const isGenericService = (service: string) => genericServiceLevel(service);
    const serviceLabel = (service: string) => service.trim();
    let withoutService = 0;
    let genericService = 0;
    let suspectedMismatch = 0;
    const serviceCounts = new Map<string, number>();
    for (const ticket of serviceTickets) {
      const path = servicePath(ticket);
      if (!path) {
        withoutService += 1;
        continue;
      }
      serviceCounts.set(path, (serviceCounts.get(path) ?? 0) + 1);
      if (isGenericService(path)) genericService += 1;
      const suggestion = suggestSimerService({
        subject: ticket.subject,
        category: ticket.category,
        cause: ticket.cause,
        currentService: ticket.service,
        serviceFirstLevel: ticket.serviceFirstLevel,
        serviceSecondLevel: ticket.serviceSecondLevel,
        serviceThirdLevel: ticket.serviceThirdLevel,
      }, serviceCatalog);
      if (suggestion && suggestion.confidence !== "LOW") {
        const current = normalize(path);
        const suggested = normalize(suggestion.path);
        if (current !== suggested && !suggested.includes(current)) suspectedMismatch += 1;
      }
    }
    const serviceRanking = [...serviceCounts.entries()]
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count || a.service.localeCompare(b.service, "pt-BR"))
      .slice(0, 10);
    const genericRanking = serviceRanking.filter((item) => isGenericService(item.service));
    const specificRanking = serviceRanking.filter((item) => !isGenericService(item.service));
    const serviceModuleCounts = new Map<string, number>();
    const thirdLevelCounts = new Map<string, number>();
    let thirdLevelMissing = 0;
    const serviceClientIssues = new Map<string, { total: number; issues: number }>();
    const serviceAnalystIssues = new Map<string, { total: number; issues: number }>();
    for (const ticket of serviceTickets) {
      const path = servicePath(ticket);
      const module = ticket.serviceSecondLevel?.trim();
      if (module) serviceModuleCounts.set(module, (serviceModuleCounts.get(module) ?? 0) + 1);
      const thirdLevel = ticket.serviceThirdLevel?.trim();
      if (thirdLevel) thirdLevelCounts.set(thirdLevel, (thirdLevelCounts.get(thirdLevel) ?? 0) + 1);
      else thirdLevelMissing += 1;

      const suggestion = path ? suggestSimerService({
        subject: ticket.subject, category: ticket.category, cause: ticket.cause, currentService: ticket.service,
        serviceFirstLevel: ticket.serviceFirstLevel, serviceSecondLevel: ticket.serviceSecondLevel, serviceThirdLevel: ticket.serviceThirdLevel,
      }, serviceCatalog) : null;
      const mismatch = Boolean(path && suggestion && suggestion.confidence !== "LOW" && normalize(path) !== normalize(suggestion.path) && !normalize(suggestion.path).includes(normalize(path)));
      const issue = !path || isGenericService(path) || mismatch;

      if (ticket.client) {
        const row = serviceClientIssues.get(ticket.client) ?? { total: 0, issues: 0 };
        row.total += 1; if (issue) row.issues += 1; serviceClientIssues.set(ticket.client, row);
      }
      if (ticket.owner) {
        const row = serviceAnalystIssues.get(ticket.owner) ?? { total: 0, issues: 0 };
        row.total += 1; if (issue) row.issues += 1; serviceAnalystIssues.set(ticket.owner, row);
      }
    }
    const moduleRanking = [...serviceModuleCounts.entries()].map(([module, count]) => ({ module, count }))
      .sort((a, b) => b.count - a.count || a.module.localeCompare(b.module, "pt-BR")).slice(0, 10);
    const thirdLevelRanking = [...thirdLevelCounts.entries()].map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count || a.service.localeCompare(b.service, "pt-BR")).slice(0, 10);
    const thirdLevelClassified = Math.max(serviceTickets.length - thirdLevelMissing, 0);
    const thirdLevelRate = serviceTickets.length ? Math.round((thirdLevelClassified / serviceTickets.length) * 100) : 0;
    const clientQuality = [...serviceClientIssues.entries()].map(([client, row]) => ({
      client, ...row, rate: row.total ? Math.round(((row.total - row.issues) / row.total) * 100) : 0,
    })).sort((a, b) => b.issues - a.issues || b.total - a.total).slice(0, 10);
    const analystQuality = [...serviceAnalystIssues.entries()].map(([analyst, row]) => ({
      analyst, ...row, rate: row.total ? Math.round(((row.total - row.issues) / row.total) * 100) : 0,
    })).sort((a, b) => b.issues - a.issues || b.total - a.total).slice(0, 10);
    const classifiedServices = Math.max(serviceTickets.length - withoutService, 0);
    const specificServices = Math.max(classifiedServices - genericService, 0);
    const classificationRate = serviceTickets.length
      ? Math.round((specificServices / serviceTickets.length) * 100)
      : 0;

    const sortedLoads = workloadRows.map((item) => item.total).sort((a, b) => a - b);
    let medianLoad = 0;
    if (sortedLoads.length > 0) {
      const middle = Math.floor(sortedLoads.length / 2);
      if (sortedLoads.length % 2 === 1) {
        medianLoad = sortedLoads[middle] ?? 0;
      } else {
        const lower = sortedLoads[middle - 1] ?? 0;
        const upper = sortedLoads[middle] ?? 0;
        medianLoad = Math.round((lower + upper) / 2);
      }
    }
    const overloadedAnalysts = workloadRows.filter((item) =>
      medianLoad > 0 && item.total >= Math.max(medianLoad * 1.5, medianLoad + 5),
    );

    const priorities = [
      {
        key: "overdue",
        kind: "overdue",
        severity: "critical",
        title: "Prazos vencidos",
        count: overdueTickets,
        description: "Atendimentos abertos cujo prazo já foi ultrapassado.",
        action: "Atuar primeiro nos itens vencidos e validar impedimentos.",
      },
      {
        key: "critical",
        kind: "critical",
        severity: "critical",
        title: "Atendimentos críticos",
        count: criticalTickets,
        description: "Itens críticos ainda em aberto no escopo da operação.",
        action: "Confirmar responsável, próximo passo e comunicação com o cliente.",
      },
      {
        key: "blocked",
        kind: "blocked",
        severity: "high",
        title: "Tarefas bloqueadas",
        count: blockedItems,
        description: "Work Items Azure com bloqueio de processo identificado.",
        action: "Remover impedimentos ou escalar o bloqueio para a área responsável.",
      },
      {
        key: "stale",
        kind: "stale",
        severity: "high",
        title: "Sem movimento há 72h",
        count: staleTickets,
        description: "Atendimentos sem atualização recente que podem estar perdendo tração.",
        action: "Revisar pendência, registrar avanço ou atualizar a expectativa.",
      },
      {
        key: "dueSoon",
        kind: "dueSoon",
        severity: "medium",
        title: "Prazos nos próximos 7 dias",
        count: dueSoon,
        description: "Itens que entrarão em zona de vencimento na próxima semana.",
        action: "Antecipar validações e dependências antes do vencimento.",
      },
      {
        key: "unassigned",
        kind: "unassigned",
        severity: "medium",
        title: "Itens sem responsável",
        count: unassignedItems,
        description: "Work Items Azure sem responsável identificado.",
        action: "Definir ownership para evitar itens órfãos na operação.",
      },
    ].filter((item) => item.count > 0);


    return cacheSet(cacheKey, {
      generatedAt: now,
      indicators: {
        openTickets,
        criticalTickets,
        staleTickets,
        dueSoon,
        overdueTickets,
        blockedItems,
        unassignedItems,
      },
      workload: workloadRows,
      serviceAnalytics: {
        totalOpenTickets: serviceTickets.length,
        classifiedServices,
        specificServices,
        withoutService,
        genericService,
        suspectedMismatch,
        classificationRate,
        catalogSize: serviceCatalog.length,
        periodDays: serviceDays,
        ranking: specificRanking,
        genericRanking,
        moduleRanking,
        thirdLevel: { classified: thirdLevelClassified, missing: thirdLevelMissing, rate: thirdLevelRate, ranking: thirdLevelRanking },
        clientQuality,
        analystQuality,
      },
      intelligence: {
        priorities,
        medianLoad,
        overloadedAnalysts,
        health: priorities.some((item) => item.severity === "critical")
          ? "critical"
          : priorities.some((item) => item.severity === "high")
            ? "attention"
            : "stable",
      },
      scope: {
        coordinator: SUPPORT_COORDINATOR,
        analysts: [...SUPPORT_ANALYSTS],
        clients: [...SIMER_CLIENTS],
      }
    }, 30_000);
  }
}

export const coordinationService = new CoordinationService();
