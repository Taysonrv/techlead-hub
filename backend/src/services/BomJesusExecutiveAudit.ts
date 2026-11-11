import { normalizeDomainText } from "../domain/TicketClassificationRules";
import type { SlaEvidence } from "./BomJesusSlaMetrics";

export type ExecutiveTicketInput = {
  id: number; subject: string; category: string; status: string; baseStatus: string | null;
  createdDate: string; resolvedDate: string | null; reopenedDate: string | null;
  taskNumber: number | null; taskType: string; taskState: string; taskRemoteUrl: string | null;
  taskCreatedAt: string | null; taskConcludedAt: string | null; deliveredVersion: string;
  isCorrectionTask: boolean; recurrenceKey: string; vistra: boolean; vistraType: string;
  serviceContext: string; anyToAdequacaoFrom: string | null; anyToAdequacaoChangedAt: string | null;
  initialObservedCategory: string | null; categoryHistory: Array<{
    kind: string; category: string; previousCategory: string | null; source: string;
    observedAt: string; sourceLastUpdate: string | null;
  }>;
  sla: SlaEvidence;
};

const norm = (value: string | null | undefined) => normalizeDomainText(value);
const hasErrorSignal = (value: string) => {
  const clean = norm(value).replace(/[^a-z0-9]+/g," ");
  return /(?:^|\s)(?:erro|falha|bug|incorret\w*|divergen\w*|nao gera\w*|nao abre|nao funciona|parou|trav\w*|quebra\w*|indisponiv\w*|lent\w*)(?:\s|$)/.test(clean);
};
const isCancelled = (value: string) => /cancelad|canceled|cancelled|removed|descartad/.test(norm(value));
const isConcluded = (value: string) => /^(concluid[ao]|done|closed|resolved|encerrad[ao])$/.test(norm(value));
const isBug = (value: string) => norm(value) === "bug";
const unique = <T,>(values: T[]) => [...new Set(values)];
const monthsOf = (rows: ExecutiveTicketInput[]) => unique(rows.map(r => r.createdDate.slice(0, 7))).sort();

