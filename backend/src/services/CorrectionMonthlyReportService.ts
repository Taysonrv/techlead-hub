import axios from "axios";
import { createHash } from "node:crypto";
import type { AxiosResponse } from "axios";
import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { AZURE_WORK_ITEM_FIELDS } from "./AzureWorkItemMapper";
import { resolveSimerClient } from "../domain/OperationalScope";
import { azureCollection, azureFailureMessage } from "./AzureDevOpsResponse";

type Identity = { displayName?: string; uniqueName?: string };
type Revision = { id?: number; rev?: number; fields?: Record<string, unknown> };
type ReportingResponse = { values?: Revision[]; value?: Revision[]; continuationToken?: string; nextLink?: string; isLastBatch?: boolean };
type FieldDefinition = { name?: string; referenceName?: string };
type FieldListResponse = { value?: FieldDefinition[] };
type SnapshotItem = { id?: number; rev?: number; fields?: Record<string, unknown> };
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
  // CreatedDate isoladamente não comprova entrada em nenhum estado.
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
const CORRECTION_TEAM_DISPLAY_NAMES = new Set([
  "alan neto", "alan kardek da silva barros neto",
  "renan sousa", "renan breno carvalho",
  "tayson araujo", "tayson alves de araujo",
]);
export function isCorrectionTeamCreator(value: string | null | undefined): boolean {
  return !!value && CORRECTION_TEAM_DISPLAY_NAMES.has(
    (identityName(value)??"").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"),
  );
}

// Reporting pode retornar apenas uniqueName: "Nome <email>". Batch ASOF
// normalmente retorna displayName; ambas as representações são identidades.
export function identityName(value: unknown): string | null {
  const name=typeof value==="string"?value:
    value&&typeof value==="object"?(value as Identity).displayName||(value as Identity).uniqueName:null;
  return typeof name==="string"?name.replace(/\s*<[^<>]*>\s*$/,"").trim()||null:null;
}

const TERMINAL = new Set(["Concluído", "Cancelado"]);
const BACKLOG_EXCLUDED = new Set(["Registro", ...TERMINAL]);

export function isBacklogState(state: string | null | undefined): boolean {
  return !!state && !BACKLOG_EXCLUDED.has(state);
}
const CACHE_TTL_MS = 10 * 60_000;
const FIELD_CACHE_TTL_MS = 60 * 60_000;
const AZURE_REQUEST_TIMEOUT_MS = 15_000;
const REVISION_STAGE_TIMEOUT_MS = 30_000;
const SNAPSHOT_STAGE_TIMEOUT_MS = 40_000;
const REPORT_CACHE_TTL_MS = 2 * 60_000;

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") return identityName(value);
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
function closingFieldEvidence(snapshot:SnapshotItem|undefined,revision:Revision|undefined) {
  if(!snapshot) return revision?.fields??{};
  const sameRevision=(snapshot.rev!==undefined&&snapshot.rev===revision?.rev)||
    (!!date(snapshot.fields?.["System.ChangedDate"])&&
      date(snapshot.fields?.["System.ChangedDate"])?.getTime()===date(revision?.fields?.["System.ChangedDate"])?.getTime());
  // Missing fields may be filled only from the same historical revision.
  return sameRevision?{...revision?.fields,...snapshot.fields}:snapshot.fields??{};
}
function historicalUrgency(fields:Record<string,unknown>,referenceName:string) {
  const value=text(fields[referenceName]);
  return value&&/^\d+$/.test(value)?`P${value}`:value;
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
  assignedAtClose?:string|null; assignedToSource?:"local-sync"|"azure-current"|"unavailable";
  terminalAt:string|null; remoteUrl:string|null; stateAtOpen:string|null; stateAtClose:string|null;
  registeredInPeriod:boolean; deliveredInPeriod:boolean; canceledInPeriod:boolean; enteredRegistrationInPeriod:boolean;
  backlogInitial:boolean; backlogCurrent:boolean; inPeriodUniverse?:boolean;
  inMonthlyIndicators?:boolean;
};

