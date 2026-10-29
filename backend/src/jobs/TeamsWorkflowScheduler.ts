import { prisma } from "../database/prisma";
import { TeamsWebhookHttpError, TeamsWorkflowWebhookService } from "../services/TeamsWorkflowWebhookService";
import {
  buildAzureTaskCreatedCard,
  buildAzureTaskRegistroCard,
  buildNewSupportTicketCard,
} from "../services/TeamsWorkflowAdaptiveCards";
import { TEAMS_WORKFLOW_EVENT } from "../services/TeamsWorkflowEvents";
import { teamsWorkflowOutboxDelegate, type TeamsWorkflowOutboxDelegate } from "../services/TeamsWorkflowOutboxClient";

const POLL_MS = 15_000;
const LEASE_MS = 45_000;
const MAX_ATTEMPTS = 8;
const METRICS_LOG_INTERVAL_MS = 5 * 60_000;

const EVENT_CONFIG = {
  [TEAMS_WORKFLOW_EVENT.SUPPORT_TICKET_NEW]: {
    enabled: "TEAMS_SUPPORT_NEW_TICKETS_ENABLED",
    webhook: "TEAMS_SUPPORT_NEW_TICKETS_WEBHOOK_URL",
  },
  [TEAMS_WORKFLOW_EVENT.AZURE_TASK_CREATED]: {
    enabled: "TEAMS_AZURE_TASK_CREATED_ENABLED",
    webhook: "TEAMS_AZURE_TASK_CREATED_WEBHOOK_URL",
  },
  [TEAMS_WORKFLOW_EVENT.AZURE_TASK_REGISTRO]: {
    enabled: "TEAMS_AZURE_TASK_REGISTRO_ENABLED",
    webhook: "TEAMS_AZURE_TASK_REGISTRO_WEBHOOK_URL",
  },
} as const;

type EventType = keyof typeof EVENT_CONFIG;
type JsonRecord = Record<string, unknown>;

function enabledEventTypes(): EventType[] {
  return (Object.keys(EVENT_CONFIG) as EventType[]).filter((eventType) => {
    const config = EVENT_CONFIG[eventType];
    return process.env[config.enabled]?.trim().toLowerCase() === "true"
      && Boolean(process.env[config.webhook]?.trim());
  });
}

