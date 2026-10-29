import test from "node:test";
import assert from "node:assert/strict";
import { classifyLeadershipSla, inclusiveCalendarDays } from "../src/domain/TechnicalLeadershipRules";

test("SLA desconhecido ou sem medição não é contado como cumprimento", () => {
  assert.equal(classifyLeadershipSla(null), "unmeasured");
  assert.equal(classifyLeadershipSla("Aguardando cálculo"), "unmeasured");
  assert.equal(classifyLeadershipSla("Não medido"), "unmeasured");
});

test("SLA classifica explicitamente vencimento, negação e cumprimento", () => {
  assert.equal(classifyLeadershipSla("SLA violado"), "outside");
  assert.equal(classifyLeadershipSla("Não violado"), "within");
  assert.equal(classifyLeadershipSla("Dentro do prazo"), "within");
});

test("período personalizado conta datas de calendário inclusivas", () => {
  assert.equal(inclusiveCalendarDays(new Date(2026, 9, 27, 0), new Date(2026, 9, 27, 23, 59)), 1);
  assert.equal(inclusiveCalendarDays(new Date(2026, 9, 1), new Date(2026, 9, 31, 23, 59)), 31);
});
