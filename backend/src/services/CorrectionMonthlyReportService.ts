import axios from "axios";
import { prisma } from "../database/prisma";
import { AZURE_WORK_ITEM_FIELDS } from "./AzureWorkItemMapper";

type Identity = { displayName?: string; uniqueName?: string };
type Revision = { id?: number; rev?: number; fields?: Record<string, unknown> };
type ReportingResponse = { values?: Revision[]; value?: Revision[]; continuationToken?: string; isLastBatch?: boolean };

const TERMINAL = new Set(["Concluído", "Cancelado"]);
const BACKLOG_EXCLUDED = new Set(["Registro", ...TERMINAL]);
const CACHE_TTL_MS = 10 * 60_000;

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
function saoPauloMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Período inválido. Use YYYY-MM.");
  const parts = month.split("-");
  const year = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(year) || !Number.isInteger(m) || m < 1 || m > 12) throw new Error("Período inválido.");
  // São Paulo não possui horário de verão no período suportado; boundaries são convertidas para UTC.
  const start = new Date(`${month}-01T03:00:00.000Z`);
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  const endExclusive = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T03:00:00.000Z`);
  return { start, endExclusive, close: new Date(endExclusive.getTime() - 1) };
}

type Row = {
  id: number; title: string; client: string | null; createdBy: string | null; createdAt: string | null;
  status: string; lastStateChangedAt: string | null; urgency: string | null; prioritized: boolean | null;
  assignedTo: string | null; terminalAt: string | null; remoteUrl: string | null;
  stateAtOpen: string | null; stateAtClose: string | null; registeredInPeriod: boolean; deliveredInPeriod: boolean;
  canceledInPeriod: boolean; enteredRegistrationInPeriod: boolean; backlogInitial: boolean; backlogCurrent: boolean;
};

export class CorrectionMonthlyReportService {
  private static cache = new Map<string, { expiresAt: number; revisions: Revision[] }>();

  private azureConfig() {
    const organization = (process.env.AZURE_DEVOPS_ORGANIZATION ?? "").trim();
    const project = (process.env.AZURE_DEVOPS_PROJECT ?? "").trim();
    const pat = (process.env.AZURE_DEVOPS_PAT ?? "").trim();
    if (!organization || !project || !pat) throw new Error("Integração Azure DevOps não configurada.");
    return { organization, project, pat };
  }

  private async revisions(): Promise<Revision[]> {
    const { organization, project, pat } = this.azureConfig();
    const cacheKey = `${organization}/${project}/corrections-reporting-revisions`;
    const cached = CorrectionMonthlyReportService.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.revisions;

    const client = axios.create({
      baseURL: `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}`,
      timeout: 45_000,
      headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}` },
    });
    const fields = [
      "System.Id","System.WorkItemType","System.Title","System.State","System.CreatedBy","System.CreatedDate",
      "System.ChangedDate","System.AssignedTo","Microsoft.VSTS.Common.Priority",
      AZURE_WORK_ITEM_FIELDS.client, AZURE_WORK_ITEM_FIELDS.prioritized,
    ].join(",");
    const all: Revision[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await client.get<ReportingResponse>("/_apis/wit/reporting/workitemrevisions", {
        params: {
          fields, types: "Correção Clientes", includeLatestOnly: false, includeIdentityRef: true,
          "$maxPageSize": 2000, continuationToken, "api-version": "7.1-preview.2",
        },
      });
      all.push(...(response.data.values ?? response.data.value ?? []));
      continuationToken = response.data.continuationToken || response.headers["x-ms-continuationtoken"];
      if (response.data.isLastBatch === true) continuationToken = undefined;
    } while (continuationToken);

    CorrectionMonthlyReportService.cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, revisions: all });
    return all;
  }

  async get(month: string) {
    const { start, endExclusive, close } = saoPauloMonth(month);
    const [revisions, current] = await Promise.all([
      this.revisions(),
      prisma.azureWorkItem.findMany({
        where: { workItemType: "Correção Clientes" },
        select: { id:true, title:true, client:true, criticality:true, prioritized:true, assignedToName:true, remoteUrl:true },
      }),
    ]);
    const currentById = new Map(current.map((item) => [item.id, item]));
    const grouped = new Map<number, Revision[]>();
    for (const revision of revisions) {
      const id = Number(revision.id ?? revision.fields?.["System.Id"]);
      if (!Number.isSafeInteger(id)) continue;
      const list = grouped.get(id) ?? [];
      list.push(revision); grouped.set(id, list);
    }

    const rows: Row[] = [];
    for (const [id, history] of grouped) {
      history.sort((a,b) => (date(a.fields?.["System.ChangedDate"])?.getTime() ?? 0) - (date(b.fields?.["System.ChangedDate"])?.getTime() ?? 0));
      const normalized = history.map((revision) => {
        const f = revision.fields ?? {};
        return { revision, at: date(f["System.ChangedDate"]) ?? date(f["System.CreatedDate"]), state: text(f["System.State"]) };
      }).filter((item) => item.at && item.state) as Array<{revision:Revision;at:Date;state:string}>;
      const firstHistory = history[0];
      const firstNormalized = normalized[0];
      if (!firstHistory || !firstNormalized) continue;
      const firstFields = firstHistory.fields ?? {};
      const createdAt = date(firstFields["System.CreatedDate"]) ?? firstNormalized.at;
      if (createdAt >= endExclusive) continue;
      const atOpen = [...normalized].reverse().find((event) => event.at < start) ?? null;
      const atClose = [...normalized].reverse().find((event) => event.at < endExclusive) ?? null;
      if (!atClose) continue;

      const stateEvents = normalized.filter((event, index) => {
        const previous = normalized[index - 1];
        return !previous || event.state !== previous.state;
      });
      const inPeriod = stateEvents.filter((event) => event.at >= start && event.at < endExclusive);
      const entered = (state: string) => inPeriod.some((event) => event.state === state);
      const stateAtOpen = atOpen?.state ?? null;
      const stateAtClose = atClose.state;
      const latestFields = atClose.revision.fields ?? {};
      const currentItem = currentById.get(id);
      const lastState = [...stateEvents].reverse().find((event) => event.at < endExclusive);
      const terminal = [...stateEvents].reverse().find((event) => event.at < endExclusive && TERMINAL.has(event.state));
      const priorityRaw = latestFields["Microsoft.VSTS.Common.Priority"];
      const urgency = text(priorityRaw) ? `P${text(priorityRaw)?.replace(/^P/i,"")}` : currentItem?.criticality ?? null;
      const prioritized = bool(latestFields[AZURE_WORK_ITEM_FIELDS.prioritized]) ?? currentItem?.prioritized ?? null;

      rows.push({
        id,
        title: text(latestFields["System.Title"]) ?? currentItem?.title ?? `Task ${id}`,
        client: text(latestFields[AZURE_WORK_ITEM_FIELDS.client]) ?? currentItem?.client ?? null,
        createdBy: text(latestFields["System.CreatedBy"]) ?? text(firstFields["System.CreatedBy"]),
        createdAt: createdAt.toISOString(),
        status: stateAtClose,
        lastStateChangedAt: lastState?.at.toISOString() ?? null,
        urgency,
        prioritized,
        assignedTo: text(latestFields["System.AssignedTo"]) ?? currentItem?.assignedToName ?? null,
        terminalAt: terminal?.at.toISOString() ?? null,
        remoteUrl: currentItem?.remoteUrl ?? null,
        stateAtOpen,
        stateAtClose,
        registeredInPeriod: createdAt >= start && createdAt < endExclusive,
        deliveredInPeriod: entered("Concluído") && stateAtClose === "Concluído",
        canceledInPeriod: entered("Cancelado") && stateAtClose === "Cancelado",
        enteredRegistrationInPeriod: entered("Registro") && stateAtClose === "Registro",
        backlogInitial: !!stateAtOpen && !BACKLOG_EXCLUDED.has(stateAtOpen),
        backlogCurrent: !BACKLOG_EXCLUDED.has(stateAtClose),
      });
    }

    const count = (predicate: (row: Row) => boolean) => rows.filter(predicate).length;
    const by = (selector: (row: Row) => string | null) => Object.entries(rows.reduce<Record<string,number>>((acc,row) => {
      const key = selector(row) || "Não informado"; acc[key] = (acc[key] ?? 0) + 1; return acc;
    }, {})).map(([name,total]) => ({ name,total })).sort((a,b) => b.total-a.total);

    return {
      period: { month, timezone:"America/Sao_Paulo", start:start.toISOString(), close:close.toISOString() },
      cards: {
        registered: count(r=>r.registeredInPeriod), delivered: count(r=>r.deliveredInPeriod),
        canceled: count(r=>r.canceledInPeriod), inRegistration: count(r=>r.enteredRegistrationInPeriod),
        backlogInitial: count(r=>r.backlogInitial), backlogCurrent: count(r=>r.backlogCurrent),
      },
      pipeline: by(r=>r.status),
      urgency: by(r=>r.urgency),
      prioritization: [
        { name:"Priorizadas", total:count(r=>r.prioritized===true) },
        { name:"Não priorizadas", total:count(r=>r.prioritized===false) },
        { name:"Não informado", total:count(r=>r.prioritized===null) },
      ],
      filters: {
        creators:[...new Set(rows.map(r=>r.createdBy).filter(Boolean))].sort(),
        clients:[...new Set(rows.map(r=>r.client).filter(Boolean))].sort(),
        urgencies:[...new Set(rows.map(r=>r.urgency).filter(Boolean))].sort(),
        states:[...new Set(rows.map(r=>r.status).filter(Boolean))].sort(),
      },
      rows,
      generatedAt:new Date().toISOString(),
      source:"Azure DevOps Reporting Work Item Revisions",
    };
  }
}
