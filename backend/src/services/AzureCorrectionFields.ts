import { AZURE_WORK_ITEM_FIELDS } from "./AzureWorkItemMapper";

export type AzureFieldDefinition = { name?: string; referenceName?: string };

export function resolveCorrectionFields(definitions: AzureFieldDefinition[]) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const find = (terms: string[], fallback: string) => {
    const exact = definitions.find(field => field.referenceName === fallback);
    if (exact?.referenceName) return exact.referenceName;
    const match = definitions.find(field => terms.some(term => normalize(`${field.name ?? ""} ${field.referenceName ?? ""}`).includes(normalize(term))));
    return match?.referenceName || fallback;
  };
  return {
    client: find(["cliente principal", "cliente"], AZURE_WORK_ITEM_FIELDS.client),
    prioritized: find(["priorizada", "priorizado"], AZURE_WORK_ITEM_FIELDS.prioritized),
    urgency: find(["urgencia", "criticidade", "priority"], AZURE_WORK_ITEM_FIELDS.criticality),
  };
}
