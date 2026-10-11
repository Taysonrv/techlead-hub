import axios from "axios";
import type { AxiosResponse } from "axios";

type AzureResponse = Pick<AxiosResponse<unknown>, "data"> &
  Partial<Pick<AxiosResponse<unknown>, "status" | "headers">>;

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
  const format = html ? "HTML" : typeof data === "string" ? "texto" : "JSON sem a coleção esperada";
  const status = response.status ? `HTTP ${response.status}; ` : "";
  throw new Error(`Resposta inválida do Azure em ${operation} (${status}${format}): a coleção JSON esperada não foi retornada. ${html
    ? "Pode ser uma página de login ou uma resposta de proxy. " : ""}Valide organização, projeto, PAT e acesso à API na tela Integrações.`);
}

export function azureFailureMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return "Azure DevOps recusou a autenticação (HTTP 401). Confira validade e organização do PAT na tela Integrações.";
    if (status === 403) return "Azure DevOps recusou o acesso (HTTP 403). Confira a permissão de leitura de Work Items e o acesso ao projeto.";
    if (status && status >= 300 && status < 400) return `Azure DevOps redirecionou a chamada da API (HTTP ${status}). Confira organização, projeto, autenticação e proxy na tela Integrações; o redirecionamento não foi seguido.`;
    if (status === 404) return "Azure DevOps não encontrou o recurso (HTTP 404). Confira organização e projeto na tela Integrações.";
    if (status === 429) return "Azure DevOps limitou as consultas (HTTP 429). Aguarde a próxima tentativa ou recarregue depois.";
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return "A consulta ao Azure DevOps excedeu o tempo limite.";
    return status ? `Falha na consulta ao Azure DevOps (HTTP ${status}).` : "Não foi possível conectar à API do Azure DevOps. Confira rede e proxy.";
  }
  return error instanceof Error ? error.message : "Consulta ao Azure DevOps indisponível.";
}
