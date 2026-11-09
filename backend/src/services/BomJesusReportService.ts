import { prisma } from "../database/prisma";
import { normalizeDomainText } from "../domain/TicketClassificationRules";

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
};
export async function bomJesusReport(startDate: string, endDate: string) {
  const start = new Date(startDate + "T00:00:00.000Z");
  const end = new Date(endDate + "T23:59:59.999Z");
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end ||
      (end.getTime() - start.getTime()) > 366 * 86400000) throw new Error("Período inválido ou superior a 366 dias.");
  const tickets = await prisma.ticket.findMany({
    where: { client: { contains: "Bom Jesus", mode: "insensitive" }, createdDate: { gte: start, lte: end }, isDeleted: false },
    select: {
      movideskId: true, subject: true, client: true, createdDate: true, status: true,
      category: true, cause: true, taskNumber: true, taskType: true, service: true,
      serviceFirstLevel: true, serviceSecondLevel: true, serviceThirdLevel: true,
      actions: { where: { isDeleted: false }, select: { createdDate: true, description: true, status: true }, orderBy: { createdDate: "asc" } },
      statusHistories: { select: { status: true, changedDate: true } },
    },
    orderBy: { createdDate: "desc" },
  });
  const keys = new Map<string, number>();
  const prepared = tickets.map(t => {
    const category = text(t.category);
    const task = text(t.taskType);
    const subject = text(t.subject);
    const service = text([t.serviceThirdLevel, t.serviceSecondLevel, t.serviceFirstLevel, t.service].filter(Boolean).join(" "));
    const actionsText = t.actions.map(a => text(a.description)).join(" ");
    const bug = includesAny(category, bugWords) || includesAny(task, bugWords);
    const improvement = includesAny(category, improvementWords) || includesAny(task, improvementWords);
    // Categoria atual não prova classificação inicial. Não inferir reclassificação sem histórico.
    const classification = bug && !improvement ? "Possível bug — validar" : improvement ? "Melhoria atual — validar origem" : "Não determinado";
    const vistra = includesAny(subject + " " + service + " " + actionsText, vistraWords);
    const recurrenceKey = service || subject.replace(/\b\d+\b/g, "#").slice(0, 110);
    if (recurrenceKey) keys.set(recurrenceKey, (keys.get(recurrenceKey) || 0) + 1);
    const productAction = t.actions.find(a => includesAny(text(a.description) + " " + text(a.status), ["encaminhad", "enviado ao produto", "time de produto", "desenvolvimento"]));
    return { t, classification, vistra, recurrenceKey, productAction };
  });
  const rows: BomJesusRow[] = prepared.map(({ t, classification, vistra, recurrenceKey, productAction }) => ({
    id: t.movideskId, subject: t.subject, client: t.client || "", createdDate: t.createdDate.toISOString(),
    status: t.status, category: t.category || "", taskNumber: t.taskNumber, taskType: t.taskType || "",
    classification, vistra, recurrenceKey, recurrenceCount: keys.get(recurrenceKey) || 0,
    actionCount: t.actions.length, firstProductEvidence: productAction?.createdDate?.toISOString() || null,
    ola: "Não apurado — exige marco de passagem e regra de OLA", evidence: productAction ? "Menção em ação; confirmar efetiva transferência" : "Sem evidência automática de transferência",
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
      confirmedBugs: null, reclassified: null, olaBreaches: null,
    },
    monthly, rows,
  };
}
