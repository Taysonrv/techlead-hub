import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/utils/operationalMetrics.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { buildOperationalCohorts, isOperationallyOpen } = await import(`data:text/javascript,${encodeURIComponent(js)}`);
const period = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-10-31T23:59:59Z") };
const records = [
  { createdDate: "2026-10-02T12:00:00Z", resolvedDate: null, closedDate: null, baseStatus: "InAttendance", isWithSimer: false },
  { createdDate: "2026-09-02T12:00:00Z", resolvedDate: "2026-10-20T12:00:00Z", closedDate: "2026-10-21T12:00:00Z", baseStatus: "Closed", isWithSimer: false },
  { createdDate: "2026-10-03T12:00:00Z", resolvedDate: null, closedDate: null, baseStatus: "Stopped", isWithSimer: true },
];

test("Movidesk event cohort counts tickets regardless of current assigned owner", () => {
  const result = buildOperationalCohorts(records, period, "allImported");
  assert.equal(result.entries.length, 2);
  assert.equal(result.resolved.length, 1);
  assert.equal(result.closed.length, 1);
  assert.equal(result.backlog.length, 2);
});

test("existing SIMER-only cohort behavior remains available for other reports", () => {
  const result = buildOperationalCohorts(records, period);
  assert.equal(result.entries.length, 1);
  assert.equal(result.resolved.length, 0);
  assert.equal(result.closed.length, 0);
  assert.equal(result.backlog.length, 1);
});


test("resolution event remains counted after ticket is reopened", () => {
  const reopened = { createdDate: "2026-09-12T12:00:00Z", resolvedDate: "2026-10-18T12:00:00Z", closedDate: null, baseStatus: "InAttendance", isWithSimer: true };
  const result = buildOperationalCohorts([reopened], period, "allImported");
  assert.equal(result.resolved.length, 1);
  assert.equal(result.backlog.length, 1);
});

test("backlog accepts only canonical open states and ignores missing or unknown states", () => {
  assert.equal(isOperationallyOpen({ baseStatus: "New" }), true);
  assert.equal(isOperationallyOpen({ baseStatus: "inattendance" }), true);
  assert.equal(isOperationallyOpen({ baseStatus: "Stopped" }), true);
  assert.equal(isOperationallyOpen({ baseStatus: "Resolved" }), false);
  assert.equal(isOperationallyOpen({ baseStatus: "Cancelled" }), false);
  assert.equal(isOperationallyOpen({ baseStatus: "Awaiting customer" }), false);
  assert.equal(isOperationallyOpen({ baseStatus: null, status: "Open" }), false);
});
