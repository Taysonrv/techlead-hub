import axios from "axios";
import type { AxiosResponse } from "axios";
import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { AZURE_WORK_ITEM_FIELDS } from "./AzureWorkItemMapper";
import { isSupportAnalyst, resolveSimerClient } from "../domain/OperationalScope";

type Identity = { displayName?: string; uniqueName?: string };
type Revision = { id?: number; rev?: number; fields?: Record<string, unknown> };
type ReportingResponse = { values?: Revision[]; value?: Revision[]; continuationToken?: string; nextLink?: string; isLastBatch?: boolean };
type FieldDefinition = { name?: string; referenceName?: string };
type FieldListResponse = { value?: FieldDefinition[] };
type SnapshotItem = { id?: number; fields?: Record<string, unknown> };
type SnapshotBatchResponse = { value?: SnapshotItem[] };
type WiqlResponse = { workItems?: Array<{ id?: number }> };

export type LocalReportCandidate = {
  id: number;
  azureCreatedAt: Date | null;
  stateChangedAt: Date | null;
  azureClosedAt: Date | null;
};

/**
 * Work Items históricos que não se movimentaram no mês chegam via WIQL ASOF.
 * Os demais candidatos locais são apenas entradas/movimentações do recorte:
 * enviar toda a base local tornava as consultas ASOF lentas e incompletas.
 */
export function selectReportCandidateIds(
  localItems: ReadonlyArray<LocalReportCandidate>,
  start: Date,
  close: Date,
  revisionIds: ReadonlyArray<number>,
  openingIds: ReadonlyArray<number>,
  closingIds: ReadonlyArray<number>,
): number[] {
  const inPeriod = (dateValue: Date | null) =>
    !!dateValue && dateValue >= start && dateValue <= close;

  return [...new Set([
    ...revisionIds,
    ...openingIds,
    ...closingIds,
    ...localItems.filter((item) =>
      inPeriod(item.azureCreatedAt) ||
      inPeriod(item.stateChangedAt) ||
      inPeriod(item.azureClosedAt),
    ).map((item) => item.id),
  ])].filter((id) => Number.isSafeInteger(id) && id > 0);
}

export function assessHistoricalBacklog(
  scopeAvailable: boolean,
  snapshotsFetched: boolean,
  openingIds: ReadonlyArray<number>,
  closingIds: ReadonlyArray<number>,
  openingSnapshotIds: ReadonlySet<number>,
  closingSnapshotIds: ReadonlySet<number>,
): boolean {
  return scopeAvailable &&
    snapshotsFetched &&
    openingIds.every((id) => openingSnapshotIds.has(id)) &&
    closingIds.every((id) => closingSnapshotIds.has(id));
}

export type MonthlyStateEvent = { at: Date; state: string };

export function classifyMonthlyStateMovement(params: {
  stateAtClose: string;
  createdAt: Date;
  start: Date;
  close: Date;
  stateEvents?: ReadonlyArray<MonthlyStateEvent>;
  stateChangedAt?: Date | null;
}) {
  const { stateAtClose, createdAt, start, close } = params;
  const createdInPeriod = createdAt >= start && createdAt <= close;
  const events = (params.stateEvents ?? []).filter(
    (event) => event.at >= start && event.at <= close,
  );
  const entered = (state: string) => events.some((event) => event.state === state);
  const dedicatedStateChangeInPeriod =
    !!params.stateChangedAt &&
    params.stateChangedAt >= start &&
    params.stateChangedAt <= close;

  // O escopo funcional exige alteração efetiva de System.State.
  // CreatedDate, por si só, nunca prova Entrega/Cancelamento/Registro.
  const reachedDuringPeriod = (state: string) =>
    stateAtClose === state &&
    (entered(state) || dedicatedStateChangeInPeriod);

  return {
    createdInPeriod,
    deliveredInPeriod: reachedDuringPeriod("Concluído"),
    canceledInPeriod: reachedDuringPeriod("Cancelado"),
    enteredRegistrationInPeriod: reachedDuringPeriod("Registro"),
  };
}

// Nomes apresentados por System.CreatedBy nas exportações do Azure do time.
// Mantém a seleção explícita; pertencer à carteira não implica ser criador do time.
const CORRECTION_TEAM_DISPLAY_NAMES = new Set(["alan neto", "renan sousa", "tayson araujo"]);
export function isCorrectionTeamCreator(value: string | null | undefined): boolean {
  return !!value && (isSupportAnalyst(value) || CORRECTION_TEAM_DISPLAY_NAMES.has(
    value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"),
  ));
}

