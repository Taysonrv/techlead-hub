import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { prisma } from "../src/database/prisma";
import { MovideskService } from "../src/services/MovideskService";
import { MovideskJsonImportService } from "../src/services/MovideskJsonImportService";
import { movideskSyncAnchor, movideskSyncIntervalMinutes } from "../src/domain/MovideskSyncPolicy";
import { MovideskController } from "../src/controllers/MovideskController";
import { tryAcquireMovideskApi, releaseMovideskApi, movideskApiOwner } from "../src/jobs/MovideskSyncCoordinator";

test("frequência de telemetria e scheduler usa cinco minutos; cursor preserva início da execução", () => {
  assert.equal(movideskSyncIntervalMinutes(""), 5);
  assert.equal(movideskSyncIntervalMinutes("2"), 2);
  assert.equal(movideskSyncIntervalMinutes("invalid"), 5);
  const createdAt = new Date("2026-10-11T20:00:00Z");
  assert.equal(movideskSyncAnchor({ createdAt, metadata: { startedAt: "2026-10-09T20:00:00Z" } })?.toISOString(), "2026-10-09T20:00:00.000Z");
  assert.equal(movideskSyncAnchor({ createdAt, metadata: { startedAt: "invalid" } }), createdAt);
});

function mockMethod(t: TestContext, target: any, name: string, replacement: any) {
  const original = target[name];
  target[name] = replacement;
  t.after(() => { target[name] = original; });
}

function setup(t: TestContext, reconciled: boolean) {
  const now = new Date();
  const saved: any[] = [];
  const previous = { createdAt: now, metadata: { startedAt: new Date(now.getTime() - 60_000).toISOString() } };
  mockMethod(t, prisma.auditLog, "findFirst", async (args: any) => {
    if (args.where.action.includes("BASELINE_COMPLETED")) return { id: 1 };
    if (args.where.metadata) return reconciled ? previous : null;
    return previous;
  });
  mockMethod(t, prisma.auditLog, "create", async (args: any) => { saved.push(args.data); return { id: 10, ...args.data }; });
  return { now, saved };
}

test("consulta vazia confirma execução e primeira reconciliação recupera sete dias", async (t) => {
  const { now, saved } = setup(t, false);
  const service = new MovideskService();
  t.mock.method(service as any, "getPage", async (_skip: number, since: Date) => {
    assert.ok(since.getTime() <= now.getTime() - 6.99 * 24 * 60 * 60_000);
    return [];
  });
  const result = await service.syncTickets(null, false, false);
  assert.equal(result.reconciliation, true);
  assert.equal(result.queriedPages, 1);
  assert.equal(result.pages, 0);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].metadata.reconciliation, true);
  assert.ok(saved[0].metadata.startedAt);
});

test("reconciliação recente mantém ciclo de seis horas e falha não avança cursor", async (t) => {
  const { now, saved } = setup(t, true);
  const service = new MovideskService();
  t.mock.method(service as any, "getPage", async (_skip: number, since: Date) => {
    assert.ok(Math.abs(now.getTime() - since.getTime() - 361 * 60_000) < 1000);
    throw new Error("API indisponível");
  });
  await assert.rejects(service.syncTickets(null, false, false), /API indisponível/);
  assert.equal(saved.length, 0);
});

test("reconciliação importa apenas clientes SIMER; erros não confirmam janela", async (t) => {
  const { saved } = setup(t, false);
  const service = new MovideskService();
  let calls = 0;
  const stamp = "2026-10-09T17:00:00.000Z";
  t.mock.method(service as any, "getPage", async (_skip: number, _since: Date, cursor: any) => {
    calls += 1;
    if (calls === 2) {
      assert.deepEqual(cursor, { id: 50, lastUpdate: stamp });
      return [];
    }
    return Array.from({ length: 50 }, (_, i) => ({ id: i + 1, lastUpdate: stamp, clients: [{ organization: { businessName: i === 0 ? "CLIENTE EXTERNO" : "COAP - SORRISO-MT" } }] }));
  });
  t.mock.method(MovideskJsonImportService.prototype, "execute", async (buffer: Buffer) => {
    const rows = JSON.parse(buffer.toString());
    assert.equal(rows.length, 49);
    assert.equal(rows.some((row: any) => row.id === 1), false);
    return { totalRows: 49, created: 48, updated: 0, ignored: 0, errors: 1 } as any;
  });
  const result = await service.syncTickets(null, false, false);
  assert.equal(result.queriedPages, 2);
  assert.equal(result.errors, 1);
  assert.equal(saved.length, 0);
});

test("telemetria exibe execução sem tickets, frequência real e próxima consulta", async (t) => {
  const { now } = setup(t, true);
  mockMethod(t, prisma.ticket, "count", async () => 0);
  mockMethod(t, prisma.importRun, "findFirst", async () => null);
  const result = await new MovideskService().baselineStatus();
  assert.equal(result.lastIncremental?.finishedAt, now);
  assert.equal(result.scheduler.intervalMinutes, movideskSyncIntervalMinutes());
  assert.equal(result.scheduler.overlapMinutes, 360);
});

test("sincronização manual respeita ciclo automático e libera exclusão após falha", async (t) => {
  t.after(() => { releaseMovideskApi("TICKETS"); releaseMovideskApi("MANUAL"); });
  const controller = new MovideskController();
  let status = 200;
  const response: any = { status(value: number) { status = value; return this; }, json(value: unknown) { return value; } };
  const sync = t.mock.method(MovideskService.prototype, "syncTickets", async () => { throw new Error("falha"); });
  assert.equal(tryAcquireMovideskApi("TICKETS"), true);
  await controller.sync({} as any, response);
  assert.equal(status, 409);
  assert.equal(sync.mock.callCount(), 0);
  releaseMovideskApi("TICKETS");
  await controller.sync({} as any, response);
  assert.equal(status, 500);
  assert.equal(movideskApiOwner(), null);
});
