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
    { id: 1, title: "Correção com evento", azureCreatedAt: createdAt, stateChangedAt: changedAt, state: "Concluído" },
    { id: 2, title: "Correção sem histórico", azureCreatedAt: createdAt, stateChangedAt: null, state: "Concluído" },
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
