import { MovideskReferenceSyncService } from "../services/MovideskReferenceSyncService";
import { MovideskSurveySyncService } from "../services/MovideskSurveySyncService";
import { releaseMovideskApi, tryAcquireMovideskApi } from "./MovideskSyncCoordinator";

export type ReferenceSyncState = {
  status: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";
  phase: "IDLE" | "CATALOG" | "QUESTIONS" | "CSAT" | "DONE";
  startedAt: string | null;
  finishedAt: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  scheduler: { enabled: boolean; hour: number; minute: number; nextEstimatedAt: string | null };
};

const HOUR = Number(process.env.MOVIDESK_REFERENCE_SYNC_HOUR ?? 3);
const MINUTE = Number(process.env.MOVIDESK_REFERENCE_SYNC_MINUTE ?? 20);
const safeHour = Number.isInteger(HOUR) && HOUR >= 0 && HOUR <= 23 ? HOUR : 3;
const safeMinute = Number.isInteger(MINUTE) && MINUTE >= 0 && MINUTE <= 59 ? MINUTE : 20;

const state: ReferenceSyncState = {
  status: "IDLE", phase: "IDLE", startedAt: null, finishedAt: null, result: null, error: null,
  scheduler: { enabled: true, hour: safeHour, minute: safeMinute, nextEstimatedAt: null },
};
let running: Promise<void> | null = null;

function nextRun() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(safeHour, safeMinute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

export function referenceSyncStatus() {
  return { ...state, scheduler: { ...state.scheduler } };
}

export function runReferenceSync() {
  if (running) return { accepted: false, state: referenceSyncStatus() };
  if (!tryAcquireMovideskApi("REFERENCE")) return { accepted: false, state: referenceSyncStatus() };
  state.status = "RUNNING"; state.phase = "CATALOG"; state.startedAt = new Date().toISOString();
  state.finishedAt = null; state.result = null; state.error = null;
  running = (async () => {
    try {
      const reference = new MovideskReferenceSyncService();
      const survey = new MovideskSurveySyncService();
      const services = await reference.syncCatalog();
      state.phase = "QUESTIONS";
      const questions = await reference.syncSurveyQuestions();
      state.phase = "CSAT";
      const csat = await survey.syncResponses();
      state.result = { services, questions, csat, syncedAt: new Date().toISOString() };
      state.status = "SUCCESS"; state.phase = "DONE";
    } catch (error) {
      state.status = "FAILED";
      state.error = error instanceof Error ? error.message : "Falha desconhecida.";
      console.error("[movidesk-reference-sync] Falha:", state.error);
    } finally {
      state.finishedAt = new Date().toISOString();
      running = null;
      releaseMovideskApi("REFERENCE");
    }
  })();
  return { accepted: true, state: referenceSyncStatus() };
}

export class MovideskReferenceSyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  private enabled() {
    const raw = process.env.MOVIDESK_REFERENCE_SYNC_SCHEDULER_ENABLED?.trim().toLowerCase();
    return Boolean(process.env.MOVIDESK_TOKEN?.trim()) && !["0","false","no","nao","não","off"].includes(raw ?? "");
  }

  start() {
    if (!this.enabled()) { state.scheduler.enabled = false; state.scheduler.nextEstimatedAt = null; return; }
    if (this.timer) return;
    this.stopped = false;
    state.scheduler.enabled = true;
    this.scheduleNext();
    console.log(`[movidesk-reference] Scheduler diário habilitado: ${String(safeHour).padStart(2,"0")}:${String(safeMinute).padStart(2,"0")}.`);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    state.scheduler.nextEstimatedAt = null;
  }

  private scheduleDueRetry() {
    if (this.stopped || !this.enabled()) return;
    const result = runReferenceSync();
    if (!result.accepted) {
      const retryAt = new Date(Date.now() + 10 * 60_000);
      state.scheduler.nextEstimatedAt = retryAt.toISOString();
      this.timer = setTimeout(() => { this.timer = null; this.scheduleDueRetry(); }, 10 * 60_000);
      this.timer.unref();
      return;
    }
    this.scheduleNext();
  }

  private scheduleNext() {
    if (this.stopped || !this.enabled()) return;
    const next = nextRun();
    state.scheduler.nextEstimatedAt = next.toISOString();
    this.timer = setTimeout(() => {
      this.timer = null;
      const result = runReferenceSync();
      if (!result.accepted) {
        const retryAt = new Date(Date.now() + 10 * 60_000);
        state.scheduler.nextEstimatedAt = retryAt.toISOString();
        console.log("[movidesk-reference] Execução diária adiada por concorrência; nova tentativa em 10 min.");
        this.timer = setTimeout(() => { this.timer = null; this.scheduleDueRetry(); }, 10 * 60_000);
        this.timer.unref();
        return;
      }
      this.scheduleNext();
    }, Math.max(1_000, next.getTime() - Date.now()));
    this.timer.unref();
  }
}
