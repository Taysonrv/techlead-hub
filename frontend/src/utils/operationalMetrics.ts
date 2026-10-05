export type OperationalMetricTicket = {
  createdDate: string;
  resolvedDate?: string | null;
  closedDate?: string | null;
  baseStatus?: string | null;
  status?: string | null;
  isWithSimer?: boolean;
};

export type OperationalPeriod = { start: Date; end: Date };

const inPeriod = (value: string | null | undefined, period: OperationalPeriod) => {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date >= period.start && date <= period.end;
};

export const isOperationallyOpen = (ticket: OperationalMetricTicket) => {
  const status = (ticket.baseStatus ?? ticket.status ?? "").trim().toLowerCase();
  return !["resolved", "closed", "canceled", "cancelled", "resolvido", "fechado", "cancelado"].includes(status);
};

export function buildOperationalCohorts<T extends OperationalMetricTicket>(
  tickets: T[],
  period: OperationalPeriod,
) {
  const simer = tickets.filter((ticket) => ticket.isWithSimer === true);
  return {
    entries: simer.filter((ticket) => inPeriod(ticket.createdDate, period)),
    resolved: simer.filter((ticket) => inPeriod(ticket.resolvedDate, period)),
    closed: simer.filter((ticket) => inPeriod(ticket.closedDate, period)),
    backlog: simer.filter(isOperationallyOpen),
  };
}

export type MetricAuditInput = {
  entries: number;
  resolved: number;
  closed: number;
  backlog: number;
  responseMeasured?: number;
  responseWithin?: number;
  solutionMeasured?: number;
  solutionWithin?: number;
  responseDrilldown?: number;
  solutionDrilldown?: number;
};

export type MetricAuditIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export function auditOperationalMetrics(input: MetricAuditInput): MetricAuditIssue[] {
  const issues: MetricAuditIssue[] = [];
  const pairs: Array<[string, number | undefined, number | undefined]> = [
    ["SLA_RESPONSE", input.responseWithin, input.responseMeasured],
    ["SLA_SOLUTION", input.solutionWithin, input.solutionMeasured],
  ];
  for (const [code, within, measured] of pairs) {
    if (within != null && measured != null && (within < 0 || measured < 0 || within > measured)) {
      issues.push({ severity: "error", code, message: `${code}: quantidade no prazo incompatível com o denominador.` });
    }
  }
  if (input.responseDrilldown != null && input.responseMeasured != null && input.responseDrilldown !== input.responseMeasured) {
    issues.push({ severity: "error", code: "RESPONSE_DRILLDOWN", message: "SLA 1ª resposta: card e drill-down usam universos diferentes." });
  }
  if (input.solutionDrilldown != null && input.solutionMeasured != null && input.solutionDrilldown !== input.solutionMeasured) {
    issues.push({ severity: "error", code: "SOLUTION_DRILLDOWN", message: "SLA solução: card e drill-down usam universos diferentes." });
  }
  return issues;
}
