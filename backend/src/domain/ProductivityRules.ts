const DEFAULT_HOURS_PER_DAY = 8;

export function productivityHoursPerDay() {
  return Math.min(
    Math.max(Number(process.env.PRODUCTIVITY_HOURS_PER_DAY ?? DEFAULT_HOURS_PER_DAY) || DEFAULT_HOURS_PER_DAY, 1),
    24,
  );
}

export function productivityHolidays() {
  return new Set(
    (process.env.PRODUCTIVITY_HOLIDAYS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function operationalDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function isProductivityBusinessDay(
  value: Date,
  holidays = productivityHolidays(),
) {
  return value.getDay() !== 0
    && value.getDay() !== 6
    && !holidays.has(operationalDateKey(value));
}

export function productivityBusinessDays(start: Date, end: Date) {
  const holidays = productivityHolidays();
  let count = 0;
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);

  while (day <= end) {
    if (isProductivityBusinessDay(day, holidays)) count += 1;
    day.setDate(day.getDate() + 1);
  }

  return count;
}

export function productivityExpectedHours(start: Date, end: Date) {
  const businessDays = productivityBusinessDays(start, end);
  const hoursPerDay = productivityHoursPerDay();
  return {
    businessDays,
    hoursPerDay,
    expectedHours: businessDays * hoursPerDay,
  };
}

export function sameOperationalPerson(a: string | null | undefined, b: string) {
  return Boolean(a && a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0);
}
