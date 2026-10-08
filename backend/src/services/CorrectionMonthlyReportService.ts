import axios from "axios";
import type { AxiosResponse } from "axios";
import { prisma } from "../database/prisma";
import { AZURE_WORK_ITEM_FIELDS } from "./AzureWorkItemMapper";
import { isSupportAnalyst, resolveSimerClient, SIMER_CLIENTS } from "../domain/OperationalScope";

type Identity = { displayName?: string; uniqueName?: string };
type Revision = { id?: number; rev?: number; fields?: Record<string, unknown> };
type ReportingResponse = { values?: Revision[]; value?: Revision[]; continuationToken?: string; nextLink?: string; isLastBatch?: boolean };
type FieldDefinition = { name?: string; referenceName?: string };
type FieldListResponse = { value?: FieldDefinition[] };
type SnapshotItem = { id?: number; fields?: Record<string, unknown> };
type SnapshotBatchResponse = { value?: SnapshotItem[] };
type WiqlResponse = { workItems?: Array<{ id?: number }> };

const TERMINAL = new Set(["Concluído", "Cancelado"]);
const BACKLOG_EXCLUDED = new Set(["Registro", ...TERMINAL]);
const CACHE_TTL_MS = 10 * 60_000;
const FIELD_CACHE_TTL_MS = 60 * 60_000;
const AZURE_REQUEST_TIMEOUT_MS = 12_000;
const REVISION_STAGE_TIMEOUT_MS = 25_000;
const SNAPSHOT_STAGE_TIMEOUT_MS = 22_000;
const REPORT_CACHE_TTL_MS = 2 * 60_000;

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
  private static reportCache = new Map<string,{expiresAt:number;data:unknown}>();
  private static inFlight = new Map<string,Promise<unknown>>();

  private azureConfig() {
    const organization=(process.env.AZURE_DEVOPS_ORGANIZATION??"").trim();
    const project=(process.env.AZURE_DEVOPS_PROJECT??"").trim();
    const pat=(process.env.AZURE_DEVOPS_PAT??"").trim();
    if(!organization||!project||!pat) throw new Error("Integração Azure DevOps não configurada.");
    return {organization,project,pat};
  }
  private client() {
    const {organization,project,pat}=this.azureConfig();
    return axios.create({baseURL:`https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}`,timeout:AZURE_REQUEST_TIMEOUT_MS,headers:{Accept:"application/json",Authorization:`Basic ${Buffer.from(`:${pat}`).toString("base64")}`}});
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
      const exact=definitions.find(field=>field.referenceName===fallback);
      if(exact?.referenceName) return exact.referenceName;
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
      "Microsoft.VSTS.Common.StateChangeDate","Microsoft.VSTS.Common.ClosedDate",
      "Microsoft.VSTS.Common.Priority",fields.client,fields.prioritized,fields.urgency,
    ].filter((value,index,array)=>array.indexOf(value)===index);

    const all:Revision[]=[];
    const client=this.client();
    const deadline=Date.now()+REVISION_STAGE_TIMEOUT_MS;
    let nextLink:string|null=null;
    let first=true;
    do {
      const remaining=deadline-Date.now();
      if(remaining<=0) throw new Error("Consulta de revisões do Azure excedeu o limite de tempo.");
      const response:AxiosResponse<ReportingResponse>=await client.get<ReportingResponse>(
        nextLink??"/_apis/wit/reporting/workitemrevisions",
        first ? {
          params:{
            fields:requested.join(","),
            types:"Correção Clientes",
            startDateTime:start.toISOString(),
            includeIdentityRef:true,
            includeLatestOnly:false,
            "$maxPageSize":2000,
            "api-version":"7.1",
          },
          timeout:Math.max(1_000,Math.min(AZURE_REQUEST_TIMEOUT_MS,remaining)),
        } : {
          timeout:Math.max(1_000,Math.min(AZURE_REQUEST_TIMEOUT_MS,remaining)),
        },
      );
      all.push(...(response.data.values??response.data.value??[]));
      nextLink=response.data.isLastBatch===true?null:(response.data.nextLink??null);
      first=false;
    } while(nextLink);

    CorrectionMonthlyReportService.cache.set(cacheKey,{expiresAt:Date.now()+CACHE_TTL_MS,revisions:all});
    return all;
  }

  private async workItemIdsAsOf(asOf:Date):Promise<number[]> {
    const query = `SELECT [System.Id]
FROM WorkItems
WHERE [System.TeamProject] = @project
  AND [System.WorkItemType] = 'Correção Clientes'
ASOF '${asOf.toISOString()}'`;
    const response=await this.client().post<WiqlResponse>(
      "/_apis/wit/wiql",
      {query},
      {params:{"api-version":"7.1"},timeout:AZURE_REQUEST_TIMEOUT_MS},
    );
    return [...new Set((response.data.workItems??[])
      .map(item=>Number(item.id))
      .filter((id):id is number=>Number.isSafeInteger(id)&&id>0))];
  }

  private workItemUrl(id:number):string|null {
    const organization=(process.env.AZURE_DEVOPS_ORGANIZATION??"").trim();
    const project=(process.env.AZURE_DEVOPS_PROJECT??"").trim();
    if(!organization||!project) return null;
    return `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_workitems/edit/${id}`;
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
      "Microsoft.VSTS.Common.StateChangeDate","Microsoft.VSTS.Common.ClosedDate",
      "Microsoft.VSTS.Common.Priority",
    ];
    const requested=[
      ...coreFields,fields.client,fields.prioritized,fields.urgency,
    ].filter((value,index,array)=>array.indexOf(value)===index);

    const deadline=Date.now()+SNAPSHOT_STAGE_TIMEOUT_MS;
    const loadBatch=async(batch:number[],requestedFields:string[])=>{
      const remaining=deadline-Date.now();
      if(remaining<=0) throw new Error("Consulta de snapshots do Azure excedeu o limite de tempo.");
      const response=await this.client().post<SnapshotBatchResponse>(
        "/_apis/wit/workitemsbatch",
        {
          ids:batch,
          fields:requestedFields,
          asOf:asOf.toISOString(),
          errorPolicy:"Omit",
        },
        {params:{"api-version":"7.1"},timeout:Math.max(1_000,Math.min(AZURE_REQUEST_TIMEOUT_MS,remaining))},
      );
      return response.data.value??[];
    };

    for(let index=0;index<normalizedIds.length;index+=200){
      if(Date.now()>=deadline) throw new Error("Consulta de snapshots do Azure excedeu o limite de tempo.");
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
    // Em desenvolvimento o React StrictMode pode montar o painel duas vezes.
    // Reutilizamos a mesma geração por mês para não duplicar as consultas
    // históricas pesadas no Azure DevOps.
    const cached=CorrectionMonthlyReportService.reportCache.get(month);
    if(cached&&cached.expiresAt>Date.now()) return cached.data;

    const existing=CorrectionMonthlyReportService.inFlight.get(month);
    if(existing) return existing;

    const generation=this.build(month)
      .then(data=>{
        CorrectionMonthlyReportService.reportCache.set(month,{expiresAt:Date.now()+REPORT_CACHE_TTL_MS,data});
        return data;
      })
      .finally(()=>{
        CorrectionMonthlyReportService.inFlight.delete(month);
      });

    CorrectionMonthlyReportService.inFlight.set(month,generation);
    return generation;
  }

  private async build(month:string) {
    const {start,endExclusive,close}=saoPauloMonth(month);
    const currentPromise=prisma.azureWorkItem.findMany({where:{workItemType:"Correção Clientes"},select:{id:true,title:true,client:true,criticality:true,prioritized:true,assignedToName:true,remoteUrl:true,createdByName:true,azureCreatedAt:true,state:true,stateChangedAt:true,azureClosedAt:true,rawFields:true}});
    let fields:{client:string;prioritized:string;urgency:string}={client:AZURE_WORK_ITEM_FIELDS.client,prioritized:AZURE_WORK_ITEM_FIELDS.prioritized,urgency:AZURE_WORK_ITEM_FIELDS.criticality};
    let revisions:Revision[]=[];
    let historyAvailable=false;
    let historyError:string|null=null;
    try {
      fields=await this.resolveFields();
      revisions=await this.revisions(fields,start);
      historyAvailable=true;
    } catch(error) {
      historyError=error instanceof Error ? error.message : "Histórico do Azure indisponível.";
      console.warn(`[correction-monthly-report] Histórico do Azure indisponível; usando snapshot local. | ${historyError}`);
    }
    const current=await currentPromise;
    const revisionIds=revisions
      .map(revision=>Number(revision.id??revision.fields?.["System.Id"]))
      .filter((id):id is number=>Number.isSafeInteger(id)&&id>0);
    let historicalScopeIds:number[]=[];
    let historicalScopeError:string|null=null;
    try {
      const [openingIds,closingIds]=await Promise.all([
        this.workItemIdsAsOf(new Date(start.getTime()-1)),
        this.workItemIdsAsOf(close),
      ]);
      historicalScopeIds=[...new Set([...openingIds,...closingIds])];
    } catch(error) {
      historicalScopeError=error instanceof Error ? error.message : "Escopo histórico ASOF indisponível.";
      console.warn(`[correction-monthly-report] WIQL ASOF indisponível; usando revisões e base sincronizada. | ${historicalScopeError}`);
    }
    const candidateIds=[...new Set([
      ...current.map(item=>item.id),
      ...revisionIds,
      ...historicalScopeIds,
    ])];
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
      const openingFields=openingSnapshot.get(id)?.fields??{};
      const closingFields=closingSnapshot.get(id)?.fields??{};
      const revisionStateAtOpen=atOpen?.state??null;
      const revisionStateAtClose=atClose.state;
      const stateAtOpen=text(openingFields["System.State"])??revisionStateAtOpen;
      const stateAtClose=text(closingFields["System.State"])??revisionStateAtClose;
      const stateEvents=normalizedHistory.filter((event,index)=>{
        const previousState=index>0?normalizedHistory[index-1]?.state:stateAtOpen;
        if(previousState) return event.state!==previousState;
        return createdAt>=start&&createdAt<endExclusive;
      });
      const inPeriod=stateEvents.filter(event=>event.at>=start&&event.at<endExclusive);
      const entered=(state:string)=>inPeriod.some(event=>event.state===state);
      const latestFields=Object.keys(closingFields).length?closingFields:(atClose.revision.fields??{});
      const currentItem=currentById.get(id);
      const lastState=[...stateEvents].reverse().find(event=>event.at<endExclusive);
      const terminal=[...stateEvents].reverse().find(event=>event.at<endExclusive&&TERMINAL.has(event.state));
      const closeStateChangedAt=date(closingFields["Microsoft.VSTS.Common.StateChangeDate"]);
      const snapshotTransitionInPeriod=!!closeStateChangedAt&&closeStateChangedAt>=start&&closeStateChangedAt<endExclusive;
      const urgencyValue=text(latestFields[fields.urgency])??text(latestFields["Microsoft.VSTS.Common.Priority"]);
      const urgency=urgencyValue ? (/^\d+$/.test(urgencyValue)?`P${urgencyValue}`:urgencyValue) : currentItem?.criticality??null;
      const prioritized=bool(latestFields[fields.prioritized])??currentItem?.prioritized??null;
      const sourceClient=text(latestFields[fields.client])??currentItem?.client??null;
      const client=resolveSimerClient(sourceClient);
      if(!client) continue;
      const deliveredInPeriod=stateAtClose==="Concluído"&&(snapshotTransitionInPeriod||entered("Concluído"));
      const canceledInPeriod=stateAtClose==="Cancelado"&&(snapshotTransitionInPeriod||entered("Cancelado"));
      const enteredRegistrationInPeriod=stateAtClose==="Registro"&&(snapshotTransitionInPeriod||entered("Registro"));
      const effectiveStateChangedAt=closeStateChangedAt??lastState?.at??null;
      const effectiveTerminalAt=TERMINAL.has(stateAtClose)?(closeStateChangedAt??terminal?.at??null):null;
      rows.push({id,title:text(latestFields["System.Title"])??currentItem?.title??`Task ${id}`,client,createdBy:text(latestFields["System.CreatedBy"])??text(firstFields["System.CreatedBy"])??currentItem?.createdByName??null,createdAt:createdAt.toISOString(),status:stateAtClose,lastStateChangedAt:effectiveStateChangedAt?.toISOString()??null,urgency,prioritized,assignedTo:text(latestFields["System.AssignedTo"])??currentItem?.assignedToName??null,terminalAt:effectiveTerminalAt?.toISOString()??null,remoteUrl:currentItem?.remoteUrl??this.workItemUrl(id),stateAtOpen,stateAtClose,registeredInPeriod:createdAt>=start&&createdAt<endExclusive,deliveredInPeriod,canceledInPeriod,enteredRegistrationInPeriod,backlogInitial:!!stateAtOpen&&!BACKLOG_EXCLUDED.has(stateAtOpen),backlogCurrent:!BACKLOG_EXCLUDED.has(stateAtClose)});
    }

    // O endpoint de revisões retorna apenas itens que tiveram revisão no período.
    // Completamos o universo com os snapshots para preservar backlog sem movimentação.
    if(snapshotAvailable){
      const existingIds=new Set(rows.map(row=>row.id));
      for(const id of candidateIds){
        if(existingIds.has(id)) continue;
        const item=currentById.get(id);
        const openingFields=openingSnapshot.get(id)?.fields??{};
        const closingFields=closingSnapshot.get(id)?.fields??{};
        if(!Object.keys(closingFields).length) continue;

        const sourceClient=text(closingFields[fields.client])??item?.client??null;
        const client=resolveSimerClient(sourceClient); if(!client) continue;
        const createdAt=date(closingFields["System.CreatedDate"])??item?.azureCreatedAt??null;
        if(!createdAt||createdAt>=endExclusive) continue;

        const stateAtOpen=text(openingFields["System.State"]);
        const stateAtClose=text(closingFields["System.State"]);
        if(!stateAtClose) continue;
        const raw=(item?.rawFields&&typeof item.rawFields==="object"&&!Array.isArray(item.rawFields)?item.rawFields:{}) as Record<string,unknown>;
        const stateChangedAt=date(closingFields["Microsoft.VSTS.Common.StateChangeDate"]);
        const transitionInPeriod=!!stateChangedAt&&stateChangedAt>=start&&stateChangedAt<endExclusive;
        const terminalAt=TERMINAL.has(stateAtClose)?stateChangedAt:null;

        rows.push({
          id,
          title:text(closingFields["System.Title"])??item?.title??`Task ${id}`,
          client,
          createdBy:text(closingFields["System.CreatedBy"])??item?.createdByName??null,
          createdAt:createdAt.toISOString(),
          status:stateAtClose,
          lastStateChangedAt:stateChangedAt?.toISOString()??null,
          urgency:text(closingFields[fields.urgency])??item?.criticality??text(raw[fields.urgency]),
          prioritized:bool(closingFields[fields.prioritized])??item?.prioritized??null,
          assignedTo:text(closingFields["System.AssignedTo"])??item?.assignedToName??null,
          terminalAt:terminalAt?.toISOString()??null,
          remoteUrl:item?.remoteUrl??this.workItemUrl(id),
          stateAtOpen,
          stateAtClose,
          registeredInPeriod:createdAt>=start&&createdAt<endExclusive,
          deliveredInPeriod:stateAtClose==="Concluído"&&transitionInPeriod,
          canceledInPeriod:stateAtClose==="Cancelado"&&transitionInPeriod,
          enteredRegistrationInPeriod:stateAtClose==="Registro"&&transitionInPeriod,
          backlogInitial:!!stateAtOpen&&!BACKLOG_EXCLUDED.has(stateAtOpen),
          backlogCurrent:!BACKLOG_EXCLUDED.has(stateAtClose),
        });
      }
    }

    // Fallback: usa snapshots asOf para preservar backlog histórico mesmo sem o endpoint de revisões.
    if(rows.length===0){
      for(const id of candidateIds){
        const item=currentById.get(id);
        const openingFields=openingSnapshot.get(id)?.fields??{};
        const closingFields=closingSnapshot.get(id)?.fields??{};
        const sourceClient=text(closingFields[fields.client])??item?.client??null;
        const client=resolveSimerClient(sourceClient); if(!client) continue;

        const createdAt=date(closingFields["System.CreatedDate"])??item?.azureCreatedAt??null;
        if(!createdAt||createdAt>=endExclusive) continue;

        const stateAtOpen=text(openingFields["System.State"]);
        const stateAtClose=text(closingFields["System.State"])??item?.state??null;
        if(!stateAtClose) continue;
        const createdInPeriod=createdAt>=start&&createdAt<endExclusive;
        const raw=(item?.rawFields&&typeof item.rawFields==="object"&&!Array.isArray(item.rawFields)?item.rawFields:{}) as Record<string,unknown>;
        const urgencyValue=text(closingFields[fields.urgency])??item?.criticality??text(raw[fields.urgency]);
        const prioritized=bool(closingFields[fields.prioritized])??item?.prioritized??null;
        const snapshotStateChangedAt=date(closingFields["Microsoft.VSTS.Common.StateChangeDate"]);
        const fallbackStateChangedAt=snapshotStateChangedAt??(!snapshotAvailable?item?.stateChangedAt??null:null);
        const transitionInPeriod=!!fallbackStateChangedAt&&fallbackStateChangedAt>=start&&fallbackStateChangedAt<endExclusive;

        rows.push({
          id,
          title:text(closingFields["System.Title"])??item?.title??`Task ${id}`,
          client,
          createdBy:text(closingFields["System.CreatedBy"])??item?.createdByName??null,
          createdAt:createdAt.toISOString(),
          status:stateAtClose,
          lastStateChangedAt:fallbackStateChangedAt?.toISOString()??null,
          urgency:urgencyValue,
          prioritized,
          assignedTo:text(closingFields["System.AssignedTo"])??item?.assignedToName??null,
          terminalAt:TERMINAL.has(stateAtClose)?fallbackStateChangedAt?.toISOString()??null:null,
          remoteUrl:item?.remoteUrl??this.workItemUrl(id),
          stateAtOpen,
          stateAtClose,
          registeredInPeriod:createdInPeriod,
          deliveredInPeriod:stateAtClose==="Concluído"&&transitionInPeriod,
          canceledInPeriod:stateAtClose==="Cancelado"&&transitionInPeriod,
          enteredRegistrationInPeriod:stateAtClose==="Registro"&&transitionInPeriod,
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
    return {period:{month,timezone:"America/Sao_Paulo",start:start.toISOString(),close:close.toISOString()},cards:{registered:count(r=>r.registeredInPeriod),delivered:count(r=>r.deliveredInPeriod),canceled:count(r=>r.canceledInPeriod),inRegistration:count(r=>r.enteredRegistrationInPeriod),backlogInitial:count(r=>r.backlogInitial),backlogCurrent:count(r=>r.backlogCurrent)},pipeline:by(r=>r.status),urgency:by(r=>r.urgency),prioritization:[{name:"Priorizadas",total:count(r=>r.prioritized===true)},{name:"Não priorizadas",total:count(r=>r.prioritized===false)},{name:"Não informado",total:count(r=>r.prioritized===null)}],filters:{creators:[...new Set(rows.map(r=>r.createdBy).filter(Boolean))].sort(),teamCreators:[...new Set(rows.map(r=>r.createdBy).filter((value):value is string=>!!value&&isSupportAnalyst(value)))].sort(),clients:[...SIMER_CLIENTS],urgencies:[...new Set(rows.map(r=>r.urgency).filter(Boolean))].sort(),states:[...new Set(rows.map(r=>r.status).filter(Boolean))].sort()},rows,generatedAt:new Date().toISOString(),source:snapshotAvailable?(historyAvailable?"Azure DevOps · revisões + snapshots asOf · carteira SIMER":"Azure DevOps · snapshots asOf · carteira SIMER"):"Base sincronizada do Azure DevOps · snapshot local · carteira SIMER",quality:{historyAvailable,historyError,snapshotAvailable,snapshotError,historicalScopeError,mode:snapshotAvailable?(historyAvailable?"historical":"asof-snapshot"):"local-snapshot",historicalMetricsReliable:historyAvailable&&snapshotAvailable,backlogHistoricalReliable:snapshotAvailable},fieldMapping:fields};
  }
}
