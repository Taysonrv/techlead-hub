
import { ensureDatabaseAvailable, reportDatabaseFailure } from "../database/prisma";
import { MovideskService } from "../services/MovideskService";
import { clearMovideskApiPriority, releaseMovideskApi, requestMovideskApiPriority, tryAcquireMovideskApi } from "./MovideskSyncCoordinator";

const DEFAULT_INTERVAL_MINUTES = 5;
const DEFAULT_INITIAL_DELAY_SECONDS = 5;

export class MovideskSyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  private enabled() {
    const raw = process.env.MOVIDESK_SYNC_SCHEDULER_ENABLED?.trim().toLowerCase();
    if (raw && ["0","false","no","nao","não","off"].includes(raw)) return false;
    return Boolean(process.env.MOVIDESK_TOKEN?.trim());
  }

  private intervalMinutes() {
    const parsed = Number(process.env.MOVIDESK_SYNC_INTERVAL_MINUTES ?? DEFAULT_INTERVAL_MINUTES);
    return Number.isSafeInteger(parsed) && parsed >= 2 && parsed <= 1440 ? parsed : DEFAULT_INTERVAL_MINUTES;
  }

  start() {
    if (!this.enabled()) {
      console.log("[movidesk-sync] Scheduler não iniciado: token ausente ou integração desabilitada.");
      return;
    }
    if (this.timer) return;
    this.stopped = false;
    console.log(`[movidesk-sync] Scheduler habilitado: primeira reconciliação em ${DEFAULT_INITIAL_DELAY_SECONDS}s; depois atualização a cada ${this.intervalMinutes()} minuto(s).`);
    this.schedule(DEFAULT_INITIAL_DELAY_SECONDS * 1000);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    console.log("[movidesk-sync] Scheduler interrompido.");
  }

  private schedule(delay: number) {
    if (this.stopped || !this.enabled()) return;
    this.timer = setTimeout(() => { this.timer = null; void this.runAndReschedule(); }, delay);
    this.timer.unref();
  }

  private async runAndReschedule() {
    let nextDelay: number | null = null;
    try { nextDelay = await this.execute(); }
    finally { this.schedule(nextDelay ?? this.intervalMinutes() * 60_000); }
  }

  private async execute(): Promise<number | null> {
    if (this.running) return null;
    if (!(await ensureDatabaseAvailable())) {
      console.warn("[movidesk-sync] PostgreSQL indisponível; ciclo adiado sem consumir a API Movidesk.");
      return 60_000;
    }
    if (!tryAcquireMovideskApi("TICKETS")) {
      requestMovideskApiPriority();
      console.log("[movidesk-sync] API ocupada: sincronização principal ganhou prioridade e tentará novamente em 2 minuto(s).");
      return 2 * 60_000;
    }
    this.running = true;
    const started = Date.now();
    try {
      const service = new MovideskService();
      if (!(await service.hasCompletedBaseline())) {
        console.log("[movidesk-sync] Ciclo aguardando baseline FULL manual; nenhuma carga automática foi executada.");
        return null;
      }

      // Não mantenha uma transação Prisma aberta durante toda a sincronização.
      // Uma interactive transaction reserva uma conexão do pool enquanto syncTickets()
      // executa chamadas externas e centenas de operações, podendo bloquear autenticação e Chat.
      // A exclusão local já é garantida por this.running + MovideskSyncCoordinator.
      // O ciclo principal deve permanecer curto e previsível. Metadados
      // analíticos são reconciliados pelo scheduler de enriquecimento, em baixa
      // prioridade, para não atrasar a chegada de tickets novos.
      const s = await service.syncTickets(null, false, false);
      console.log([
        "[movidesk-sync] Sincronização concluída.",
        `modo=${s.mode}`, `paginas=${s.pages}`, `total=${s.totalRows}`,
        `inseridos=${s.created}`, `atualizados=${s.updated}`,
        `ignorados=${s.ignored}`, `erros=${s.errors}`,
        `duração=${Math.round((Date.now()-started)/1000)}s`
      ].join(" | "));
    } catch (error) {
      if (!reportDatabaseFailure(error)) console.error("[movidesk-sync] Falha na sincronização automática:", error);
    } finally {
      this.running = false;
      releaseMovideskApi("TICKETS");
      clearMovideskApiPriority();
    }
    return null;
  }
}
