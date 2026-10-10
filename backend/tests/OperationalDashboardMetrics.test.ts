import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationalCohorts } from "../../frontend/src/utils/operationalMetrics";
import { calculateTimestampSla } from "../../frontend/src/utils/timestampSla";
test("resolutions include older entries and exclude reopened tickets", () => {
  const common = { createdDate: "2026-09-01", resolvedDate: "2026-10-05", isWithSimer: true };
  const result = buildOperationalCohorts([{ ...common, baseStatus: "Closed" }, { ...common, baseStatus: "InAttendance" }], { start: new Date("2026-10-01"), end: new Date("2026-10-31") });
  assert.equal(result.entries.length, 0);
  assert.equal(result.resolved.length, 1);
  assert.equal(result.backlog.length, 1);
});
test("SLA includes measured service requests and reports missing evidence", () => {
  const result = calculateTimestampSla([{ category: "Solicitação de serviço", dueDate: "2026-10-05", resolvedDate: "2026-10-04" }, { category: "Adequação", dueDate: "2026-10-05", resolvedDate: "2026-10-06" }, { resolvedDate: "2026-10-04" }], "solution");
  assert.equal(result.measured, 2);
  assert.equal(result.unmeasured, 1);
  assert.equal(result.percentage, 50);
});
