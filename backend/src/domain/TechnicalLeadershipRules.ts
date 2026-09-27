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
