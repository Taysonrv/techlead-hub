import { MovideskService } from "../services/MovideskService";
import { releaseMovideskApi, tryAcquireMovideskApi } from "./MovideskSyncCoordinator";

const DEFAULT_INTERVAL_MINUTES = 1;
const DEFAULT_INITIAL_DELAY_SECONDS = 60;
const DEFAULT_BATCH_SIZE = 5;

export class MovideskEnrichmentScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  private enabled() {
    const raw = process.env.MOVIDESK_ENRICHMENT_SCHEDULER_ENABLED?.trim().toLowerCase();
    if (raw && ["0", "false", "no", "nao", "não", "off"].includes(raw)) return false;
    return Boolean(process.env.MOVIDESK_TOKEN?.trim());
  }

  private intervalMinutes() {
    const parsed = Number(process.env.MOVIDESK_ENRICHMENT_INTERVAL_MINUTES ?? DEFAULT_INTERVAL_MINUTES);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 1440 ? parsed : DEFAULT_INTERVAL_MINUTES;
  }

  private batchSize() {
    const parsed = Number(process.env.MOVIDESK_ENRICHMENT_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10 ? parsed : DEFAULT_BATCH_SIZE;
  }

  start() {
    if (!this.enabled()) {
      console.log("[movidesk-enrichment] Scheduler não iniciado: token ausente ou integração desabilitada.");
      return;
    }
    if (this.timer) return;
    this.stopped = false;
    console.log(
      `[movidesk-enrichment] Scheduler habilitado: lote de ${this.batchSize()} ticket(s) a cada ${this.intervalMinutes()} minuto(s).`,
    );
    this.schedule(DEFAULT_INITIAL_DELAY_SECONDS * 1000);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    console.log("[movidesk-enrichment] Scheduler interrompido.");
  }

  private schedule(delay: number) {
    if (this.stopped || !this.enabled()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runAndReschedule();
    }, delay);
    this.timer.unref();
  }

  private async runAndReschedule() {
    try {
      await this.execute();
    } finally {
      this.schedule(this.intervalMinutes() * 60_000);
    }
  }

  private async execute() {
    if (this.running) return;
    if (!tryAcquireMovideskApi("ENRICHMENT_SCHEDULER")) {
      console.log("[movidesk-enrichment] Ciclo adiado: outra rotina Movidesk está utilizando a API.");
      return;
    }

    this.running = true;
    const started = Date.now();
    try {
      const service = new MovideskService();
      if (!(await service.hasCompletedBaseline())) {
        console.log("[movidesk-enrichment] Ciclo aguardando baseline FULL.");
        return;
      }

      const result = await service.syncTicketEnrichment(this.batchSize());
      console.log([
        "[movidesk-enrichment] Lote concluído.",
        `tickets=${result.tickets}`,
        `pendentesAntes=${result.pendingBeforeRun}`,
        `pendentesDepois=${result.pendingAfterRun}`,
        `acoes=${result.actions}`,
        `apontamentos=${result.appointments}`,
        `historicosResponsavel=${result.ownerHistories}`,
        `historicosStatus=${result.statusHistories}`,
        `erros=${result.errors}`,
        `duracao=${Math.round((Date.now() - started) / 1000)}s`,
        result.pendingAfterRun > 0 ? `etaAprox=${Math.ceil(result.pendingAfterRun / Math.max(1, result.tickets - result.errors))} lote(s)` : "fila=concluida",
      ].join(" | "));
    } catch (error) {
      console.error("[movidesk-enrichment] Falha no enriquecimento automático:", error);
    } finally {
      this.running = false;
      releaseMovideskApi("ENRICHMENT_SCHEDULER");
    }
  }
}
