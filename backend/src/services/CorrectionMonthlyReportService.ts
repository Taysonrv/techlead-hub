import axios from "axios";
import { prisma } from "../database/prisma";
import { AZURE_WORK_ITEM_FIELDS } from "./AzureWorkItemMapper";
import { resolveSimerClient, SIMER_CLIENTS } from "../domain/OperationalScope";

type Identity = { displayName?: string; uniqueName?: string };
type Revision = { id?: number; rev?: number; fields?: Record<string, unknown> };
type ReportingResponse = { values?: Revision[]; value?: Revision[]; continuationToken?: string; isLastBatch?: boolean };
type FieldDefinition = { name?: string; referenceName?: string };
type FieldListResponse = { value?: FieldDefinition[] };
type SnapshotItem = { id?: number; fields?: Record<string, unknown> };
type SnapshotBatchResponse = { value?: SnapshotItem[] };

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
  backlogInitial:boolean; backlogCurrent:boolean; inPeriodUniverse?:boolean;
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
  private async revisions(
    fields:{client:string;prioritized:string;urgency:string},
    start:Date,
  ):Promise<Revision[]> {
    const {organization,project}=this.azureConfig();
    const cacheKey=`${organization}/${project}/corrections/${start.toISOString().slice(0,10)}/${fields.client}/${fields.prioritized}/${fields.urgency}`;
    const cached=CorrectionMonthlyReportService.cache.get(cacheKey);
    if(cached&&cached.expiresAt>Date.now()) return cached.revisions;

    const requested=[
      "System.Id","System.WorkItemType","System.Title","System.State","System.CreatedBy",
      "System.CreatedDate","System.ChangedDate","System.AssignedTo",
      "Microsoft.VSTS.Common.Priority",fields.client,fields.prioritized,fields.urgency,
    ].filter((value,index,array)=>array.indexOf(value)===index);

    const all:Revision[]=[];
    let continuationToken:string|undefined;
    do {
      const response=await this.client().post<ReportingResponse>(
        "/_apis/wit/reporting/workitemrevisions",
        {
          types:["Correção Clientes"],
          fields:requested,
          includeIdentityRef:true,
          includeLatestOnly:false,
        },
        {
          params:{
            startDateTime:start.toISOString(),
            continuationToken,
            "$maxPageSize":2000,
            "api-version":"7.1",
          },
        },
      );
      all.push(...(response.data.values??response.data.value??[]));
      continuationToken=response.data.continuationToken||response.headers["x-ms-continuationtoken"];
      if(response.data.isLastBatch===true) continuationToken=undefined;
    } while(continuationToken);

    CorrectionMonthlyReportService.cache.set(cacheKey,{expiresAt:Date.now()+CACHE_TTL_MS,revisions:all});
    return all;
  }

  private async snapshots(
    ids:number[],
    asOf:Date,
    fields:{client:string;prioritized:string;urgency:string},
  ):Promise<Map<number,SnapshotItem>> {
    const normalizedIds=[...new Set(ids.filter(id=>Number.isSafeInteger(id)&&id>0))];
    const result=new Map<number,SnapshotItem>();
    if(!normalizedIds.length) return result;

    const coreFields=[
      "System.Id","System.WorkItemType","System.Title","System.State","System.CreatedBy",
      "System.CreatedDate","System.ChangedDate","System.AssignedTo",
      "Microsoft.VSTS.Common.Priority",
    ];
    const requested=[
      ...coreFields,fields.client,fields.prioritized,fields.urgency,
    ].filter((value,index,array)=>array.indexOf(value)===index);

    const loadBatch=async(batch:number[],requestedFields:string[])=>{
      const response=await this.client().post<SnapshotBatchResponse>(
        "/_apis/wit/workitemsbatch",
        {
          ids:batch,
          fields:requestedFields,
          asOf:asOf.toISOString(),
          errorPolicy:"Omit",
        },
        {params:{"api-version":"7.1"}},
      );
      return response.data.value??[];
    };

    for(let index=0;index<normalizedIds.length;index+=200){
      const batch=normalizedIds.slice(index,index+200);
      let values:SnapshotItem[];
      try {
        values=await loadBatch(batch,requested);
      } catch(error) {
        // Um campo customizado não reportável não deve derrubar o snapshot histórico.
        console.warn("[correction-monthly-report] Snapshot completo rejeitado; repetindo com campos centrais.");
        values=await loadBatch(batch,coreFields);
      }
      for(const item of values){
        const id=Number(item.id??item.fields?.["System.Id"]);
        if(Number.isSafeInteger(id)) result.set(id,item);
      }
    }

    return result;
  }

  async get(month:string) {
    const {start,endExclusive,close}=saoPauloMonth(month);
    const currentPromise=prisma.azureWorkItem.findMany({where:{workItemType:"Correção Clientes"},select:{id:true,title:true,client:true,criticality:true,prioritized:true,assignedToName:true,remoteUrl:true,createdByName:true,azureCreatedAt:true,state:true,stateChangedAt:true,azureClosedAt:true,rawFields:true}});
    let fields:{client:string;prioritized:string;urgency:string}={client:AZURE_WORK_ITEM_FIELDS.client,prioritized:AZURE_WORK_ITEM_FIELDS.prioritized,urgency:AZURE_WORK_ITEM_FIELDS.criticality};
    let revisions:Revision[]=[];
    let historyAvailable=false;
    let historyError:string|null=null;
    try {
      fields=await this.resolveFields();
      revisions=await this.revisions(fields,start);
      historyAvailable=revisions.length>0;
    } catch(error) {
      historyError=error instanceof Error ? error.message : "Histórico do Azure indisponível.";
      console.warn(`[correction-monthly-report] Histórico do Azure indisponível; usando snapshot local. | ${historyError}`);
    }
    const current=await currentPromise;
    const candidateIds=current.map(item=>item.id);
    let openingSnapshot=new Map<number,SnapshotItem>();
    let closingSnapshot=new Map<number,SnapshotItem>();
    let snapshotAvailable=false;
    let snapshotError:string|null=null;
    try {
      [openingSnapshot,closingSnapshot]=await Promise.all([
        this.snapshots(candidateIds,new Date(start.getTime()-1),fields),
        this.snapshots(candidateIds,close,fields),
      ]);
      snapshotAvailable=closingSnapshot.size>0;
    } catch(error) {
      snapshotError=error instanceof Error ? error.message : "Snapshots históricos do Azure indisponíveis.";
      console.warn(`[correction-monthly-report] Snapshots asOf indisponíveis; mantendo estratégia de revisões/snapshot local. | ${snapshotError}`);
    }

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
      const openingFields=openingSnapshot.get(id)?.fields??{};
      const closingFields=closingSnapshot.get(id)?.fields??{};
      const revisionStateAtOpen=atOpen?.state??null;
      const revisionStateAtClose=atClose.state;
      const stateAtOpen=text(openingFields["System.State"])??revisionStateAtOpen;
      const stateAtClose=text(closingFields["System.State"])??revisionStateAtClose;
      const latestFields=Object.keys(closingFields).length?closingFields:(atClose.revision.fields??{});
      const currentItem=currentById.get(id);
      const lastState=[...stateEvents].reverse().find(event=>event.at<endExclusive);
      const terminal=[...stateEvents].reverse().find(event=>event.at<endExclusive&&TERMINAL.has(event.state));
      const urgencyValue=text(latestFields[fields.urgency])??text(latestFields["Microsoft.VSTS.Common.Priority"]);
      const urgency=urgencyValue ? (/^\d+$/.test(urgencyValue)?`P${urgencyValue}`:urgencyValue) : currentItem?.criticality??null;
      const prioritized=bool(latestFields[fields.prioritized])??currentItem?.prioritized??null;
      const sourceClient=text(latestFields[fields.client])??currentItem?.client??null;
      const client=resolveSimerClient(sourceClient);
      if(!client) continue;
      rows.push({id,title:text(latestFields["System.Title"])??currentItem?.title??`Task ${id}`,client,createdBy:text(latestFields["System.CreatedBy"])??text(firstFields["System.CreatedBy"])??currentItem?.createdByName??null,createdAt:createdAt.toISOString(),status:stateAtClose,lastStateChangedAt:lastState?.at.toISOString()??text(closingFields["System.ChangedDate"])??null,urgency,prioritized,assignedTo:text(latestFields["System.AssignedTo"])??currentItem?.assignedToName??null,terminalAt:terminal?.at.toISOString()??null,remoteUrl:currentItem?.remoteUrl??null,stateAtOpen,stateAtClose,registeredInPeriod:createdAt>=start&&createdAt<endExclusive,deliveredInPeriod:entered("Concluído")&&stateAtClose==="Concluído",canceledInPeriod:entered("Cancelado")&&stateAtClose==="Cancelado",enteredRegistrationInPeriod:entered("Registro")&&stateAtClose==="Registro",backlogInitial:!!stateAtOpen&&!BACKLOG_EXCLUDED.has(stateAtOpen),backlogCurrent:!BACKLOG_EXCLUDED.has(stateAtClose)});
    }

    // O endpoint de revisões retorna apenas itens que tiveram revisão no período.
    // Completamos o universo com os snapshots para preservar backlog sem movimentação.
    if(snapshotAvailable){
      const existingIds=new Set(rows.map(row=>row.id));
      for(const item of current){
        if(existingIds.has(item.id)) continue;
        const openingFields=openingSnapshot.get(item.id)?.fields??{};
        const closingFields=closingSnapshot.get(item.id)?.fields??{};
        if(!Object.keys(closingFields).length) continue;

        const sourceClient=text(closingFields[fields.client])??item.client;
        const client=resolveSimerClient(sourceClient); if(!client) continue;
        const createdAt=date(closingFields["System.CreatedDate"])??item.azureCreatedAt;
        if(!createdAt||createdAt>=endExclusive) continue;

        const stateAtOpen=text(openingFields["System.State"]);
        const stateAtClose=text(closingFields["System.State"]);
        if(!stateAtClose) continue;
        const changedAt=date(closingFields["System.ChangedDate"]);
        const raw=(item.rawFields&&typeof item.rawFields==="object"&&!Array.isArray(item.rawFields)?item.rawFields:{}) as Record<string,unknown>;

        rows.push({
          id:item.id,
          title:text(closingFields["System.Title"])??item.title,
          client,
          createdBy:text(closingFields["System.CreatedBy"])??item.createdByName,
          createdAt:createdAt.toISOString(),
          status:stateAtClose,
          lastStateChangedAt:changedAt?.toISOString()??null,
          urgency:text(closingFields[fields.urgency])??item.criticality??text(raw[fields.urgency]),
          prioritized:bool(closingFields[fields.prioritized])??item.prioritized,
          assignedTo:text(closingFields["System.AssignedTo"])??item.assignedToName,
          terminalAt:TERMINAL.has(stateAtClose)?changedAt?.toISOString()??null:null,
          remoteUrl:item.remoteUrl,
          stateAtOpen,
          stateAtClose,
          registeredInPeriod:createdAt>=start&&createdAt<endExclusive,
          deliveredInPeriod:false,
          canceledInPeriod:false,
          enteredRegistrationInPeriod:false,
          backlogInitial:!!stateAtOpen&&!BACKLOG_EXCLUDED.has(stateAtOpen),
          backlogCurrent:!BACKLOG_EXCLUDED.has(stateAtClose),
        });
      }
    }

    // Fallback: usa snapshots asOf para preservar backlog histórico mesmo sem o endpoint de revisões.
    if(rows.length===0){
      for(const item of current){
        const openingFields=openingSnapshot.get(item.id)?.fields??{};
        const closingFields=closingSnapshot.get(item.id)?.fields??{};
        const sourceClient=text(closingFields[fields.client])??item.client;
        const client=resolveSimerClient(sourceClient); if(!client) continue;

        const createdAt=date(closingFields["System.CreatedDate"])??item.azureCreatedAt;
        if(!createdAt||createdAt>=endExclusive) continue;

        const stateAtOpen=text(openingFields["System.State"]);
        const stateAtClose=text(closingFields["System.State"])??item.state;
        const createdInPeriod=createdAt>=start&&createdAt<endExclusive;
        const changedAt=date(closingFields["System.ChangedDate"])??item.stateChangedAt;
        const raw=(item.rawFields&&typeof item.rawFields==="object"&&!Array.isArray(item.rawFields)?item.rawFields:{}) as Record<string,unknown>;
        const urgencyValue=text(closingFields[fields.urgency])??item.criticality??text(raw[fields.urgency]);
        const prioritized=bool(closingFields[fields.prioritized])??item.prioritized;

        rows.push({
          id:item.id,
          title:text(closingFields["System.Title"])??item.title,
          client,
          createdBy:text(closingFields["System.CreatedBy"])??item.createdByName,
          createdAt:createdAt.toISOString(),
          status:stateAtClose,
          lastStateChangedAt:changedAt?.toISOString()??null,
          urgency:urgencyValue,
          prioritized,
          assignedTo:text(closingFields["System.AssignedTo"])??item.assignedToName,
          terminalAt:TERMINAL.has(stateAtClose)?changedAt?.toISOString()??item.azureClosedAt?.toISOString()??null:null,
          remoteUrl:item.remoteUrl,
          stateAtOpen,
          stateAtClose,
          registeredInPeriod:createdInPeriod,
          deliveredInPeriod:false,
          canceledInPeriod:false,
          enteredRegistrationInPeriod:false,
          backlogInitial:snapshotAvailable&&!!stateAtOpen&&!BACKLOG_EXCLUDED.has(stateAtOpen),
          backlogCurrent:snapshotAvailable&&!BACKLOG_EXCLUDED.has(stateAtClose),
        });
      }
    }
    for(const row of rows){
      row.inPeriodUniverse=
        row.registeredInPeriod||
        row.deliveredInPeriod||
        row.canceledInPeriod||
        row.enteredRegistrationInPeriod||
        row.backlogInitial||
        row.backlogCurrent;
    }
        const count=(p:(r:Row)=>boolean)=>rows.filter(p).length;
    const by=(selector:(r:Row)=>string|null)=>Object.entries(rows.reduce<Record<string,number>>((acc,row)=>{const key=selector(row)||"Não informado";acc[key]=(acc[key]??0)+1;return acc;},{})).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total);
    return {period:{month,timezone:"America/Sao_Paulo",start:start.toISOString(),close:close.toISOString()},cards:{registered:count(r=>r.registeredInPeriod),delivered:count(r=>r.deliveredInPeriod),canceled:count(r=>r.canceledInPeriod),inRegistration:count(r=>r.enteredRegistrationInPeriod),backlogInitial:count(r=>r.backlogInitial),backlogCurrent:count(r=>r.backlogCurrent)},pipeline:by(r=>r.status),urgency:by(r=>r.urgency),prioritization:[{name:"Priorizadas",total:count(r=>r.prioritized===true)},{name:"Não priorizadas",total:count(r=>r.prioritized===false)},{name:"Não informado",total:count(r=>r.prioritized===null)}],filters:{creators:[...new Set(rows.map(r=>r.createdBy).filter(Boolean))].sort(),clients:[...SIMER_CLIENTS],urgencies:[...new Set(rows.map(r=>r.urgency).filter(Boolean))].sort(),states:[...new Set(rows.map(r=>r.status).filter(Boolean))].sort()},rows,generatedAt:new Date().toISOString(),source:snapshotAvailable?(historyAvailable?"Azure DevOps · revisões + snapshots asOf · carteira SIMER":"Azure DevOps · snapshots asOf · carteira SIMER"):"Base sincronizada do Azure DevOps · snapshot local · carteira SIMER",quality:{historyAvailable,historyError,snapshotAvailable,snapshotError,mode:snapshotAvailable?(historyAvailable?"historical":"asof-snapshot"):"local-snapshot",historicalMetricsReliable:historyAvailable&&snapshotAvailable,backlogHistoricalReliable:snapshotAvailable},fieldMapping:fields};
  }
}
