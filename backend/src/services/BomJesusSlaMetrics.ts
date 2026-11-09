import { ALIARE_TARGETS, isAliarePause, isSlaEligibleCategory, normalizeSlaLabel, type SlaKind, type SlaPriority, type SlaTier } from "../domain/AliareSlaRules";

// Portaria MGI 11.460/2025 (feriados nacionais de 2026, não pontos facultativos).
// Feriados estaduais/municipais e exceções contratuais não são presumidos.
export const BRAZIL_NATIONAL_HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-04-03", "2026-04-21", "2026-05-01", "2026-09-07",
  "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25",
]);
const MINUTE = 60_000;
const BRT = 180 * MINUTE;
export type StatusChange = { status: string; changedDate: Date | null };
export type SlaMetric = { minutes: number | null; targetMinutes: number | null; exceeded: boolean | null; overMinutes: number | null; percent: number | null; state: "concluido" | "em andamento" | "sem marco" | "fora de escopo" };
export type SlaEvidence = {
  tier: SlaTier; tierSource: string; tierVerified: boolean; priority: SlaPriority | null;
  kind: SlaKind; eligible: boolean; warnings: string[];
  response: SlaMetric; support: SlaMetric; factory: SlaMetric; total: SlaMetric;
  supportDeadlineAt: string | null; supportEndAt: string | null; factoryEndAt: string | null;
  pauseMinutesSupport: number; pauseMinutesFactory: number; holidayPolicy: string;
};
export function resolveSlaTier(agreement?: string | null, override?: SlaTier | null): { tier: SlaTier; source: string; verified: boolean } {
  const n = normalizeSlaLabel(agreement);
  if (override) return { tier: override, source: "PERFIL_INFORMADO_MANUALMENTE", verified: false };
  if (/(^| )vip( |$)/.test(n)) return { tier: "VIP", source: "TICKET_SLA_AGREEMENT", verified: true };
  if (/(^| )(padrao|standard)( |$)/.test(n)) return { tier: "PADRAO", source: "TICKET_SLA_AGREEMENT", verified: true };
  return { tier: "PADRAO", source: "HIPOTESE_PADRAO_CONFERIR_CONTRATO", verified: false };
}
/**
 * O(days) version of Aliare business calendar for Brazil/Sao_Paulo.
 * 2026 Brazil has no DST. Minute boundary semantics match aliareBusinessMinutes.
 */
