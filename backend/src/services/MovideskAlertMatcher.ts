const DEFAULT_TERMS = ["AGRIQ", "receituário", "receita avulsa", "receita agronômica"] as const;

export function normalizeMovideskAlertText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMovideskNewTicketStatus(status: unknown): boolean {
  return normalizeMovideskAlertText(status) === "novo";
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
  const subjectWords = normalizedSubject
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const hasPhrase = (phrase: string[]) => {
    if (phrase.length === 0) return false;
    return subjectWords.some((_, index) =>
      phrase.every((word, offset) => subjectWords[index + offset] === word),
    );
  };

  return terms.some((term) => {
    const normalizedTerm = normalizeMovideskAlertText(term);
    if (!normalizedTerm) return false;

    // "receita" sozinha também aparece em assuntos fiscais, como
    // "Código de receita Impostos". Para esse termo genérico, só aceitamos
    // as famílias pertinentes ao AgriQ: receita avulsa ou agronômica.
    if (normalizedTerm === "receita") {
      return [
        ["receita", "avulsa"],
        ["receitas", "avulsas"],
        ["avulsa", "receita"],
        ["avulsas", "receitas"],
        ["receita", "agronomica"],
        ["receitas", "agronomicas"],
        ["agronomica", "receita"],
        ["agronomicas", "receitas"],
        ["avulsa", "de", "receita"],
        ["avulsas", "de", "receitas"],
        ["agronomica", "de", "receita"],
        ["agronomicas", "de", "receitas"],
      ].some(hasPhrase);
    }

    const termWords = normalizedTerm.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
    return hasPhrase(termWords);
  });
}

export function areMovideskTeamsAlertsEnabled(
  value = process.env.TEAMS_ALERTS_ENABLED,
): boolean {
  return value?.trim().toLowerCase() === "true";
}
