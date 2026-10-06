import { Router } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { prisma } from "../database/prisma";
import { requirePermission } from "../middlewares/roleMiddleware";
import { ticketOperationalScope, azureOperationalScope } from "../domain/OperationalScope";

export const knownProblemRoutes = Router();
knownProblemRoutes.use(requirePermission("known-problems"));

const clean = (value: unknown, max = 4000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const optional = (value: unknown, max = 1000) => clean(value, max) || null;
const allowedStatus = new Set(["ATIVO","INVESTIGANDO","CORRECAO_ANDAMENTO","RESOLVIDO"]);
const allowedSeverity = new Set(["BAIXA","MEDIA","ALTA","CRITICA"]);
const knownProblemTicketScope = () => ticketOperationalScope();



async function list(req: AuthenticatedRequest) {
  const q = clean(req.query.q, 200).toLocaleLowerCase("pt-BR");
  const status = clean(req.query.status, 40);
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT kp.*, u."name" AS "updatedByName",
      (SELECT COUNT(*)::int FROM "KnownProblemRead" r WHERE r."problemId"=kp."id") AS "readCount"
    FROM "KnownProblem" kp
    LEFT JOIN "User" u ON u."id"=kp."updatedById"
    WHERE kp."archived"=FALSE
    ORDER BY kp."pinned" DESC,
      CASE kp."severity" WHEN 'CRITICA' THEN 4 WHEN 'ALTA' THEN 3 WHEN 'MEDIA' THEN 2 ELSE 1 END DESC,
      kp."updatedAt" DESC
  `);
  return rows.filter((row) => {
    if (status && row.status !== status) return false;
    if (!q) return true;
    return [row.title,row.symptom,row.solution,row.service,row.client,row.movideskTicket,row.azureWorkItem,row.tags]
      .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(q);
  });
}

knownProblemRoutes.get("/", async (req: AuthenticatedRequest,res) => {
  try {
    const items=await list(req);
    const userId=req.auth!.userId;
    const unread=await prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*)::int AS total FROM "KnownProblem" kp
      WHERE kp."archived"=FALSE AND NOT EXISTS
      (SELECT 1 FROM "KnownProblemRead" r WHERE r."problemId"=kp."id" AND r."userId"=$1 AND r."readAt">=kp."updatedAt")
    `,userId);
    res.json({items,unread:Number(unread[0]?.total??0),serverTime:new Date().toISOString()});
  } catch(error){console.error("[known-problems] list",error);res.status(500).json({error:"Não foi possível carregar os problemas conhecidos."});}
});


