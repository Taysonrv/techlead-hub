import { normalizeDomainText } from "./TicketClassificationRules";

export type AzureProductivityOutcome =
  | "DELIVERED"
  | "SUPPORT_CONCLUDED"
  | "CONCLUDED_WITHOUT_VERSION"
  | "CANCELLED"
  | "IN_PROGRESS";

export type AzureProductivityWorkItemType =
  | "Correção Clientes"
  | "Evolução"
  | "APOIO";

export const AZURE_PRODUCTIVITY_TYPES = {
  correction: "Correção Clientes",
  evolution: "Evolução",
  support: "APOIO",
} as const;

export function isAzureProductivityConcluded(state?: string | null) {
  return normalizeDomainText(state) === "concluido";
}

export function isAzureProductivityCancelled(state?: string | null) {
  return normalizeDomainText(state) === "cancelado";
}

/**
 * Classifica o desfecho produtivo do workflow Azure.
 * Esta regra é intencionalmente mais restrita que o lifecycle técnico:
 * somente "Concluído" e "Cancelado" encerram o denominador histórico
 * deste indicador.
 */
export function classifyAzureProductivityOutcome(input: {
  state?: string | null;
  workItemType?: string | null;
  hasDeliveredVersion: boolean;
}): AzureProductivityOutcome {
  if (isAzureProductivityCancelled(input.state)) return "CANCELLED";
  if (!isAzureProductivityConcluded(input.state)) return "IN_PROGRESS";
  if (input.workItemType === AZURE_PRODUCTIVITY_TYPES.support) return "SUPPORT_CONCLUDED";
  return input.hasDeliveredVersion ? "DELIVERED" : "CONCLUDED_WITHOUT_VERSION";
}

export function isAzureProductiveOutcome(outcome: AzureProductivityOutcome) {
  return outcome === "DELIVERED" || outcome === "SUPPORT_CONCLUDED";
}

export function isAzureProductivityTerminalOutcome(outcome: AzureProductivityOutcome) {
  return outcome !== "IN_PROGRESS";
}
