import axios from "axios";
import type { AxiosResponse } from "axios";

type AzureResponse = Pick<AxiosResponse<unknown>, "data"> &
  Partial<Pick<AxiosResponse<unknown>, "status" | "headers">>;

export type AzureFailure = {
  code: "authentication" | "permission" | "redirect" | "configuration" | "invalid-response" | "rate-limit" | "timeout" | "network" | "remote";
  httpStatus: number | null;
  requiresConfiguration: boolean;
  message: string;
};

export class AzureDevOpsResponseError extends Error {
  readonly code = "invalid-response";
  constructor(message: string, readonly httpStatus: number | null) { super(message); }
}

function invalidResponse(response: AzureResponse, operation: string, collection = false): never {
  const data = response.data;
  const contentType = String(response.headers?.["content-type"] ?? "").toLowerCase();
  const html = contentType.includes("html") || (typeof data === "string" && /^\s*(?:<!doctype\s+html|<html\b)/i.test(data));
  const format = html ? "HTML" : typeof data === "string" ? "texto" : `JSON sem ${collection ? "a coleção esperada" : "o objeto esperado"}`;
  const status = response.status ? `HTTP ${response.status}; ` : "";
  throw new AzureDevOpsResponseError(`Resposta inválida do Azure em ${operation} (${status}${format}): ${collection ? "a coleção JSON esperada não foi retornada" : "o objeto JSON esperado não foi retornado"}. ${html
    ? "Pode ser uma página de login ou uma resposta de proxy. " : ""}Valide organização, projeto, PAT e acesso à API na tela Integrações.`, response.status ?? null);
}

export function azureObject<T extends Record<string, unknown>>(response: AzureResponse, requiredKey: string, operation: string): T {
  const data = response.data;
  if (!String(response.headers?.["content-type"] ?? "").toLowerCase().includes("html") && data &&
      typeof data === "object" && !Array.isArray(data) && requiredKey in data) return data as T;
  return invalidResponse(response, operation);
}

/** Never print response bodies, redirect URLs or credentials in diagnostics. */
export function azureCollection<T>(response: AzureResponse, keys: string | string[], operation: string): T[] {
  const data = response.data;
  const contentType = String(response.headers?.["content-type"] ?? "").toLowerCase();
  const html = contentType.includes("html") ||
    (typeof data === "string" && /^\s*(?:<!doctype\s+html|<html\b)/i.test(data));
  if (!html && data && typeof data === "object") {
    for (const key of typeof keys === "string" ? [keys] : keys) {
      const collection = (data as Record<string, unknown>)[key];
      if (Array.isArray(collection)) return collection as T[];
    }
  }
  return invalidResponse(response, operation, true);
}

function redirectIsSignIn(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  const headers = error.response?.headers;
  const candidates = [headers?.location, headers?.["x-tfs-fedauthredirect"]];
  return candidates.some(value => {
    if (typeof value !== "string") return false;
    try {
      const url = new URL(value, "https://dev.azure.com");
      return (url.hostname === "login.microsoftonline.com" || url.hostname === "login.live.com" ||
        url.hostname.endsWith(".visualstudio.com") || url.hostname === "dev.azure.com") &&
        (/\/(?:_signin|signin|login)(?:\/|$)/i.test(url.pathname) || url.hostname.startsWith("login."));
    } catch { return false; }
  });
}

export function azureFailureMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return "Azure DevOps recusou a autenticação (HTTP 401). Confira validade e organização do PAT na tela Integrações.";
    if (status === 403) return "Azure DevOps recusou o acesso (HTTP 403). Confira a permissão de leitura de Work Items e o acesso ao projeto.";
    if (status && status >= 300 && status < 400) return redirectIsSignIn(error)
      ? `Azure DevOps redirecionou a API para autenticação interativa (HTTP ${status}). O PAT não autenticou esta chamada. Valide a credencial e as políticas de acesso da organização na tela Integrações; o login não foi seguido.`
      : `Azure DevOps redirecionou a chamada da API (HTTP ${status}). Confira organização, projeto, autenticação e proxy na tela Integrações; o redirecionamento não foi seguido.`;
    if (status === 404) return "Azure DevOps não encontrou o recurso (HTTP 404). Confira organização e projeto na tela Integrações.";
    if (status === 429) return "Azure DevOps limitou as consultas (HTTP 429). Aguarde a próxima tentativa ou recarregue depois.";
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return "A consulta ao Azure DevOps excedeu o tempo limite.";
    return status ? `Falha na consulta ao Azure DevOps (HTTP ${status}).` : "Não foi possível conectar à API do Azure DevOps. Confira rede e proxy.";
  }
  return error instanceof Error ? error.message : "Consulta ao Azure DevOps indisponível.";
}

export function azureFailure(error: unknown): AzureFailure {
  const status = axios.isAxiosError(error) ? error.response?.status ?? null : error instanceof AzureDevOpsResponseError ? error.httpStatus : null;
  const code: AzureFailure["code"] = error instanceof AzureDevOpsResponseError ? "invalid-response" :
    (error as { code?: string } | null)?.code === "configuration" ? "configuration" :
    status === 401 ? "authentication" : status === 403 ? "permission" :
    status && status >= 300 && status < 400 ? redirectIsSignIn(error) ? "authentication" : "redirect" :
    status === 404 ? "configuration" : status === 429 ? "rate-limit" :
    axios.isAxiosError(error) && ["ECONNABORTED", "ETIMEDOUT"].includes(error.code ?? "") ? "timeout" :
    axios.isAxiosError(error) && !status ? "network" : "remote";
  return { code, httpStatus: status, requiresConfiguration: ["authentication", "permission", "redirect", "configuration", "invalid-response"].includes(code), message: azureFailureMessage(error) };
}
