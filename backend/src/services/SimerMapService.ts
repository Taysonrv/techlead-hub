import axios from "axios";
import path from "node:path";
import { prisma } from "../database/prisma";

type MapRow = { id:number; sourceFile:string; mapName:string; nodeId:string|null; nodeText:string; path:string; depth:number; parentPath:string|null; parentNodeId:string|null; icon:string|null; link:string|null; nodeKind:string|null; importedAt:Date };
type ParsedNode = Omit<MapRow,"id"|"importedAt">;

function decodeXml(value:string){ return value.replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d))).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&"); }
function attr(tag:string,name:string){ const m=tag.match(new RegExp(`\\b${name}="([^"]*)"`,"i")); return m ? decodeXml(m[1] ?? "") : null; }
function kindFrom(icon:string|null,text:string){ const v=(icon??"").toLowerCase(); if(v.includes("table"))return"objeto"; if(v.includes("package"))return"mapa"; if(v.includes("xmag"))return"seletor"; if(v.includes("filter"))return"filtro"; if(v.includes("cog"))return"servico"; if(v.includes("report"))return"relatorio"; if(v.includes("folder"))return"grupo"; if(/^(interface|objeto|classe|serviço|servico|consulta|relatorio|relatório|construtor|atributo|função|funcao|evento|seletor|utilitario|utilitário)$/i.test(text))return text.toLowerCase(); return null; }
function parseMap(xml:string,sourceFile:string){
  const mapName=path.basename(sourceFile).replace(/\.mm$/i,"");
  const tokens=xml.match(/<node\b[^>]*>|<\/node>|<icon\b[^>]*\/>/gi)??[];
  const stack:Array<{text:string;nodeId:string|null;path:string;row:ParsedNode}>=[];
  const rows:ParsedNode[]=[];
  for(const token of tokens){
    if(/^<\/node/i.test(token)){stack.pop();continue;}
    if(/^<icon/i.test(token)){const current=stack.at(-1);if(current&&!current.row.icon){current.row.icon=attr(token,"BUILTIN");current.row.nodeKind=kindFrom(current.row.icon,current.row.nodeText);}continue;}
    const text=(attr(token,"TEXT")??"").trim(); if(!text)continue;
    const nodeId=attr(token,"ID"); const link=attr(token,"LINK");
    const parent=stack.at(-1); const currentPath=parent?`${parent.path} › ${text}`:text;
    const row:ParsedNode={sourceFile,mapName,nodeId,nodeText:text,path:currentPath,depth:stack.length,parentPath:parent?.path??null,parentNodeId:parent?.nodeId??null,icon:null,link,nodeKind:kindFrom(null,text)};
    rows.push(row); stack.push({text,nodeId,path:currentPath,row});
    if(/\/\s*>$/.test(token))stack.pop();
  }
  return rows;
}
function terms(value:string){return [...new Set(value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[^a-z0-9_.]+/).filter(x=>x.length>=4))].slice(0,12);}
const SIMER_SCOPE_SQL=`LOWER("sourceFile") NOT LIKE '%erpweb%' AND LOWER("sourceFile") NOT LIKE '%essencial%' AND LOWER(path) NOT LIKE '% › erpweb%' AND LOWER(path) NOT LIKE '% › essencial%'`;

