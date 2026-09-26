export const SLA_BUSINESS_CALENDAR = {
  startHour: 8,
  endHour: 18,
  weekdays: [1, 2, 3, 4, 5] as const,
} as const;

/**
 * Minutos úteis usados pelo SLA/OLA.
 *
 * Regra histórica preservada: segunda a sexta, 08:00–18:00.
 * Feriados NÃO são descontados aqui. O calendário de produtividade é
 * propositalmente separado para evitar alteração retroativa de SLA.
 */
export function slaBusinessMinutes(start: Date, end: Date) {
  if (end <= start) return 0;

  let total = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const day = cursor.getDay();
    if ((SLA_BUSINESS_CALENDAR.weekdays as readonly number[]).includes(day)) {
      const from = new Date(cursor);
      from.setHours(SLA_BUSINESS_CALENDAR.startHour, 0, 0, 0);
      const to = new Date(cursor);
      to.setHours(SLA_BUSINESS_CALENDAR.endHour, 0, 0, 0);

      total += Math.max(
        0,
        (Math.min(to.getTime(), end.getTime()) - Math.max(from.getTime(), start.getTime())) / 60_000,
      );
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.round(total);
}
