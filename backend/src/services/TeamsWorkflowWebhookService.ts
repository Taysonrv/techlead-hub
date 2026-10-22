import { buildMovideskAdaptiveCard, type MovideskAlertTicket } from "./MovideskTeamsAdaptiveCard";

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;

export type TeamsWebhookResult = {
  status: number;
  durationMs: number;
};

function configuredTimeout(): number {
  const value = Number(process.env.TEAMS_WEBHOOK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isSafeInteger(value) && value >= 1_000 && value <= MAX_TIMEOUT_MS
    ? value
    : DEFAULT_TIMEOUT_MS;
}

export class TeamsWorkflowWebhookService {
  async sendNewTicket(ticket: MovideskAlertTicket): Promise<TeamsWebhookResult> {
    if (process.env.TEAMS_ALERTS_ENABLED?.trim().toLowerCase() !== "true") {
      throw new Error("Alertas Teams desativados.");
    }

    const endpoint = process.env.TEAMS_WORKFLOW_WEBHOOK_URL?.trim();
    const baseUrl = process.env.TEAMS_TICKET_BASE_URL?.trim();
    if (!endpoint || !baseUrl) {
      throw new Error("Webhook ou URL-base do atendimento não configurado.");
    }

    let webhook: URL;
    try {
      webhook = new URL(endpoint);
    } catch {
      throw new Error("TEAMS_WORKFLOW_WEBHOOK_URL inválida.");
    }
    if (webhook.protocol !== "https:" || webhook.username || webhook.password) {
      throw new Error("TEAMS_WORKFLOW_WEBHOOK_URL deve ser HTTPS.");
    }

    const card = buildMovideskAdaptiveCard(ticket, baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), configuredTimeout());
    const startedAt = Date.now();

    try {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
        signal: controller.signal,
      });
      const result = { status: response.status, durationMs: Date.now() - startedAt };
      if (!response.ok) {
        // Nunca propagar body/URL do Workflow: respostas podem conter detalhes sensíveis.
        const retryAfter = response.headers.get("retry-after");
        throw new Error(
          `Teams Workflow respondeu HTTP ${response.status}.${retryAfter ? ` Retry-After=${retryAfter}.` : ""}`,
        );
      }
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Teams Workflow respondeu HTTP ")) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new Error("Timeout no envio do alerta ao Teams.");
      }
      throw new Error("Falha de rede ao enviar alerta ao Teams.");
    } finally {
      clearTimeout(timeout);
    }
  }
}