export function businessMinutesAliare2026(start: Date, end: Date, kind: SlaKind): number {
  if (end <= start) return 0;
  const first = Math.ceil(start.getTime() / MINUTE);
  const last = Math.floor(end.getTime() / MINUTE);
  if (last <= first) return 0;
  const lo = first - 180;
  const hi = last - 180;
  let total = 0;
  const day = Math.floor(lo / 1440) * 1440;
  for (let currentDay = day; currentDay < hi; currentDay += 1440) {
    const d = new Date(currentDay * MINUTE);
    const dateKey = d.toISOString().slice(0, 10);
    if (BRAZIL_NATIONAL_HOLIDAYS_2026.has(dateKey)) continue;
    const wd = d.getUTCDay();
    const from = currentDay + 480;
    const to = currentDay + (kind === "BUG" ? 1080 : wd === 6 ? 720 : 1110);
    if (!((wd >= 1 && wd <= 5) || (kind === "OUTROS" && wd === 6))) continue;
    total += Math.max(0, Math.min(hi, to) - Math.max(lo, from));
  }
  return total;
}
export function observedPauseMinutes(start: Date, end: Date, kind: SlaKind, history: StatusChange[]) {
  if (end <= start) return 0;
  const changes = history.filter((h): h is {status:string;changedDate:Date} => Boolean(h.changedDate))
    .sort((a,b) => a.changedDate.getTime() - b.changedDate.getTime());
  let paused = 0;
  for (let i = 0; i < changes.length; i++) {
    const h = changes[i]!;
    if (!isAliarePause(h.status)) continue;
    const from = new Date(Math.max(start.getTime(), h.changedDate.getTime()));
    const next = changes[i+1]?.changedDate ?? end;
    const to = new Date(Math.min(end.getTime(), next.getTime()));
    if (to > from) paused += businessMinutesAliare2026(from,to,kind);
  }
  return paused;
}
export function computeBomJesusSla(input: {
  category: string | null; taskKind: boolean; urgencyPriority: SlaPriority | null;
  slaAgreement: string | null; tierOverride?: SlaTier | null;
  createdDate: Date; firstResponseDate: Date | null; resolvedDate: Date | null;
  taskCreatedAt: Date | null; taskClosedAt: Date | null; taskIsConcluded: boolean;
  statusHistories: StatusChange[]; asOf: Date;
}): SlaEvidence {
  const kind: SlaKind = input.taskKind ? "BUG" : "OUTROS";
  const eligible = Boolean(input.category?.trim()) && isSlaEligibleCategory(input.category);
  const profile = resolveSlaTier(input.slaAgreement, input.tierOverride);
  const target = input.urgencyPriority ? ALIARE_TARGETS[profile.tier][kind][input.urgencyPriority] : null;
  const warnings: string[] = [];
  if (!profile.verified) warnings.push("Perfil Padrão/VIP não confirmado pelo contrato; resultado é cenário preliminar.");
  if (!input.urgencyPriority) warnings.push("Prioridade não identificada.");
  if (!input.category?.trim()) warnings.push("Categoria do ticket não identificada; não é possível aferir enquadramento no SLA.");
  else if (!eligible) warnings.push("Categoria atual excluída do SLA (Adequação/Solicitação de Serviço); verificar histórico da mudança.");
  if (!input.statusHistories.length) warnings.push("Histórico de status indisponível; eventuais pausas anteriores não estão comprovadas.");
  if (input.statusHistories.length && !input.statusHistories.some(h => h.changedDate && h.changedDate <= input.createdDate)) warnings.push("Estado inicial do histórico de status não comprovado; pausas anteriores ao primeiro registro podem faltar.");
  warnings.push("Feriados nacionais de 2026 descontados; feriados locais e outras indisponibilidades externas não foram identificados automaticamente.");
  warnings.push("A prioridade atual foi utilizada; alterações históricas de urgência podem alterar os prazos.");
  if (input.taskKind && !input.taskCreatedAt) warnings.push("Sem data de criação da Task; não é possível confirmar passagem ao Desenvolvimento.");
  if (input.taskIsConcluded && !input.taskClosedAt) warnings.push("Task consta concluída, mas não há data técnica de conclusão.");
  const metric = (start: Date | null, end: Date | null, targetMinutes: number | null, state: SlaMetric["state"]): SlaMetric => {
    if (!eligible) return { minutes: null, targetMinutes, exceeded: null, overMinutes: null, percent: null, state: "fora de escopo" };
    if (!start || !end || end < start) return { minutes: null, targetMinutes, exceeded: null, overMinutes: null, percent: null, state: "sem marco" };
    const gross = businessMinutesAliare2026(start,end,kind);
    const pause = observedPauseMinutes(start,end,kind,input.statusHistories);
    const minutes = Math.max(0, gross-pause);
    return { minutes, targetMinutes, exceeded: targetMinutes !== null ? minutes > targetMinutes : null,
      overMinutes: targetMinutes !== null ? Math.max(0,minutes-targetMinutes) : null,
      percent: targetMinutes ? Math.round(minutes/targetMinutes*1000)/10 : null, state };
  };
  const supportEnd = input.taskKind ? input.taskCreatedAt : (input.resolvedDate ?? null);
  const factoryEnd = input.taskIsConcluded ? input.taskClosedAt : input.asOf;
  const response = metric(input.createdDate, input.firstResponseDate, target?.response ?? null, input.firstResponseDate ? "concluido" : "sem marco");
  const support = metric(input.createdDate, supportEnd, target?.support ?? null, input.taskKind && input.taskCreatedAt ? "concluido" : "sem marco");
  const factory = input.taskKind
    ? metric(input.taskCreatedAt, input.taskCreatedAt && factoryEnd && factoryEnd >= input.taskCreatedAt ? factoryEnd : null, target?.factory ?? null,
      input.taskIsConcluded && input.taskClosedAt ? "concluido" : "em andamento")
    : metric(null,null,null,"fora de escopo");
  const total = input.taskKind
    ? metric(input.createdDate, input.taskCreatedAt && input.asOf >= input.taskCreatedAt ? factoryEnd : null, target?.total ?? null,
      input.taskIsConcluded && input.taskClosedAt ? "concluido" : "em andamento")
    : metric(input.createdDate,input.resolvedDate,target?.total ?? null,input.resolvedDate ? "concluido" : "sem marco");
  const supportPause = supportEnd ? observedPauseMinutes(input.createdDate,supportEnd,kind,input.statusHistories) : 0;
  const factoryPause = input.taskCreatedAt && factoryEnd && factoryEnd >= input.taskCreatedAt
    ? observedPauseMinutes(input.taskCreatedAt,factoryEnd,kind,input.statusHistories) : 0;
  return { tier: profile.tier,tierSource:profile.source,tierVerified:profile.verified,priority:input.urgencyPriority,
    kind,eligible,warnings,response,support,factory,total,
    supportDeadlineAt:null,supportEndAt:supportEnd?.toISOString()??null,
    factoryEndAt:input.taskKind && input.taskCreatedAt && factoryEnd ? factoryEnd.toISOString():null,
    pauseMinutesSupport:supportPause,pauseMinutesFactory:factoryPause,
    holidayPolicy:"Feriados nacionais 2026; sem pontos facultativos, feriados locais ou pausas não demonstradas" };
}
