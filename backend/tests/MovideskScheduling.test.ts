import assert from "node:assert/strict";
import test from "node:test";
import { movideskNextCycleDelay } from "../src/jobs/MovideskSyncScheduler";
import { clearMovideskApiPriority, requestMovideskApiPriority } from "../src/jobs/MovideskSyncCoordinator";
import { prisma } from "../src/database/prisma";
import { MovideskService } from "../src/services/MovideskService";

test("ciclo de 80s deixa 220s até o próximo início na cadência de cinco minutos", () => {
  assert.equal(movideskNextCycleDelay(300_000, 80_000), 220_000);
  assert.equal(movideskNextCycleDelay(300_000, 400_000), 30_000);
});

test("enriquecimento cede prioridade sem consumir API ou remover pendências", async (t) => {
  const originalFindMany = prisma.ticket.findMany;
  t.after(() => {
    prisma.ticket.findMany = originalFindMany;
    clearMovideskApiPriority();
  });
  prisma.ticket.findMany = (async () => [
    { id: 1, movideskId: 816434, lastUpdate: new Date(), movideskEnrichment: null },
    { id: 2, movideskId: 816435, lastUpdate: new Date(), movideskEnrichment: null },
  ]) as typeof originalFindMany;
  requestMovideskApiPriority();
  const result = await new MovideskService().syncTicketEnrichment(10);
  assert.equal(result.yieldedToSync, true);
  assert.equal(result.tickets, 0);
  assert.equal(result.pendingBeforeRun, 2);
  assert.equal(result.pendingAfterRun, 2);
  assert.equal(result.errors, 0);
});
