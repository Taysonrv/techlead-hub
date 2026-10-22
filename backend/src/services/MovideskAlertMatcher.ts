const DEFAULT_TERMS = ["AGRIQ", "receituário", "receita"] as const;

export function normalizeMovideskAlertText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMovideskAlertTerms(raw = process.env.TEAMS_ALERT_TERMS): string[] {
  const values = (raw ?? DEFAULT_TERMS.join(";"))
    .split(";")
    .map(normalizeMovideskAlertText)
    .filter(Boolean);
  return [...new Set(values)];
}

export function shouldAlertForMovideskSubject(
  subject: unknown,
  terms = parseMovideskAlertTerms(),
): boolean {
  const normalizedSubject = normalizeMovideskAlertText(subject);
  if (!normalizedSubject) return false;
  return terms.some((term) => {
    const normalizedTerm = normalizeMovideskAlertText(term);
    return normalizedTerm.length > 0 && normalizedSubject.includes(normalizedTerm);
  });
}

export function areMovideskTeamsAlertsEnabled(
  value = process.env.TEAMS_ALERTS_ENABLED,
): boolean {
  return value?.trim().toLowerCase() === "true";
}
