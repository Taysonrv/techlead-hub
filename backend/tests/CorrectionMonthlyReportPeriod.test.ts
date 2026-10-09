import assert from "node:assert/strict";
import test from "node:test";
import { assessHistoricalBacklog, classifyMonthlyStateMovement, isBacklogState, saoPauloMonth, selectReportCandidateIds } from "../src/services/CorrectionMonthlyReportService";

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

test("seleção não encaminha toda a base local para os snapshots", () => {
  const start = new Date("2026-10-01T03:00:00.000Z");
  const close = new Date("2026-10-09T12:00:00.000Z");
  const local = [
    { id: 1, azureCreatedAt: new Date("2026-07-01T00:00:00.000Z"), stateChangedAt: null, azureClosedAt: null },
    { id: 2, azureCreatedAt: new Date("2026-10-05T00:00:00.000Z"), stateChangedAt: null, azureClosedAt: null },
    { id: 3, azureCreatedAt: new Date("2026-01-01T00:00:00.000Z"), stateChangedAt: new Date("2026-10-02T00:00:00.000Z"), azureClosedAt: null },
    { id: 4, azureCreatedAt: new Date("2026-01-01T00:00:00.000Z"), stateChangedAt: null, azureClosedAt: null },
  ];
  const ids = selectReportCandidateIds(local, start, close, [3, 8], [1], [4]);
  assert.deepEqual(ids, [3, 8, 1, 4, 2]);
  assert.equal(new Set(ids).size, ids.length);
});

test("backlog só é certificado quando ASOF e ambas as fotografias cobrem os IDs", () => {
  const opening = new Set([10, 11]);
  const closing = new Set([11, 12]);
  assert.equal(assessHistoricalBacklog(true, true, [10, 11], [11, 12], opening, closing), true);
  assert.equal(assessHistoricalBacklog(true, true, [10, 11], [11, 12], new Set([10]), closing), false);
  assert.equal(assessHistoricalBacklog(true, false, [10], [11], opening, closing), false);
  assert.equal(assessHistoricalBacklog(false, true, [10], [11], opening, closing), false);
});

test("mês com escopo histórico comprovadamente vazio admite backlog zero", () => {
  assert.equal(assessHistoricalBacklog(true, true, [], [], new Set(), new Set()), true);
});


test("movimentação mensal considera apenas o estado-alvo no fechamento e evidência dentro do período", () => {
  const start = new Date("2026-09-01T03:00:00.000Z");
  const close = new Date("2026-10-01T02:59:59.999Z");

  const delivered = classifyMonthlyStateMovement({
    stateAtClose: "Concluído",
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    start,
    close,
    stateEvents: [{ at: new Date("2026-09-14T15:00:00.000Z"), state: "Concluído" }],
  });
  assert.equal(delivered.deliveredInPeriod, true);
  assert.equal(delivered.canceledInPeriod, false);

  const reopened = classifyMonthlyStateMovement({
    stateAtClose: "Qualidade",
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    start,
    close,
    stateEvents: [
      { at: new Date("2026-09-14T15:00:00.000Z"), state: "Concluído" },
      { at: new Date("2026-09-20T15:00:00.000Z"), state: "Qualidade" },
    ],
  });
  assert.equal(reopened.deliveredInPeriod, false);
});

test("task criada no mês e terminal no fechamento conta a entrada mesmo sem revisão histórica", () => {
  const start = new Date("2026-09-01T03:00:00.000Z");
  const close = new Date("2026-10-01T02:59:59.999Z");
  const movement = classifyMonthlyStateMovement({
    stateAtClose: "Cancelado",
    createdAt: new Date("2026-09-18T12:00:00.000Z"),
    start,
    close,
  });
  assert.equal(movement.createdInPeriod, true);
  assert.equal(movement.canceledInPeriod, true);
});

test("StateChangeDate fora do mês não altera retroativamente o fechamento", () => {
  const start = new Date("2026-09-01T03:00:00.000Z");
  const close = new Date("2026-10-01T02:59:59.999Z");
  const movement = classifyMonthlyStateMovement({
    stateAtClose: "Concluído",
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    start,
    close,
    stateChangedAt: new Date("2026-10-03T12:00:00.000Z"),
  });
  assert.equal(movement.deliveredInPeriod, false);
});

test("Registro pode aparecer no pipeline, mas a regra de movimento é independente do backlog", () => {
  const start = new Date("2026-09-01T03:00:00.000Z");
  const close = new Date("2026-10-01T02:59:59.999Z");
  const movement = classifyMonthlyStateMovement({
    stateAtClose: "Registro",
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    start,
    close,
    stateEvents: [{ at: new Date("2026-09-07T12:00:00.000Z"), state: "Registro" }],
  });
  assert.equal(movement.enteredRegistrationInPeriod, true);
});


test("backlog exclui Registro e estados terminais, mas mantém estados abertos", () => {
  assert.equal(isBacklogState("Registro"), false);
  assert.equal(isBacklogState("Concluído"), false);
  assert.equal(isBacklogState("Cancelado"), false);
  assert.equal(isBacklogState("Qualificação"), true);
  assert.equal(isBacklogState("Fila Desenvolvimento"), true);
  assert.equal(isBacklogState(null), false);
});
