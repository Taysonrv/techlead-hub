import { prisma } from "../database/prisma";
import {
  TeamsWebhookHttpError,
  TeamsWorkflowWebhookService,
} from "../services/TeamsWorkflowWebhookService";
import {
  isMovideskNewTicketStatus,
  shouldAlertForMovideskSubject,
} from "../services/MovideskAlertMatcher";

const POLL_MS = 15_000;
const LEASE_MS = 45_000;
const MAX_ATTEMPTS = 8;
const METRICS_LOG_INTERVAL_MS = 5 * 60_000;

function retryDelay(attempt: number): number {
  const base = Math.min(60 * 60_000, 15_000 * 2 ** Math.min(attempt, 8));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

export class MovideskTeamsAlertScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;
  private lastMetricsLoggedAt = 0;
  private readonly webhook: TeamsWorkflowWebhookService;

  constructor(
    private readonly db: typeof prisma = prisma,
    webhook?: TeamsWorkflowWebhookService,
  ) {
    this.webhook = webhook ?? new TeamsWorkflowWebhookService();
  }

  start() {
    if (this.timer || this.stopped) return;
    if (process.env.TEAMS_ALERTS_ENABLED?.trim().toLowerCase() !== "true") {
      console.log("[teams-alerts] Alertas desativados; fila permanece preservada.");
      return;
    }
    this.timer = setTimeout(() => { void this.tick(); }, 5_000);
    this.timer.unref();
    console.log("[teams-alerts] Worker da fila persistente iniciado.");
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
      if (process.env.TEAMS_ALERTS_ENABLED?.trim().toLowerCase() !== "true") return;
      await this.processOne();
      await this.logQueueMetrics();
    } catch (error) {
      console.warn("[teams-alerts] Falha no ciclo da fila:", error instanceof Error ? error.message : "erro desconhecido");
    } finally {
      this.running = false;
      if (!this.stopped && process.env.TEAMS_ALERTS_ENABLED?.trim().toLowerCase() === "true") {
        this.timer = setTimeout(() => { void this.tick(); }, POLL_MS);
        this.timer.unref();
      }
    }
  }

  private async logQueueMetrics() {
    const now = Date.now();
    if (now - this.lastMetricsLoggedAt < METRICS_LOG_INTERVAL_MS) return;

    const [pending, processing, sent, dead, oldestPending] = await Promise.all([
      this.db.teamsAlertOutbox.count({ where: { status: "PENDING" } }),
      this.db.teamsAlertOutbox.count({ where: { status: "PROCESSING" } }),
      this.db.teamsAlertOutbox.count({ where: { status: "SENT" } }),
      this.db.teamsAlertOutbox.count({ where: { status: "DEAD" } }),
      this.db.teamsAlertOutbox.findFirst({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);

    this.lastMetricsLoggedAt = now;
    const oldestPendingAgeMinutes = oldestPending
      ? Math.max(0, Math.round((now - oldestPending.createdAt.getTime()) / 60_000))
      : null;
    console.log([
      "[teams-alerts] Métricas da outbox.",
      `pending=${pending}`,
      `processing=${processing}`,
      `sent=${sent}`,
      `dead=${dead}`,
      `idadePendenteMaisAntigaMin=${oldestPendingAgeMinutes ?? "n/a"}`,
    ].join(" | "));
  }

  private async processOne() {
    const now = new Date();
    const candidate = await this.db.teamsAlertOutbox.findFirst({
      where: {
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: now } },
          {
            status: "PROCESSING",
            OR: [
              { lockedUntil: null },
              { lockedUntil: { lt: now } },
            ],
          },
        ],
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    });
    if (!candidate) return;

    // Um processo pode cair depois de incrementar attempts na última tentativa,
    // antes de persistir SENT/PENDING/DEAD. Não reenvie um item recuperado que
    // já consumiu o limite: finalize-o sem reivindicar nem chamar o webhook.
    if (candidate.attempts >= MAX_ATTEMPTS) {
      await this.db.teamsAlertOutbox.updateMany({
        where: {
          id: candidate.id,
          OR: [
            { status: "PENDING", nextAttemptAt: { lte: now } },
            {
              status: "PROCESSING",
              OR: [
                { lockedUntil: null },
                { lockedUntil: { lt: now } },
              ],
            },
          ],
        },
        data: {
          status: "DEAD",
          lockedUntil: null,
          lastError: `Limite de ${MAX_ATTEMPTS} tentativas atingido; item encerrado durante recuperação.`,
        },
      });
      return;
    }

    const leaseUntil = new Date(Date.now() + LEASE_MS);
    const claimed = await this.db.teamsAlertOutbox.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: now } },
          {
            status: "PROCESSING",
            OR: [
              { lockedUntil: null },
              { lockedUntil: { lt: now } },
            ],
          },
        ],
      },
      data: { status: "PROCESSING", lockedUntil: leaseUntil, attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) return;

    try {
      const ticket = await this.db.ticket.findUnique({
        where: { movideskId: candidate.movideskId },
        select: { movideskId: true, subject: true, client: true, createdDate: true, urgency: true, status: true, owner: true },
      });
      if (!ticket) throw new Error("Ticket não encontrado no banco para montar o alerta.");
      if (!shouldAlertForMovideskSubject(ticket.subject)) {
        await this.db.teamsAlertOutbox.update({
          where: { id: candidate.id },
          data: {
            status: "DEAD",
            lockedUntil: null,
            lastError: "Alerta descartado: assunto fora do escopo AgriQ/receituário.",
          },
        });
        console.log("[teams-alerts] Alerta descartado por assunto | ticket=" + candidate.movideskId);
        return;
      }
      if (!isMovideskNewTicketStatus(ticket.status)) {
        await this.db.teamsAlertOutbox.update({
          where: { id: candidate.id },
          data: {
            status: "DEAD",
            lockedUntil: null,
            lastError: `Alerta descartado: status atual do atendimento é "${ticket.status}", não "Novo".`,
          },
        });
        console.log(`[teams-alerts] Alerta descartado por status | ticket=${candidate.movideskId} | status=${ticket.status}`);
        return;
      }
      const result = await this.webhook.sendNewTicket(ticket);
      await this.db.teamsAlertOutbox.update({
        where: { id: candidate.id },
        data: { status: "SENT", sentAt: new Date(), lockedUntil: null, lastHttpStatus: result.status, lastError: null },
      });
      console.log(`[teams-alerts] Alerta enviado | ticket=${candidate.movideskId} | http=${result.status} | duração=${result.durationMs}ms`);
    } catch (error) {
      const attempts = candidate.attempts + 1;
      const message =
        error instanceof Error
          ? error.message
          : "Falha desconhecida no envio.";
      const terminal = attempts >= MAX_ATTEMPTS;
      const retryAfterMs =
        error instanceof TeamsWebhookHttpError
          ? error.retryAfterMs
          : null;
      const delayMs = retryAfterMs ?? retryDelay(attempts);
      const httpStatus =
        error instanceof TeamsWebhookHttpError
          ? error.status
          : null;

      await this.db.teamsAlertOutbox.update({
        where: { id: candidate.id },
        data: {
          status: terminal ? "DEAD" : "PENDING",
          lockedUntil: null,
          nextAttemptAt: new Date(Date.now() + delayMs),
          lastHttpStatus: httpStatus,
          lastError: message.slice(0, 500),
        },
      });
      console.warn(`[teams-alerts] Envio falhou | ticket=${candidate.movideskId} | tentativa=${attempts}/${MAX_ATTEMPTS} | estado=${terminal ? "DEAD" : "PENDING"} | motivo=${message}`);
    }
  }
}
