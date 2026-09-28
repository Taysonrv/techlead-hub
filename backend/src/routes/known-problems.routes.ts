import { Router } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { prisma } from "../database/prisma";

export const knownProblemRoutes = Router();

const clean = (value: unknown, max = 4000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const optional = (value: unknown, max = 1000) => clean(value, max) || null;
const allowedStatus = new Set(["ATIVO","INVESTIGANDO","CORRECAO_ANDAMENTO","RESOLVIDO"]);
const allowedSeverity = new Set(["BAIXA","MEDIA","ALTA","CRITICA"]);

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


knownProblemRoutes.get("/sources", async (req: AuthenticatedRequest,res) => {
  try {
    const q=clean(req.query.q,120); if(q.length<2) return res.json({tickets:[],workItems:[]});
    // Busca contextual: cada termo digitado pode aparecer em qualquer uma das dimensões
    // pesquisáveis. Assim "coap fixacao saldo", por exemplo, não precisa existir como
    // uma frase exata em um único campo para localizar o atendimento ou Work Item.
    const terms=[...new Set(q.split(/\\s+/).map(term=>term.trim()).filter(term=>term.length>=2))].slice(0,8);
    const ticketWhere:any={isDeleted:false,AND:terms.map(term=>{
      const numeric=Number(term.replace(/\\D/g,""));
      return {OR:[
        ...(Number.isFinite(numeric)&&numeric>0?[{movideskId:numeric},{taskNumber:numeric}]:[]),
        {subject:{contains:term,mode:"insensitive"}},{client:{contains:term,mode:"insensitive"}},
        {category:{contains:term,mode:"insensitive"}},{cause:{contains:term,mode:"insensitive"}},
        {serviceFirstLevel:{contains:term,mode:"insensitive"}},{serviceSecondLevel:{contains:term,mode:"insensitive"}},{serviceThirdLevel:{contains:term,mode:"insensitive"}},
        {taskType:{contains:term,mode:"insensitive"}},{registeredVersion:{contains:term,mode:"insensitive"}},{deliveredVersion:{contains:term,mode:"insensitive"}}
      ]};
    })};
    const workItemWhere:any={AND:terms.map(term=>{
      const numeric=Number(term.replace(/\\D/g,""));
      return {OR:[
        ...(Number.isFinite(numeric)&&numeric>0?[{id:numeric},{movideskTicket:numeric}]:[]),
        {title:{contains:term,mode:"insensitive"}},{client:{contains:term,mode:"insensitive"}},
        {module:{contains:term,mode:"insensitive"}},{process:{contains:term,mode:"insensitive"}},
        {workItemType:{contains:term,mode:"insensitive"}},{state:{contains:term,mode:"insensitive"}},
        {registeredVersion:{contains:term,mode:"insensitive"}},{deliveredVersion:{contains:term,mode:"insensitive"}},
        {description:{contains:term,mode:"insensitive"}},{workaround:{contains:term,mode:"insensitive"}}
      ]};
    })};
    const [tickets,workItems]=await Promise.all([
      prisma.ticket.findMany({
        where:ticketWhere,orderBy:{lastUpdate:"desc"},take:16,
        select:{movideskId:true,subject:true,client:true,category:true,cause:true,serviceFirstLevel:true,serviceSecondLevel:true,serviceThirdLevel:true,taskNumber:true,taskType:true,registeredVersion:true,deliveredVersion:true,causeDetail:true,taskUrl:true}
      }),
      prisma.azureWorkItem.findMany({
        where:workItemWhere,orderBy:{azureChangedAt:"desc"},take:16,
        select:{id:true,workItemType:true,title:true,state:true,reason:true,client:true,criticality:true,module:true,process:true,movideskTicket:true,deliveredVersion:true,registeredVersion:true,workaround:true,description:true,technicalSolution:true,remoteUrl:true}
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
