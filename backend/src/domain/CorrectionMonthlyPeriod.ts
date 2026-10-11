export function saoPauloMonth(month: string, nowUtc: Date = new Date()) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Período inválido. Use YYYY-MM.");
  const [rawYear, rawMonth] = month.split("-");
  const year = Number(rawYear);
  const m = Number(rawMonth);
  if (!Number.isInteger(year) || !Number.isInteger(m) || m < 1 || m > 12) throw new Error("Período inválido.");
  const start = new Date(`${month}-01T03:00:00.000Z`);
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  const endExclusive = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T03:00:00.000Z`);
  // A fotografia corrente evita ASOF futuro por diferença de relógio.
  const now = new Date(nowUtc.getTime() - 60_000);
  if (now < start) throw new Error("Não é possível consultar um período que ainda não começou.");
  const periodEnd = new Date(endExclusive.getTime() - 1);
  const close = periodEnd < now ? periodEnd : now;
  return { start, endExclusive, close };
}
