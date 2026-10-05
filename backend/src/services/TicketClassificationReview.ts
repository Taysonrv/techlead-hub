import { normalizeOperationalText } from "../domain/OperationalLifecycleRules";

export type ClassificationReview = {
  suggestedCategory: "Problema" | "Dúvida" | null;
  suggestedCause: string | null;
  confidence: "ALTA" | "MÉDIA";
  evidence: string[];
  reason: string;
};

type TicketForReview = {
  subject: string;
  category: string | null;
  cause: string | null;
  justification?: string | null;
  rawData?: unknown;
};

const normalize = (value: string) => normalizeOperationalText(value);

function contextFrom(ticket: TicketForReview) {
  const raw = ticket.rawData && typeof ticket.rawData === "object" && !Array.isArray(ticket.rawData)
    ? ticket.rawData as Record<string, unknown>
    : null;
  const actions = raw && Array.isArray(raw.actions) ? raw.actions : [];
  const recent = actions.slice(-8).flatMap((action) => {
    if (!action || typeof action !== "object" || Array.isArray(action)) return [];
    const item = action as Record<string, unknown>;
    return [item.description, item.justification]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  });
  return normalize([ticket.subject, ticket.justification, ...recent].filter(Boolean).join(" "));
}

export function reviewTicketClassification(ticket: TicketForReview): ClassificationReview | null {
  const category = normalize(ticket.category ?? "");
  if (!category) return null;
  const context = contextFrom(ticket);
  if (context.length < 8) return null;

  const evidence: string[] = [];
  const signal = (pattern: RegExp, label: string) => {
    if (!pattern.test(context)) return false;
    evidence.push(label);
    return true;
  };

  const problemSignals = [
    signal(/\berro\b|mensagem de erro|exception|rejei[cç][aã]o|falha|nao permite|nao grava|nao salva|incorret|divergen|duplicad|trav|bug/, "contexto relata erro/falha"),
    signal(/deveria|comportamento esperado|resultado incorreto|nao deveria|inconsisten/, "contexto compara comportamento esperado"),
  ].filter(Boolean).length;
  const doubtSignals = [
    signal(/como fazer|como realizar|como funciona|orienta[cç][aã]o|duvida|d[uú]vida|procedimento|qual processo|onde (?:fica|localiza)|gostaria de saber/, "contexto pede orientação/procedimento"),
    signal(/treinamento|explica[cç][aã]o|esclarecimento|informa[cç][aã]o/, "contexto pede informação/esclarecimento"),
  ].filter(Boolean).length;

  const suggestedCategory = problemSignals > doubtSignals && problemSignals > 0
    ? "Problema"
    : doubtSignals > problemSignals && doubtSignals > 0
      ? "Dúvida"
      : null;

  let suggestedCause: string | null = null;
  if (category === "problema" || suggestedCategory === "Problema") {
    if (/sefaz|receita estadual|webservice|certificado|agriq|sisdev|indea|hendow|plugboleto|terceir/.test(context)) {
      suggestedCause = "SEFAZ ou aplicativo de terceiros";
      evidence.push("há referência a SEFAZ/integração externa");
    } else if (/parametr|configura[cç][aã]o|configurad|cadastro incorreto|regra configur/.test(context)) {
      suggestedCause = "Configuração";
      evidence.push("há indício de configuração/parametrização");
    } else if (/opera[cç][aã]o incorreta|processo incorreto|procedimento incorreto|usuario (?:fez|informou|selecionou)|lancamento incorreto/.test(context)) {
      suggestedCause = "Erro operacional";
      evidence.push("há indício de execução operacional incorreta");
    }
  }

  const currentCause = normalize(ticket.cause ?? "");
  const categoryMismatch = Boolean(suggestedCategory && normalize(suggestedCategory) !== category);
  const causeMismatch = Boolean(suggestedCause && currentCause && normalize(suggestedCause) !== currentCause);
  if (!categoryMismatch && !causeMismatch) return null;

  const comparisons = [
    categoryMismatch ? `Categoria atual "${ticket.category}" diverge do contexto, que sugere "${suggestedCategory}".` : null,
    causeMismatch ? `Causa atual "${ticket.cause}" diverge dos indícios, que sugerem "${suggestedCause}".` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    suggestedCategory: categoryMismatch ? suggestedCategory : null,
    suggestedCause: causeMismatch ? suggestedCause : null,
    confidence: Math.max(problemSignals, doubtSignals) >= 2 || Boolean(suggestedCause) ? "ALTA" : "MÉDIA",
    evidence: [...new Set(evidence)].slice(0, 5),
    reason: comparisons.join(" "),
  };
}
