import { prisma } from "../database/prisma";
import { normalizeDomainText, mapPriority, SLA_PRIORITY } from "../domain/TicketClassificationRules";
import { slaBusinessMinutes } from "../domain/SlaCalendarRules";

const text = (value: string | null | undefined) => normalizeDomainText(value);
const includesAny = (value: string, terms: string[]) => terms.some(term => value.includes(term));
const bugWords = ["bug", "defeito", "correcao"];
const improvementWords = ["melhoria", "evolucao", "blindagem", "adequacao"];
const vistraWords = ["vistra", "relatorio", "dashboard", "painel"];
export type BomJesusRow = {
  id: number; subject: string; client: string; createdDate: string; status: string; category: string;
  taskNumber: number | null; taskType: string; classification: string; vistra: boolean;
  recurrenceKey: string; recurrenceCount: number; actionCount: number;
  firstProductEvidence: string | null; ola: string; evidence: string;
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
    const vistra = includesAny(subject + " " + service + " " + actionsText, vistraWords);
    const recurrenceKey = service || subject.replace(/\b\d+\b/g, "#").slice(0, 110);
    if (recurrenceKey) keys.set(recurrenceKey, (keys.get(recurrenceKey) || 0) + 1);
    const productAction = t.actions.find(a => includesAny(text(a.description) + " " + text(a.status), ["encaminhad", "enviado ao produto", "time de produto", "desenvolvimento"]));
    return { t, classification, vistra, recurrenceKey, productAction, linkedTask };
  });
  const rows: BomJesusRow[] = prepared.map(({ t, classification, vistra, recurrenceKey, productAction, linkedTask }) => ({
    id: t.movideskId, subject: t.subject, client: t.client || "", createdDate: t.createdDate.toISOString(),
    status: t.status, category: t.category || "", taskNumber: t.taskNumber, taskType: linkedTask?.workItemType || t.taskType || "",
    classification, vistra, recurrenceKey, recurrenceCount: keys.get(recurrenceKey) || 0,
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
  const monthly = Array.from(new Set(rows.map(x => x.createdDate.slice(0, 7)))).sort().map(month => ({
    month, tickets: rows.filter(x => x.createdDate.startsWith(month)).length,
    vistra: rows.filter(x => x.createdDate.startsWith(month) && x.vistra).length,
  }));
  return {
    generatedAt: new Date().toISOString(), clientFilter: "Bom Jesus", startDate, endDate,
    methodology: "Dados do banco sincronizado. Classificações são indícios, não bugs confirmados. Reclassificação e OLA não podem ser afirmados sem evidência temporal auditável. Recorrência agrupa serviço ou assunto normalizado; exige validação da causa-raiz.",
    totals: {
      tickets: rows.length, possibleBugs: rows.filter(x => x.classification === "Possível bug — validar").length,
      currentImprovements: rows.filter(x => x.classification === "Melhoria atual — validar origem").length,
      vistraCandidates: rows.filter(x => x.vistra).length,
      recurrenceCandidates: rows.filter(x => x.recurrenceCount > 1).length,
      confirmedBugs: null, reclassified: null, olaBreaches: rows.filter(x => x.supportOlaBreached === true && includesAny(text(x.taskType), bugWords)).length,
      linkedCorrectionTasks: prepared.filter(x => !!x.linkedTask && includesAny(text(x.linkedTask.workItemType), bugWords)).length,
      deliveredCorrectionTasks: prepared.filter(x => !!x.linkedTask && includesAny(text(x.linkedTask.workItemType), bugWords) && !!x.linkedTask.deliveredVersion).length,
    },
    monthly, rows,
  };
}
