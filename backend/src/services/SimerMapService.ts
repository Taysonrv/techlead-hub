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
    const rows=await prisma.$queryRawUnsafe<MapRow[]>(`SELECT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt" FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} AND (${ts.map((_,i)=>`("nodeText" ILIKE $${i+1} OR path ILIKE $${i+1})`).join(" OR ")}) LIMIT 500`,...ts.map(t=>`%${t}%`));
    return rows.map(row=>{const hay=`${row.nodeText} ${row.path} ${row.mapName}`.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"");const node=row.nodeText.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"");const matched=ts.filter(t=>hay.includes(t));const nodeMatches=ts.filter(t=>node.includes(t)).length;const coverage=matched.length/ts.length;const score=(matched.length*10)+(nodeMatches*4)+(coverage===1?25:0)+Math.min(row.depth,8);return{...row,score,matchedTerms:matched,coverage};}).filter(x=>x.matchedTerms.length>0).sort((a,b)=>b.score-a.score||b.depth-a.depth).slice(0,Math.max(1,Math.min(limit,50)));
  }
  async tree(sourceFile:string){
    const source=sourceFile.trim(); if(!source)return[];
    return prisma.$queryRawUnsafe<MapRow[]>(`SELECT id,"sourceFile","mapName","nodeId","nodeText",path,depth,"parentPath","parentNodeId",icon,link,"nodeKind","importedAt" FROM "SimerMapNode" WHERE ${SIMER_SCOPE_SQL} AND "sourceFile"=$1 ORDER BY id ASC LIMIT 5000`,source);
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