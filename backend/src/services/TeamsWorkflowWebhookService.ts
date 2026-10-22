import { buildMovideskAdaptiveCard, type MovideskAlertTicket } from "./MovideskTeamsAdaptiveCard";

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_RETRY_AFTER_MS = 24 * 60 * 60_000;

export type TeamsWebhookResult = {
  status: number;
  durationMs: number;
};

export class TeamsWebhookHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryAfterMs: number | null,
  ) {
    super(`Teams Workflow respondeu HTTP ${status}.`);
    this.name = "TeamsWebhookHttpError";
  }
}

function configuredTimeout(): number {
  const value = Number(process.env.TEAMS_WEBHOOK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isSafeInteger(value) && value >= 1_000 && value <= MAX_TIMEOUT_MS
    ? value
    : DEFAULT_TIMEOUT_MS;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
  }

  const retryDate = Date.parse(value);
  if (!Number.isFinite(retryDate)) return null;

  return Math.min(
    Math.max(0, retryDate - Date.now()),
    MAX_RETRY_AFTER_MS,
  );
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
        throw new TeamsWebhookHttpError(
          response.status,
          parseRetryAfter(response.headers.get("retry-after")),
        );
      }
      return result;
    } catch (error) {
      if (error instanceof TeamsWebhookHttpError) {
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
