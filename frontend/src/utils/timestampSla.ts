export type CalculatedSlaKind = "response" | "solution";

export type CalculatedSlaTicket = {
  category?: string | null;
  firstResponseDueDate?: string | null;
  firstResponseDate?: string | null;
  dueDate?: string | null;
  resolvedDate?: string | null;
  closedDate?: string | null;
};

export type CalculatedSlaSummary<T extends CalculatedSlaTicket> = {
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
 * SLA calculado pelo Hub a partir dos marcos temporais disponíveis no Ticket.
 * Não representa os indicadores responseSlaIndicator/solutionSlaIndicator:
 * esses campos não são expostos pelo TicketApiDto utilizado na integração.
 */
export function calculateTimestampSla<T extends CalculatedSlaTicket>(
  tickets: T[],
  kind: CalculatedSlaKind,
): CalculatedSlaSummary<T> {
  const withinTickets: T[] = [];
  const outsideTickets: T[] = [];
  const unmeasuredTickets: T[] = [];

  tickets.forEach((ticket) => {
    if (!isMeasuredCategory(ticket.category)) {
      unmeasuredTickets.push(ticket);
      return;
    }

    const due = parseDate(kind === "response" ? ticket.firstResponseDueDate : ticket.dueDate);
    const completed = parseDate(
      kind === "response"
        ? ticket.firstResponseDate
        : ticket.resolvedDate ?? ticket.closedDate,
    );

    if (!due || !completed) {
      unmeasuredTickets.push(ticket);
      return;
    }

    if (completed.getTime() <= due.getTime()) withinTickets.push(ticket);
    else outsideTickets.push(ticket);
  });

  const measuredTickets = [...withinTickets, ...outsideTickets];
  const measured = measuredTickets.length;
  return {
    within: withinTickets.length,
    outside: outsideTickets.length,
    unmeasured: unmeasuredTickets.length,
    measured,
    percentage: measured ? Math.round(withinTickets.length / measured * 1000) / 10 : null,
    withinTickets,
    outsideTickets,
    unmeasuredTickets,
    measuredTickets,
  };
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isMeasuredCategory(category: string | null | undefined) {
  const normalized = normalize(category);
  return normalized !== "adequacao" && normalized !== "solicitacao de servico";
}

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
