import { prisma } from "../database/prisma";
import { normalizeDomainText, mapPriority } from "../domain/TicketClassificationRules";
import type { SlaTier } from "../domain/AliareSlaRules";
import { computeBomJesusSla, type SlaEvidence } from "./BomJesusSlaMetrics";
import { summarizeCategoryEvents, isBugToAdequacao } from "./TicketCategoryHistoryService";

const text = (value: string | null | undefined) => normalizeDomainText(value);
const includesAny = (value: string, terms: string[]) => terms.some(term => value.includes(term));
const bugWords = ["bug", "defeito", "correcao"];
const improvementWords = ["melhoria", "evolucao", "blindagem", "adequacao"];
const vistraWords = ["vistra"];
const reportWords = ["relatorio", "dashboard", "painel"];
const failureWords = ["erro", "falha", "nao funciona", "nao abre", "parou", "indisponivel", "travamento", "bug"];
const normalizeSymptom = (subject: string) => text(subject)
  .replace(/\b(?:ticket|atendimento|chamado|solicitacao)\s*#?\d+\b/g, " ")
  .replace(/\b\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b/g, " ")
  .replace(/\b\d+\b/g, " ")
  .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
export type BomJesusRow = {
  id: number; subject: string; client: string; createdDate: string; status: string; category: string;
  taskNumber: number | null; taskType: string; classification: string; vistra: boolean;
  recurrenceKey: string; recurrenceCount: number; actionCount: number;
  firstProductEvidence: string | null; ola: string; evidence: string;
  categoryChangedAt: string | null; categoryChangeEvidence: string; vistraType: string; recurrenceEvidence: string;
  initialObservedCategory: string | null; initialObservedAt: string | null; initialSource: string | null;
  openingCategoryVerified: boolean; categoryHistory: Array<{ previousCategory: string | null; category: string; source: string; observedAt: string; sourceLastUpdate: string | null; kind: string }>;
  taskState: string; deliveredVersion: string; taskCreatedAt: string | null; taskConcludedAt: string | null; supportMinutes: number | null; supportTargetMinutes: number | null; supportOlaBreached: boolean | null;
  sla: SlaEvidence;
};
export async function bomJesusReport(startDate: string, endDate: string, tierOverride: SlaTier | null = null) {
  const start = new Date(startDate + "T00:00:00.000Z");
  const end = new Date(endDate + "T23:59:59.999Z");
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end ||
      (end.getTime() - start.getTime()) > 366 * 86400000) throw new Error("Período inválido ou superior a 366 dias.");
  const tickets = await prisma.ticket.findMany({
    where: { client: { contains: "Bom Jesus", mode: "insensitive" }, createdDate: { gte: start, lte: end }, isDeleted: false },
    select: {
      movideskId: true, subject: true, client: true, createdDate: true, status: true, urgency: true,
      category: true, cause: true, taskNumber: true, taskType: true, service: true, slaAgreement: true,
      firstResponseDate: true, resolvedDate: true,
      serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true,
      actions: { where: { isDeleted: false }, select: { createdDate: true, description: true, status: true }, orderBy: { createdDate: "asc" } },
      statusHistories: { select: { status: true, changedDate: true } },
      categorySnapshots: { orderBy: { id: "asc" }, select: { kind: true, category: true, previousCategory: true, source: true, observedAt: true, sourceLastUpdate: true } },
    },
    orderBy: { createdDate: "desc" },
  });
  const taskIds = [...new Set(tickets.map(t => t.taskNumber).filter((id): id is number => id !== null))];
  const tasks = await prisma.azureWorkItem.findMany({
    where: { OR: [
      ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
      { movideskTicket: { in: tickets.map(t => t.movideskId) } },
    ] },
    select: { id: true, movideskTicket: true, workItemType: true, state: true, azureCreatedAt: true, azureClosedAt: true, stateChangedAt: true, criticality: true, deliveredVersion: true },
  });
  const byTask = new Map(tasks.map(t => [t.id, t]));
  const byTicket = new Map(tasks.filter(t => t.movideskTicket !== null).map(t => [t.movideskTicket!, t]));
  const keys = new Map<string, number>();
  const prepared = tickets.map(t => {
    const linkedTask = (t.taskNumber ? byTask.get(t.taskNumber) : undefined) ?? byTicket.get(t.movideskId);
    const category = text(t.category);
    const task = text(t.taskType);
    const subject = text(t.subject);
    const service = text([t.serviceThirdLevel, t.serviceSecondLevel, t.serviceFirstLevel, t.service].filter(Boolean).join(" "));
    const actionsText = t.actions.map(a => text(a.description)).join(" ");
    const bug = includesAny(category, bugWords) || includesAny(task, bugWords) || (!!linkedTask && includesAny(text(linkedTask.workItemType), bugWords));
    const correctionTask = Boolean(linkedTask && includesAny(text(linkedTask.workItemType) + " " + text(t.taskType), bugWords));
    const improvement = includesAny(category, improvementWords) || includesAny(task, improvementWords);
    // Categoria atual não prova classificação inicial. Não inferir reclassificação sem histórico.
    const classification = bug && !improvement ? "Possível bug — validar" : improvement ? "Melhoria atual — validar origem" : "Não determinado";
    const vistraContext = subject + " " + service;
    const vistra = includesAny(vistraContext, vistraWords);
    const reportFailure = includesAny(vistraContext, reportWords) && includesAny(subject + " " + actionsText, failureWords);
    const vistraType = vistra && includesAny(subject + " " + actionsText, failureWords) ? "Falha Vistra — revisar" : reportFailure ? "Falha de relatório — revisar" : vistra ? "Vistra — sem defeito comprovado" : "Não identificado";
    const categoryHistory = summarizeCategoryEvents(t.categorySnapshots);
    const transitions = categoryHistory.transitions.filter(isBugToAdequacao);
    const lastTransition = transitions[transitions.length - 1] ?? null;
    const symptom = normalizeSymptom(t.subject);
    const recurrenceKey = symptom.length >= 16 ? symptom.slice(0, 140) : "";
    if (recurrenceKey) keys.set(recurrenceKey, (keys.get(recurrenceKey) || 0) + 1);
    const productAction = t.actions.find(a => includesAny(text(a.description) + " " + text(a.status), ["encaminhad", "enviado ao produto", "time de produto", "desenvolvimento"]));
    const concluded = linkedTask && ["concluida", "concluido", "done", "closed", "resolved", "encerrado", "encerrada"].includes(text(linkedTask.state));
    const taskClosedAt = concluded ? (linkedTask?.stateChangedAt ?? linkedTask?.azureClosedAt ?? null) : null;
    const sla = computeBomJesusSla({
      category: t.category, taskKind: correctionTask || category === "bug",
      urgencyPriority: mapPriority(t.urgency, linkedTask?.criticality),
      slaAgreement: t.slaAgreement, tierOverride,
      createdDate: t.createdDate, firstResponseDate: t.firstResponseDate,
      resolvedDate: t.resolvedDate, taskCreatedAt: linkedTask?.azureCreatedAt ?? null,
      taskClosedAt, taskIsConcluded: Boolean(concluded), statusHistories: t.statusHistories,
      asOf: new Date(),
    });
    return { t, classification, vistra, vistraType, categoryHistory, lastTransition, recurrenceKey, productAction, linkedTask, sla, correctionTask, concluded, taskClosedAt };
  });
  const rows: BomJesusRow[] = prepared.map(({ t, classification, vistra, vistraType, categoryHistory, lastTransition, recurrenceKey, productAction, linkedTask, sla, taskClosedAt }) => ({
    id: t.movideskId, subject: t.subject, client: t.client || "", createdDate: t.createdDate.toISOString(),
    status: t.status, category: t.category || "", taskNumber: linkedTask?.id ?? t.taskNumber, taskType: linkedTask?.workItemType || t.taskType || "",
    classification, vistra, vistraType, recurrenceKey, recurrenceCount: recurrenceKey ? keys.get(recurrenceKey) || 0 : 0,
    recurrenceEvidence: recurrenceKey ? "Mesmo assunto normalizado; confirmar mesma causa-raiz" : "Assunto insuficiente para agrupamento",
    categoryChangedAt: lastTransition?.observedAt || null,
    categoryChangeEvidence: lastTransition
      ? `Alteração observada: ${lastTransition.previousCategory} → ${lastTransition.category}. Fonte: ${lastTransition.source}. Data de captura (não é necessariamente a data da alteração no Movidesk).`
      : "",
    initialObservedCategory: categoryHistory.initialObservedCategory,
    initialObservedAt: categoryHistory.initialObservedAt,
    initialSource: categoryHistory.initialSource,
    openingCategoryVerified: categoryHistory.openingCategoryVerified,
    categoryHistory: categoryHistory.transitions,
    actionCount: t.actions.length,
    taskState: linkedTask?.state || "", deliveredVersion: linkedTask?.deliveredVersion || "",
    taskCreatedAt: linkedTask?.azureCreatedAt?.toISOString() || null,
    taskConcludedAt: taskClosedAt?.toISOString() || null,
    supportMinutes: sla.support.minutes,
    supportTargetMinutes: sla.support.targetMinutes,
    supportOlaBreached: sla.support.exceeded,
    sla,
    firstProductEvidence: productAction?.createdDate?.toISOString() || null,
    ola: sla.support.minutes !== null && sla.support.targetMinutes !== null
      ? `OLA Suporte ${sla.support.minutes} / ${sla.support.targetMinutes} min (${sla.support.exceeded ? "excedido" : "dentro da meta"})`
      : "OLA Suporte não calculável — verificar marcos/prioridade/categoria",
    evidence: productAction ? "Menção em ação; conferir data efetiva de passagem" : "Sem menção textual de transferência",
  }));
  const vistraMonthly = rows.filter(x => x.vistraType !== "Não identificado" && x.vistraType !== "Vistra — sem defeito comprovado");
  const monthly = Array.from(new Set(rows.map(x => x.createdDate.slice(0, 7)))).sort().map(month => ({
    month, tickets: rows.filter(x => x.createdDate.startsWith(month)).length,
    vistra: vistraMonthly.filter(x => x.createdDate.startsWith(month)).length,
  }));
  return {
    generatedAt: new Date().toISOString(), clientFilter: "Bom Jesus", startDate, endDate,
    methodology: "Bugs reais = tickets vinculados a Work Items de correção do Azure (ex.: Correção Clientes); código numérico do campo Tipo Task no Movidesk não classifica sozinho. Categoria: transições detectadas entre observações sincronizadas, sem reconstrução fictícia da abertura. OLA/SLA: Aliare 2026 v1.0, perfil Padrão/VIP, calendário Bug seg–sex 08–18h, feriados nacionais 2026 e pausas registradas em histórico de status. Criação da Task é PROXY de passagem ao Desenvolvimento, não confirmação do envio; conclusão Azure é referência de encerramento. Perfil, pausas, feriados locais e prioridade histórica precisam de conferência. Todos os desvios apresentados são preliminares.",
    totals: {
      tickets: rows.length, possibleBugs: rows.filter(x => x.classification === "Possível bug — validar").length,
      currentImprovements: rows.filter(x => x.classification === "Melhoria atual — validar origem").length,
      vistraCandidates: vistraMonthly.length,
      categoryChangeEvidenceCount: rows.filter(x => x.categoryChangeEvidence).length,
      categoryHistoryCoverage: rows.filter(x => x.categoryHistory.length > 0).length,
      categoryOpeningVerified: 0,
      recurrenceGroups: new Set(rows.filter(x => x.recurrenceCount > 1).map(x => x.recurrenceKey)).size,
      recurrenceCandidates: rows.filter(x => x.recurrenceCount > 1).length,
      confirmedBugs: prepared.filter(x => x.correctionTask).length, reclassified: rows.filter(x => x.categoryChangeEvidence).length,
      olaBreaches: rows.filter(x => x.sla.kind === "BUG" && x.sla.eligible && x.sla.support.exceeded === true && x.sla.tierVerified && x.taskCreatedAt).length,
      olaBreachesPreliminary: rows.filter(x => x.sla.kind === "BUG" && x.sla.eligible && x.sla.support.exceeded === true && !x.sla.tierVerified && x.taskCreatedAt).length,
      responseBreaches: rows.filter(x => x.sla.eligible && x.sla.response.exceeded === true).length,
      factoryBreaches: rows.filter(x => x.sla.kind === "BUG" && x.sla.eligible && x.sla.factory.exceeded === true && x.sla.factory.state === "concluido").length,
      totalSlaBreaches: rows.filter(x => x.sla.eligible && x.sla.total.exceeded === true && x.sla.total.state === "concluido").length,
      factoryOverdueOpen: rows.filter(x => x.sla.kind === "BUG" && x.sla.eligible && x.sla.factory.exceeded === true && x.sla.factory.state === "em andamento").length,
      withoutVerifiedProfile: rows.filter(x => x.sla.kind === "BUG" && x.sla.eligible && !x.sla.tierVerified).length,
      slaCalculationEligible: rows.filter(x => x.sla.eligible && x.sla.priority !== null).length,
      linkedCorrectionTasks: prepared.filter(x => x.correctionTask).length,
      deliveredCorrectionTasks: prepared.filter(x => x.correctionTask && x.concluded && !!x.linkedTask?.deliveredVersion).length,
      concludedCorrectionTasks: prepared.filter(x => x.correctionTask && x.concluded).length,
      openCorrectionTasks: prepared.filter(x => x.correctionTask && !x.concluded).length,
      correctionWithVersion: prepared.filter(x => x.correctionTask && !!x.linkedTask?.deliveredVersion).length,
    },
    monthly, rows,
  };
}