knownProblemRoutes.get("/candidates", async (_req: AuthenticatedRequest,res) => {
  try {
    const since=new Date(); since.setDate(since.getDate()-180);
    const tickets=await prisma.ticket.findMany({
      where:{AND:[knownProblemTicketScope(),{isDeleted:false,createdDate:{gte:since}}]},
      select:{movideskId:true,subject:true,client:true,category:true,cause:true,causeDetail:true,reason:true,service:true,serviceFirstLevel:true,serviceSecondLevel:true,serviceThirdLevel:true,taskNumber:true,deliveredVersion:true,registeredVersion:true,createdDate:true},
      orderBy:{createdDate:"desc"},take:3000
    });
    const norm=(v?:string|null)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
    const words=(v?:string|null)=>[...new Set(norm(v).split(/[^a-z0-9]+/).filter(x=>x.length>=4&&!["para","como","erro","problema","ticket","simer","cliente","nao","com","sem"].includes(x)))];
    const service=(t:any)=>t.serviceThirdLevel||t.serviceSecondLevel||t.serviceFirstLevel||t.service||"Sem serviço";
    type Group={service:string;category:string;cause:string;version:string;cases:number;clients:Set<string>;tickets:number[];subjects:string[];tasks:Set<number>;dates:Date[];tokens:Map<string,number>};
    const groups=new Map<string,Group>();
    tickets.forEach(t=>{
      const svc=service(t),cat=t.category||"Sem categoria",cause=t.causeDetail||t.cause||t.reason||"Sem causa",ver=t.deliveredVersion||t.registeredVersion||"Sem versão";
      const subjectTokens=words(t.subject);
      // Service/category/cause form the stable operational signature. Subject tokens
      // are accumulated to explain the recurrence without making wording differences
      // split the same incident family.
      const key=[norm(svc),norm(cat),norm(cause)].join("|");
      const g: Group=groups.get(key)??{service:svc,category:cat,cause,version:ver,cases:0,clients:new Set<string>(),tickets:[] as number[],subjects:[] as string[],tasks:new Set<number>(),dates:[] as Date[],tokens:new Map<string,number>()};
      g.cases++; if(t.client)g.clients.add(t.client); g.tickets.push(t.movideskId); if(t.subject)g.subjects.push(t.subject); if(t.taskNumber)g.tasks.add(t.taskNumber); g.dates.push(t.createdDate);
      subjectTokens.forEach(token=>g.tokens.set(token,(g.tokens.get(token)??0)+1)); groups.set(key,g);
    });
    const existing=await prisma.$queryRawUnsafe<any[]>(`SELECT "service","version","movideskTicket","azureWorkItem" FROM "KnownProblem" WHERE "archived"=FALSE`);
    const now=Date.now();
    const candidates=[...groups.values()].filter(g=>g.cases>=3).map(g=>{
      const covered=existing.some(k=>(k.service&&norm(k.service)===norm(g.service)&&(!k.version||k.version===g.version))||g.tickets.includes(Number(k.movideskTicket))||[...g.tasks].includes(Number(k.azureWorkItem)));
      const recent30=g.dates.filter(d=>now-d.getTime()<=30*86400000).length;
      const previous30=g.dates.filter(d=>{const age=now-d.getTime();return age>30*86400000&&age<=60*86400000}).length;
      const trendPct=previous30>0?Math.round(((recent30-previous30)/previous30)*100):recent30>0?100:0;
      const topTerms=[...g.tokens.entries()].filter(([,count])=>count>=Math.max(2,Math.ceil(g.cases*.3))).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([term])=>term);
      const linkedTasks=[...g.tasks];
      const score=Math.min(100,Math.round(g.cases*8+g.clients.size*10+Math.min(20,recent30*4)+Math.min(15,linkedTasks.length*5)+(trendPct>0?10:0)));
      return {service:g.service,category:g.category,cause:g.cause,version:g.version,cases:g.cases,clients:g.clients.size,tickets:g.tickets.slice(0,12),tasks:linkedTasks.slice(0,8),sampleSubjects:g.subjects.slice(0,3),covered,priority:score>=70?"high":score>=48?"medium":"review",score,recent30,previous30,trendPct,topTerms,linkedTaskCount:linkedTasks.length};
    }).filter(x=>!x.covered).sort((a,b)=>b.score-a.score||b.clients-a.clients||b.cases-a.cases).slice(0,24);
    const anomalies=candidates.filter(x=>x.recent30>=3&&(x.trendPct>=50||x.score>=75)).map(x=>({
      service:x.service,category:x.category,cause:x.cause,cases:x.cases,recent30:x.recent30,previous30:x.previous30,
      trendPct:x.trendPct,score:x.score,clients:x.clients,tickets:x.tickets,
      severity:x.score>=85||x.trendPct>=150?"critical":"warning",
      reason:x.previous30===0?`Novo padrão com ${x.recent30} ocorrência(s) nos últimos 30 dias`:`Crescimento de ${x.trendPct}% contra os 30 dias anteriores`
    })).slice(0,8);
    const summary={total:candidates.length,high:candidates.filter(x=>x.priority==="high").length,rising:candidates.filter(x=>x.trendPct>0).length,multiClient:candidates.filter(x=>x.clients>=2).length,anomalies:anomalies.length};
    res.json({items:candidates,summary,anomalies,periodDays:180,generatedAt:new Date().toISOString()});
  } catch(error){console.error("[known-problems] candidates",error);res.status(500).json({error:"Não foi possível calcular candidatos a Problema Conhecido."});}
});

