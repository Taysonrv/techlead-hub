import axios from "axios";

export type AzureDevOpsConfiguration = { organization: string; project: string; pat: string };
type ConfigurationInput = Partial<AzureDevOpsConfiguration>;

export class AzureDevOpsConfigurationError extends Error {
  readonly code = "configuration";
}

function azureUrl(value: string): { organization: string; project: string } | null {
  if (!/^https?:\/\//i.test(value)) return null;
  let url: URL;
  try { url = new URL(value); }
  catch { throw new AzureDevOpsConfigurationError("URL do Azure DevOps inválida. Informe organização e projeto na tela Integrações."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new AzureDevOpsConfigurationError("Use uma URL HTTPS do Azure DevOps, sem credenciais, para configurar organização e projeto.");
  }
  const segments = url.pathname.split("/").filter(Boolean).map(segment => {
    try { return decodeURIComponent(segment); }
    catch { throw new AzureDevOpsConfigurationError("A URL do Azure DevOps contém um nome inválido."); }
  });
  if (url.hostname === "dev.azure.com") {
    return { organization: segments[0] ?? "", project: segments[1]?.startsWith("_") ? "" : segments[1] ?? "" };
  }
  const legacy = url.hostname.match(/^([a-z0-9-]+)\.visualstudio\.com$/i);
  if (legacy) {
    if (segments[0]?.toLowerCase() === "defaultcollection") segments.shift();
    return { organization: legacy[1]!, project: segments[0]?.startsWith("_") ? "" : segments[0] ?? "" };
  }
  throw new AzureDevOpsConfigurationError("A URL informada não identifica uma organização do Azure DevOps Services.");
}

/** Accept names, GUIDs and copied Azure project URLs without encoding the whole URL as a name. */
export function azureDevOpsConfiguration(input: ConfigurationInput = {}): AzureDevOpsConfiguration {
  const rawOrganization = input.organization?.trim() || process.env.AZURE_DEVOPS_ORGANIZATION?.trim() || "";
  const rawProject = input.project?.trim() || process.env.AZURE_DEVOPS_PROJECT?.trim() || "";
  const organizationUrl = azureUrl(rawOrganization);
  const projectUrl = azureUrl(rawProject);
  const organization = organizationUrl?.organization ?? rawOrganization;
  if (projectUrl && projectUrl.organization.toLowerCase() !== organization.toLowerCase()) {
    throw new AzureDevOpsConfigurationError("A URL do projeto pertence a outra organização do Azure DevOps.");
  }
  const project = (projectUrl?.project ?? rawProject) || organizationUrl?.project || "";
  if (organization && /[\s/\\?#:@]/.test(organization)) {
    throw new AzureDevOpsConfigurationError("Organização Azure inválida. Informe o nome ou a URL da organização.");
  }
  if (project && /[/\\?#]/.test(project)) {
    throw new AzureDevOpsConfigurationError("Projeto Azure inválido. Informe o nome, GUID ou a URL do projeto.");
  }
  return { organization, project, pat: input.pat?.trim() || process.env.AZURE_DEVOPS_PAT?.trim() || "" };
}

export function azureRequestOptions(configuration: AzureDevOpsConfiguration, timeout = 15_000) {
  return {
    baseURL: `https://dev.azure.com/${encodeURIComponent(configuration.organization)}/${encodeURIComponent(configuration.project)}`,
    timeout,
    maxRedirects: 0,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`:${configuration.pat}`, "utf8").toString("base64")}`,
      "X-TFS-FedAuthRedirect": "Suppress",
    },
  };
}

export function createAzureDevOpsClient(configuration: AzureDevOpsConfiguration, timeout = 15_000) {
  return axios.create(azureRequestOptions(configuration, timeout));
}
