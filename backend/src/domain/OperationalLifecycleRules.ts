export const TERMINAL_WORK_ITEM_STATES = [
  "Concluído", "Concluido", "Closed", "Done", "Resolved", "Cancelado", "Canceled",
] as const;

const OPEN_TICKET_BASE_STATES = ["New", "InAttendance", "Stopped"] as const;
const CLOSED_TICKET_STATUS_PATTERN = /conclu|fechad|encerrad|resolvid|cancelad/;
const OPEN_TICKET_STATUS_PATTERN = /novo|desenvolvimento|andamento|aguard|paus|parad/;

export function normalizeOperationalText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function isTerminalWorkItemState(state: string | null | undefined) {
  const normalized = normalizeOperationalText(state);
  return TERMINAL_WORK_ITEM_STATES.some((value) => normalizeOperationalText(value) === normalized);
}

export function isOperationalTicketOpen(
  ticket: { baseStatus: string | null; status: string },
  options: { excludeNormalizedStatuses?: readonly string[] } = {},
) {
  const status = normalizeOperationalText(ticket.status);
  if (options.excludeNormalizedStatuses?.includes(status)) return false;
  if (CLOSED_TICKET_STATUS_PATTERN.test(status)) return false;

  return OPEN_TICKET_BASE_STATES.includes((ticket.baseStatus ?? "") as typeof OPEN_TICKET_BASE_STATES[number])
    || OPEN_TICKET_STATUS_PATTERN.test(status);
}

export function isOperationalTicketFinalized(ticket: { baseStatus: string | null; status: string }) {
  const status = normalizeOperationalText(ticket.status);
  return ticket.baseStatus === "Resolved"
    || ticket.baseStatus === "Closed"
    || CLOSED_TICKET_STATUS_PATTERN.test(status);
}