knownProblemRoutes.get("/sources", async (req: AuthenticatedRequest,res) => {
  try {
    const q=clean(req.query.q,120); if(q.length<2) return res.json({tickets:[],workItems:[]});
    // Busca contextual: cada termo digitado pode aparecer em qualquer uma das dimensões
    // pesquisáveis. Assim "coap fixacao saldo", por exemplo, não precisa existir como
    // uma frase exata em um único campo para localizar o atendimento ou Work Item.
    const terms=[...new Set(q.split(/\\s+/).map(term=>term.trim()).filter(term=>term.length>=2))].slice(0,8);
    const ticketWhere:any={AND:[knownProblemTicketScope(),{isDeleted:false},...terms.map(term=>{
      const numeric=Number(term.replace(/\\D/g,""));
      return {OR:[
        ...(Number.isFinite(numeric)&&numeric>0?[{movideskId:numeric},{taskNumber:numeric}]:[]),
        {subject:{contains:term,mode:"insensitive"}},{client:{contains:term,mode:"insensitive"}},
        {category:{contains:term,mode:"insensitive"}},{cause:{contains:term,mode:"insensitive"}},
        {serviceFirstLevel:{contains:term,mode:"insensitive"}},{serviceSecondLevel:{contains:term,mode:"insensitive"}},{serviceThirdLevel:{contains:term,mode:"insensitive"}},
        {taskType:{contains:term,mode:"insensitive"}},{registeredVersion:{contains:term,mode:"insensitive"}},{deliveredVersion:{contains:term,mode:"insensitive"}}
      ]};
    })]};
    const workItemWhere:any={AND:[azureOperationalScope(),...terms.map(term=>{
      const numeric=Number(term.replace(/\\D/g,""));
      return {OR:[
        ...(Number.isFinite(numeric)&&numeric>0?[{id:numeric},{movideskTicket:numeric}]:[]),
        {title:{contains:term,mode:"insensitive"}},{client:{contains:term,mode:"insensitive"}},
        {module:{contains:term,mode:"insensitive"}},{process:{contains:term,mode:"insensitive"}},
        {workItemType:{contains:term,mode:"insensitive"}},{state:{contains:term,mode:"insensitive"}},
        {registeredVersion:{contains:term,mode:"insensitive"}},{deliveredVersion:{contains:term,mode:"insensitive"}},
        {workaround:{contains:term,mode:"insensitive"}},{technicalSolution:{contains:term,mode:"insensitive"}}
      ]};
    })]};
    const [tickets,workItems]=await Promise.all([
      prisma.ticket.findMany({
        where:ticketWhere,orderBy:{lastUpdate:"desc"},take:16,
        select:{movideskId:true,subject:true,client:true,category:true,cause:true,serviceFirstLevel:true,serviceSecondLevel:true,serviceThirdLevel:true,taskNumber:true,taskType:true,registeredVersion:true,deliveredVersion:true,causeDetail:true,taskUrl:true}
      }),
      prisma.azureWorkItem.findMany({
        where:workItemWhere,orderBy:{azureChangedAt:"desc"},take:16,
        select:{id:true,workItemType:true,title:true,state:true,reason:true,client:true,criticality:true,module:true,process:true,movideskTicket:true,deliveredVersion:true,registeredVersion:true,workaround:true,technicalSolution:true,remoteUrl:true}
      })
    ]);
    res.json({tickets,workItems});
  } catch(error){console.error("[known-problems] sources",error);res.status(500).json({error:"Não foi possível pesquisar tickets e tarefas."});}
});