function retryDelay(attempt: number): number {
  const base = Math.min(60 * 60_000, 15_000 * 2 ** Math.min(attempt, 8));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

function asObject(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

export class TeamsWorkflowScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;
  private lastMetricsLoggedAt = 0;
  private readonly webhook = new TeamsWorkflowWebhookService();
  private readonly outbox: TeamsWorkflowOutboxDelegate;

  constructor(private readonly db: typeof prisma = prisma) {
    this.outbox = teamsWorkflowOutboxDelegate(db);
  }

  start() {
    if (this.timer || this.stopped) return;
    this.timer = setTimeout(() => { void this.tick(); }, 5_000);
    this.timer.unref();
    console.log("[teams-workflows] Worker iniciado; processos permanecem sob controles independentes.");
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async tick() {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      const enabled = enabledEventTypes();
      if (enabled.length) {
        await this.processOne(enabled);
        await this.logQueueMetrics();
      }
    } catch (error) {
      console.warn("[teams-workflows] Falha no ciclo da fila:", error instanceof Error ? error.message : "erro desconhecido");
    } finally {
      this.running = false;
      if (!this.stopped) {
        this.timer = setTimeout(() => { void this.tick(); }, POLL_MS);
        this.timer.unref();
      }
    }
  }

  private async logQueueMetrics() {
    const now = Date.now();
    if (now - this.lastMetricsLoggedAt < METRICS_LOG_INTERVAL_MS) return;
    const [pending, processing, sent, dead] = await Promise.all([
      this.outbox.count({ where: { status: "PENDING" } }),
      this.outbox.count({ where: { status: "PROCESSING" } }),
      this.outbox.count({ where: { status: "SENT" } }),
      this.outbox.count({ where: { status: "DEAD" } }),
    ]);
    this.lastMetricsLoggedAt = now;
    console.log(`[teams-workflows] Outbox | pending=${pending} | processing=${processing} | sent=${sent} | dead=${dead}`);
  }

  private async processOne(enabled: EventType[]) {
    const now = new Date();
    const candidate = await this.outbox.findFirst({
      where: {
        eventType: { in: enabled },
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: now } },
          { status: "PROCESSING", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
        ],
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    });
    if (!candidate) return;

    if (candidate.attempts >= MAX_ATTEMPTS) {
      await this.outbox.updateMany({
        where: { id: candidate.id, status: candidate.status, attempts: { gte: MAX_ATTEMPTS } },
        data: { status: "DEAD", lockedUntil: null, lastError: `Limite de ${MAX_ATTEMPTS} tentativas atingido durante recuperação.` },
      });
      return;
    }

    const claimed = await this.outbox.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: now } },
          { status: "PROCESSING", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
        ],
      },
      data: { status: "PROCESSING", lockedUntil: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) return;

    const config = EVENT_CONFIG[candidate.eventType as EventType];
    if (!config) {
      await this.outbox.update({ where: { id: candidate.id }, data: { status: "DEAD", lockedUntil: null, lastError: "Tipo de evento Teams desconhecido." } });
      return;
    }

    if (process.env[config.enabled]?.trim().toLowerCase() !== "true") {
      await this.outbox.update({ where: { id: candidate.id }, data: { status: "PENDING", lockedUntil: null, attempts: { decrement: 1 } } });
      return;
    }

    try {
      const payload = asObject(candidate.payload);
      const ticketBaseUrl = process.env.TEAMS_TICKET_BASE_URL?.trim() ?? "";
      const card = candidate.eventType === TEAMS_WORKFLOW_EVENT.SUPPORT_TICKET_NEW
        ? buildNewSupportTicketCard(payload, ticketBaseUrl)
        : candidate.eventType === TEAMS_WORKFLOW_EVENT.AZURE_TASK_CREATED
          ? buildAzureTaskCreatedCard(payload, ticketBaseUrl)
          : buildAzureTaskRegistroCard(payload, ticketBaseUrl);
      const result = await this.webhook.sendCard(process.env[config.webhook]?.trim() ?? "", card);
      await this.outbox.update({
        where: { id: candidate.id },
        data: { status: "SENT", sentAt: new Date(), lockedUntil: null, lastHttpStatus: result.status, lastError: null },
      });
      console.log(`[teams-workflows] Card enviado | evento=${candidate.eventType} | ticket=${candidate.movideskId} | workItem=${candidate.azureWorkItemId ?? "n/a"} | http=${result.status} | duração=${result.durationMs}ms`);
    } catch (error) {
      const attempts = candidate.attempts + 1;
      const message = error instanceof Error ? error.message : "Falha desconhecida no envio.";
      const terminal = attempts >= MAX_ATTEMPTS;
      const retryAfterMs = error instanceof TeamsWebhookHttpError ? error.retryAfterMs : null;
      const delayMs = retryAfterMs ?? retryDelay(attempts);
      const httpStatus = error instanceof TeamsWebhookHttpError ? error.status : null;
      await this.outbox.update({
        where: { id: candidate.id },
        data: {
          status: terminal ? "DEAD" : "PENDING",
          lockedUntil: null,
          nextAttemptAt: new Date(Date.now() + delayMs),
          lastHttpStatus: httpStatus,
          lastError: message.slice(0, 500),
        },
      });
      console.warn(`[teams-workflows] Envio falhou | evento=${candidate.eventType} | ticket=${candidate.movideskId} | tentativa=${attempts}/${MAX_ATTEMPTS} | estado=${terminal ? "DEAD" : "PENDING"} | motivo=${message}`);
    }
  }
}
