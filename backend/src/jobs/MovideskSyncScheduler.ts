import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { MovideskService } from "../services/MovideskService";
import { clearMovideskApiPriority, releaseMovideskApi, requestMovideskApiPriority, tryAcquireMovideskApi } from "./MovideskSyncCoordinator";

const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_INITIAL_DELAY_SECONDS = 5;
const LOCK_NAMESPACE = 864211;
const LOCK_RESOURCE = 2;
type LockRow = { acquired: boolean };

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
    return Number.isSafeInteger(parsed) && parsed >= 15 && parsed <= 1440 ? parsed : DEFAULT_INTERVAL_MINUTES;
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
    let retrySoon = false;
    try { retrySoon = await this.execute(); }
    finally { this.schedule(retrySoon ? 2 * 60_000 : this.intervalMinutes() * 60_000); }
  }

  private async execute(): Promise<boolean> {
    if (this.running) return false;
    if (!tryAcquireMovideskApi("TICKETS")) {
      requestMovideskApiPriority();
      console.log("[movidesk-sync] API ocupada: sincronização principal ganhou prioridade e tentará novamente em 2 minuto(s).");
      return true;
    }
    this.running = true;
    const started = Date.now();
    try {
      const service = new MovideskService();
      if (!(await service.hasCompletedBaseline())) {
        console.log("[movidesk-sync] Ciclo aguardando baseline FULL manual; nenhuma carga automática foi executada.");
        return false;
      }

      const result = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<LockRow[]>(Prisma.sql`
          SELECT pg_try_advisory_xact_lock(
            CAST(${LOCK_NAMESPACE} AS integer),
            CAST(${LOCK_RESOURCE} AS integer)
          ) AS acquired
        `);
        if (rows[0]?.acquired !== true) return { acquired: false as const, sync: null };
        const sync = await service.syncTickets(null, false);
        return { acquired: true as const, sync };
      }, { maxWait: 5_000, timeout: 55 * 60 * 1000 });

      if (!result.acquired) {
        console.log("[movidesk-sync] Ciclo ignorado: outra instância já está sincronizando.");
        return false;
      }
      const s = result.sync;
      console.log([
        "[movidesk-sync] Sincronização concluída.",
        `modo=${s.mode}`, `paginas=${s.pages}`, `total=${s.totalRows}`,
        `inseridos=${s.created}`, `atualizados=${s.updated}`,
        `ignorados=${s.ignored}`, `erros=${s.errors}`,
        `duração=${Math.round((Date.now()-started)/1000)}s`
      ].join(" | "));
    } catch (error) {
      console.error("[movidesk-sync] Falha na sincronização automática:", error);
    } finally {
      this.running = false;
      releaseMovideskApi("TICKETS");
      clearMovideskApiPriority();
    }
    return false;
  }
}