knownProblemRoutes.post("/", async (req: AuthenticatedRequest,res) => {
  try {
    const title=clean(req.body?.title,220), symptom=clean(req.body?.symptom), solution=clean(req.body?.solution,8000);
    if(!title||!symptom||!solution) return res.status(400).json({error:"Título, sintoma e solução são obrigatórios."});
    const duplicate=await prisma.$queryRawUnsafe<any[]>(`
      SELECT "id","title" FROM "KnownProblem" WHERE "archived"=FALSE AND (
        ($1::text IS NOT NULL AND "movideskTicket"=$1) OR
        ($2::text IS NOT NULL AND "azureWorkItem"=$2) OR
        (LOWER(TRIM("title"))=LOWER(TRIM($3)) AND COALESCE(LOWER(TRIM("service")),'')=COALESCE(LOWER(TRIM($4)),''))
      ) LIMIT 1
    `,optional(req.body?.movideskTicket,80),optional(req.body?.azureWorkItem,120),title,optional(req.body?.service,500));
    if(duplicate.length) return res.status(409).json({error:`Já existe uma publicação semelhante (#${duplicate[0].id} · ${duplicate[0].title}). Atualize o cadastro existente em vez de duplicá-lo.`});
    const status=allowedStatus.has(req.body?.status)?req.body.status:"ATIVO";
    const severity=allowedSeverity.has(req.body?.severity)?req.body.severity:"MEDIA";
    const rows=await prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "KnownProblem" ("title","symptom","solution","service","client","movideskTicket","azureWorkItem","version","status","severity","tags","pinned","cause","workaround","technicalSolution","comment","azureWorkItemType","azureUrl","createdById","updatedById")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) RETURNING *
    `,title,symptom,solution,optional(req.body?.service,500),optional(req.body?.client,300),optional(req.body?.movideskTicket,80),optional(req.body?.azureWorkItem,120),optional(req.body?.version,120),status,severity,optional(req.body?.tags,800),Boolean(req.body?.pinned),optional(req.body?.cause,8000),optional(req.body?.workaround,8000),optional(req.body?.technicalSolution,8000),optional(req.body?.comment,4000),optional(req.body?.azureWorkItemType,80),optional(req.body?.azureUrl,4000),req.auth!.userId);
    res.status(201).json(rows[0]);
  } catch(error){console.error("[known-problems] create",error);res.status(500).json({error:"Não foi possível publicar o problema conhecido."});}
});

knownProblemRoutes.put("/:id", async (req: AuthenticatedRequest,res) => {
  try {
    const id=Number(req.params.id); if(!Number.isInteger(id)) return res.status(400).json({error:"Registro inválido."});
    const title=clean(req.body?.title,220), symptom=clean(req.body?.symptom), solution=clean(req.body?.solution,8000);
    if(!title||!symptom||!solution) return res.status(400).json({error:"Título, sintoma e solução são obrigatórios."});
    const duplicate=await prisma.$queryRawUnsafe<any[]>(`
      SELECT "id","title" FROM "KnownProblem" WHERE "archived"=FALSE AND "id"<>$1 AND (
        ($2::text IS NOT NULL AND "movideskTicket"=$2) OR
        ($3::text IS NOT NULL AND "azureWorkItem"=$3) OR
        (LOWER(TRIM("title"))=LOWER(TRIM($4)) AND COALESCE(LOWER(TRIM("service")),'')=COALESCE(LOWER(TRIM($5)),''))
      ) LIMIT 1
    `,id,optional(req.body?.movideskTicket,80),optional(req.body?.azureWorkItem,120),title,optional(req.body?.service,500));
    if(duplicate.length) return res.status(409).json({error:`Já existe outra publicação semelhante (#${duplicate[0].id} · ${duplicate[0].title}).`});
    const status=allowedStatus.has(req.body?.status)?req.body.status:"ATIVO";
    const severity=allowedSeverity.has(req.body?.severity)?req.body.severity:"MEDIA";
    const rows=await prisma.$queryRawUnsafe<any[]>(`
      UPDATE "KnownProblem" SET "title"=$1,"symptom"=$2,"solution"=$3,"service"=$4,"client"=$5,
      "movideskTicket"=$6,"azureWorkItem"=$7,"version"=$8,"status"=$9,"severity"=$10,"tags"=$11,
      "pinned"=$12,"cause"=$13,"workaround"=$14,"technicalSolution"=$15,"comment"=$16,"azureWorkItemType"=$17,"azureUrl"=$18,"updatedById"=$19,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$20 AND "archived"=FALSE RETURNING *
    `,title,symptom,solution,optional(req.body?.service,500),optional(req.body?.client,300),optional(req.body?.movideskTicket,80),optional(req.body?.azureWorkItem,120),optional(req.body?.version,120),status,severity,optional(req.body?.tags,800),Boolean(req.body?.pinned),optional(req.body?.cause,8000),optional(req.body?.workaround,8000),optional(req.body?.technicalSolution,8000),optional(req.body?.comment,4000),optional(req.body?.azureWorkItemType,80),optional(req.body?.azureUrl,4000),req.auth!.userId,id);
    if(!rows.length) return res.status(404).json({error:"Problema conhecido não encontrado."}); res.json(rows[0]);
  } catch(error){console.error("[known-problems] update",error);res.status(500).json({error:"Não foi possível atualizar o problema conhecido."});}
});

knownProblemRoutes.post("/:id/read", async (req: AuthenticatedRequest,res) => {
  try { const id=Number(req.params.id); await prisma.$executeRawUnsafe(`
    INSERT INTO "KnownProblemRead" ("problemId","userId","readAt") VALUES ($1,$2,CURRENT_TIMESTAMP)
    ON CONFLICT ("problemId","userId") DO UPDATE SET "readAt"=CURRENT_TIMESTAMP
  `,id,req.auth!.userId); res.json({ok:true}); }
  catch(error){console.error("[known-problems] read",error);res.status(500).json({error:"Não foi possível confirmar a leitura."});}
});

knownProblemRoutes.delete("/:id", async (req: AuthenticatedRequest,res) => {
  try { const id=Number(req.params.id); await prisma.$executeRawUnsafe(`UPDATE "KnownProblem" SET "archived"=TRUE,"updatedById"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2`,req.auth!.userId,id); res.status(204).send(); }
  catch(error){console.error("[known-problems] archive",error);res.status(500).json({error:"Não foi possível arquivar o registro."});}
});
