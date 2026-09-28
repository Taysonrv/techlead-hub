export const HIGH_AZURE_CRITICALITIES = ["Crítica", "Alta"] as const;

function normalizeAzureDomainText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

/**
 * Criticidade elevada do Work Item no Azure.
 * Não representa prioridade P1/P2 do atendimento Movidesk.
 */
export function isHighAzureCriticality(value?: string | null) {
  const normalized = normalizeAzureDomainText(value);
  return normalized === "alta" || normalized === "critica";
}
