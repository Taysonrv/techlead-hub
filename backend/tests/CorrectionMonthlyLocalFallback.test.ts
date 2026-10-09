import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../src/database/prisma";
import { CorrectionMonthlyReportService } from "../src/services/CorrectionMonthlyReportService";

test("fallback preserva Tasks locais sem certificar cobertura a partir de um único evento", async (t) => {
  const createdAt = new Date("2026-09-02T12:00:00Z");
  const changedAt = new Date("2026-09-15T12:00:00Z");
  const originalFindMany = prisma.azureWorkItem.findMany;
  const originalQueryRaw = prisma.$queryRaw;
  t.after(() => {
    prisma.azureWorkItem.findMany = originalFindMany;
    prisma.$queryRaw = originalQueryRaw;
  });
  prisma.azureWorkItem.findMany = (async () => [
    { id: 1, title: "Correção com evento", client: "COAP", azureCreatedAt: createdAt, stateChangedAt: changedAt, state: "Concluído" },
    { id: 2, title: "Correção sem histórico", client: "COAP", azureCreatedAt: createdAt, stateChangedAt: null, state: "Concluído" },
  ]) as typeof originalFindMany;
  prisma.$queryRaw = (async () => [
    { workItemId: 1, oldValue: "Desenvolvimento", newValue: "Concluído", changedAt },
  ]) as typeof originalQueryRaw;
  const service = new CorrectionMonthlyReportService();
  // Fontes externas vazias, como no incidente; nenhuma rede ou BD necessário.
  t.mock.method(service, "resolveFields", async () => ({ client: "client", urgency: "urgency", prioritized: "prioritized" }));
  t.mock.method(service, "revisions", async () => []);
  t.mock.method(service, "workItemIdsAsOf", async () => []);
  t.mock.method(service, "snapshots", async () => new Map());
  t.mock.method(service, "workItemUrl", () => "https://dev.azure.com/test/_workitems/edit/1");
  const build = service as unknown as { build(month: string): Promise<{
    cards: { registered: number; delivered: number };
    rows: Array<{ id: number; deliveredInPeriod: boolean }>;
    quality: { localFallbackUsed: boolean; movementHistoryReliable: boolean; backlogHistoricalReliable: boolean };
  }> };
  const report = await build.build("2026-09");
  assert.equal(report.cards.registered, 2);
  assert.equal(report.cards.delivered, 1);
  assert.equal(report.rows.find(row => row.id === 2)?.deliveredInPeriod, false);
  assert.equal(report.quality.localFallbackUsed, true);
  assert.equal(report.quality.movementHistoryReliable, false);
  assert.equal(report.quality.backlogHistoricalReliable, false);
});


test("fallback usa StateChangeDate e restringe todas as dimensões à carteira SIMER", async (t) => {
  const originalFindMany = prisma.azureWorkItem.findMany;
  const originalQueryRaw = prisma.$queryRaw;
  t.after(() => {
    prisma.azureWorkItem.findMany = originalFindMany;
    prisma.$queryRaw = originalQueryRaw;
  });
  const createdAt = new Date("2026-08-01T12:00:00Z");
  const changedAt = new Date("2026-09-15T12:00:00Z");
  const item = (id: number, client: string, state: string, stateChangedAt: Date | null) =>
    ({ id, title: `Task ${id}`, client, azureCreatedAt: createdAt, state, stateChangedAt });
  prisma.azureWorkItem.findMany = (async () => [
    item(1, "COAP", "Concluído", changedAt),
    item(2, "COAGRO", "Cancelado", changedAt),
    item(3, "BOM JESUS", "Registro", changedAt),
    item(4, "Cliente fora da carteira", "Concluído", changedAt),
    item(5, "COAP", "Concluído", new Date("2026-10-02T12:00:00Z")),
    item(6, "COAP", "Cancelado", null),
    item(7, "COAP", "Concluído", new Date("2026-08-20T12:00:00Z")),
  ]) as typeof originalFindMany;
  prisma.$queryRaw = (async () => [
    { workItemId: 5, oldValue: "Registro", newValue: "Concluído", changedAt: new Date("2026-10-02T12:00:00Z") },
  ]) as typeof originalQueryRaw;
  const service = new CorrectionMonthlyReportService();
  t.mock.method(service, "resolveFields", async () => ({ client: "client", urgency: "urgency", prioritized: "prioritized" }));
  t.mock.method(service, "revisions", async () => []);
  t.mock.method(service, "workItemIdsAsOf", async () => []);
  t.mock.method(service, "snapshots", async () => new Map());
  t.mock.method(service, "workItemUrl", () => null);
  const build = service as unknown as { build(month: string): Promise<{
    cards: { delivered: number; canceled: number; inRegistration: number; backlogCurrent: number };
    rows: Array<{ id: number; client: string; terminalAt: string | null }>;
    filters: { clients: string[] };
    pipeline: Array<{ name: string; total: number }>;
    quality: { movementHistoryReliable: boolean };
  }> };
  const report = await build.build("2026-09");
  assert.equal(report.cards.delivered, 1);
  assert.equal(report.cards.canceled, 1);
  assert.equal(report.cards.inRegistration, 1);
  assert.equal(report.cards.backlogCurrent, 0);
  assert.equal(report.rows.some(row => row.id === 4), false);
  assert.equal(report.filters.clients.includes("Cliente fora da carteira"), false);
  assert.equal(report.pipeline.reduce((sum, entry) => sum + entry.total, 0), 6);
  assert.equal(report.rows.find(row => row.id === 1)?.client, "COAP - SORRISO-MT");
  assert.equal(report.rows.find(row => row.id === 1)?.terminalAt, changedAt.toISOString());
  assert.equal(report.quality.movementHistoryReliable, false);
});