export class CorrectionMonthlyReportService {
  private static cache = new Map<string,{expiresAt:number;revisions:Revision[]}>();
  private static fieldCache = new Map<string,{expiresAt:number;fields:FieldDefinition[]}>();
  private static reportCache = new Map<string,{expiresAt:number;data:unknown}>();
  private static previews = new Map<string,Promise<unknown>>();
  private static previewErrors = new Map<string,{error:unknown;expiresAt:number}>();
  private static retryAfter = new Map<string,number>();
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
    return axios.create({baseURL:`https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}`,timeout:AZURE_REQUEST_TIMEOUT_MS,maxRedirects:0,headers:{Accept:"application/json",Authorization:`Basic ${Buffer.from(`:${pat}`).toString("base64")}`}});
  }
  private async fieldDefinitions() {
    const {organization,project}=this.azureConfig();
    const key=`${organization}/${project}`;
    const cached=CorrectionMonthlyReportService.fieldCache.get(key);
    if(cached&&cached.expiresAt>Date.now()) return cached.fields;
    try {
      const response=await this.client().get<FieldListResponse>("/_apis/wit/fields",{params:{"api-version":"7.1"}});
      const fields=azureCollection<FieldDefinition>(response,"value","campos");
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
    let continuationToken:string|undefined;
    const visited=new Set<string>();
    do {
      const remaining=deadline-Date.now();
      if(remaining<=0) throw new Error("Consulta de revisões do Azure excedeu o limite de tempo.");
      const response:AxiosResponse<ReportingResponse>=await client.get<ReportingResponse>(
        nextLink??"/_apis/wit/reporting/workitemrevisions",
        nextLink ? {
          timeout:Math.max(1_000,Math.min(AZURE_REQUEST_TIMEOUT_MS,remaining)),
        } : {
          params:{
            fields:requested.join(","),
            types:"Correção Clientes",
            ...(first?{startDateTime:start.toISOString()}:{continuationToken}),
            includeIdentityRef:true,
            includeLatestOnly:false,
            "$maxPageSize":2000,
            "api-version":"7.1",
          },
          timeout:Math.max(1_000,Math.min(AZURE_REQUEST_TIMEOUT_MS,remaining)),
        },
      );
      all.push(...azureCollection<Revision>(response,["values","value"],"Reporting de revisões"));
      nextLink=response.data.isLastBatch===true?null:(response.data.nextLink??null);
      continuationToken=response.data.isLastBatch===true?undefined:response.data.continuationToken;
      if(response.data.isLastBatch===false&&!nextLink&&!continuationToken)
        throw new Error("Revisões incompletas: Azure não retornou continuação da consulta.");
      const cursor=nextLink??continuationToken;
      if(cursor&&visited.has(cursor)) throw new Error("Revisões incompletas: continuação repetida pelo Azure.");
      if(cursor) visited.add(cursor);
      first=false;
    } while(nextLink||continuationToken);

    CorrectionMonthlyReportService.cache.set(cacheKey,{expiresAt:Date.now()+CACHE_TTL_MS,revisions:all});
    return all;
  }

  private async workItemIdsAsOf(asOf:Date,includeTerminal=false):Promise<number[]> {
    const query = `SELECT [System.Id]
FROM WorkItems
WHERE [System.TeamProject] = @project
  AND [System.WorkItemType] = 'Correção Clientes'
${includeTerminal?"":"  AND [System.State] <> 'Concluído'\n  AND [System.State] <> 'Cancelado'"}
ASOF '${asOf.toISOString()}'`;
    const response=await this.client().post<WiqlResponse>(
      "/_apis/wit/wiql",
      {query},
      {params:{"api-version":"7.1"},timeout:AZURE_REQUEST_TIMEOUT_MS},
    );
    return [...new Set(azureCollection<{id?:number}>(response,"workItems","escopo WIQL ASOF")
      .map(item=>Number(item.id))
      .filter((id):id is number=>Number.isSafeInteger(id)&&id>0))];
  }

  /** Recuperação independente do Reporting/WIQL: revisões completas por ID. */
  private async recoverHistoricalSnapshots(ids:number[],start:Date,close:Date) {
    const opening=new Map<number,SnapshotItem>();
    const closing=new Map<number,SnapshotItem>();
    const recovered:Revision[]=[];
    const completed=new Set<number>();
    const deadline=Date.now()+30_000;
    let cursor=0;
    let failures=0;
    let client:ReturnType<CorrectionMonthlyReportService["client"]>;
    try { client=this.client(); }
    catch { return {opening,closing,revisions:recovered,completed,failures:ids.length}; }
    const worker=async()=>{
      while(cursor<ids.length&&Date.now()<deadline&&failures<4){
        const id=ids[cursor++]!;
        const history:Revision[]=[];
        try {
          let skip=0;
          while(true){
            const remaining=deadline-Date.now();
            if(remaining<=0) throw new Error("Prazo de recuperação do histórico excedido.");
            const response=await client.get<{value?:Revision[]}>(`/_apis/wit/workitems/${id}/revisions`,{
              params:{"$top":200,"$skip":skip,"api-version":"7.1"},
              timeout:Math.max(1,Math.min(AZURE_REQUEST_TIMEOUT_MS,remaining)),
            });
            const page=azureCollection<Revision>(response,"value","revisões por Task");
            history.push(...page.map(revision=>({...revision,id})));
            if(page.length<200) break;
            skip+=page.length;
          }
          // Sem a primeira revisão, a fotografia anterior não é comprovada.
          if(!history.length||history[0]?.rev!==1) throw new Error("Revisões incompletas.");
          history.sort((a,b)=>(a.rev??0)-(b.rev??0));
          const at=(revision:Revision)=>date(revision.fields?.["System.ChangedDate"]);
          const before=[...history].reverse().find(revision=>{const changed=at(revision);return !!changed&&changed<start;});
          const final=[...history].reverse().find(revision=>{const changed=at(revision);return !!changed&&changed<=close;});
          if(before) opening.set(id,{id,fields:before.fields});
          if(final) closing.set(id,{id,fields:final.fields});
          recovered.push(...history);
          completed.add(id);
        } catch { failures+=1; }
      }
    };
    await Promise.all(Array.from({length:Math.min(4,ids.length)},worker));
    return {opening,closing,revisions:recovered,completed,failures:failures+Math.max(0,ids.length-cursor)};
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
      return azureCollection<SnapshotItem>(response,"value","snapshots ASOF");
    };

    let cursor=0;
    const worker=async()=>{while(cursor<normalizedIds.length){
      if(Date.now()>=deadline) throw new Error("Consulta de snapshots do Azure excedeu o limite de tempo.");
      const index=cursor;
      cursor+=200;
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
    }};
    await Promise.all(Array.from({length:Math.min(3,Math.ceil(normalizedIds.length/200))},worker));

    return result;
  }

  private snapshotKey(month:string) {
    const scope=createHash("sha256").update(`${process.env.AZURE_DEVOPS_ORGANIZATION??""}/${process.env.AZURE_DEVOPS_PROJECT??""}/support-simer-v2`).digest("hex").slice(0,24);
    return `correction-monthly-close:${scope}:${month}`;
  }

  private async currentAssignees(ids:number[]):Promise<Map<number,string|null>> {
    const result=new Map<number,string|null>();
    if(!ids.length) return result;
    const client=this.client();
    const deadline=Date.now()+AZURE_REQUEST_TIMEOUT_MS;
    let cursor=0;
    const worker=async()=>{while(cursor<ids.length){
      const batch=ids.slice(cursor,cursor+200);cursor+=200;
      const remaining=deadline-Date.now();
      if(remaining<=0) throw new Error("Consulta de responsáveis atuais excedeu o limite de tempo.");
      const response=await client.post<SnapshotBatchResponse>("/_apis/wit/workitemsbatch",{
        ids:batch,fields:["System.Id","System.AssignedTo"],errorPolicy:"Omit",
      },{params:{"api-version":"7.1"},timeout:remaining});
      for(const item of azureCollection<SnapshotItem>(response,"value","responsáveis atuais")){
        const id=Number(item.id??item.fields?.["System.Id"]);
        if(Number.isSafeInteger(id)) result.set(id,identityName(item.fields?.["System.AssignedTo"]));
      }
    }};
    await Promise.all(Array.from({length:Math.min(3,Math.ceil(ids.length/200))},worker));
    return result;
  }

  private async loadClosing(month:string):Promise<{rows:Row[];reliable:boolean;coverage?:Record<string,unknown>}|null> {
    try {
      const saved=await prisma.systemSetting.findUnique({where:{key:this.snapshotKey(month)}});
      if(!saved) return null;
      const parsed=JSON.parse(saved.value);
      // Descarta prévias antigas que podiam usar o estado atual em meses passados.
      return (parsed.version===5)&&Array.isArray(parsed.rows)?parsed:null;
    } catch { return null; }
  }

  private async saveClosing(month:string,data:{rows:Row[];quality:{backlogHistoricalReliable:boolean;movementHistoryReliable?:boolean;backlogInitialAvailable?:boolean;backlogCurrentAvailable?:boolean}}) {
    // Um mês em andamento não representa fechamento para o próximo mês.
    const period=saoPauloMonth(month);
    if(period.close.getTime()!==period.endExclusive.getTime()-1) return;
    try {
      const previous=await this.loadClosing(month);
      const reliable=data.quality.backlogHistoricalReliable;
      if(previous?.reliable&&!reliable) return;
      if(previous?.reliable&&previous.coverage?.movementHistoryReliable===true&&!data.quality.movementHistoryReliable) return;
      const value=JSON.stringify({version:5,reliable,coverage:{movementHistoryReliable:data.quality.movementHistoryReliable??false,backlogInitialAvailable:data.quality.backlogInitialAvailable??reliable,backlogCurrentAvailable:data.quality.backlogCurrentAvailable??reliable},savedAt:new Date().toISOString(),rows:data.rows.filter(row=>row.inPeriodUniverse)});
      await prisma.systemSetting.upsert({where:{key:this.snapshotKey(month)},create:{key:this.snapshotKey(month),value,encrypted:false},update:{value,encrypted:false}});
    } catch(error) {
      console.warn("[correction-monthly-report] Não foi possível persistir fechamento:",error instanceof Error?error.message:String(error));
    }
  }

  /** A tela recebe a prévia local; o Azure atualiza o mesmo mês em background. */
  async getPreview(month:string,forceRefresh=false) {
    saoPauloMonth(month);
    const cache=CorrectionMonthlyReportService.reportCache;
    const pending=CorrectionMonthlyReportService.inFlight;
    if(forceRefresh&&!pending.has(month)) {
      const previous=cache.get(month);
      this.invalidateMonth(month);
      // A recarga ignora caches do Azure, mas mantém a última apuração
      // visível enquanto consulta novamente e se a atualização falhar.
      if(previous) cache.set(month,{...previous,expiresAt:0});
    }
    const withStatus=(data:unknown)=>{
      const report=data as {quality:Record<string,unknown>};
      const refreshing=pending.has(month);
      const retryAt=CorrectionMonthlyReportService.retryAfter.get(month)??0;
      return {...report,quality:{...report.quality,refreshing,
        nextHistoryRetryAt:!refreshing&&retryAt>Date.now()?new Date(retryAt).toISOString():undefined}};
    };
    const cached=cache.get(month);
    const previewError=CorrectionMonthlyReportService.previewErrors.get(month);
    if(!cached&&previewError&&previewError.expiresAt>Date.now()) throw previewError.error;
    const retryAt=CorrectionMonthlyReportService.retryAfter.get(month)??0;
    const needsRefresh=forceRefresh||!cached||cached.expiresAt<=Date.now()||(retryAt>0&&Date.now()>=retryAt);
    if(cached&&(!needsRefresh||pending.has(month))) return withStatus(cached.data);
    let data=cached?.data;
    if(!cached){
      let preview=CorrectionMonthlyReportService.previews.get(month);
      if(!preview){
        preview=this.build(month,true).then(local=>{
          CorrectionMonthlyReportService.previewErrors.delete(month);
          cache.set(month,{expiresAt:Date.now()+REPORT_CACHE_TTL_MS,data:local});
          return local;
        }).catch(error=>{
          CorrectionMonthlyReportService.previewErrors.set(month,{error,expiresAt:Date.now()+CACHE_TTL_MS});
          console.warn(`[correction-monthly-report] Falha ao preparar prévia local. | mês=${month} | ${error instanceof Error?error.message:String(error)}`);
          throw error;
        }).finally(()=>CorrectionMonthlyReportService.previews.delete(month));
        CorrectionMonthlyReportService.previews.set(month,preview);
      }
      data=await preview;
    }
    // A expiração só agenda nova consulta: não substitui a cobertura remota
    // por uma prévia local durante os dez minutos entre tentativas parciais.
    if(!pending.has(month)&&(forceRefresh||Date.now()>=retryAt)){
      const refresh=(async()=>{
        // Persistir a prévia não bloqueia a primeira resposta. A gravação
        // antecede a apuração remota para não sobrescrever seu fechamento.
        if(!cached)await this.saveClosing(month,data as Awaited<ReturnType<CorrectionMonthlyReportService["build"]>>);
        return this.build(month);
      })().then(async updated=>{
        await this.saveClosing(month,updated);
        const completed={...updated,quality:{...updated.quality,lastHistoryAttemptAt:new Date(Date.now()).toISOString()}};
        cache.set(month,{expiresAt:Date.now()+REPORT_CACHE_TTL_MS,data:completed});
        if(!updated.quality.historicalMetricsReliable) CorrectionMonthlyReportService.retryAfter.set(month,Date.now()+10*60_000);
        else CorrectionMonthlyReportService.retryAfter.delete(month);
        return completed;
      }).catch(error=>{
        CorrectionMonthlyReportService.retryAfter.set(month,Date.now()+10*60_000);
        const refreshError=error instanceof Error?error.message:String(error);
        console.warn("[correction-monthly-report] Atualização histórica em background falhou:",refreshError);
        const report=data as {quality:Record<string,unknown>};
        const failed={...report,quality:{...report.quality,refreshError,lastHistoryAttemptAt:new Date(Date.now()).toISOString()}};
        cache.set(month,{expiresAt:Date.now()+REPORT_CACHE_TTL_MS,data:failed});
        return failed;
      }).finally(()=>pending.delete(month));
      pending.set(month,refresh);
    }
    return withStatus(data);
  }

  async get(month:string, forceRefresh=false) {
    // O botão Recarregar deve ignorar resultados parciais em cache quando
    // o Azure DevOps volta a ficar disponível.
    if(forceRefresh) this.invalidateMonth(month);
    // Em desenvolvimento o React StrictMode pode montar o painel duas vezes.
    // Reutilizamos a mesma geração por mês para não duplicar as consultas
    // históricas pesadas no Azure DevOps.
    const cached=CorrectionMonthlyReportService.reportCache.get(month);
    if(cached&&cached.expiresAt>Date.now()) return cached.data;

    const existing=CorrectionMonthlyReportService.inFlight.get(month);
    if(existing) return existing;

    const generation=this.build(month)
      .then(async data=>{
        await this.saveClosing(month,data);
        CorrectionMonthlyReportService.reportCache.set(month,{expiresAt:Date.now()+REPORT_CACHE_TTL_MS,data});
        return data;
      })
      .finally(()=>{
        CorrectionMonthlyReportService.inFlight.delete(month);
      });

    CorrectionMonthlyReportService.inFlight.set(month,generation);
    return generation;
  }

  private invalidateMonth(month:string) {
    CorrectionMonthlyReportService.reportCache.delete(month);
    CorrectionMonthlyReportService.previewErrors.delete(month);
    CorrectionMonthlyReportService.fieldCache.delete(`${process.env.AZURE_DEVOPS_ORGANIZATION??""}/${process.env.AZURE_DEVOPS_PROJECT??""}`);
    for(const key of CorrectionMonthlyReportService.cache.keys())
      if(key.includes(`/corrections/${month}-01/`)) CorrectionMonthlyReportService.cache.delete(key);
  }

  private async build(month:string,localOnly=false) {
    const startedAt=Date.now();
    if(localOnly) console.info(`[correction-monthly-report] Preparando prévia local. | mês=${month}`);
    const {start,endExclusive,close}=saoPauloMonth(month);
    const livePeriod=close.getTime()<endExclusive.getTime()-1;
    const savedClosingPromise=!livePeriod?this.loadClosing(month):Promise.resolve(null);
    const scopePromise=localOnly?Promise.resolve({ids:null,complete:false,error:null}):Promise.allSettled([
      this.workItemIdsAsOf(new Date(start.getTime()-1)),
      // O pipeline é a carteira inteira no fechamento, inclusive Registro
      // e terminais. A descoberta remota não depende da sincronização local.
      this.workItemIdsAsOf(close,true),
    ]).then(results=>({
      ids:results.map(result=>result.status==="fulfilled"?result.value:[]) as [number[],number[]],
      complete:results.every(result=>result.status==="fulfilled"),
      error:results.flatMap((result,index)=>result.status==="rejected"?[`${index===0?"Abertura":"Fechamento"}: ${azureFailureMessage(result.reason)}`]:[]).join(" | ")||null,
    }));
    const currentPromise=prisma.azureWorkItem.findMany({where:{workItemType:"Correção Clientes"},select:{id:true,title:true,client:true,criticality:true,prioritized:true,assignedToName:true,remoteUrl:true,createdByName:true,azureCreatedAt:true,state:true,stateChangedAt:true,azureClosedAt:true}});
    let fields:{client:string;prioritized:string;urgency:string}={client:AZURE_WORK_ITEM_FIELDS.client,prioritized:AZURE_WORK_ITEM_FIELDS.prioritized,urgency:AZURE_WORK_ITEM_FIELDS.criticality};
    let revisions:Revision[]=[];
    let historyAvailable=false;
    let historyError:string|null=null;
    try {
      if(!localOnly){
      fields=await this.resolveFields();
      revisions=await this.revisions(fields,start);
      historyAvailable=true;
      }
    } catch(error) {
      historyError=azureFailureMessage(error);
      console.warn(`[correction-monthly-report] Histórico do Azure indisponível; usando snapshot local. | ${historyError}`);
    }
    const [savedClosing,currentItems]=await Promise.all([savedClosingPromise,currentPromise]);
    const archivedRows=new Map((savedClosing?.rows??[]).map(row=>[row.id,row]));
    const current=currentItems.filter(item=>!!resolveSimerClient(item.client)&&isCorrectionTeamCreator(item.createdByName));
    const revisionIds=revisions
      .map(revision=>Number(revision.id??revision.fields?.["System.Id"]))
      .filter((id):id is number=>Number.isSafeInteger(id)&&id>0);
    let openingScopeIds:number[]=[];
    let closingScopeIds:number[]=[];
    let historicalScopeError:string|null=null;
    let historicalScopeAvailable=false;
    const scope=await scopePromise;
    if(scope.ids){
      [openingScopeIds,closingScopeIds]=scope.ids;
      historicalScopeAvailable=scope.complete;
    }
    historicalScopeError=scope.error;
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
      if(!localOnly){
      const results=await Promise.allSettled([
        this.snapshots(candidateIds,new Date(start.getTime()-1),fields),
        this.snapshots(candidateIds,close,fields),
      ]);
      if(results[0].status==="fulfilled") openingSnapshot=results[0].value;
      if(results[1].status==="fulfilled") closingSnapshot=results[1].value;
      snapshotAvailable=results.every(result=>result.status==="fulfilled");
      const errors=results.flatMap((result,index)=>result.status==="rejected"?[`${index===0?"Abertura":"Fechamento"}: ${azureFailureMessage(result.reason)}`]:[]);
      if(errors.length) throw new Error(errors.join(" | "));
      }
    } catch(error) {
      snapshotError=azureFailureMessage(error);
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
    if(!localOnly&&externalHistorySuspicious&&!historicalScopeError)
      historicalScopeError="O Azure retornou escopo histórico vazio apesar de existirem Tasks locais no período. Confirme organização, projeto e acesso da integração; essa resposta não comprova carteira ou backlog zerados.";

    let perItemHistoryRecoveryUsed=false;
    let recoveredHistoryItems=0;
    let recoveryCandidates=0;
    const recoveredRevisionIds=new Set<number>();
    const incompleteClosingEvidence=[...closingSnapshot].some(([,snapshot])=>{
      const f=snapshot.fields??{};
      if(!isCorrectionTeamCreator(identityName(f["System.CreatedBy"]))) return false;
      if(!text(f[fields.client])) return true;
      return !!resolveSimerClient(text(f[fields.client]))&&!date(f["Microsoft.VSTS.Common.StateChangeDate"]);
    });
    // Inclui estoque antigo sem movimento no mês e itens encerrados depois
    // da abertura. A fotografia é o último estado ANTES do início do mês,
    // exatamente o fechamento do mês anterior (America/Sao_Paulo).
    if(!localOnly&&(!snapshotAvailable||incompleteClosingEvidence||
      ((!historyAvailable||revisions.length===0)&&closingSnapshot.size===0&&current.length>0))){
      const ids=new Set(current.filter(item=>
        !!item.azureCreatedAt&&item.azureCreatedAt<=close&&
        !!resolveSimerClient(item.client)&&isCorrectionTeamCreator(item.createdByName)&&
        (!TERMINAL.has(item.state)||!item.stateChangedAt||item.stateChangedAt>=start),
      ).sort((a,b)=>(a.azureCreatedAt?.getTime()??0)-(b.azureCreatedAt?.getTime()??0)).map(item=>item.id));
      // Inclui Tasks encontradas no Azure que ainda não existem no banco local.
      for(const [id,snapshot] of closingSnapshot){
        const f=snapshot.fields??{};
        if(isCorrectionTeamCreator(identityName(f["System.CreatedBy"]))&&
          (!text(f[fields.client])||resolveSimerClient(text(f[fields.client])))) {
          const changed=date(f["Microsoft.VSTS.Common.StateChangeDate"]);
          if(!text(f[fields.client])||!TERMINAL.has(text(f["System.State"])??"")||!changed||changed>=start) ids.add(id);
        }
      }
      recoveryCandidates=ids.size;
      if(ids.size){
        const recovered=await this.recoverHistoricalSnapshots([...ids],start,close);
        recoveredHistoryItems=recovered.completed.size;
        if(recoveredHistoryItems){
          perItemHistoryRecoveryUsed=true;
          revisions=[...revisions,...recovered.revisions];
          for(const id of recovered.completed) recoveredRevisionIds.add(id);
          // Revisões completas também recuperam os campos customizados que
          // o batch pode ter omitido. Valores ASOF existentes têm precedência.
          for(const [target,items] of [[openingSnapshot,recovered.opening],[closingSnapshot,recovered.closing]] as const)
            for(const [id,item] of items){
              const existing=target.get(id);
              target.set(id,{...item,...existing,fields:{...item.fields,...existing?.fields}});
            }
        }
        console.info(`[correction-monthly-report] Recuperação por Task. | candidatos=${ids.size} | recuperados=${recoveredHistoryItems} | falhas=${recovered.failures} | fechamentoAnterior=${new Date(start.getTime()-1).toISOString()}`);
      }
    }

    const missingClosingFields=closingScopeIds.filter(id=>{
      const f=closingSnapshot.get(id)?.fields??{};
      const creator=identityName(f["System.CreatedBy"]);
      return !creator||!text(f["System.State"])||!date(f["System.CreatedDate"])||
        (isCorrectionTeamCreator(creator)&&!text(f[fields.client]));
    }).length;
    let backlogHistoricalReliable=assessHistoricalBacklog(
      historicalScopeAvailable,
      snapshotAvailable||perItemHistoryRecoveryUsed,
      openingScopeIds,
      closingScopeIds,
      new Set(openingSnapshot.keys()),
      new Set(closingSnapshot.keys()),
    ) && !externalHistorySuspicious && missingClosingFields===0 &&
      openingScopeIds.every(id=>!!text(openingSnapshot.get(id)?.fields?.["System.State"]));
    const closingMovementCoverage=[...closingSnapshot].filter(([,snapshot])=>{
      const f=snapshot.fields??{};
      return !!resolveSimerClient(text(f[fields.client]))&&isCorrectionTeamCreator(identityName(f["System.CreatedBy"]));
    }).every(([id,snapshot])=>{
      const stateChanged=date(snapshot.fields?.["Microsoft.VSTS.Common.StateChangeDate"]);
      return (!!stateChanged&&stateChanged<=close)||recoveredRevisionIds.has(id);
    });
    let movementHistoryReliable=backlogHistoricalReliable&&
      (closingMovementCoverage||(historyAvailable&&revisions.length>0));
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
      const latestFields=closingFieldEvidence(closingSnapshot.get(id),atClose?.revision);
      if(text(latestFields["System.WorkItemType"])&&text(latestFields["System.WorkItemType"])!=="Correção Clientes") continue;
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
      const urgency=historicalUrgency(latestFields,fields.urgency);
      const prioritized=bool(latestFields[fields.prioritized]);
      const client=text(latestFields[fields.client]);
      const {deliveredInPeriod,canceledInPeriod,enteredRegistrationInPeriod}=movement;
      const effectiveStateChangedAt=closeStateChangedAt??lastState?.at??null;
      const effectiveTerminalAt=TERMINAL.has(stateAtClose)?(closeStateChangedAt??terminal?.at??null):null;
      rows.push({id,title:text(latestFields["System.Title"])??`Task ${id}`,client,createdBy:identityName(latestFields["System.CreatedBy"])??identityName(firstFields["System.CreatedBy"])??currentItem?.createdByName??null,createdAt:createdAt.toISOString(),status:stateAtClose,lastStateChangedAt:effectiveStateChangedAt?.toISOString()??null,urgency,prioritized,assignedTo:null,assignedAtClose:identityName(latestFields["System.AssignedTo"]),terminalAt:effectiveTerminalAt?.toISOString()??null,remoteUrl:currentItem?.remoteUrl??this.workItemUrl(id),stateAtOpen,stateAtClose,registeredInPeriod:movement.createdInPeriod,deliveredInPeriod,canceledInPeriod,enteredRegistrationInPeriod,backlogInitial:isBacklogState(stateAtOpen),backlogCurrent:isBacklogState(stateAtClose)});
    }

    // O endpoint de revisões retorna apenas itens que tiveram revisão no período.
    // Completamos o universo com os snapshots para preservar backlog sem movimentação.
    if(snapshotAvailable||closingSnapshot.size){
      const existingIds=new Set(rows.map(row=>row.id));
      for(const id of candidateIds){
        if(existingIds.has(id)) continue;
        const item=currentById.get(id);
        const openingFields=openingSnapshot.get(id)?.fields??{};
        const closingFields=closingSnapshot.get(id)?.fields??{};
        if(!Object.keys(closingFields).length) continue;
        if(text(closingFields["System.WorkItemType"])&&text(closingFields["System.WorkItemType"])!=="Correção Clientes") continue;

        const client=text(closingFields[fields.client]);
        const createdAt=date(closingFields["System.CreatedDate"])??item?.azureCreatedAt??null;
        if(!createdAt||createdAt>close) continue;

        const stateAtOpen=text(openingFields["System.State"]);
        const stateAtClose=text(closingFields["System.State"]);
        if(!stateAtClose) continue;
        const stateChangedAt=date(closingFields["Microsoft.VSTS.Common.StateChangeDate"]);
        const movement=classifyMonthlyStateMovement({stateAtClose,createdAt,start,close,stateChangedAt});
        const terminalAt=TERMINAL.has(stateAtClose)?stateChangedAt:null;

        rows.push({
          id,
          title:text(closingFields["System.Title"])??`Task ${id}`,
          client,
          createdBy:identityName(closingFields["System.CreatedBy"])??item?.createdByName??null,
          createdAt:createdAt.toISOString(),
          status:stateAtClose,
          lastStateChangedAt:stateChangedAt?.toISOString()??null,
          urgency:historicalUrgency(closingFields,fields.urgency),
          prioritized:bool(closingFields[fields.prioritized]),
          assignedTo:null,
          assignedAtClose:identityName(closingFields["System.AssignedTo"]),
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
        if(text(closingFields["System.WorkItemType"])&&text(closingFields["System.WorkItemType"])!=="Correção Clientes") continue;
        const client=text(closingFields[fields.client]);

        const createdAt=date(closingFields["System.CreatedDate"])??item?.azureCreatedAt??null;
        if(!createdAt||createdAt>close) continue;

        const stateAtOpen=text(openingFields["System.State"]);
        const stateAtClose=text(closingFields["System.State"])??(livePeriod?item?.state??null:null);
        if(!stateAtClose) continue;
        const createdInPeriod=createdAt>=start&&createdAt<=close;
        const urgencyValue=historicalUrgency(closingFields,fields.urgency);
        const prioritized=bool(closingFields[fields.prioritized]);
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
          title:text(closingFields["System.Title"])??`Task ${id}`,
          client,
          createdBy:identityName(closingFields["System.CreatedBy"])??item?.createdByName??null,
          createdAt:createdAt.toISOString(),
          status:stateAtClose,
          lastStateChangedAt:fallbackStateChangedAt?.toISOString()??null,
          urgency:urgencyValue,
          prioritized,
          assignedTo:null,
          assignedAtClose:identityName(closingFields["System.AssignedTo"]),
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
    if((!backlogHistoricalReliable||!movementHistoryReliable||rows.length===0)&&current.length>0){
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

      // Somente fotografias reais ou revisões recuperadas dispensam reconstrução.
      const recoveredRowIds=new Set(rows.filter(row=>closingSnapshot.has(row.id)||grouped.has(row.id)).map(row=>row.id));
      rows=rows.filter(row=>recoveredRowIds.has(row.id));
      const previousMonth=new Date(start.getTime()-24*60*60*1000).toISOString().slice(0,7);
      const persisted=await this.loadClosing(previousMonth);
      const previousReport=persisted??(CorrectionMonthlyReportService.reportCache.get(previousMonth)?.data as {rows?:Row[]}|undefined);
      const previousClosing=new Map((previousReport?.rows??[]).map(row=>[row.id,row.stateAtClose]));
      for(const item of current){
        if(recoveredRowIds.has(item.id)) continue;
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
          : (previousClosing.get(item.id)||firstAfterOpen?.oldValue?.trim()||
             [...events].reverse().find(event=>event.changedAt<start)?.newValue?.trim()||
             (item.stateChangedAt&&item.stateChangedAt<start?item.state:null));
        const stateAtClose=firstAfterClose?.oldValue?.trim()||
          archivedRows.get(item.id)?.stateAtClose||
          [...events].reverse().find(event=>event.changedAt<=close)?.newValue?.trim()||
          (livePeriod||(item.stateChangedAt&&item.stateChangedAt<=close)?item.state:null);
        // Mantém criação comprovada na tabela mesmo sem estado histórico conhecido.

        const periodEvents=events
          .filter(event=>event.changedAt>=start&&event.changedAt<=close&&!!event.newValue?.trim())
          .map(event=>({at:event.changedAt,state:event.newValue!.trim()}));
        const movement=classifyMonthlyStateMovement({
          stateAtClose:stateAtClose??"",
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
          status:stateAtClose??"Histórico indisponível",
          lastStateChangedAt:effectiveStateChangedAt?.toISOString()??null,
          urgency:livePeriod?item.criticality??null:archivedRows.get(item.id)?.urgency??null,
          prioritized:livePeriod?item.prioritized??null:archivedRows.get(item.id)?.prioritized??null,
          assignedTo:item.assignedToName,
          assignedAtClose:archivedRows.get(item.id)?.assignedAtClose??null,
          terminalAt:TERMINAL.has(stateAtClose??"")?(effectiveStateChangedAt??terminalEvent?.changedAt)?.toISOString()??null:null,
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
          `[correction-monthly-report] ${localOnly?"Prévia local disponível":"Histórico incompleto; reconstrução local"}. | mês=${month} | candidatos=${localPeriodCandidates} | linhas=${rows.length} | eventosEstado=${localStateHistoryEvents}`,
        );
      }
    }

    // Preserva a fotografia já gravada de um mês encerrado durante a prévia.
    // Atualizações no estado atual não reescrevem retroativamente esse fechamento.
    let persistedClosingUsed=false;
    if(savedClosing?.reliable&&(!backlogHistoricalReliable||
      (savedClosing.coverage?.movementHistoryReliable===true&&!movementHistoryReliable))){
      rows=savedClosing.rows;
      backlogHistoricalReliable=true;
      movementHistoryReliable=savedClosing.coverage?.movementHistoryReliable===true;
      persistedClosingUsed=true;
    } else if(localOnly&&savedClosing){
      const preserved=new Map(rows.map(row=>[row.id,row]));
      for(const row of savedClosing.rows) preserved.set(row.id,row);
      rows=[...preserved.values()];
    }
    // Uma única carteira para cards, gráficos, filtros, detalhamento e exportação.
    // Normaliza os nomes abreviados do Azure usando a regra compartilhada.
    rows=rows.flatMap(row=>{
      const client=resolveSimerClient(row.client);
      return client && isCorrectionTeamCreator(row.createdBy) ? [{...row,client,createdBy:identityName(row.createdBy)}] : [];
    });
    for(const row of rows){
      row.inPeriodUniverse=
        row.registeredInPeriod||
        row.deliveredInPeriod||
        row.canceledInPeriod||
        row.enteredRegistrationInPeriod||
        row.backlogInitial||
        row.backlogCurrent||
        Boolean(row.stateAtClose);
      row.inMonthlyIndicators=row.registeredInPeriod||row.deliveredInPeriod||row.canceledInPeriod||
        row.enteredRegistrationInPeriod||row.backlogInitial||row.backlogCurrent;
    }
    rows=[...new Map(rows.map(row=>[row.id,row])).values()];
    const scopedRows=rows.length;
    rows=rows.filter(row=>row.inPeriodUniverse);
    // Current assignment is descriptive metadata, independent of historical
    // State/client/urgency/priority and never a filter for support creators.
    const currentItemsById=new Map(currentItems.map(item=>[item.id,item]));
    const remoteIds=rows.filter(row=>!currentItemsById.has(row.id)).map(row=>row.id);
    let remoteAssignees=new Map<number,string|null>();
    let currentAssigneeError:string|null=null;
    if(!localOnly&&remoteIds.length){
      try { remoteAssignees=await this.currentAssignees(remoteIds); }
      catch(error){currentAssigneeError=azureFailureMessage(error);}
    }
    for(const row of rows){
      if(currentItemsById.has(row.id)){
        row.assignedTo=identityName(currentItemsById.get(row.id)?.assignedToName);
        row.assignedToSource="local-sync";
      } else if(remoteAssignees.has(row.id)){
        row.assignedTo=remoteAssignees.get(row.id)??null;
        row.assignedToSource="azure-current";
      } else {
        row.assignedTo=null;
        row.assignedToSource="unavailable";
      }
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
      `duraçãoMs=${Date.now()-startedAt}`,
    ].join(" | "));
    const count=(p:(r:Row)=>boolean)=>rows.filter(p).length;
    const by=(selector:(r:Row)=>string|null)=>Object.entries(rows.filter(row=>Boolean(row.stateAtClose)).reduce<Record<string,number>>((acc,row)=>{const key=selector(row)||"Não informado";acc[key]=(acc[key]??0)+1;return acc;},{})).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total);
    return {period:{month,timezone:"America/Sao_Paulo",start:start.toISOString(),close:close.toISOString()},cards:{registered:count(r=>r.registeredInPeriod),delivered:count(r=>r.deliveredInPeriod),canceled:count(r=>r.canceledInPeriod),inRegistration:count(r=>r.enteredRegistrationInPeriod),backlogInitial:count(r=>r.backlogInitial),backlogCurrent:count(r=>r.backlogCurrent)},pipeline:by(r=>r.status),urgency:by(r=>r.urgency),prioritization:[{name:"Priorizadas",total:count(r=>Boolean(r.stateAtClose)&&r.prioritized===true)},{name:"Não priorizadas",total:count(r=>Boolean(r.stateAtClose)&&r.prioritized===false)},{name:"Não informado",total:count(r=>Boolean(r.stateAtClose)&&r.prioritized===null)}],filters:{creators:[...new Set(rows.map(r=>r.createdBy).filter(Boolean))].sort(),teamCreators:[...new Set(rows.map(r=>r.createdBy).filter((value):value is string=>!!value&&isCorrectionTeamCreator(value)))].sort(),clients:[...new Set(rows.map(r=>r.client).filter((value):value is string=>!!value))].sort(),urgencies:[...new Set(rows.map(r=>r.urgency).filter(Boolean))].sort(),states:[...new Set(rows.map(r=>r.status).filter(Boolean))].sort()},rows,generatedAt:new Date().toISOString(),source:persistedClosingUsed?"Fechamento histórico salvo · Azure DevOps":perItemHistoryRecoveryUsed?"Azure DevOps · revisões por Task + prévia local":localFallbackUsed?"Base sincronizada do Azure DevOps · histórico local reconstruído":snapshotAvailable?(historyAvailable?"Azure DevOps · revisões + snapshots asOf":"Azure DevOps · snapshots asOf"):"Base sincronizada do Azure DevOps · snapshot local",quality:{persistedClosingUsed,currentAssigneeError,unknownUrgencyRows:rows.filter(row=>!!row.stateAtClose&&!row.urgency).length,unknownPrioritizationRows:rows.filter(row=>!!row.stateAtClose&&row.prioritized===null).length,localPreview:localOnly,backlogCurrentAvailable:backlogHistoricalReliable||livePeriod||rows.some(row=>row.backlogCurrent),unknownClosingStates:rows.filter(row=>!row.stateAtClose).length,backlogInitialAvailable:backlogHistoricalReliable||openingSnapshot.size>0||rows.some(row=>row.backlogInitial),perItemHistoryRecoveryUsed,recoveredHistoryItems,recoveryCandidates,missingClosingFields,historyAvailable,historyError,snapshotAvailable,snapshotError,historicalScopeError,externalHistorySuspicious,localFallbackUsed,localStateHistoryEvents,mode:localFallbackUsed?"local-history-fallback":backlogHistoricalReliable&&historyAvailable?"historical":snapshotAvailable?"asof-partial":"local-snapshot",movementHistoryReliable,historicalMetricsReliable:movementHistoryReliable&&backlogHistoricalReliable,backlogHistoricalReliable,diagnostics:{scopedRecords:scopedRows,localRecords:current.length,localPeriodCandidates,revisions:revisions.length,openingScopeIds:openingScopeIds.length,closingScopeIds:closingScopeIds.length,snapshotCandidates:candidateIds.length,openingSnapshotItems:openingSnapshot.size,closingSnapshotItems:closingSnapshot.size,outputRows:rows.length,monthlyIndicatorRows:rows.filter(row=>row.inMonthlyIndicators).length}},fieldMapping:fields};
  }
}
