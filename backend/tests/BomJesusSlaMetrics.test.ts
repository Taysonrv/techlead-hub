import assert from "node:assert/strict";
import test from "node:test";
import { ALIARE_TARGETS, aliareBusinessMinutes } from "../src/domain/AliareSlaRules";
import { BRAZIL_NATIONAL_HOLIDAYS_2026, businessMinutesAliare2026, computeBomJesusSla, observedPauseMinutes, resolveSlaTier } from "../src/services/BomJesusSlaMetrics";

const d = (iso: string) => new Date(iso);
test("Prazos oficiais Aliare para Bug P1 Padrão e VIP", () => {
  assert.deepEqual(ALIARE_TARGETS.PADRAO.BUG.P1, { response: 120, support: 660, factory: 480, total: 1140 });
  assert.deepEqual(ALIARE_TARGETS.VIP.BUG.P1, { response: 60, support: 330, factory: 240, total: 570 });
});
test("Feriados nacionais: segunda-feira 7 setembro 2026 não é contabilizada", () => {
  assert.equal(BRAZIL_NATIONAL_HOLIDAYS_2026.has("2026-09-07"), true);
  assert.equal(businessMinutesAliare2026(d("2026-09-04T20:00:00Z"), d("2026-09-08T12:00:00Z"), "BUG"), 120);
});
test("Padrão Bug: segunda a sexta 08–18 BRT; fora da janela não conta", () => {
  assert.equal(businessMinutesAliare2026(d("2026-11-03T10:30:00Z"), d("2026-11-03T23:00:00Z"), "BUG"), 600);
});
test("Outros: sábado 08–12 BRT entra; Bug não entra", () => {
  assert.equal(businessMinutesAliare2026(d("2026-11-07T11:00:00Z"), d("2026-11-07T15:00:00Z"), "OUTROS"), 240);
  assert.equal(businessMinutesAliare2026(d("2026-11-07T11:00:00Z"), d("2026-11-07T15:00:00Z"), "BUG"), 0);
});
test("Pausa de 2h com volta ao trabalho deve ser descontada", () => {
  const start = d("2026-11-03T11:00:00Z"), end = d("2026-11-03T21:00:00Z");
  assert.equal(observedPauseMinutes(start,end,"BUG",[
    { status: "Aguardando » Retorno do cliente", changedDate: d("2026-11-03T13:00:00Z") },
    { status: "Em atendimento", changedDate: d("2026-11-03T15:00:00Z") },
  ]), 120);
});
test("Perfil é lido do contrato sem presumir que Bom Jesus é VIP", () => {
  assert.deepEqual(resolveSlaTier("SLA VIP"), { tier: "VIP", source: "TICKET_SLA_AGREEMENT", verified: true });
  assert.equal(resolveSlaTier(null).verified, false);
  assert.equal(resolveSlaTier("padrão").tier, "PADRAO");
  assert.equal(resolveSlaTier("VIP", "PADRAO").verified, false);
});
test("OLA suporte excedido e fábrica dentro do prazo em cenário Padrão", () => {
  const metrics = computeBomJesusSla({
    category: "Bug", taskKind: true, urgencyPriority: "P1", slaAgreement: "SLA Padrão",
    createdDate: d("2026-11-03T11:00:00Z"),
    firstResponseDate: d("2026-11-03T12:00:00Z"), resolvedDate: null,
    taskCreatedAt: d("2026-11-04T22:00:00Z"),
    taskClosedAt: d("2026-11-05T13:00:00Z"), taskIsConcluded: true,
    statusHistories: [], asOf: d("2026-11-06T12:00:00Z"),
  });
  assert.equal(metrics.support.minutes, 1200);
  assert.equal(metrics.support.exceeded, true);
  assert.equal(metrics.support.overMinutes, 540);
  assert.equal(metrics.factory.minutes, 120);
  assert.equal(metrics.factory.exceeded, false);
  assert.equal(metrics.total.minutes, 1320);
  assert.equal(metrics.total.exceeded, true);
  assert.equal(metrics.response.minutes, 60);
});
test("Adequação não é elegível ao SLA, mesmo se há tarefa antiga de correção", () => {
  const metrics = computeBomJesusSla({
    category: "Adequação", taskKind: true, urgencyPriority: "P1", slaAgreement: "SLA Padrão",
    createdDate: d("2026-11-03T11:00:00Z"), firstResponseDate: null,
    resolvedDate: null, taskCreatedAt: d("2026-11-05T12:00:00Z"),
    taskClosedAt: null, taskIsConcluded: false, statusHistories: [], asOf: d("2026-11-09T12:00:00Z"),
  });
  assert.equal(metrics.eligible, false);
  assert.equal(metrics.support.minutes, null);
  assert.equal(metrics.support.exceeded, null);
});

test("Calendário otimizado tem mesma contagem do calendário oficial em dia útil sem feriado", () => {
  const from = d("2026-11-05T12:42:30Z");
  const to = d("2026-11-05T19:31:50Z");
  assert.equal(businessMinutesAliare2026(from,to,"BUG"), aliareBusinessMinutes(from,to,"BUG"));
});
test("Task concluída sem data de conclusão não produz SLA fictício até agora", () => {
  const metrics = computeBomJesusSla({
    category: "Bug", taskKind: true, urgencyPriority: "P2", slaAgreement: "VIP",
    createdDate: d("2026-11-03T11:00:00Z"), firstResponseDate: null, resolvedDate: null,
    taskCreatedAt: d("2026-11-04T14:00:00Z"), taskClosedAt: null,
    taskIsConcluded: true, statusHistories: [], asOf: d("2026-11-09T12:00:00Z"),
  });
  assert.equal(metrics.factory.minutes, null);
  assert.equal(metrics.total.minutes, null);
  assert.equal(metrics.factoryEndAt, null);
});
test("Categoria ausente não é utilizada para validar SLA", () => {
  const metrics = computeBomJesusSla({
    category: null, taskKind: true, urgencyPriority: "P1", slaAgreement: "SLA Padrão",
    createdDate: d("2026-11-03T11:00:00Z"), firstResponseDate: null,
    resolvedDate: null, taskCreatedAt: d("2026-11-05T12:00:00Z"),
    taskClosedAt: null, taskIsConcluded: false, statusHistories: [], asOf: d("2026-11-09T12:00:00Z"),
  });
  assert.equal(metrics.eligible, false);
  assert.equal(metrics.support.exceeded, null);
});
