export type LeadershipConfidence = "ALTA" | "MÉDIA";
export type LeadershipGapConfidence = "Alta" | "Média" | "Baixa";
export type LeadershipGapImpact = "Alto" | "Médio";

export const TECHNICAL_LEADERSHIP_THRESHOLDS = {
  recurrenceMinimum: 3,
  recurrenceStrongEvidence: 5,
  recurrenceGapMinimum: 5,
  highImpactMinimum: 10,
  blockedHighImpactMinimum: 5,
  classificationHighImpactMinimum: 10,
} as const;

export function recurrenceConfidence(input: {
  count: number;
  clientCount: number;
  analystCount: number;
}): LeadershipConfidence {
  return input.count >= TECHNICAL_LEADERSHIP_THRESHOLDS.recurrenceStrongEvidence
    && (input.clientCount >= 2 || input.analystCount >= 2)
    ? "ALTA"
    : "MÉDIA";
}

export function recurrenceAction(input: {
  count: number;
  clientCount: number;
  analystCount: number;
}) {
  if (input.analystCount >= 2) return "Avaliar treinamento interno e padronização do diagnóstico.";
  if (input.clientCount === 1 && input.count >= TECHNICAL_LEADERSHIP_THRESHOLDS.recurrenceStrongEvidence) {
    return "Avaliar orientação ou treinamento direcionado ao cliente.";
  }
  return "Avaliar causa raiz e recorrência com Produto/Desenvolvimento.";
}

export function recurrenceGapConfidence(input: {
  recurrenceConfidence: LeadershipConfidence;
  azureLinked: number;
}): LeadershipGapConfidence {
  if (input.azureLinked <= 0) return "Baixa";
  return input.recurrenceConfidence === "ALTA" ? "Alta" : "Média";
}

export function recurrenceGapImpact(count: number, confidence: LeadershipGapConfidence): LeadershipGapImpact {
  return count >= TECHNICAL_LEADERSHIP_THRESHOLDS.highImpactMinimum && confidence !== "Baixa"
    ? "Alto"
    : "Médio";
}

export function volumeGapImpact(count: number, highImpactMinimum: number): LeadershipGapImpact {
  return count >= highImpactMinimum ? "Alto" : "Médio";
}

export type LeadershipAuditSignalKey =
  | "CLASSIFICATION_DIVERGENCE"
  | "NO_MOVEMENT"
  | "DEADLINE_OR_SLA"
  | "CLOSED_TICKET_ACTIVE_TASK"
  | "OPEN_TICKET_FINISHED_TASK";

export const TECHNICAL_LEADERSHIP_AUDIT_SIGNALS: Record<LeadershipAuditSignalKey, {
  weight: number;
  reason: string;
  source: "Movidesk" | "Movidesk + Azure";
}> = {
  CLASSIFICATION_DIVERGENCE: {
    weight: 4,
    reason: "Possível divergência entre categoria e causa",
    source: "Movidesk",
  },
  NO_MOVEMENT: {
    weight: 3,
    reason: "Sem ação registrada há mais de 72h",
    source: "Movidesk",
  },
  DEADLINE_OR_SLA: {
    weight: 5,
    reason: "Prazo vencido ou SLA de solução violado",
    source: "Movidesk",
  },
  CLOSED_TICKET_ACTIVE_TASK: {
    weight: 7,
    reason: "Ticket encerrado com Task Azure ainda ativa",
    source: "Movidesk + Azure",
  },
  OPEN_TICKET_FINISHED_TASK: {
    weight: 6,
    reason: "Ticket aberto com Task Azure concluída",
    source: "Movidesk + Azure",
  },
};

export function leadershipAuditConfidence(input: {
  sources: Iterable<string>;
  evidenceCount: number;
}): LeadershipConfidence {
  const sources = new Set(input.sources);
  return sources.has("Movidesk + Azure") || input.evidenceCount >= 2 ? "ALTA" : "MÉDIA";
}

export type RecurrencePattern = "CONCENTRATED" | "TRANSVERSAL" | "DISTRIBUTED";

export function recurrencePattern(input: {
  clientCount: number;
  topClientSharePct: number;
}): RecurrencePattern {
  if (input.clientCount <= 1 || input.topClientSharePct >= 70) return "CONCENTRATED";
  if (input.clientCount >= 2 && input.topClientSharePct <= 60) return "TRANSVERSAL";
  return "DISTRIBUTED";
}