export type ExecutiveOlaCase = {
  ticketId: number; subject: string; taskId: number | null; taskState: string;
  priority: string | null; tier: string; tierVerified: boolean; category: string;
  openedAt: string; taskCreatedAt: string | null;
  minutes: number | null; targetMinutes: number | null; excessMinutes: number | null;
  pauseMinutes: number; status: "ALERTA" | "DENTRO" | "NAO_MENSURAVEL" | "CANCELADA";
  warnings: string[]; taskUrl: string | null;
};
export type ExecutiveCorrection = {
  ticketId: number; subject: string; category: string; taskId: number | null;
  taskState: string; taskUrl: string | null; outcome: "CONCLUIDA" | "EM_ABERTO" | "CANCELADA";
  version: string | null; taskConcludedAt: string | null; ticketResolvedAt: string | null;
  ticketReopenedAt: string | null; resolvedAfterTask: boolean;
  reopenedAfterTask: boolean; validatedByClient: "NAO_COMPROVADO";
  reappearanceCandidate: boolean; reappearanceTicketIds: number[];
};
export type ExecutiveRecurrence = {
  key: string; title: string; ticketIds: number[]; taskIds: number[];
  count: number; firstAt: string; lastAt: string;
  evidence: "MESMA_TASK" | "ASSUNTO_NORMALIZADO";
  afterTechnicalConclusion: boolean; laterTicketIds: number[];
  qualification: string;
};
export type ExecutiveCategoryCase = {
  ticketId: number; subject: string; category: string; previousCategory: string | null;
  observedAt: string | null; initialObserved: string | null;
  taskId: number | null; reason: string; evidence: "OBSERVADA" | "INVESTIGAR";
};
export type ExecutiveVistraCase = {
  ticketId: number; subject: string; date: string; category: string; taskId: number | null;
  area: "VISTRA" | "ANALITICO" | "RELATORIO_SIMER"; suspectedFailure: boolean;
  evidence: string;
};
export function buildBomJesusExecutiveAudit(rows: ExecutiveTicketInput[]) {
  const byId = new Map(rows.map(r => [r.id, r]));
  const corrections = rows.filter(r => r.isCorrectionTask);
  const correctionUniqueTasks = unique(corrections.map(r => r.taskNumber).filter((n): n is number => n != null));
  const categoryBug = rows.filter(r => isBug(r.category));
  const bugWithCorrection = rows.filter(r => isBug(r.category) && r.isCorrectionTask);
  const bugWithoutCorrection = rows.filter(r => isBug(r.category) && !r.isCorrectionTask);
  const correctionOutsideBug = rows.filter(r => !isBug(r.category) && r.isCorrectionTask);
  const otherTickets = rows.filter(r => !isBug(r.category) && !r.isCorrectionTask);

  const correctionRows: ExecutiveCorrection[] = corrections.map(r => {
    const cancelled = isCancelled(r.taskState);
    const concluded = isConcluded(r.taskState);
    const reopenedAfterTask = Boolean(r.reopenedDate && r.taskConcludedAt &&
      Date.parse(r.reopenedDate) > Date.parse(r.taskConcludedAt));
    const resolvedAfterTask = Boolean(r.resolvedDate && r.taskConcludedAt &&
      Date.parse(r.resolvedDate) >= Date.parse(r.taskConcludedAt));
    const matching = r.recurrenceKey && r.taskConcludedAt
      ? rows.filter(other => other.id !== r.id && other.recurrenceKey === r.recurrenceKey
          && Date.parse(other.createdDate) > Date.parse(r.taskConcludedAt!))
      : [];
    return {
      ticketId: r.id, subject: r.subject, category: r.category, taskId: r.taskNumber,
      taskState: r.taskState, taskUrl: r.taskRemoteUrl,
      outcome: cancelled ? "CANCELADA" : concluded ? "CONCLUIDA" : "EM_ABERTO",
      version: r.deliveredVersion || null, taskConcludedAt: r.taskConcludedAt,
      ticketResolvedAt: r.resolvedDate, ticketReopenedAt: r.reopenedDate,
      resolvedAfterTask, reopenedAfterTask, validatedByClient: "NAO_COMPROVADO" as const,
      reappearanceCandidate: Boolean(matching.length) || reopenedAfterTask,
      reappearanceTicketIds: matching.map(t => t.id),
    };
  });
  const olaRows: ExecutiveOlaCase[] = corrections.map(r => {
    const cancelled = isCancelled(r.taskState);
    const support = r.sla.support;
    const measured = support.minutes != null && support.targetMinutes != null && r.taskCreatedAt != null;
    const status = cancelled ? "CANCELADA" :
      !measured ? "NAO_MENSURAVEL" : support.exceeded ? "ALERTA" : "DENTRO";
    return {
      ticketId: r.id, subject: r.subject, taskId: r.taskNumber, taskState: r.taskState,
      category: r.category, openedAt: r.createdDate, taskCreatedAt: r.taskCreatedAt,
      priority: r.sla.priority, tier: r.sla.tier, tierVerified: r.sla.tierVerified,
      minutes: support.minutes, targetMinutes: support.targetMinutes,
      excessMinutes: support.overMinutes, pauseMinutes: r.sla.pauseMinutesSupport,
      status: status as ExecutiveOlaCase["status"], warnings: r.sla.warnings,
      taskUrl: r.taskRemoteUrl,
    };
  }).sort((a,b) => {
    const rank = {ALERTA:0, NAO_MENSURAVEL:1, DENTRO:2, CANCELADA:3};
    return rank[a.status] - rank[b.status] || (b.excessMinutes ?? 0) - (a.excessMinutes ?? 0);
  });
  const activeOla = olaRows.filter(x => x.status !== "CANCELADA");
  const measuredOla = activeOla.filter(x => x.status !== "NAO_MENSURAVEL");
  const alertedOla = measuredOla.filter(x => x.status === "ALERTA");
  const median = (values: number[]) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a,b)=>a-b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid-1]! + sorted[mid]!) / 2);
  };

  // Two complementary signals: same Azure correction Task and identical normalised subject.
  // These are overlap-capable candidates; do NOT add group sizes to report unique ticket count.
  const recurrenceGroups: ExecutiveRecurrence[] = [];
  const addGroups = (kind: "MESMA_TASK" | "ASSUNTO_NORMALIZADO", groups: Map<string, ExecutiveTicketInput[]>) => {
    for (const [key, members] of groups) {
      if (members.length < 2) continue;
      const sorted = [...members].sort((a,b)=>a.createdDate.localeCompare(b.createdDate));
      const relatedTasks = unique(sorted.map(x=>x.taskNumber).filter((n):n is number=>n!=null));
      const later = sorted.filter(t => sorted.some(prev =>
        prev.id !== t.id && prev.isCorrectionTask && prev.taskConcludedAt != null &&
        prev.taskNumber != null && Date.parse(t.createdDate) > Date.parse(prev.taskConcludedAt)
      ));
      recurrenceGroups.push({
        key: kind + ":" + key, title: sorted[0]!.subject,
        ticketIds: sorted.map(x=>x.id), taskIds: relatedTasks,
        count: sorted.length, firstAt: sorted[0]!.createdDate, lastAt: sorted[sorted.length-1]!.createdDate,
        evidence: kind, afterTechnicalConclusion: later.length > 0,
        laterTicketIds: unique(later.map(t=>t.id)),
        qualification: kind === "MESMA_TASK" ? "Mesmo Work Item Azure; confirmar defeito e contexto" :
          "Assunto normalizado igual; confirmar causa-raiz antes de chamar recorrência",
      });
    }
  };
  const taskGroups = new Map<string, ExecutiveTicketInput[]>();
  const symptomGroups = new Map<string, ExecutiveTicketInput[]>();
  for (const row of rows) {
    if (row.taskNumber && row.isCorrectionTask) {
      const key = String(row.taskNumber);
      taskGroups.set(key, [...(taskGroups.get(key)??[]), row]);
    }
    if (row.recurrenceKey.length >= 16 && !/pesquisa de satisfacao|avaliacao do atendimento/.test(norm(row.subject))) {
      symptomGroups.set(row.recurrenceKey, [...(symptomGroups.get(row.recurrenceKey)??[]), row]);
    }
  }
  addGroups("MESMA_TASK", taskGroups);
  addGroups("ASSUNTO_NORMALIZADO", symptomGroups);
  recurrenceGroups.sort((a,b)=> Number(b.afterTechnicalConclusion) - Number(a.afterTechnicalConclusion) || b.count-a.count);
  const recurrenceTicketIds = unique(recurrenceGroups.flatMap(g=>g.ticketIds));

  const categoryTransitions: ExecutiveCategoryCase[] = rows.flatMap(r =>
    r.categoryHistory.filter(h => h.kind === "CHANGE" && norm(h.category) === "adequacao" && norm(h.previousCategory) !== "adequacao" && !!norm(h.previousCategory))
      .map(h => ({
        ticketId:r.id,subject:r.subject,category:r.category,previousCategory:h.previousCategory,
        observedAt:h.observedAt,initialObserved:r.initialObservedCategory,taskId:r.taskNumber,
        reason:"Mudança observada em capturas sucessivas; NÃO é categoria de abertura",evidence:"OBSERVADA" as const,
      }))
  );
  const categoryReview: ExecutiveCategoryCase[] = rows.filter(r =>
    norm(r.category) === "adequacao" && !categoryTransitions.some(t=>t.ticketId===r.id) &&
    (r.isCorrectionTask || hasErrorSignal(r.subject)))
    .map(r=>({
      ticketId:r.id,subject:r.subject,category:r.category,previousCategory:null,
      observedAt:null,initialObserved:r.initialObservedCategory,taskId:r.taskNumber,
      reason:r.isCorrectionTask ? "Adequação atual com Task de correção: verificar histórico na interface Movidesk" :
        "Adequação atual com relato de falha; verificar histórico original",
      evidence:"INVESTIGAR" as const,
    })).sort((a,b)=>Number(b.taskId!==null)-Number(a.taskId!==null));

  const vistraCases: ExecutiveVistraCase[] = [];
  for (const r of rows) {
    const context = norm(r.subject+" "+r.serviceContext);
    let area: ExecutiveVistraCase["area"] | null = null;
    if (context.includes("vistra")) area="VISTRA";
    else if (context.includes("analitico") || context.includes("analytics")) area="ANALITICO";
    else if (/relatorio|dashboard|painel/.test(context)) area="RELATORIO_SIMER";
    if (!area) continue;
    vistraCases.push({ticketId:r.id,subject:r.subject,date:r.createdDate,category:r.category,
      taskId:r.isCorrectionTask?r.taskNumber:null,area,
      suspectedFailure:hasErrorSignal(r.subject) || r.isCorrectionTask,
      evidence:r.isCorrectionTask?"Task de correção relacionada; validar vínculo com falha" :
        hasErrorSignal(r.subject)?"Sintoma relatado no assunto; validar defeito":"Menção sem falha comprovada",
    });
  }
  const vistraMonthly = monthsOf(rows).map(month=>({
    month,
    vistra:vistraCases.filter(x=>x.area==="VISTRA"&&x.date.startsWith(month)&&x.suspectedFailure).length,
    analitico:vistraCases.filter(x=>x.area==="ANALITICO"&&x.date.startsWith(month)&&x.suspectedFailure).length,
    relatorios:vistraCases.filter(x=>x.area==="RELATORIO_SIMER"&&x.date.startsWith(month)&&x.suspectedFailure).length,
  }));
  const monthly = monthsOf(rows).map(month=>{
    const inMonth=rows.filter(x=>x.createdDate.startsWith(month));
    return {month,tickets:inMonth.length,bugs:inMonth.filter(x=>isBug(x.category)).length,
      corrections:inMonth.filter(x=>x.isCorrectionTask).length,
      olaAlerts:inMonth.filter(x=>alertedOla.some(a=>a.ticketId===x.id)).length,
      categoryTransitions:categoryTransitions.filter(x=>x.observedAt?.startsWith(month)).length,
    };
  });
  return {
    definition:"Somente tickets do cliente Bom Jesus no período e sob responsabilidade operacional SIMER. Registros com categorias históricas parciais e OLA por criação da Task são auditáveis, porém preliminares.",
    matrix:{
      total:rows.length, bugCategory:categoryBug.length, correctionTickets:corrections.length,
      bugWithCorrection:bugWithCorrection.length, bugWithoutCorrection:bugWithoutCorrection.length,
      correctionNonBug:correctionOutsideBug.length, others:otherTickets.length,
      discordantTicketIds:unique([...bugWithoutCorrection,...correctionOutsideBug].map(x=>x.id)),
      cases: [...bugWithoutCorrection.map(r=>({ticketId:r.id,subject:r.subject,category:r.category,
        taskId:r.taskNumber,taskType:r.taskType,reason:"Categoria Bug sem Task Azure de correção vinculada",status:r.status})),
        ...correctionOutsideBug.map(r=>({ticketId:r.id,subject:r.subject,category:r.category,
          taskId:r.taskNumber,taskType:r.taskType,reason:"Task Azure de correção com categoria diferente de Bug",status:r.status}))],
    },
    corrections:{
      tickets:corrections.length, distinctTasks:correctionUniqueTasks.length,
      concluded:correctionRows.filter(r=>r.outcome==="CONCLUIDA").length,
      open:correctionRows.filter(r=>r.outcome==="EM_ABERTO").length,
      cancelled:correctionRows.filter(r=>r.outcome==="CANCELADA").length,
      concludedWithVersion:correctionRows.filter(r=>r.outcome==="CONCLUIDA"&&!!r.version).length,
      resolvedAfterTask:correctionRows.filter(r=>r.outcome==="CONCLUIDA"&&r.resolvedAfterTask).length,
      reopenedAfterTask:correctionRows.filter(r=>r.reopenedAfterTask).length,
      postConclusionCandidates:correctionRows.filter(r=>r.reappearanceCandidate).length,
      clientValidatedCount:null as null, // Status Movidesk/Azure não comprova aceite explícito do cliente.
      rows:correctionRows,
    },
    ola:{
      totalCorrectionTickets:corrections.length, activeCorrectionTickets:activeOla.length,
      measured:measuredOla.length, alerts:alertedOla.length,
      onTime:measuredOla.filter(x=>x.status==="DENTRO").length,
      unmeasurable:activeOla.filter(x=>x.status==="NAO_MENSURAVEL").length,
      cancelled:olaRows.filter(x=>x.status==="CANCELADA").length,
      withinTargetPercent:measuredOla.length?Math.round(measuredOla.filter(x=>x.status==="DENTRO").length/measuredOla.length*1000)/10:null,
      medianSupportMinutes:median(measuredOla.map(x=>x.minutes!).filter(x=>Number.isFinite(x))),
      medianExcessMinutes:median(alertedOla.map(x=>x.excessMinutes!).filter(x=>Number.isFinite(x))),
      maxExcessMinutes:alertedOla.length?Math.max(...alertedOla.map(x=>x.excessMinutes??0)):null,
      withVerifiedTier:measuredOla.filter(x=>x.tierVerified).length,
      alertsWithVerifiedTier:alertedOla.filter(x=>x.tierVerified).length,
      cases:olaRows,
    },
    categories:{ observedToAdequacao:categoryTransitions.length, observedTicketCount:unique(categoryTransitions.map(x=>x.ticketId)).length,
      observed:categoryTransitions, reviewCandidates:categoryReview,
      legacyWarning:"A API do Movidesk não expõe categoryHistories; BASELINE não comprova categoria na abertura.",
    },
    recurrence:{groups:recurrenceGroups.length, ticketCandidates:recurrenceTicketIds.length,
      sameTaskGroups:recurrenceGroups.filter(x=>x.evidence==="MESMA_TASK").length,
      afterConclusionGroups:recurrenceGroups.filter(x=>x.afterTechnicalConclusion).length,
      groupsDetail:recurrenceGroups,
    },
    vistra:{
      explicitVistra:vistraCases.filter(x=>x.area==="VISTRA").length,
      suspectedVistraFailures:vistraCases.filter(x=>x.area==="VISTRA"&&x.suspectedFailure).length,
      suspectedAnaliticoFailures:vistraCases.filter(x=>x.area==="ANALITICO"&&x.suspectedFailure).length,
      suspectedReportFailures:vistraCases.filter(x=>x.area==="RELATORIO_SIMER"&&x.suspectedFailure).length,
      cases:vistraCases,monthly:vistraMonthly,
    },
    monthly,
    dataQuality:{
      ticketIdsWithoutAzure:bugWithoutCorrection.map(x=>x.id),
      ticketsWithUnknownOla:activeOla.filter(x=>x.status==="NAO_MENSURAVEL").map(x=>x.ticketId),
      ticketsWithAssumedTier:measuredOla.filter(x=>!x.tierVerified).map(x=>x.ticketId),
      linkedTicketLookup:byId.size,
      noProvenHistoricalOpeningCategory:true,
    },
  };
}
