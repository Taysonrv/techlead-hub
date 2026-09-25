import { prisma } from "../database/prisma";
import { SIMER_CLIENTS, SUPPORT_ANALYSTS, SUPPORT_COORDINATOR, coordinationAzureScope, ticketOperationalScope } from "../domain/OperationalScope";
import { microsoftKnowledgeService } from "./MicrosoftKnowledgeService";
import { SIMER_SERVICE_CATALOG, suggestSimerService, type SimerServiceCatalogItem } from "../domain/SimerServiceCatalog";
import { extractMovideskTimeEntries } from "./MovideskPayloadAnalytics";

const OPEN_TICKET_STATES = ["New", "InAttendance", "Stopped"];
const CLOSED_WORK_ITEM_STATES = ["Closed", "Resolved", "Concluído", "Concluido", "Done", "Removed"];

export class CoordinationService {
  async details(kind: string, analyst?: string, limit = 50, serviceModule?: string, serviceClient?: string, serviceName?: string, serviceDays = 0) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 72 * 60 * 60 * 1_000);
    const nextSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const serviceSince = serviceDays > 0 ? new Date(now.getTime() - Math.min(serviceDays, 730) * 86400000) : null;
    const ticketScope = ticketOperationalScope();
    const azureScope = coordinationAzureScope();

    const ticketExtra: Record<string, unknown> =
      kind === "critical" ? { urgency: "Crítica" } :
      kind === "stale" ? { OR: [{ lastUpdate: { lt: staleBefore } }, { lastUpdate: null }] } :
      kind === "dueSoon" ? { dueDate: { gte: now, lte: nextSevenDays }, NOT: { baseStatus: "Stopped" } } :
      kind === "overdue" ? { dueDate: { lt: now }, NOT: { baseStatus: "Stopped" } } :
      {};

    const azureExtra: Record<string, unknown> =
      kind === "blocked" ? { blockedProcess: true } :
      kind === "unassigned" ? { assignedToName: null } :
      {};

    const wantsTickets = ["backlog", "critical", "stale", "dueSoon", "overdue", "analyst", "service", "serviceModule", "serviceClient", "serviceAnalyst"].includes(kind);
    const wantsAzure = ["blocked", "unassigned", "analyst"].includes(kind);

    const [tickets, workItems] = await Promise.all([
      wantsTickets
        ? prisma.ticket.findMany({
            where: {
              AND: [
                ticketScope,
                { isDeleted: false, baseStatus: { in: OPEN_TICKET_STATES } },
                ticketExtra,
                ...(analyst ? [{ owner: { equals: analyst, mode: "insensitive" as const } }] : []),
                ...(serviceClient ? [{ client: { equals: serviceClient, mode: "insensitive" as const } }] : []),
                ...(serviceSince && ["service","serviceModule","serviceClient","serviceAnalyst"].includes(kind) ? [{ createdDate: { gte: serviceSince } }] : []),
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
            take: safeLimit,
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
                { state: { notIn: CLOSED_WORK_ITEM_STATES } },
                azureExtra,
                ...(analyst ? [{ createdByName: { equals: analyst, mode: "insensitive" as const } }] : []),
              ],
            },
            orderBy: [{ azureChangedAt: "asc" }],
            take: safeLimit,
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
      [ticket.serviceFirstLevel, ticket.serviceSecondLevel, ticket.serviceThirdLevel].map((v) => v?.trim()).filter(Boolean).join(" » ") || ticket.service?.trim() || "";
    const filteredTickets = serviceName
      ? tickets.filter((ticket) => normalizeService(ticketServicePath(ticket)) === normalizeService(serviceName))
      : tickets;

    return {
      kind,
      analyst: analyst ?? null,
      serviceModule: serviceModule ?? null,
      serviceClient: serviceClient ?? null,
      serviceName: serviceName ?? null,
      total: filteredTickets.length + workItems.length,
      truncated: filteredTickets.length === safeLimit || workItems.length === safeLimit,
      tickets: filteredTickets,
      workItems,
    };
  }

  async slaDevelopmentFlow(days = 180) {
    const since = new Date(Date.now() - Math.min(Math.max(days, 30), 730) * 86400000);
    const norm=(v?:string|null)=>(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
    const tickets = await prisma.ticket.findMany({
      where: { AND: [{ isDeleted: false, createdDate: { gte: since } }, { OR: [
        { client: { in: [...SIMER_CLIENTS], mode: "insensitive" } },
        { owner: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" } },
      ] }] },
      select: { movideskId:true, subject:true, category:true, client:true, owner:true, urgency:true, createdDate:true, taskNumber:true, taskStatus:true, taskTitle:true, taskType:true, solutionSlaIndicator:true }
    });
    const bugTickets=tickets.filter(t=> {
      const category = norm(t.category);
      const taskType = norm(t.taskType);
      // O Movidesk pode classificar o atendimento como "Problema - Bug",
      // enquanto o vínculo de desenvolvimento identifica explicitamente o tipo da Task.
      return category === "bug" || category.includes("bug") || taskType === "bug";
    });
    const ids=[...new Set(bugTickets.map(t=>t.taskNumber).filter((x):x is number=>Boolean(x)))];
    const movideskIds=bugTickets.map(t=>t.movideskId);
    const items=await prisma.azureWorkItem.findMany({
      where:{OR:[...(ids.length?[{id:{in:ids}}]:[]),...(movideskIds.length?[{movideskTicket:{in:movideskIds}}]:[])]},
      select:{id:true,state:true,azureCreatedAt:true,stateChangedAt:true,azureChangedAt:true,azureClosedAt:true,title:true,movideskTicket:true,criticality:true}
    });
    const byId=new Map(items.map(x=>[x.id,x]));
    const byTicket=new Map(items.filter(x=>x.movideskTicket).map(x=>[x.movideskTicket!,x]));
    const businessMinutes=(a:Date,b:Date)=>{if(b<=a)return 0;let total=0,c=new Date(a);c.setHours(0,0,0,0);while(c<=b){const d=c.getDay();if(d>=1&&d<=5){const x=new Date(c);x.setHours(8,0,0,0);const y=new Date(c);y.setHours(18,0,0,0);total+=Math.max(0,(Math.min(y.getTime(),b.getTime())-Math.max(x.getTime(),a.getTime()))/60000)}c.setDate(c.getDate()+1)}return Math.round(total)};
    const targets:any={P1:{support:660,factory:480,total:1140},P2:{support:1320,factory:3360,total:4680},P3:{support:1980,factory:9600,total:11580},P4:{support:2640,factory:21600,total:24240}};
    const urgency=(v?:string|null)=>{const n=norm(v);if(n.includes("critica")||n==="p1")return"P1";if(n.includes("alta")||n==="p2")return"P2";if(n.includes("media")||n==="p3")return"P3";if(n.includes("baixa")||n==="p4")return"P4";return null};
    let missingAzure=0,missingTaskCreatedAt=0,missingPriority=0;
    const rows=bugTickets.flatMap(t=>{const w=(t.taskNumber?byId.get(t.taskNumber):undefined)??byTicket.get(t.movideskId);if(!w){missingAzure++;return[]}if(!w.azureCreatedAt){missingTaskCreatedAt++;return[]}const p=urgency(t.urgency) ?? urgency(w.criticality);if(!p){missingPriority++;return[]}const concluded=norm(w.state)==="concluida"||norm(w.state)==="concluido"||norm(t.taskStatus)==="concluida"||norm(t.taskStatus)==="concluido";// Para o estado atual Concluída, stateChangedAt representa a transição que encerrou a Task.
      // azureClosedAt fica como fallback porque pode refletir outro marco de fechamento do Work Item.
      const end=concluded?(w.stateChangedAt??w.azureClosedAt??w.azureChangedAt):null;const support=businessMinutes(t.createdDate,w.azureCreatedAt);const factory=end?businessMinutes(w.azureCreatedAt,end):null;const total=factory===null?null:support+factory;const tg=targets[p];const supportPct=Math.round(support/tg.support*1000)/10;const factoryPct=factory===null?null:Math.round(factory/tg.factory*1000)/10;const totalPct=total===null?null:Math.round(total/tg.total*1000)/10;const bottleneck=factoryPct!==null&&factoryPct>supportPct?"Fábrica":"Suporte";return[{movideskId:t.movideskId,subject:t.subject,client:t.client,owner:t.owner??"Sem responsável",taskNumber:w.id,taskTitle:w.title??t.taskTitle,taskState:w.state??t.taskStatus,urgency:p,taskCreatedAt:w.azureCreatedAt,taskConcludedAt:end,supportMinutes:support,factoryMinutes:factory,totalMinutes:total,supportTargetMinutes:tg.support,factoryTargetMinutes:tg.factory,totalTargetMinutes:tg.total,supportPct,factoryPct,totalPct,bottleneck,officialSla:t.solutionSlaIndicator}]} );
    const done=rows.filter(r=>r.taskConcludedAt);
    const avg=(xs:number[])=>xs.length?Math.round(xs.reduce((a,b)=>a+b,0)/xs.length):0;
    const summarize=(group:any[])=>{const completed=group.filter(r=>r.taskConcludedAt);return{total:group.length,concluded:completed.length,openDevelopment:group.length-completed.length,avgSupportMinutes:avg(group.map(r=>r.supportMinutes)),avgFactoryMinutes:avg(completed.map(r=>r.factoryMinutes!)),avgTotalMinutes:avg(completed.map(r=>r.totalMinutes!)),supportWithinOla:group.filter(r=>r.supportPct<=100).length,factoryWithinOla:completed.filter(r=>(r.factoryPct??Infinity)<=100).length,totalWithinSla:completed.filter(r=>(r.totalPct??Infinity)<=100).length,supportBottleneck:group.filter(r=>r.bottleneck==="Suporte").length,factoryBottleneck:completed.filter(r=>r.bottleneck==="Fábrica").length}};
    const byPriority=["P1","P2","P3","P4"].map(priority=>({priority,...summarize(rows.filter(r=>r.urgency===priority)),rows:rows.filter(r=>r.urgency===priority).map(r=>r.movideskId)}));
    const owners=[...new Set(rows.map(r=>r.owner))].map(owner=>({owner,...summarize(rows.filter(r=>r.owner===owner)),rows:rows.filter(r=>r.owner===owner).map(r=>r.movideskId)})).sort((a,b)=>b.total-a.total);
    const monthKey=(date:Date)=>date.toISOString().slice(0,7);
    const monthLabel=(key:string)=>{const [year,month]=key.split("-");return new Intl.DateTimeFormat("pt-BR",{month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(Date.UTC(Number(year),Number(month)-1,1))).replace(".","");};
    const monthly=[...new Set(rows.map(r=>monthKey(r.taskCreatedAt)))].sort().map(month=>{const group=rows.filter(r=>monthKey(r.taskCreatedAt)===month);const completed=group.filter(r=>r.taskConcludedAt);return{month,label:monthLabel(month),total:group.length,concluded:completed.length,avgSupportMinutes:avg(group.map(r=>r.supportMinutes)),avgFactoryMinutes:avg(completed.map(r=>r.factoryMinutes!)),avgTotalMinutes:avg(completed.map(r=>r.totalMinutes!)),supportWithinPct:group.length?Math.round(group.filter(r=>r.supportPct<=100).length/group.length*1000)/10:0,factoryWithinPct:completed.length?Math.round(completed.filter(r=>(r.factoryPct??Infinity)<=100).length/completed.length*1000)/10:0,totalWithinPct:completed.length?Math.round(completed.filter(r=>(r.totalPct??Infinity)<=100).length/completed.length*1000)/10:0}});
    return { periodDays: days, rule:{taskEndState:"Concluida",schedule:"Seg-Sex 08:00-18:00",profile:"PADRAO"}, dataQuality:{bugsInPeriod:bugTickets.length,linked:rows.length,missingAzure,missingTaskCreatedAt,missingPriority}, summary:{bugsWithTask:rows.length,concluded:done.length,openDevelopment:rows.length-done.length,avgSupportMinutes:avg(rows.map(r=>r.supportMinutes)),avgFactoryMinutes:avg(done.map(r=>r.factoryMinutes!)),avgTotalMinutes:avg(done.map(r=>r.totalMinutes!)),supportWithinOla:rows.filter(r=>r.supportPct<=100).length,factoryWithinOla:done.filter(r=>(r.factoryPct??Infinity)<=100).length,totalWithinSla:done.filter(r=>(r.totalPct??Infinity)<=100).length}, byPriority, owners, monthly, rows };
  }

  async serviceIntelligence(filters: { client?: string; analyst?: string; months?: number } = {}) {
    const months = Math.min(Math.max(filters.months ?? 6, 3), 12);
    const since = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1); since.setHours(0, 0, 0, 0);
    const previousSince = new Date(since);
    previousSince.setMonth(previousSince.getMonth() - months);
    const scope = ticketOperationalScope();
    const allTickets = await prisma.ticket.findMany({
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
    });
    const tickets = allTickets.filter((ticket) => ticket.createdDate >= since);
    const previousTickets = allTickets.filter((ticket) => ticket.createdDate >= previousSince && ticket.createdDate < since);
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
    const pathOf = (ticket: (typeof tickets)[number]) =>
      [ticket.serviceFirstLevel, ticket.serviceSecondLevel, ticket.serviceThirdLevel].map((v) => v?.trim()).filter((v): v is string => Boolean(v)).join(" » ") || ticket.service?.trim() || "";
    const generic = (path: string) => {
      const values = path.split("»").map(normalize).filter(Boolean);
      return values.some((v) => v.includes("simer")) && values.filter((v) => !/^(atendimento ao cliente|siagri simer|simer|siagri)$/.test(v)).length === 0;
    };
    const catalogMap = new Map<string, SimerServiceCatalogItem>();
    for (const item of SIMER_SERVICE_CATALOG) catalogMap.set(normalize(item.path), item);
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
        serviceCounts.set(path, (serviceCounts.get(path) ?? 0) + 1);
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
    const previousTotal = previousTickets.length;
    const volumeDelta = previousTotal ? Math.round(((tickets.length - previousTotal) / previousTotal) * 100) : tickets.length ? 100 : 0;
    const previousSpecific = previousTickets.filter((ticket) => {
      const path = pathOf(ticket); return Boolean(path) && !generic(path);
    }).length;
    const previousRate = previousTotal ? Math.round((previousSpecific / previousTotal) * 100) : 0;
    const currentRate = tickets.length ? Math.round((specific / tickets.length) * 100) : 0;
    const classificationDelta = currentRate - previousRate;
    return {
      periodMonths: months, total: tickets.length, specific, generic: genericCount, withoutService, suspected,
      classificationRate: currentRate,
      catalogSize: catalog.length,
      comparison: { previousTotal, volumeDelta, previousClassificationRate: previousRate, classificationDelta },
      trend: [...monthsMap.values()].sort((a,b) => a.month.localeCompare(b.month)),
      ranking, modules, causes, categories, samples,
      filters: {
        clients: [...new Set(tickets.map((t) => t.client).filter((v): v is string => Boolean(v)))].sort((a,b) => a.localeCompare(b,"pt-BR")),
        analysts: [...SUPPORT_ANALYSTS],
      },
    };
  }

  async productivityCapacity(days = 28) {
    const now = new Date();
    const start = new Date(now.getTime() - (Math.min(Math.max(days, 7), 90) - 1) * 86400000);
    start.setHours(0, 0, 0, 0);
    const holidays = new Set((process.env.PRODUCTIVITY_HOLIDAYS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
    const hoursPerDay = Math.min(Math.max(Number(process.env.PRODUCTIVITY_HOURS_PER_DAY ?? 8) || 8, 1), 24);
    const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
    const isBusiness = (value: Date) => value.getDay() !== 0 && value.getDay() !== 6 && !holidays.has(dateKey(value));
    let businessDays = 0; for (const day = new Date(start); day <= now; day.setDate(day.getDate()+1)) if (isBusiness(day)) businessDays += 1;
    const tickets = await prisma.ticket.findMany({
      where: { AND: [ticketOperationalScope(), { isDeleted: false }, { owner: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" } }] },
      select: { owner: true, rawData: true },
    });
    const same = (a: string | null, b: string) => Boolean(a && a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0);
    const analysts = SUPPORT_ANALYSTS.map((analyst) => {
      let minutes = 0;
      for (const ticket of tickets) for (const entry of extractMovideskTimeEntries(ticket.rawData)) {
        if (entry.date) { const date = new Date(entry.date); if (date < start || date > now) continue; }
        if (entry.analyst ? same(entry.analyst, analyst) : same(ticket.owner, analyst)) minutes += entry.minutes;
      }
      const expectedHours = businessDays * hoursPerDay, registeredHours = Number((minutes/60).toFixed(2));
      return { analyst, expectedHours, registeredHours, coverageRate: expectedHours ? Number((registeredHours/expectedHours*100).toFixed(1)) : null };
    });
    const expectedHours = analysts.reduce((sum,row)=>sum+row.expectedHours,0);
    const registeredHours = Number(analysts.reduce((sum,row)=>sum+row.registeredHours,0).toFixed(2));
    return { days, businessDays, hoursPerDay, expectedHours, registeredHours, coverageRate: expectedHours ? Number((registeredHours/expectedHours*100).toFixed(1)) : null, analysts };
  }

  async summary(userId: number, serviceDays = 0) {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 72 * 60 * 60 * 1_000);
    const nextSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);

    const ticketScope = ticketOperationalScope();
    const serviceSince = serviceDays > 0 ? new Date(now.getTime() - Math.min(serviceDays, 730) * 86400000) : null;
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
        where: { AND: [ticketScope, { isDeleted: false, baseStatus: { in: OPEN_TICKET_STATES } }] },
      }),
      prisma.ticket.count({
        where: { AND: [ticketScope, { isDeleted: false, urgency: "Crítica", baseStatus: { in: OPEN_TICKET_STATES } }] },
      }),
      prisma.ticket.count({
        where: {
          AND: [
            ticketScope,
            {
              isDeleted: false,
              baseStatus: { in: OPEN_TICKET_STATES },
              OR: [{ lastUpdate: { lt: staleBefore } }, { lastUpdate: null }],
            },
          ],
        },
      }),
      prisma.ticket.count({
        where: {
          AND: [
            ticketScope,
            {
              isDeleted: false,
              baseStatus: { in: OPEN_TICKET_STATES },
              dueDate: { gte: now, lte: nextSevenDays },
            },
          ],
        },
      }),
      prisma.ticket.count({
        where: {
          AND: [
            ticketScope,
            {
              isDeleted: false,
              baseStatus: { in: OPEN_TICKET_STATES },
              dueDate: { lt: now },
            },
          ],
        },
      }),
      prisma.azureWorkItem.count({
        where: { AND: [azureScope, { blockedProcess: true, state: { notIn: CLOSED_WORK_ITEM_STATES } }] },
      }),
      prisma.azureWorkItem.count({
        where: { AND: [azureScope, { assignedToName: null, state: { notIn: CLOSED_WORK_ITEM_STATES } }] },
      }),
      prisma.ticket.groupBy({
        by: ["owner"],
        where: {
          AND: [
            ticketScope,
            {
              isDeleted: false,
              baseStatus: { in: OPEN_TICKET_STATES },
              owner: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" },
            },
          ],
        },
        _count: { id: true },
      }),
      prisma.azureWorkItem.groupBy({
        by: ["createdByName"],
        where: {
          AND: [
            azureScope,
            {
              state: { notIn: CLOSED_WORK_ITEM_STATES },
              createdByName: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" },
            },
          ],
        },
        _count: { id: true },
      }),
      prisma.ticket.findMany({
        // Qualidade de Serviço pertence à carteira da squad: basta o ticket ser
        // de um cliente da squad OU estar com um analista da squad.
        where: { AND: [
          { isDeleted: false, baseStatus: { in: OPEN_TICKET_STATES } },
          ...(serviceSince ? [{ createdDate: { gte: serviceSince } }] : []),
          { OR: [
            { client: { in: [...SIMER_CLIENTS], mode: "insensitive" } },
            { owner: { in: [...SUPPORT_ANALYSTS], mode: "insensitive" } },
          ] },
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
      if (!row.createdByName) continue;
      const analyst = SUPPORT_ANALYSTS.find(
        (name) => name.localeCompare(row.createdByName!, "pt-BR", { sensitivity: "base" }) === 0,
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
    const servicePath = (ticket: (typeof serviceTickets)[number]) =>
      [ticket.serviceFirstLevel, ticket.serviceSecondLevel, ticket.serviceThirdLevel]
        .map((value) => value?.trim()).filter((value): value is string => Boolean(value))
        .join(" » ") || ticket.service?.trim() || "";

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
    const isGenericService = (path: string) => {
      const values = path.split("»").map((value) => normalize(value)).filter(Boolean);
      if (!values.some((value) => value.includes("simer"))) return false;
      return values.filter((value) => !/^(atendimento ao cliente|siagri simer|simer|siagri)$/.test(value)).length === 0;
    };
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
    const serviceClientIssues = new Map<string, { total: number; issues: number }>();
    const serviceAnalystIssues = new Map<string, { total: number; issues: number }>();
    for (const ticket of serviceTickets) {
      const path = servicePath(ticket);
      const parts = path.split("»").map((value) => value.trim()).filter(Boolean);
      const module = parts.find((value, index) => index >= 2 && !/^(siagri simer|simer)$/i.test(value));
      if (module) serviceModuleCounts.set(module, (serviceModuleCounts.get(module) ?? 0) + 1);

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

    const microsoft = await microsoftKnowledgeService
      .coordinationSnapshot(userId)
      .catch(() => ({
        connected: false,
        plannerTasks: [],
        events: [],
        teams: [],
        warnings: ["Microsoft 365 temporariamente indisponível."],
      }));

    return {
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
      },
      integrations: {
        planner: {
          configured: Boolean(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID),
          connected: microsoft.connected,
          items: microsoft.plannerTasks.length,
        },
        outlook: {
          configured: Boolean(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID),
          connected: microsoft.connected,
          items: microsoft.events.length,
        },
        teams: {
          configured: Boolean(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID),
          connected: microsoft.connected,
          items: microsoft.teams.length,
        },
      },
      microsoft,
    };
  }
}

export const coordinationService = new CoordinationService();
