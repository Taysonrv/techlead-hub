export type OperationalMetricTicket = {
  createdDate: string;
  resolvedDate?: string | null;
  closedDate?: string | null;
  baseStatus?: string | null;
  status?: string | null;
  canceledDate?: string | null;
  isWithSimer?: boolean;
};

export type OperationalPeriod = { start: Date; end: Date };

const inPeriod = (value: string | null | undefined, period: OperationalPeriod) => {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date >= period.start && date <= period.end;
};

const OPEN_BASE_STATUSES = new Set(["new", "inattendance", "stopped"]);

/**
 * Backlog atual segue os estados canônicos aceitos pelo backend.
 * Status ausente/desconhecido não deve ser presumido como pendente.
 */
export const isOperationallyOpen = (ticket: OperationalMetricTicket) => {
  const baseStatus = (ticket.baseStatus ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return OPEN_BASE_STATUSES.has(baseStatus);
};

export const isTicketCancelled = (ticket: OperationalMetricTicket) => {
  const baseStatus = (ticket.baseStatus ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const status = (ticket.status ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return Boolean(ticket.canceledDate) || baseStatus === "canceled" || status.includes("cancel");
};

export function buildOperationalCohorts<T extends OperationalMetricTicket>(
  tickets: T[],
  period: OperationalPeriod,
  scope: "currentSimer" | "allImported" = "currentSimer",
) {
  const simer = scope === "allImported" ? tickets : tickets.filter((ticket) => ticket.isWithSimer === true);
  return {
    entries: simer.filter((ticket) => inPeriod(ticket.createdDate, period)),
    resolved: simer.filter((ticket) => inPeriod(ticket.resolvedDate, period)),
    closed: simer.filter((ticket) => inPeriod(ticket.closedDate, period) && !isTicketCancelled(ticket)),
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


export type DataCoverage = {
  total: number;
  populated: number;
  missing: number;
  rate: number;
};

export function dataCoverage<T>(rows: T[], predicate: (row: T) => boolean): DataCoverage {
  const populated = rows.filter(predicate).length;
  const total = rows.length;
  return {
    total,
    populated,
    missing: Math.max(0, total - populated),
    rate: total ? Math.round((populated / total) * 1000) / 10 : 0,
  };
}

export function classifyCoverage(coverage: DataCoverage): "complete" | "partial" | "unavailable" | "empty" {
  if (coverage.total === 0) return "empty";
  if (coverage.populated === 0) return "unavailable";
  if (coverage.populated === coverage.total) return "complete";
  return "partial";
}
