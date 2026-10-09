import assert from "node:assert/strict";
import test from "node:test";
import { saoPauloMonth } from "../src/services/CorrectionMonthlyReportService";

test("mês corrente usa fechamento provisório anterior ao instante atual", () => {
  const observedAt = new Date("2026-10-09T12:00:00.000Z");
  const period = saoPauloMonth("2026-10", observedAt);
  assert.equal(period.start.toISOString(), "2026-10-01T03:00:00.000Z");
  assert.equal(period.endExclusive.toISOString(), "2026-11-01T03:00:00.000Z");
  assert.equal(period.close.toISOString(), "2026-10-09T11:59:00.000Z");
});

test("mês encerrado preserva o fechamento histórico de São Paulo", () => {
  const period = saoPauloMonth("2026-09", new Date("2026-10-09T12:00:00.000Z"));
  assert.equal(period.start.toISOString(), "2026-09-01T03:00:00.000Z");
  assert.equal(period.close.toISOString(), "2026-10-01T02:59:59.999Z");
});

test("mês futuro não é homologado como snapshot existente", () => {
  assert.throws(
    () => saoPauloMonth("2026-11", new Date("2026-10-09T12:00:00.000Z")),
    /período que ainda não começou/,
  );
});

test("início e fim do ano respeitam limites da apuração", () => {
  const period = saoPauloMonth("2025-12", new Date("2026-10-09T12:00:00.000Z"));
  assert.equal(period.start.toISOString(), "2025-12-01T03:00:00.000Z");
  assert.equal(period.close.toISOString(), "2026-01-01T02:59:59.999Z");
});