const TERMINAL = new Set(["Concluído", "Cancelado"]);
const BACKLOG_EXCLUDED = new Set(["Registro", ...TERMINAL]);

export function isBacklogState(state: string | null | undefined): boolean {
  return !!state && !BACKLOG_EXCLUDED.has(state);
}
const CACHE_TTL_MS = 10 * 60_000;
const FIELD_CACHE_TTL_MS = 60 * 60_000;
const AZURE_REQUEST_TIMEOUT_MS = 18_000;
const REVISION_STAGE_TIMEOUT_MS = 30_000;
const SNAPSHOT_STAGE_TIMEOUT_MS = 60_000;
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
export function saoPauloMonth(month: string, nowUtc: Date = new Date()) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Período inválido. Use YYYY-MM.");
  const parts = month.split("-");
  const year = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(year) || !Number.isInteger(m) || m < 1 || m > 12) throw new Error("Período inválido.");
  const start = new Date(`${month}-01T03:00:00.000Z`);
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  const endExclusive = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T03:00:00.000Z`);
  // Meses encerrados usam 23:59:59.999 do último dia em São Paulo.
  // No mês corrente, ASOF futuro é inválido no Azure DevOps: utilizamos
  // uma fotografia de "agora" com pequena margem contra diferença de relógio.
  const now = new Date(nowUtc.getTime() - 60_000);
  if (now < start) throw new Error("Não é possível consultar um período que ainda não começou.");
  const periodEnd = new Date(endExclusive.getTime() - 1);
  const close = periodEnd < now ? periodEnd : now;
  return { start, endExclusive, close };
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
  AND [System.State] <> 'Registro'
  AND [System.State] <> 'Concluído'
  AND [System.State] <> 'Cancelado'
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
        // Apenas erro de campo inválido admite tentar novamente com campos
        // centrais. Retentar 429/401/403/timeout duplicava a carga no Azure.
        const status=axios.isAxiosError(error)?error.response?.status:null;
        if(status!==400&&status!==422) throw error;
        console.warn("[correction-monthly-report] Campos customizados rejeitados; repetindo somente campos centrais.");
        values=await loadBatch(batch,coreFields);
      }
      for(const item of values){
        const id=Number(item.id??item.fields?.["System.Id"]);
        if(Number.isSafeInteger(id)) result.set(id,item);
      }
    }

    return result;
  }

  async get(month:string, forceRefresh=false) {
    // O botão Recarregar deve ignorar resultados parciais em cache quando
    // o Azure DevOps volta a ficar disponível.
    if(forceRefresh) CorrectionMonthlyReportService.reportCache.delete(month);
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
    const livePeriod=close.getTime()<endExclusive.getTime()-1;
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
    let openingScopeIds:number[]=[];
    let closingScopeIds:number[]=[];
    let historicalScopeError:string|null=null;
    let historicalScopeAvailable=false;
    try {
      [openingScopeIds,closingScopeIds]=await Promise.all([
        this.workItemIdsAsOf(new Date(start.getTime()-1)),
        this.workItemIdsAsOf(close),
      ]);
      historicalScopeAvailable=true;
    } catch(error) {
      historicalScopeError=error instanceof Error ? error.message : "Escopo histórico ASOF indisponível.";
      console.warn(`[correction-monthly-report] WIQL ASOF indisponível; usando revisões e base sincronizada. | ${historicalScopeError}`);
    }
    const candidateIds=selectReportCandidateIds(
      current, start, close, revisionIds, openingScopeIds, closingScopeIds,
    );
    let openingSnapshot=new Map<number,SnapshotItem>();
    let closingSnapshot=new Map<number,SnapshotItem>();
    let snapshotAvailable=false;
    let snapshotError:string|null=null;
    try {
      // Duas fotografias independentes: "sem registros" é válido quando o
      // escopo é vazio; "consulta falhou" não equivale a backlog zero.
      openingSnapshot=await this.snapshots(candidateIds,new Date(start.getTime()-1),fields);
      closingSnapshot=await this.snapshots(candidateIds,close,fields);
      snapshotAvailable=true;
    } catch(error) {
      snapshotError=error instanceof Error ? error.message : "Snapshots históricos do Azure indisponíveis.";
      console.warn(`[correction-monthly-report] Snapshots asOf indisponíveis; mantendo estratégia de revisões/snapshot local. | ${snapshotError}`);
    }
    const localPeriodCandidates=current.filter(item =>
      [item.azureCreatedAt,item.stateChangedAt,item.azureClosedAt]
        .some(value=>!!value&&value>=start&&value<=close),
    ).length;
    const externalHistorySuspicious =
      localPeriodCandidates>0 &&
      revisions.length===0 &&
      openingScopeIds.length===0 &&
      closingScopeIds.length===0;

    let backlogHistoricalReliable=assessHistoricalBacklog(
      historicalScopeAvailable,
      snapshotAvailable,
      openingScopeIds,
      closingScopeIds,
      new Set(openingSnapshot.keys()),
      new Set(closingSnapshot.keys()),
    ) && !externalHistorySuspicious;
    let movementHistoryReliable=historyAvailable && !externalHistorySuspicious;
    let localFallbackUsed=false;
    let localStateHistoryEvents=0;

    const currentById=new Map(current.map(item=>[item.id,item]));
    const grouped=new Map<number,Revision[]>();
    for(const revision of revisions){const id=Number(revision.id??revision.fields?.["System.Id"]);if(!Number.isSafeInteger(id))continue;const list=grouped.get(id)??[];list.push(revision);grouped.set(id,list);}

    let rows:Row[]=[];
    for(const [id,history] of grouped){
      history.sort((a,b)=>(date(a.fields?.["System.ChangedDate"])?.getTime()??0)-(date(b.fields?.["System.ChangedDate"])?.getTime()??0));
      const normalizedHistory=history.map(revision=>{const f=revision.fields??{};return{revision,at:date(f["System.ChangedDate"])??date(f["System.CreatedDate"]),state:text(f["System.State"])}}).filter((item):item is {revision:Revision;at:Date;state:string}=>!!item.at&&!!item.state);
      const firstHistory=history[0];const firstNormalized=normalizedHistory[0];if(!firstHistory||!firstNormalized)continue;
      const firstFields=firstHistory.fields??{};const createdAt=date(firstFields["System.CreatedDate"])??firstNormalized.at;if(createdAt>close)continue;
      const atOpen=[...normalizedHistory].reverse().find(event=>event.at<start)??null;
      const atClose=[...normalizedHistory].reverse().find(event=>event.at<=close)??null;
      if(!atClose && !closingSnapshot.has(id)) continue;
      const openingFields=openingSnapshot.get(id)?.fields??{};
      const closingFields=closingSnapshot.get(id)?.fields??{};
      const revisionStateAtOpen=atOpen?.state??null;
      const revisionStateAtClose=atClose?.state??null;
      const stateAtOpen=text(openingFields["System.State"])??revisionStateAtOpen;
      const stateAtClose=text(closingFields["System.State"])??revisionStateAtClose;
      if(!stateAtClose)continue;
      const stateEvents=normalizedHistory.filter((event,index)=>{
        const previousState=index>0?normalizedHistory[index-1]?.state:stateAtOpen;
        if(previousState) return event.state!==previousState;
        return createdAt>=start&&createdAt<endExclusive;
      });
      const inPeriod=stateEvents.filter(event=>event.at>=start&&event.at<=close);
      const latestFields=Object.keys(closingFields).length?closingFields:(atClose?.revision.fields??{});
      const currentItem=currentById.get(id);
      const lastState=[...stateEvents].reverse().find(event=>event.at<=close);
      const terminal=[...stateEvents].reverse().find(event=>event.at<=close&&TERMINAL.has(event.state));
      const closeStateChangedAt=date(closingFields["Microsoft.VSTS.Common.StateChangeDate"]);
      const movement=classifyMonthlyStateMovement({
        stateAtClose,
        createdAt,
        start,
        close,
        stateEvents:inPeriod,
        stateChangedAt:closeStateChangedAt,
      });
      const urgencyValue=text(latestFields[fields.urgency])??text(latestFields["Microsoft.VSTS.Common.Priority"]);
      const urgency=urgencyValue ? (/^\d+$/.test(urgencyValue)?`P${urgencyValue}`:urgencyValue) : currentItem?.criticality??null;
      const prioritized=bool(latestFields[fields.prioritized])??currentItem?.prioritized??null;
      const client=text(latestFields[fields.client])??currentItem?.client??null;
      const {deliveredInPeriod,canceledInPeriod,enteredRegistrationInPeriod}=movement;
      const effectiveStateChangedAt=closeStateChangedAt??lastState?.at??null;
      const effectiveTerminalAt=TERMINAL.has(stateAtClose)?(closeStateChangedAt??terminal?.at??null):null;
      rows.push({id,title:text(latestFields["System.Title"])??currentItem?.title??`Task ${id}`,client,createdBy:text(latestFields["System.CreatedBy"])??text(firstFields["System.CreatedBy"])??currentItem?.createdByName??null,createdAt:createdAt.toISOString(),status:stateAtClose,lastStateChangedAt:effectiveStateChangedAt?.toISOString()??null,urgency,prioritized,assignedTo:text(latestFields["System.AssignedTo"])??currentItem?.assignedToName??null,terminalAt:effectiveTerminalAt?.toISOString()??null,remoteUrl:currentItem?.remoteUrl??this.workItemUrl(id),stateAtOpen,stateAtClose,registeredInPeriod:movement.createdInPeriod,deliveredInPeriod,canceledInPeriod,enteredRegistrationInPeriod,backlogInitial:isBacklogState(stateAtOpen),backlogCurrent:isBacklogState(stateAtClose)});
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

        const client=text(closingFields[fields.client])??item?.client??null;
        const createdAt=date(closingFields["System.CreatedDate"])??item?.azureCreatedAt??null;
        if(!createdAt||createdAt>close) continue;

        const stateAtOpen=text(openingFields["System.State"]);
        const stateAtClose=text(closingFields["System.State"]);
        if(!stateAtClose) continue;
        const raw=(item?.rawFields&&typeof item.rawFields==="object"&&!Array.isArray(item.rawFields)?item.rawFields:{}) as Record<string,unknown>;
        const stateChangedAt=date(closingFields["Microsoft.VSTS.Common.StateChangeDate"]);
        const movement=classifyMonthlyStateMovement({stateAtClose,createdAt,start,close,stateChangedAt});
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
          registeredInPeriod:movement.createdInPeriod,
          deliveredInPeriod:movement.deliveredInPeriod,
          canceledInPeriod:movement.canceledInPeriod,
          enteredRegistrationInPeriod:movement.enteredRegistrationInPeriod,
          backlogInitial:isBacklogState(stateAtOpen),
          backlogCurrent:isBacklogState(stateAtClose),
        });
      }
    }

    // Fallback: usa snapshots asOf para preservar backlog histórico mesmo sem o endpoint de revisões.
    if(rows.length===0){
      for(const id of candidateIds){
        const item=currentById.get(id);
        const openingFields=openingSnapshot.get(id)?.fields??{};
        const closingFields=closingSnapshot.get(id)?.fields??{};
        const client=text(closingFields[fields.client])??item?.client??null;

        const createdAt=date(closingFields["System.CreatedDate"])??item?.azureCreatedAt??null;
        if(!createdAt||createdAt>close) continue;

        const stateAtOpen=text(openingFields["System.State"]);
        const stateAtClose=text(closingFields["System.State"])??(livePeriod?item?.state??null:null);
        if(!stateAtClose) continue;
        const createdInPeriod=createdAt>=start&&createdAt<=close;
        const raw=(item?.rawFields&&typeof item.rawFields==="object"&&!Array.isArray(item.rawFields)?item.rawFields:{}) as Record<string,unknown>;
        const urgencyValue=text(closingFields[fields.urgency])??item?.criticality??text(raw[fields.urgency]);
        const prioritized=bool(closingFields[fields.prioritized])??item?.prioritized??null;
        const snapshotStateChangedAt=date(closingFields["Microsoft.VSTS.Common.StateChangeDate"]);
        const fallbackStateChangedAt=snapshotStateChangedAt??(!snapshotAvailable&&livePeriod?item?.stateChangedAt??null:null);
        const movement=classifyMonthlyStateMovement({
          stateAtClose,
          createdAt,
          start,
          close,
          stateChangedAt:fallbackStateChangedAt,
        });

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
          deliveredInPeriod:movement.deliveredInPeriod,
          canceledInPeriod:movement.canceledInPeriod,
          enteredRegistrationInPeriod:movement.enteredRegistrationInPeriod,
          backlogInitial:snapshotAvailable&&isBacklogState(stateAtOpen),
          backlogCurrent:snapshotAvailable&&isBacklogState(stateAtClose),
        });
      }
    }
    // Se Azure Reporting/WIQL vierem vazios apesar de existirem Correções
    // locais no período, reconstrói o snapshot mensal a partir do histórico
    // persistido pelo sincronizador. Isso evita transformar ausência de
    // cobertura remota em "zero confiável".
    if(rows.length===0&&localPeriodCandidates>0&&current.length>0){
      const ids=current.map(item=>item.id).filter(id=>Number.isSafeInteger(id)&&id>0);
      type LocalStateHistory={workItemId:number;oldValue:string|null;newValue:string|null;changedAt:Date};
      let localHistory:LocalStateHistory[]=[];
      if(ids.length){
        localHistory=await prisma.$queryRaw<LocalStateHistory[]>(Prisma.sql`
          SELECT "workItemId", "oldValue", "newValue", "changedAt"
          FROM "AzureWorkItemHistory"
          WHERE "field" = 'state'
            AND "workItemId" IN (${Prisma.join(ids)})
          ORDER BY "workItemId" ASC, "changedAt" ASC, "id" ASC
        `);
      }
      localStateHistoryEvents=localHistory.length;
      const historyById=new Map<number,LocalStateHistory[]>();
      for(const event of localHistory){
        const list=historyById.get(event.workItemId)??[];
        list.push(event);
        historyById.set(event.workItemId,list);
      }

      for(const item of current){
        const createdAt=item.azureCreatedAt;
        if(!createdAt||createdAt>close) continue;
        const client=item.client?.trim()||null;
        const events=(historyById.get(item.id)??[])
          .filter(event=>event.oldValue!==event.newValue);

        // A primeira alteração depois de uma fotografia informa, em oldValue,
        // qual era o estado imediatamente antes dela.
        const firstAfterOpen=events.find(event=>event.changedAt>=start);
        const firstAfterClose=events.find(event=>event.changedAt>close);
        const stateAtOpen=createdAt>=start
          ? null
          : (firstAfterOpen?.oldValue?.trim()||item.state||null);
        const stateAtClose=firstAfterClose?.oldValue?.trim()||item.state||null;
        if(!stateAtClose) continue;

        const periodEvents=events
          .filter(event=>event.changedAt>=start&&event.changedAt<=close&&!!event.newValue?.trim())
          .map(event=>({at:event.changedAt,state:event.newValue!.trim()}));
        const movement=classifyMonthlyStateMovement({
          stateAtClose,
          createdAt,
          start,
          close,
          stateEvents:periodEvents,
          // StateChangeDate pertence ao estado atual. Só serve como evidência
          // histórica quando esse estado já existia no fechamento consultado.
          stateChangedAt:item.state===stateAtClose&&item.stateChangedAt&&item.stateChangedAt<=close
            ? item.stateChangedAt : null,
        });
        const lastStateEvent=[...events].reverse().find(event=>event.changedAt<=close)??null;
        const effectiveStateChangedAt=item.state===stateAtClose&&item.stateChangedAt&&item.stateChangedAt<=close
          ? item.stateChangedAt : lastStateEvent?.changedAt??null;
        const terminalEvent=[...events].reverse().find(event=>
          event.changedAt<=close&&!!event.newValue&&TERMINAL.has(event.newValue.trim()),
        )??null;

        rows.push({
          id:item.id,
          title:item.title||`Task ${item.id}`,
          client,
          createdBy:item.createdByName,
          createdAt:createdAt.toISOString(),
          status:stateAtClose,
          lastStateChangedAt:effectiveStateChangedAt?.toISOString()??null,
          urgency:item.criticality,
          prioritized:item.prioritized,
          assignedTo:item.assignedToName,
          terminalAt:TERMINAL.has(stateAtClose)?(effectiveStateChangedAt??terminalEvent?.changedAt)?.toISOString()??null:null,
          remoteUrl:item.remoteUrl??this.workItemUrl(item.id),
          stateAtOpen,
          stateAtClose,
          registeredInPeriod:movement.createdInPeriod,
          deliveredInPeriod:movement.deliveredInPeriod,
          canceledInPeriod:movement.canceledInPeriod,
          enteredRegistrationInPeriod:movement.enteredRegistrationInPeriod,
          backlogInitial:isBacklogState(stateAtOpen),
          backlogCurrent:isBacklogState(stateAtClose),
        });
      }

      if(rows.length>0){
        localFallbackUsed=true;
        // Eventos locais provam movimentos individuais, não a cobertura de
        // todas as Tasks. Uma fila parcialmente enriquecida não certifica zeros.
        movementHistoryReliable=false;
        // Reconstrução local é útil para operação, porém não recebe o selo
        // "histórico ASOF confiável" usado para homologação oficial.
        backlogHistoricalReliable=false;
        console.warn(
          `[correction-monthly-report] Azure histórico retornou vazio; fallback local ativado. | mês=${month} | candidatos=${localPeriodCandidates} | linhas=${rows.length} | eventosEstado=${localStateHistoryEvents}`,
        );
      }
    }

    // Uma única carteira para cards, gráficos, filtros, detalhamento e exportação.
    // Normaliza os nomes abreviados do Azure usando a regra compartilhada.
    rows=rows.flatMap(row=>{
      const client=resolveSimerClient(row.client);
      return client ? [{...row,client}] : [];
    });
    for(const row of rows){
      row.inPeriodUniverse=
        row.registeredInPeriod||
        row.deliveredInPeriod||
        row.canceledInPeriod||
        row.enteredRegistrationInPeriod||
        row.backlogInitial||
        row.backlogCurrent;
    }
        console.info([
      "[correction-monthly-report] Apuração concluída.",
      `mês=${month}`,
      `locais=${current.length}`,
      `candidatosPeriodo=${localPeriodCandidates}`,
      `revisoes=${revisions.length}`,
      `asofEntrada=${openingScopeIds.length}`,
      `asofFechamento=${closingScopeIds.length}`,
      `linhas=${rows.length}`,
      `fallbackLocal=${localFallbackUsed?"sim":"não"}`,
    ].join(" | "));
    const count=(p:(r:Row)=>boolean)=>rows.filter(p).length;
    const by=(selector:(r:Row)=>string|null)=>Object.entries(rows.reduce<Record<string,number>>((acc,row)=>{const key=selector(row)||"Não informado";acc[key]=(acc[key]??0)+1;return acc;},{})).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total);
    return {period:{month,timezone:"America/Sao_Paulo",start:start.toISOString(),close:close.toISOString()},cards:{registered:count(r=>r.registeredInPeriod),delivered:count(r=>r.deliveredInPeriod),canceled:count(r=>r.canceledInPeriod),inRegistration:count(r=>r.enteredRegistrationInPeriod),backlogInitial:count(r=>r.backlogInitial),backlogCurrent:count(r=>r.backlogCurrent)},pipeline:by(r=>r.status),urgency:by(r=>r.urgency),prioritization:[{name:"Priorizadas",total:count(r=>r.prioritized===true)},{name:"Não priorizadas",total:count(r=>r.prioritized===false)},{name:"Não informado",total:count(r=>r.prioritized===null)}],filters:{creators:[...new Set(rows.map(r=>r.createdBy).filter(Boolean))].sort(),teamCreators:[...new Set(rows.map(r=>r.createdBy).filter((value):value is string=>!!value&&isCorrectionTeamCreator(value)))].sort(),clients:[...new Set(rows.map(r=>r.client).filter((value):value is string=>!!value))].sort(),urgencies:[...new Set(rows.map(r=>r.urgency).filter(Boolean))].sort(),states:[...new Set(rows.map(r=>r.status).filter(Boolean))].sort()},rows,generatedAt:new Date().toISOString(),source:localFallbackUsed?"Base sincronizada do Azure DevOps · histórico local reconstruído":snapshotAvailable?(historyAvailable?"Azure DevOps · revisões + snapshots asOf":"Azure DevOps · snapshots asOf"):"Base sincronizada do Azure DevOps · snapshot local",quality:{historyAvailable,historyError,snapshotAvailable,snapshotError,historicalScopeError,externalHistorySuspicious,localFallbackUsed,localStateHistoryEvents,mode:localFallbackUsed?"local-history-fallback":backlogHistoricalReliable&&historyAvailable?"historical":snapshotAvailable?"asof-partial":"local-snapshot",movementHistoryReliable,historicalMetricsReliable:!localFallbackUsed&&historyAvailable&&backlogHistoricalReliable,backlogHistoricalReliable,diagnostics:{localRecords:current.length,localPeriodCandidates,revisions:revisions.length,openingScopeIds:openingScopeIds.length,closingScopeIds:closingScopeIds.length,snapshotCandidates:candidateIds.length,openingSnapshotItems:openingSnapshot.size,closingSnapshotItems:closingSnapshot.size,outputRows:rows.length}},fieldMapping:fields};
  }
}
