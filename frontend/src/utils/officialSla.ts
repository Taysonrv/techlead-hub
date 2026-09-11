export type OfficialSlaKind = "response" | "solution";

export type OfficialSlaTicket = {
  category?: string | null;
  responseSlaIndicator?: string | null;
  solutionSlaIndicator?: string | null;
};

export type OfficialSlaSummary<T extends OfficialSlaTicket> = {
  within: number;
  outside: number;
  unmeasured: number;
  measured: number;
  percentage: number | null;
  withinTickets: T[];
  outsideTickets: T[];
  unmeasuredTickets: T[];
  measuredTickets: T[];
};

/**
 * Resultado histórico oficial informado pelo Movidesk.
 *
 * A regra é compartilhada por Dashboard, Clientes e Desempenho para que
 * o mesmo recorte sempre produza o mesmo numerador e denominador.
 */
export function calculateOfficialSla<T extends OfficialSlaTicket>(
  tickets: T[],
  kind: OfficialSlaKind,
): OfficialSlaSummary<T> {
  const withinTickets: T[] = [];
  const outsideTickets: T[] = [];
  const unmeasuredTickets: T[] = [];

  tickets.forEach((ticket) => {
    if (!isOfficialSlaCategory(ticket.category)) {
      unmeasuredTickets.push(ticket);
      return;
    }

    const result = normalizeOfficialSlaIndicator(
      kind === "response"
        ? ticket.responseSlaIndicator
        : ticket.solutionSlaIndicator,
    );

    if (result === true) withinTickets.push(ticket);
    else if (result === false) outsideTickets.push(ticket);
    else unmeasuredTickets.push(ticket);
  });

  const measuredTickets = [...withinTickets, ...outsideTickets];
  const measured = measuredTickets.length;

  return {
    within: withinTickets.length,
    outside: outsideTickets.length,
    unmeasured: unmeasuredTickets.length,
    measured,
    percentage: measured > 0
      ? Math.round((withinTickets.length / measured) * 1000) / 10
      : null,
    withinTickets,
    outsideTickets,
    unmeasuredTickets,
    measuredTickets,
  };
}

export function normalizeOfficialSlaIndicator(
  value: string | null | undefined,
): boolean | null {
  const normalized = normalize(value);
  if (!normalized) return null;

  if ([
    "fora do prazo",
    "fora",
    "violado",
    "vencido",
    "estourado",
    "nao cumprido",
    "nao atingido",
  ].some((term) => normalized.includes(term))) return false;

  if ([
    "dentro do prazo",
    "no prazo",
    "dentro",
    "cumprido",
    "atingido",
  ].some((term) => normalized.includes(term))) return true;

  return null;
}

function isOfficialSlaCategory(category: string | null | undefined) {
  const normalized = normalize(category);
  return normalized !== "adequacao" && normalized !== "solicitacao de servico";
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
