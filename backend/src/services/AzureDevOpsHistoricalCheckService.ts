import { saoPauloMonth } from "../domain/CorrectionMonthlyPeriod";
import { createAzureDevOpsClient, type AzureDevOpsConfiguration } from "./AzureDevOpsClient";
import { resolveCorrectionFields, type AzureFieldDefinition } from "./AzureCorrectionFields";
import { azureCollection, azureFailure, type AzureFailure } from "./AzureDevOpsResponse";

type Check = { key: string; label: string; status: "ok" | "empty" | "failed" | "skipped"; records?: number; message?: string };
type ScopeItem = { id: number };

/** Small read-only probes of the exact historical APIs; never homologates monthly totals. */
export async function checkAzureMonthlyAccess(configuration: AzureDevOpsConfiguration, month: string) {
  const { start, close } = saoPauloMonth(month);
  const opening = new Date(start.getTime() - 1);
  const client = createAzureDevOpsClient(configuration);
  const checks: Check[] = [];
  let failure: AzureFailure | null = null;
  let definitions: AzureFieldDefinition[] = [];
  try {
    const response = await client.get("/_apis/wit/fields", { params: { "api-version": "7.1" } });
    definitions = azureCollection<AzureFieldDefinition>(response, "value", "campos do relatório");
    checks.push({ key: "fields", label: "Campos da integração", status: "ok", records: definitions.length });
  } catch (error) {
    failure = azureFailure(error);
    checks.push({ key: "fields", label: "Campos da integração", status: "failed", message: failure.message });
  }
  const fieldMapping = resolveCorrectionFields(definitions);
  const missingFields = Object.values(fieldMapping).filter(reference => !definitions.some(field => field.referenceName === reference));
  if (!failure) checks.push({ key: "mapping", label: "Cliente, urgência e priorização", status: missingFields.length ? "failed" : "ok",
    message: missingFields.length ? `Campos não encontrados: ${missingFields.join(", ")}. Confirme o mapeamento do processo Azure.` : Object.entries(fieldMapping).map(([key, value]) => `${key}: ${value}`).join("; ") });

  const scopes: [ScopeItem[], ScopeItem[]] = [[], []];
  const scopeReady = [false, false];
  if (!failure) {
    const probes = [
      { key: "openingScope", label: "Carteira na abertura", run: async () => {
        const response = await client.post("/_apis/wit/wiql", { query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = 'Correção Clientes' AND [System.State] <> 'Concluído' AND [System.State] <> 'Cancelado' ASOF '${opening.toISOString()}'` }, { params: { "api-version": "7.1", "$top": 1 } });
        scopes[0] = azureCollection<ScopeItem>(response, "workItems", "abertura WIQL ASOF"); scopeReady[0] = true; return scopes[0];
      } },
      { key: "closingScope", label: "Carteira no fechamento", run: async () => {
        const response = await client.post("/_apis/wit/wiql", { query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = 'Correção Clientes' ASOF '${close.toISOString()}'` }, { params: { "api-version": "7.1", "$top": 1 } });
        scopes[1] = azureCollection<ScopeItem>(response, "workItems", "fechamento WIQL ASOF"); scopeReady[1] = true; return scopes[1];
      } },
      { key: "revisions", label: "Reporting de revisões", run: async () => {
        const response = await client.get("/_apis/wit/reporting/workitemrevisions", { params: {
          "api-version": "7.1", startDateTime: start.toISOString(), types: "Correção Clientes", "$maxPageSize": 1,
          fields: ["System.Id", "System.State", "System.ChangedDate", ...Object.values(fieldMapping)].join(","),
          includeIdentityRef: true,
        } });
        return azureCollection(response, ["values", "value"], "Reporting de revisões");
      } },
    ];
    const results = await Promise.allSettled(probes.map(probe => probe.run()));
    results.forEach((result, index) => {
      const probe = probes[index]!;
      if (result.status === "fulfilled") checks.push({ key: probe.key, label: probe.label,
        status: result.value.length ? "ok" : "empty", records: result.value.length,
        message: "Consulta limitada a uma amostra. Não representa o total do mês." });
      else {
        const cause = azureFailure(result.reason); failure ??= cause;
        checks.push({ key: probe.key, label: probe.label, status: "failed", message: cause.message });
      }
    });
  } else {
    for (const [key, label] of [["openingScope", "Carteira na abertura"], ["closingScope", "Carteira no fechamento"], ["revisions", "Reporting de revisões"]])
      checks.push({ key: key!, label: label!, status: "skipped", message: "A conexão deve ser corrigida antes de consultar o histórico." });
  }

  const snapshotResults = await Promise.all([opening, close].map(async (asOf, index): Promise<Check> => {
    const key = index === 0 ? "openingSnapshot" : "closingSnapshot";
    const label = index === 0 ? "Snapshot da abertura" : "Snapshot do fechamento";
    const id = scopes[index]![0]?.id;
    if (!scopeReady[index] || !Number.isSafeInteger(id) || !id || failure?.requiresConfiguration)
      return { key, label, status: "skipped", message: !scopeReady[index] || failure?.requiresConfiguration
        ? "O acesso histórico precisa ser validado antes do snapshot." : "A consulta não retornou uma Task para testar a fotografia." };
    try {
      const response = await client.post("/_apis/wit/workitemsbatch", { ids: [id], asOf: asOf.toISOString(), errorPolicy: "Omit",
        fields: ["System.Id", "System.State", "System.CreatedBy", "System.CreatedDate", "Microsoft.VSTS.Common.StateChangeDate", ...Object.values(fieldMapping)],
      }, { params: { "api-version": "7.1" } });
      const items = azureCollection<{ id: number; fields?: Record<string, unknown> }>(response, "value", label);
      if (!items.some(item => item.id === id && typeof item.fields?.["System.State"] === "string"))
        return { key, label, status: "failed", records: items.length, message: "O Azure não devolveu o estado da Task da amostra na fotografia solicitada." };
      return { key, label, status: "ok", records: items.length, message: "Fotografia de uma Task recuperada. A cobertura completa será conferida ao gerar o relatório." };
    } catch (error) { return { key, label, status: "failed", message: azureFailure(error).message }; }
  }));
  checks.push(...snapshotResults);
  return { month, ok: !checks.some(check => check.status === "failed"), checks, fieldMapping,
    checkedAt: new Date().toISOString(), note: "Este teste valida acesso às APIs com uma amostra. A homologação exige a apuração completa e a conferência dos IDs no mesmo escopo." };
}
