import assert from "node:assert/strict";
import test from "node:test";
import { computeMovideskIncrementalSince } from "../src/services/MovideskService";

test("primeiro incremental após upgrade recupera as últimas 24 horas", () => {
  const now = new Date("2026-10-09T15:00:00.000Z");
  assert.equal(
    computeMovideskIncrementalSince(null, now).toISOString(),
    "2026-10-08T15:00:00.000Z",
  );
});

test("ciclos seguintes mantêm janela de segurança de seis horas", () => {
  const lastRun = new Date("2026-10-09T14:30:00.000Z");
  assert.equal(
    computeMovideskIncrementalSince(lastRun, new Date("2026-10-09T15:00:00.000Z")).toISOString(),
    "2026-10-09T08:30:00.000Z",
  );
});

test("janela incremental nunca recua antes do escopo operacional de 2026", () => {
  assert.equal(
    computeMovideskIncrementalSince(
      new Date("2026-01-01T02:00:00.000Z"),
      new Date("2026-01-01T03:00:00.000Z"),
    ).toISOString(),
    "2026-01-01T00:00:00.000Z",
  );
});
