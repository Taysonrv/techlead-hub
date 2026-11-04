import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationalCohorts } from "../../frontend/src/utils/operationalMetrics";
import { calculateTimestampSla } from "../../frontend/src/utils/timestampSla";
test("resolutions include older entries even when reopened later", () => {
  const common = { createdDate: "2026-09-01", resolvedDate: "2026-10-05", ticketType: 2, isWithSimer: true };
  const result = buildOperationalCohorts([{ ...common, baseStatus: "Closed" }, { ...common, baseStatus: "InAttendance" }], { start: new Date("2026-10-01"), end: new Date("2026-10-31") });
  assert.equal(result.entries.length, 0);
  assert.equal(result.resolved.length, 2);
  assert.equal(result.backlog.length, 1);
});
test("SLA includes measured service requests and reports missing evidence", () => {
  const result = calculateTimestampSla([{ category: "Solicitação de serviço", dueDate: "2026-10-05", resolvedDate: "2026-10-04" }, { category: "Adequação", dueDate: "2026-10-05", resolvedDate: "2026-10-06" }, { resolvedDate: "2026-10-04" }], "solution");
  assert.equal(result.measured, 2);
  assert.equal(result.unmeasured, 1);
  assert.equal(result.percentage, 50);
});

test("pending period includes only public open tickets created inside selected range", () => {
  const period = { start: new Date("2026-11-01T00:00:00Z"), end: new Date("2026-11-30T23:59:59Z") };
  const base = { isWithSimer: true, baseStatus: "InAttendance" };
  const tickets = [
    { ...base, ticketType: 2, createdDate: "2026-11-04T12:00:00Z" },
    { ...base, ticketType: 1, createdDate: "2026-11-04T12:00:00Z" },
    { ...base, ticketType: null, createdDate: "2026-11-04T12:00:00Z" },
    { ...base, ticketType: 2, createdDate: "2026-10-20T12:00:00Z" },
    { ...base, ticketType: 2, baseStatus: "Closed", createdDate: "2026-11-04T12:00:00Z" },
  ];
  const result = buildOperationalCohorts(tickets, period, "allImported");
  assert.equal(result.pendingInPeriod.length, 1);
  assert.equal(result.backlog.length, 2);
});
test("pending period updates with date selection and excludes unknown status", () => {
  const tickets = [
    { ticketType: 2, baseStatus: "New", createdDate: "2026-10-12T12:00:00Z" },
    { ticketType: 2, baseStatus: "Stopped", createdDate: "2026-11-12T12:00:00Z" },
    { ticketType: 2, baseStatus: null, createdDate: "2026-11-12T12:00:00Z" },
  ];
  const october = buildOperationalCohorts(tickets, { start: new Date("2026-10-01"), end: new Date("2026-10-31T23:59:59Z") }, "allImported");
  const november = buildOperationalCohorts(tickets, { start: new Date("2026-11-01"), end: new Date("2026-11-30T23:59:59Z") }, "allImported");
  assert.equal(october.pendingInPeriod.length, 1);
  assert.equal(november.pendingInPeriod.length, 1);
});
