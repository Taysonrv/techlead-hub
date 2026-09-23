import JSZip from "jszip";
import { prisma } from "../database/prisma";

type RuleNode={externalId:string;name:string;kind:string;documentation:string|null;lane:string|null;x:number|null;y:number|null};
type RuleTransition={externalId:string;fromId:string;toId:string;name:string|null;condition:string|null};
const decode=(v:string)=>v.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
const clean=(v:string)=>decode(v).replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
const attr=(s:string,n:string)=>{const m=s.match(new RegExp("\\b"+n+'="([^"]*)"',"i"));return m?decode(m[1]??""):null;};
function block(xml:string,tag:string){return [...xml.matchAll(new RegExp("<"+tag+"\\b[\\s\\S]*?<\\/"+tag+">","gi"))].map(x=>x[0]);}
function parseDiagram(xml:string,sourceFile:string){
 const pkg=xml.match(/<Package\b[^>]*>/i)?.[0]??"";const processName=attr(pkg,"Name")||sourceFile.replace(/.*[\\/]/,"").replace(/\.bpm$/i,"");
 const nodes:RuleNode[]=[];
 for(const a of block(xml,"Activity")){const head=a.match(/<Activity\b[^>]*>/i)?.[0]??"";const id=attr(head,"Id");if(!id)continue;const name=attr(head,"Name")||(/<StartEvent\b/i.test(a)?"Início":/<EndEvent\b/i.test(a)?"Fim":"Etapa");
  const doc=clean(a.match(/<Documentation>([\s\S]*?)<\/Documentation>/i)?.[1]??a.match(/<Description>([\s\S]*?)<\/Description>/i)?.[1]??"");
  const kind=/<Route\b/i.test(a)?"gateway":/<StartEvent\b/i.test(a)?"inicio":/<EndEvent\b/i.test(a)?"fim":/<SubFlow\b/i.test(a)?"subprocesso":"atividade";
  const g=a.match(/<Coordinates\b[^>]*>/i)?.[0]??"";nodes.push({externalId:id,name,kind,documentation:doc||null,lane:null,x:Number(attr(g,"XCoordinate"))||null,y:Number(attr(g,"YCoordinate"))||null});}
 const transitions:RuleTransition[]=[];
 for(const t of block(xml,"Transition")){const h=t.match(/<Transition\b[^>]*>/i)?.[0]??"";const id=attr(h,"Id"),from=attr(h,"From"),to=attr(h,"To");if(!id||!from||!to)continue;const condition=clean(t.match(/<Condition[^>]*>([\s\S]*?)<\/Condition>/i)?.[1]??"");transitions.push({externalId:id,fromId:from,toId:to,name:attr(h,"Name"),condition:condition||null});}
 return{processName,nodes,transitions};
}
export class SystemRuleService{
 async summary(){const [p,n,t]=await Promise.all([prisma.$queryRawUnsafe<Array<{c:bigint}>>('SELECT COUNT(*)::bigint c FROM "SystemRuleProcess"'),prisma.$queryRawUnsafe<Array<{c:bigint}>>('SELECT COUNT(*)::bigint c FROM "SystemRuleNode"'),prisma.$queryRawUnsafe<Array<{c:bigint}>>('SELECT COUNT(*)::bigint c FROM "SystemRuleTransition"')]);return{processes:Number(p[0]?.c??0),nodes:Number(n[0]?.c??0),transitions:Number(t[0]?.c??0)};}
 async search(text:string,limit=20){const q=text.trim();if(!q)return[];return prisma.$queryRawUnsafe<any[]>(`SELECT n.id,n."processId",n.name,n.kind,n.documentation,n.lane,n.x,n.y,p.name "processName",p."sourceFile", CASE WHEN LOWER(n.name)=LOWER($2) THEN 100 WHEN n.name ILIKE $1 THEN 70 WHEN COALESCE(n.documentation,'') ILIKE $1 THEN 45 ELSE 20 END score FROM "SystemRuleNode" n JOIN "SystemRuleProcess" p ON p.id=n."processId" WHERE n.name ILIKE $1 OR COALESCE(n.documentation,'') ILIKE $1 OR p.name ILIKE $1 OR p."sourceFile" ILIKE $1 ORDER BY score DESC,n.id LIMIT $3`,`%${q}%`,q,Math.max(1,Math.min(limit,50)));}
 async flow(processId:number,focusId?:number){const [process,nodes,transitions]=await Promise.all([prisma.$queryRawUnsafe<any[]>('SELECT * FROM "SystemRuleProcess" WHERE id=$1 LIMIT 1',processId),prisma.$queryRawUnsafe<any[]>('SELECT * FROM "SystemRuleNode" WHERE "processId"=$1 ORDER BY COALESCE(x,0),COALESCE(y,0),id',processId),prisma.$queryRawUnsafe<any[]>('SELECT * FROM "SystemRuleTransition" WHERE "processId"=$1 ORDER BY id',processId)]);return{process:process[0]??null,nodes,transitions,focusId:focusId??null};}
 async importBpm(sourceFile:string,base64:string){const outer=await JSZip.loadAsync(Buffer.from(base64,"base64"));let totalNodes=0,totalTransitions=0,processes=0,created=0,updated=0;
  for(const name of Object.keys(outer.files).filter(x=>x.toLowerCase().endsWith(".diag"))){const diag=await outer.file(name)!.async("nodebuffer");const inner=await JSZip.loadAsync(diag);const entry=inner.file("Diagram.xml");if(!entry)continue;const parsed=parseDiagram(await entry.async("string"),sourceFile);if(!parsed.nodes.length)continue;
   const fileName=sourceFile.replace(/.*[\\/]/,"");
   await prisma.$transaction(async tx=>{const old=await tx.$queryRawUnsafe<Array<{id:number}>>('SELECT id FROM "SystemRuleProcess" WHERE LOWER(name)=LOWER($1) OR LOWER("sourceFile")=LOWER($2) OR LOWER("sourceFile") LIKE LOWER($3) ORDER BY CASE WHEN LOWER(name)=LOWER($1) THEN 0 WHEN LOWER("sourceFile")=LOWER($2) THEN 1 ELSE 2 END LIMIT 1',parsed.processName,sourceFile,"%/"+fileName);let pid=old[0]?.id;if(pid){updated++;await tx.$executeRawUnsafe('DELETE FROM "SystemRuleTransition" WHERE "processId"=$1',pid);await tx.$executeRawUnsafe('DELETE FROM "SystemRuleNode" WHERE "processId"=$1',pid);await tx.$executeRawUnsafe('UPDATE "SystemRuleProcess" SET "sourceFile"=$2,name=$3,"importedAt"=CURRENT_TIMESTAMP WHERE id=$1',pid,sourceFile,parsed.processName);}else{created++;const ins=await tx.$queryRawUnsafe<Array<{id:number}>>('INSERT INTO "SystemRuleProcess" ("sourceFile",name,"importedAt") VALUES ($1,$2,CURRENT_TIMESTAMP) RETURNING id',sourceFile,parsed.processName);pid=ins[0]!.id;}
    for(const n of parsed.nodes)await tx.$executeRawUnsafe('INSERT INTO "SystemRuleNode" ("processId","externalId",name,kind,documentation,lane,x,y) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',pid,n.externalId,n.name,n.kind,n.documentation,n.lane,n.x,n.y);
    for(const t of parsed.transitions)await tx.$executeRawUnsafe('INSERT INTO "SystemRuleTransition" ("processId","externalId","fromId","toId",name,condition) VALUES ($1,$2,$3,$4,$5,$6)',pid,t.externalId,t.fromId,t.toId,t.name,t.condition);
   });processes++;totalNodes+=parsed.nodes.length;totalTransitions+=parsed.transitions.length;}
  return{sourceFile,processes,nodes:totalNodes,transitions:totalTransitions,created,updated};}
}