export class SimerMapService {
  async summary(){
    const [stats,maps,kinds,links]=await Promise.all([
      prisma.$queryRaw<Array<{total:bigint;maps:bigint;importedAt:Date|null}>>`SELECT COUNT(*)::bigint total,COUNT(DISTINCT "sourceFile")::bigint maps,MAX("importedAt") "importedAt" FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL}`,
      prisma.$queryRaw<Array<{mapName:string;total:bigint}>>`SELECT "mapName",COUNT(*)::bigint total FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} GROUP BY "mapName" ORDER BY total DESC,"mapName" ASC LIMIT 30`,
      prisma.$queryRaw<Array<{nodeKind:string;total:bigint}>>`SELECT COALESCE("nodeKind",'outro') "nodeKind",COUNT(*)::bigint total FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} GROUP BY COALESCE("nodeKind",'outro') ORDER BY total DESC LIMIT 12`,
      prisma.$queryRaw<Array<{total:bigint}>>`SELECT COUNT(*)::bigint total FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} AND link IS NOT NULL AND link<>''`,
    ]);
    return {total:Number(stats[0]?.total??0),maps:Number(stats[0]?.maps??0),links:Number(links[0]?.total??0),importedAt:stats[0]?.importedAt??null,builderApiUrl:process.env.SIMER_BUILDER_API_URL?.trim()||"http://appdev.siagri.com.br:8888",items:maps.map(x=>({mapName:x.mapName,total:Number(x.total)})),kinds:kinds.map(x=>({kind:x.nodeKind,total:Number(x.total)}))};
  }
  async builderStatus(){const url=process.env.SIMER_BUILDER_API_URL?.trim()||"http://appdev.siagri.com.br:8888";const started=Date.now();try{const r=await axios.get(url,{timeout:2500,validateStatus:()=>true});return{url,reachable:true,status:r.status,latencyMs:Date.now()-started};}catch{return{url,reachable:false,status:null,latencyMs:Date.now()-started};}}
  async search(query:string,limit=50){
    const q=query.trim();if(!q)return[];const safe=Math.max(1,Math.min(limit,100));
    return prisma.$queryRawUnsafe<MapRow[]>(`SELECT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt" FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} AND ("nodeText" ILIKE $1 OR path ILIKE $1 OR "mapName" ILIKE $1 OR COALESCE(link,'') ILIKE $1) ORDER BY CASE WHEN LOWER("nodeText")=LOWER($2) THEN 0 WHEN "nodeText" ILIKE $1 THEN 1 WHEN "mapName" ILIKE $1 THEN 2 ELSE 3 END,depth ASC LIMIT $3`,`%${q}%`,q,safe);
  }
  async context(text:string,limit=20){
    const ts=terms(text);if(!ts.length)return[];
    const rows=await prisma.$queryRawUnsafe<MapRow[]>(`SELECT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt" FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} AND (${ts.map((_,i)=>`("nodeText" ILIKE $${i+1} OR path ILIKE $${i+1} OR "mapName" ILIKE $${i+1})`).join(" OR ")}) LIMIT 900`,...ts.map(t=>`%${t}%`));
    const links=await prisma.$queryRawUnsafe<MapRow[]>(`SELECT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt" FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} AND link IS NOT NULL AND link<>'' LIMIT 2500`);
    const linkedTerms=new Map<string,Set<string>>();
    for(const link of links){const hay=`${link.nodeText} ${link.path} ${link.mapName}`.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"");const inherited=ts.filter(t=>hay.includes(t));if(!inherited.length)continue;const raw=(link.link??"").replace(/\\/g,"/").replace(/^file:\/\//i,"").split("#")[0]??"";let decoded="";try{decoded=decodeURIComponent(raw).replace(/^\.\//,"");}catch{decoded=raw.replace(/^\.\//,"");}const base=link.sourceFile.replace(/\\/g,"/").split("/").slice(0,-1).join("/");const target=path.posix.normalize(path.posix.join(base,decoded)).toLowerCase();const name=path.posix.basename(decoded).replace(/\.mm$/i,"").toLowerCase();for(const key of [target,name]){const set=linkedTerms.get(key)??new Set<string>();inherited.forEach(t=>set.add(t));linkedTerms.set(key,set);}}
    return rows.map(row=>{const norm=(v:string)=>v.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"");const hay=norm(`${row.nodeText} ${row.path} ${row.mapName}`);const node=norm(row.nodeText);const direct=ts.filter(t=>hay.includes(t));const inherited=linkedTerms.get(row.sourceFile.replace(/\\/g,"/").toLowerCase())??linkedTerms.get(row.mapName.toLowerCase())??new Set<string>();const matched=[...new Set([...direct,...inherited])];const nodeMatches=ts.filter(t=>node.includes(t)).length;const coverage=matched.length/ts.length;const linkBonus=[...inherited].filter(t=>!direct.includes(t)).length*18;const score=(matched.length*10)+(nodeMatches*5)+(coverage===1?45:0)+linkBonus+Math.min(row.depth,10);return{...row,score,matchedTerms:matched,coverage};}).filter(x=>x.matchedTerms.length>0).sort((a,b)=>b.score-a.score||b.depth-a.depth).slice(0,Math.max(1,Math.min(limit,50)));
  }
  async tree(sourceFile:string,focusId?:number){
    const source=sourceFile.trim(); if(!source)return[];
    if(!focusId)return prisma.$queryRawUnsafe<MapRow[]>(`SELECT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt" FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} AND "sourceFile"=$1 ORDER BY id ASC LIMIT 1200`,source);
    const focusRows=await prisma.$queryRawUnsafe<MapRow[]>(`SELECT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt" FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} AND "sourceFile"=$1 AND id=$2 LIMIT 1`,source,focusId);
    const focus=focusRows[0]; if(!focus)return[];
    const rows=await prisma.$queryRawUnsafe<MapRow[]>(`WITH RECURSIVE ancestors AS (
      SELECT * FROM "SimerMapNode" WHERE id=$2 AND "sourceFile"=$1
      UNION ALL SELECT p.* FROM "SimerMapNode" p JOIN ancestors a ON a."parentNodeId"=p."nodeId" AND p."sourceFile"=a."sourceFile"
    ), nearby AS (
      SELECT s.* FROM "SimerMapNode" s WHERE s."sourceFile"=$1 AND (
        s.id=$2 OR
        s."parentNodeId" IS NOT DISTINCT FROM $3 OR
        s."parentNodeId"=(SELECT "nodeId" FROM "SimerMapNode" WHERE id=$2)
      )
    )
    SELECT DISTINCT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt"
    FROM (SELECT * FROM ancestors UNION ALL SELECT * FROM nearby) scoped
    WHERE ${SIMER_SCOPE_SQL} ORDER BY depth,id LIMIT 180`,source,focusId,focus.parentNodeId);
    return rows;
  }
  async resolveContainer(id:number){
    const rows=await prisma.$queryRawUnsafe<MapRow[]>(`SELECT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt" FROM "SimerMapNode" WHERE id=$1 AND ${SIMER_SCOPE_SQL} LIMIT 1`,id);
    const current=rows[0]; if(!current)return null;
    const match=current.nodeText.match(/\$?container([A-Za-z0-9_]+)/i);
    if(!match?.[1])return null;
    const container=`Container${match[1]}`;
    const candidates=await prisma.$queryRawUnsafe<MapRow[]>(`SELECT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt" FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} AND (LOWER("mapName")=LOWER($1) OR LOWER("nodeText")=LOWER($1) OR LOWER("sourceFile") LIKE LOWER($2)) ORDER BY CASE WHEN LOWER("mapName")=LOWER($1) THEN 0 WHEN LOWER("nodeText")=LOWER($1) THEN 1 ELSE 2 END,depth ASC LIMIT 1`,container,`%${container}.mm`);
    return candidates[0]??null;
  }
  async followLink(id:number){
    const rows=await prisma.$queryRawUnsafe<MapRow[]>(`SELECT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt" FROM "SimerMapNode" WHERE id=$1 LIMIT 1`,id);
    const current=rows[0]; if(!current?.link)return null;
    const raw=current.link.replace(/\\/g,"/").replace(/^file:\/\//i,"").split("#")[0]??"";
    const decoded=decodeURIComponent(raw).replace(/^\.\//,"");
    const base=current.sourceFile.replace(/\\/g,"/").split("/").slice(0,-1).join("/");
    const target=path.posix.normalize(path.posix.join(base,decoded));
    const name=path.posix.basename(decoded).replace(/\.mm$/i,"");
    const candidates=await prisma.$queryRawUnsafe<MapRow[]>(`SELECT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt" FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} AND ("sourceFile"=$1 OR LOWER("mapName")=LOWER($2) OR LOWER("sourceFile") LIKE LOWER($3)) ORDER BY CASE WHEN "sourceFile"=$1 THEN 0 WHEN LOWER("mapName")=LOWER($2) THEN 1 ELSE 2 END,depth ASC LIMIT 1`,target,name,`%${decoded}`);
    return candidates[0]??null;
  }
  async related(id:number){
    const rows=await prisma.$queryRawUnsafe<MapRow[]>(`SELECT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt" FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} AND (id=$1 OR "parentNodeId"=(SELECT "nodeId" FROM "SimerMapNode" WHERE id=$1) OR "nodeId"=(SELECT "parentNodeId" FROM "SimerMapNode" WHERE id=$1) OR ("sourceFile"=(SELECT "sourceFile" FROM "SimerMapNode" WHERE id=$1) AND link=(SELECT link FROM "SimerMapNode" WHERE id=$1) AND link IS NOT NULL)) ORDER BY depth,path LIMIT 100`,id);return rows;
  }
  async importBatch(files:Array<{sourceFile:string;content:string}>){let nodes=0;const imported=[];for(const file of files){const result=await this.importMap(file.sourceFile,file.content);nodes+=result.total;imported.push(result);}return{files:imported.length,nodes,items:imported};}
  async importMap(sourceFile:string,content:string){
    if(!/\.mm$/i.test(sourceFile))throw new Error("Envie arquivo .mm.");if(!content.includes("<map")||!content.includes("<node"))throw new Error(`Mapa inválido: ${sourceFile}`);
    const rows=parseMap(content,sourceFile);if(!rows.length)throw new Error(`Nenhum nó identificado em ${sourceFile}`);
    await prisma.$transaction(async tx=>{await tx.$executeRawUnsafe(`DELETE FROM "SimerMapNode" WHERE "sourceFile"=$1`,sourceFile);for(let i=0;i<rows.length;i+=150){const chunk=rows.slice(i,i+150),values:unknown[]=[];const placeholders=chunk.map((r,idx)=>{const b=idx*11;values.push(r.sourceFile,r.mapName,r.nodeId,r.nodeText,r.path,r.depth,r.parentPath,r.parentNodeId,r.icon,r.link,r.nodeKind);return`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},CURRENT_TIMESTAMP)`;}).join(",");await tx.$executeRawUnsafe(`INSERT INTO "SimerMapNode" ("sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt") VALUES ${placeholders}`,...values);}});
    return{sourceFile,mapName:rows[0]?.mapName??path.basename(sourceFile),total:rows.length,links:rows.filter(x=>x.link).length};
  }
}