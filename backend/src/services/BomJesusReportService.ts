import { prisma } from "../database/prisma";
import { normalizeDomainText, mapPriority, SLA_PRIORITY } from "../domain/TicketClassificationRules";
import { slaBusinessMinutes } from "../domain/SlaCalendarRules";

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
function categoryTransition(actions: Array<{description: string | null; createdDate: Date | null}>) {
  // Só reconhece registro textual explícito de alteração. Não infere histórico da categoria atual.
  const pattern = /(?:categoria\s*(?:alterada|modificada|mudou|de|:)\s*(?:de\s*)?bug\s*(?:para|->|→|a)\s*adequacao|bug\s*(?:reclassificado|alterado)\s*(?:para|como)\s*adequacao)/i;
  const evidence = actions.find(a => pattern.test(text(a.description)));
  return evidence ? { date: evidence.createdDate?.toISOString() || null, evidence: (evidence.description || "").slice(0, 350) } : null;
}
export type BomJesusRow = {
  id: number; subject: string; client: string; createdDate: string; status: string; category: string;
  taskNumber: number | null; taskType: string; classification: string; vistra: boolean;
  recurrenceKey: string; recurrenceCount: number; actionCount: number;
  firstProductEvidence: string | null; ola: string; evidence: string;
  categoryChangedAt: string | null; categoryChangeEvidence: string; vistraType: string; recurrenceEvidence: string;
  taskState: string; deliveredVersion: string; taskCreatedAt: string | null; supportMinutes: number | null; supportTargetMinutes: number | null; supportOlaBreached: boolean | null;
};
export async function bomJesusReport(startDate: string, endDate: string) {
  const start = new Date(startDate + "T00:00:00.000Z");
  const end = new Date(endDate + "T23:59:59.999Z");
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end ||
      (end.getTime() - start.getTime()) > 366 * 86400000) throw new Error("Período inválido ou superior a 366 dias.");
  const tickets = await prisma.ticket.findMany({
    where: { client: { contains: "Bom Jesus", mode: "insensitive" }, createdDate: { gte: start, lte: end }, isDeleted: false },
    select: {
      movideskId: true, subject: true, client: true, createdDate: true, status: true, urgency: true,
      category: true, cause: true, taskNumber: true, taskType: true, service: true,
      serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true,
      actions: { where: { isDeleted: false }, select: { createdDate: true, description: true, status: true }, orderBy: { createdDate: "asc" } },
      statusHistories: { select: { status: true, changedDate: true } },
    },
    orderBy: { createdDate: "desc" },
  });
  const taskIds = [...new Set(tickets.map(t => t.taskNumber).filter((id): id is number => id !== null))];
  const tasks = await prisma.azureWorkItem.findMany({
    where: { OR: [
      ...(taskIds.length ? [{ id: { in: taskIds } }] : []),
      { movideskTicket: { in: tickets.map(t => t.movideskId) } },
    ] },
    select: { id: true, movideskTicket: true, workItemType: true, state: true, azureCreatedAt: true, criticality: true, deliveredVersion: true },
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
    const improvement = includesAny(category, improvementWords) || includesAny(task, improvementWords);
    // Categoria atual não prova classificação inicial. Não inferir reclassificação sem histórico.
    const classification = bug && !improvement ? "Possível bug — validar" : improvement ? "Melhoria atual — validar origem" : "Não determinado";
    const vistraContext = subject + " " + service;
    const vistra = includesAny(vistraContext, vistraWords);
    const reportFailure = includesAny(vistraContext, reportWords) && includesAny(subject + " " + actionsText, failureWords);
    const vistraType = vistra && includesAny(subject + " " + actionsText, failureWords) ? "Falha Vistra — revisar" : reportFailure ? "Falha de relatório — revisar" : vistra ? "Vistra — sem defeito comprovado" : "Não identificado";
    const transition = categoryTransition(t.actions);
    const symptom = normalizeSymptom(t.subject);
    const recurrenceKey = symptom.length >= 16 ? symptom.slice(0, 140) : "";
    if (recurrenceKey) keys.set(recurrenceKey, (keys.get(recurrenceKey) || 0) + 1);
    const productAction = t.actions.find(a => includesAny(text(a.description) + " " + text(a.status), ["encaminhad", "enviado ao produto", "time de produto", "desenvolvimento"]));
    return { t, classification, vistra, vistraType, transition, recurrenceKey, productAction, linkedTask };
  });
  const rows: BomJesusRow[] = prepared.map(({ t, classification, vistra, vistraType, transition, recurrenceKey, productAction, linkedTask }) => ({
    id: t.movideskId, subject: t.subject, client: t.client || "", createdDate: t.createdDate.toISOString(),
    status: t.status, category: t.category || "", taskNumber: t.taskNumber, taskType: linkedTask?.workItemType || t.taskType || "",
    classification, vistra, vistraType, recurrenceKey, recurrenceCount: recurrenceKey ? keys.get(recurrenceKey) || 0 : 0,
    recurrenceEvidence: recurrenceKey ? "Mesmo assunto normalizado; confirmar mesma causa-raiz" : "Assunto insuficiente para agrupamento",
    categoryChangedAt: transition?.date || null, categoryChangeEvidence: transition?.evidence || "",
    actionCount: t.actions.length,
    taskState: linkedTask?.state || "", deliveredVersion: linkedTask?.deliveredVersion || "",
    taskCreatedAt: linkedTask?.azureCreatedAt?.toISOString() || null,
    supportMinutes: linkedTask?.azureCreatedAt && linkedTask.azureCreatedAt >= t.createdDate ? slaBusinessMinutes(t.createdDate, linkedTask.azureCreatedAt) : null,
    supportTargetMinutes: mapPriority(t.urgency, linkedTask?.criticality) ? SLA_PRIORITY[mapPriority(t.urgency, linkedTask?.criticality)!].supportMinutes : null,
    supportOlaBreached: linkedTask?.azureCreatedAt && linkedTask.azureCreatedAt >= t.createdDate && mapPriority(t.urgency, linkedTask?.criticality)
      ? slaBusinessMinutes(t.createdDate, linkedTask.azureCreatedAt) > SLA_PRIORITY[mapPriority(t.urgency, linkedTask?.criticality)!].supportMinutes : null,
    firstProductEvidence: productAction?.createdDate?.toISOString() || null,
    ola: linkedTask?.azureCreatedAt && linkedTask.azureCreatedAt >= t.createdDate && mapPriority(t.urgency, linkedTask?.criticality)
      ? `Calculado pela criação da Task (OLA Suporte): ${slaBusinessMinutes(t.createdDate, linkedTask.azureCreatedAt)} min / ${SLA_PRIORITY[mapPriority(t.urgency, linkedTask?.criticality)!].supportMinutes} min`
      : "Não calculável — falta data válida da Task ou prioridade", evidence: productAction ? "Menção em ação; confirmar efetiva transferência" : "Sem evidência automática de transferência",
  }));
  const vistraMonthly = rows.filter(x => x.vistraType !== "Não identificado" && x.vistraType !== "Vistra — sem defeito comprovado");
  const monthly = Array.from(new Set(rows.map(x => x.createdDate.slice(0, 7)))).sort().map(month => ({
    month, tickets: rows.filter(x => x.createdDate.startsWith(month)).length,
    vistra: vistraMonthly.filter(x => x.createdDate.startsWith(month)).length,
  }));
  return {
    generatedAt: new Date().toISOString(), clientFilter: "Bom Jesus", startDate, endDate,
    methodology: "Dados sincronizados. Mudança Bug→Adequação só é indicada quando há registro explícito nas ações; ausência de evidência não significa ausência de mudança. Recorrência usa assuntos normalizados idênticos, não apenas a rotina; confirmar causa-raiz. Vistra/relatórios exigem evidência de falha. OLA usa criação da Task como marco conforme Desempenho & SLA.",
    totals: {
      tickets: rows.length, possibleBugs: rows.filter(x => x.classification === "Possível bug — validar").length,
      currentImprovements: rows.filter(x => x.classification === "Melhoria atual — validar origem").length,
      vistraCandidates: vistraMonthly.length,
      categoryChangeEvidenceCount: rows.filter(x => x.categoryChangeEvidence).length,
      recurrenceGroups: new Set(rows.filter(x => x.recurrenceCount > 1).map(x => x.recurrenceKey)).size,
      recurrenceCandidates: rows.filter(x => x.recurrenceCount > 1).length,
      confirmedBugs: null, reclassified: rows.filter(x => x.categoryChangeEvidence).length, olaBreaches: rows.filter(x => x.supportOlaBreached === true && includesAny(text(x.taskType), bugWords)).length,
      linkedCorrectionTasks: prepared.filter(x => !!x.linkedTask && includesAny(text(x.linkedTask.workItemType), bugWords)).length,
      deliveredCorrectionTasks: prepared.filter(x => !!x.linkedTask && includesAny(text(x.linkedTask.workItemType), bugWords) && !!x.linkedTask.deliveredVersion).length,
    },
    monthly, rows,
  };
}
