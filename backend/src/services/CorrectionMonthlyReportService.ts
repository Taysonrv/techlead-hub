import axios from "axios";
import { prisma } from "../database/prisma";
import { AZURE_WORK_ITEM_FIELDS } from "./AzureWorkItemMapper";

type Identity = { displayName?: string; uniqueName?: string };
type Revision = { id?: number; rev?: number; fields?: Record<string, unknown> };
type ReportingResponse = { values?: Revision[]; value?: Revision[]; continuationToken?: string; isLastBatch?: boolean };
type FieldDefinition = { name?: string; referenceName?: string };
type FieldListResponse = { value?: FieldDefinition[] };

const TERMINAL = new Set(["Concluído", "Cancelado"]);
const BACKLOG_EXCLUDED = new Set(["Registro", ...TERMINAL]);
const CACHE_TTL_MS = 10 * 60_000;
const FIELD_CACHE_TTL_MS = 60 * 60_000;

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") return text((value as Identity).displayName);
  if (typeof value === "number") return String(value);
  return null;
}
function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  const v = text(value)?.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return v === "sim" || v === "true" || v === "yes" || v === "1" ? true : v === "nao" || v === "false" || v === "no" || v === "0" ? false : null;
}
function date(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}
function saoPauloMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Período inválido. Use YYYY-MM.");
  const parts = month.split("-");
  const year = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(year) || !Number.isInteger(m) || m < 1 || m > 12) throw new Error("Período inválido.");
  const start = new Date(`${month}-01T03:00:00.000Z`);
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  const endExclusive = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T03:00:00.000Z`);
  return { start, endExclusive, close: new Date(endExclusive.getTime() - 1) };
}

type Row = {
  id:number; title:string; client:string|null; createdBy:string|null; createdAt:string|null; status:string;
  lastStateChangedAt:string|null; urgency:string|null; prioritized:boolean|null; assignedTo:string|null;
  terminalAt:string|null; remoteUrl:string|null; stateAtOpen:string|null; stateAtClose:string|null;
  registeredInPeriod:boolean; deliveredInPeriod:boolean; canceledInPeriod:boolean; enteredRegistrationInPeriod:boolean;
  backlogInitial:boolean; backlogCurrent:boolean;
};

export class CorrectionMonthlyReportService {
  private static cache = new Map<string,{expiresAt:number;revisions:Revision[]}>();
  private static fieldCache = new Map<string,{expiresAt:number;fields:FieldDefinition[]}>();

  private azureConfig() {
    const organization=(process.env.AZURE_DEVOPS_ORGANIZATION??"").trim();
    const project=(process.env.AZURE_DEVOPS_PROJECT??"").trim();
    const pat=(process.env.AZURE_DEVOPS_PAT??"").trim();
    if(!organization||!project||!pat) throw new Error("Integração Azure DevOps não configurada.");
    return {organization,project,pat};
  }
  private client() {
    const {organization,project,pat}=this.azureConfig();
    return axios.create({baseURL:`https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}`,timeout:60_000,headers:{Accept:"application/json",Authorization:`Basic ${Buffer.from(`:${pat}`).toString("base64")}`}});
  }
  private async fieldDefinitions() {
    const {organization,project}=this.azureConfig();
    const key=`${organization}/${project}`;
    const cached=CorrectionMonthlyReportService.fieldCache.get(key);
    if(cached&&cached.expiresAt>Date.now()) return cached.fields;
    try {
      const response=await this.client().get<FieldListResponse>("/_apis/wit/fields",{params:{"api-version":"7.1"}});
      const fields=response.data.value??[];
      CorrectionMonthlyReportService.fieldCache.set(key,{expiresAt:Date.now()+FIELD_CACHE_TTL_MS,fields});
      return fields;
    } catch { return []; }
  }
  private async resolveFields() {
    const definitions=await this.fieldDefinitions();
    const find=(terms:string[],fallback:string)=>{
      const match=definitions.find(field=>{
        const hay=normalized(`${field.name??""} ${field.referenceName??""}`);
        return terms.some(term=>hay.includes(normalized(term)));
      });
      return match?.referenceName||fallback;
    };
    return {
      client:find(["cliente principal","cliente"],AZURE_WORK_ITEM_FIELDS.client),
      prioritized:find(["priorizada","priorizado"],AZURE_WORK_ITEM_FIELDS.prioritized),
      urgency:find(["urgencia","criticidade","priority"],AZURE_WORK_ITEM_FIELDS.criticality),
    };
  }
  private async revisions(fields:{client:string;prioritized:string;urgency:string}):Promise<Revision[]> {
    const {organization,project}=this.azureConfig();
    const cacheKey=`${organization}/${project}/corrections/${fields.client}/${fields.prioritized}/${fields.urgency}`;
    const cached=CorrectionMonthlyReportService.cache.get(cacheKey);
    if(cached&&cached.expiresAt>Date.now()) return cached.revisions;
    const requested=[ "System.Id","System.WorkItemType","System.Title","System.State","System.CreatedBy","System.CreatedDate","System.ChangedDate","System.AssignedTo","Microsoft.VSTS.Common.Priority",fields.client,fields.prioritized,fields.urgency ].filter((v,i,a)=>a.indexOf(v)===i).join(",");
    const all:Revision[]=[]; let continuationToken:string|undefined;
    do {
      const response=await this.client().get<ReportingResponse>("/_apis/wit/reporting/workitemrevisions",{params:{fields:requested,types:"Correção Clientes",includeLatestOnly:false,includeIdentityRef:true,"$maxPageSize":2000,continuationToken,"api-version":"7.1-preview.2"}});
      all.push(...(response.data.values??response.data.value??[]));
      continuationToken=response.data.continuationToken||response.headers["x-ms-continuationtoken"];
      if(response.data.isLastBatch===true) continuationToken=undefined;
    } while(continuationToken);
    CorrectionMonthlyReportService.cache.set(cacheKey,{expiresAt:Date.now()+CACHE_TTL_MS,revisions:all});
    return all;
  }

  async get(month:string) {
    const {start,endExclusive,close}=saoPauloMonth(month);
    const fields=await this.resolveFields();
    const [revisions,current]=await Promise.all([
      this.revisions(fields),
      prisma.azureWorkItem.findMany({where:{workItemType:"Correção Clientes"},select:{id:true,title:true,client:true,criticality:true,prioritized:true,assignedToName:true,remoteUrl:true,createdByName:true,azureCreatedAt:true,state:true,stateChangedAt:true,azureClosedAt:true,rawFields:true}}),
    ]);
    const currentById=new Map(current.map(item=>[item.id,item]));
    const grouped=new Map<number,Revision[]>();
    for(const revision of revisions){const id=Number(revision.id??revision.fields?.["System.Id"]);if(!Number.isSafeInteger(id))continue;const list=grouped.get(id)??[];list.push(revision);grouped.set(id,list);}

    const rows:Row[]=[];
    for(const [id,history] of grouped){
      history.sort((a,b)=>(date(a.fields?.["System.ChangedDate"])?.getTime()??0)-(date(b.fields?.["System.ChangedDate"])?.getTime()??0));
      const normalizedHistory=history.map(revision=>{const f=revision.fields??{};return{revision,at:date(f["System.ChangedDate"])??date(f["System.CreatedDate"]),state:text(f["System.State"])}}).filter((item):item is {revision:Revision;at:Date;state:string}=>!!item.at&&!!item.state);
      const firstHistory=history[0];const firstNormalized=normalizedHistory[0];if(!firstHistory||!firstNormalized)continue;
      const firstFields=firstHistory.fields??{};const createdAt=date(firstFields["System.CreatedDate"])??firstNormalized.at;if(createdAt>=endExclusive)continue;
      const atOpen=[...normalizedHistory].reverse().find(event=>event.at<start)??null;
      const atClose=[...normalizedHistory].reverse().find(event=>event.at<endExclusive)??null;if(!atClose)continue;
      const stateEvents=normalizedHistory.filter((event,index)=>{const previous=normalizedHistory[index-1];return!previous||event.state!==previous.state;});
      const inPeriod=stateEvents.filter(event=>event.at>=start&&event.at<endExclusive);
      const entered=(state:string)=>inPeriod.some(event=>event.state===state);
      const stateAtOpen=atOpen?.state??null;const stateAtClose=atClose.state;const latestFields=atClose.revision.fields??{};const currentItem=currentById.get(id);
      const lastState=[...stateEvents].reverse().find(event=>event.at<endExclusive);
      const terminal=[...stateEvents].reverse().find(event=>event.at<endExclusive&&TERMINAL.has(event.state));
      const urgencyValue=text(latestFields[fields.urgency])??text(latestFields["Microsoft.VSTS.Common.Priority"]);
      const urgency=urgencyValue ? (/^\d+$/.test(urgencyValue)?`P${urgencyValue}`:urgencyValue) : currentItem?.criticality??null;
      const prioritized=bool(latestFields[fields.prioritized])??currentItem?.prioritized??null;
      rows.push({id,title:text(latestFields["System.Title"])??currentItem?.title??`Task ${id}`,client:text(latestFields[fields.client])??currentItem?.client??null,createdBy:text(latestFields["System.CreatedBy"])??text(firstFields["System.CreatedBy"])??currentItem?.createdByName??null,createdAt:createdAt.toISOString(),status:stateAtClose,lastStateChangedAt:lastState?.at.toISOString()??null,urgency,prioritized,assignedTo:text(latestFields["System.AssignedTo"])??currentItem?.assignedToName??null,terminalAt:terminal?.at.toISOString()??null,remoteUrl:currentItem?.remoteUrl??null,stateAtOpen,stateAtClose,registeredInPeriod:createdAt>=start&&createdAt<endExclusive,deliveredInPeriod:entered("Concluído")&&stateAtClose==="Concluído",canceledInPeriod:entered("Cancelado")&&stateAtClose==="Cancelado",enteredRegistrationInPeriod:entered("Registro")&&stateAtClose==="Registro",backlogInitial:!!stateAtOpen&&!BACKLOG_EXCLUDED.has(stateAtOpen),backlogCurrent:!BACKLOG_EXCLUDED.has(stateAtClose)});
    }

    // Fallback: se o Reporting endpoint não devolver histórico, ainda entregamos o mês atual com os dados sincronizados.
    if(rows.length===0){
      for(const item of current){
        const createdAt=item.azureCreatedAt; if(!createdAt||createdAt>=endExclusive)continue;
        const raw=(item.rawFields&&typeof item.rawFields==="object"&&!Array.isArray(item.rawFields)?item.rawFields:{}) as Record<string,unknown>;
        const state=item.state;const createdInPeriod=createdAt>=start&&createdAt<endExclusive;
        const stateChanged=item.stateChangedAt;const changedInPeriod=!!stateChanged&&stateChanged>=start&&stateChanged<endExclusive;
        rows.push({id:item.id,title:item.title,client:item.client,createdBy:item.createdByName,createdAt:createdAt.toISOString(),status:state,lastStateChangedAt:stateChanged?.toISOString()??null,urgency:item.criticality??text(raw[fields.urgency]),prioritized:item.prioritized,assignedTo:item.assignedToName,terminalAt:item.azureClosedAt?.toISOString()??null,remoteUrl:item.remoteUrl,stateAtOpen:createdInPeriod?null:state,stateAtClose:state,registeredInPeriod:createdInPeriod,deliveredInPeriod:changedInPeriod&&state==="Concluído",canceledInPeriod:changedInPeriod&&state==="Cancelado",enteredRegistrationInPeriod:changedInPeriod&&state==="Registro",backlogInitial:!createdInPeriod&&!BACKLOG_EXCLUDED.has(state),backlogCurrent:!BACKLOG_EXCLUDED.has(state)});
      }
    }
    const count=(p:(r:Row)=>boolean)=>rows.filter(p).length;
    const by=(selector:(r:Row)=>string|null)=>Object.entries(rows.reduce<Record<string,number>>((acc,row)=>{const key=selector(row)||"Não informado";acc[key]=(acc[key]??0)+1;return acc;},{})).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total);
    return {period:{month,timezone:"America/Sao_Paulo",start:start.toISOString(),close:close.toISOString()},cards:{registered:count(r=>r.registeredInPeriod),delivered:count(r=>r.deliveredInPeriod),canceled:count(r=>r.canceledInPeriod),inRegistration:count(r=>r.enteredRegistrationInPeriod),backlogInitial:count(r=>r.backlogInitial),backlogCurrent:count(r=>r.backlogCurrent)},pipeline:by(r=>r.status),urgency:by(r=>r.urgency),prioritization:[{name:"Priorizadas",total:count(r=>r.prioritized===true)},{name:"Não priorizadas",total:count(r=>r.prioritized===false)},{name:"Não informado",total:count(r=>r.prioritized===null)}],filters:{creators:[...new Set(rows.map(r=>r.createdBy).filter(Boolean))].sort(),clients:[...new Set(rows.map(r=>r.client).filter(Boolean))].sort(),urgencies:[...new Set(rows.map(r=>r.urgency).filter(Boolean))].sort(),states:[...new Set(rows.map(r=>r.status).filter(Boolean))].sort()},rows,generatedAt:new Date().toISOString(),source:rows.length?"Azure DevOps · histórico de revisões/snapshot sincronizado":"Azure DevOps",fieldMapping:fields};
  }
}
