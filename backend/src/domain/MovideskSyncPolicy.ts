export const MOVIDESK_SAFETY_LOOKBACK_MINUTES = 360;
// Cobre o mês corrente do Dashboard e atualizações em tickets criados antes
// do início da carga anual, que ainda podem ser resolvidos neste período.
export const MOVIDESK_RECONCILIATION_DAYS = 35;
export const MOVIDESK_RECONCILIATION_INTERVAL_MS = 24 * 60 * 60_000;

export function movideskSyncIntervalMinutes(raw = process.env.MOVIDESK_SYNC_INTERVAL_MINUTES) {
  const value = Number(raw ?? 5);
  return Number.isSafeInteger(value) && value >= 2 && value <= 1440 ? value : 5;
}

export function movideskSyncAnchor(run: { createdAt: Date; metadata?: unknown } | null): Date | null {
  if (!run) return null;
  const metadata = run.metadata as { startedAt?: unknown } | null;
  const startedAt = typeof metadata?.startedAt === "string" ? new Date(metadata.startedAt) : null;
  return startedAt && Number.isFinite(startedAt.getTime()) && startedAt <= run.createdAt ? startedAt : run.createdAt;
}

export function movideskReconciliationDue(lastStartedAt: Date | null, now: Date) {
  return !lastStartedAt || now.getTime() - lastStartedAt.getTime() >= MOVIDESK_RECONCILIATION_INTERVAL_MS;
}
