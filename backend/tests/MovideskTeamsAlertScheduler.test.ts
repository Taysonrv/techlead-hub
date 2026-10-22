import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { prisma } from "../src/database/prisma";
import { MovideskTeamsAlertScheduler } from "../src/jobs/MovideskTeamsAlertScheduler";
import {
  TeamsWebhookHttpError,
  TeamsWorkflowWebhookService,
} from "../src/services/TeamsWorkflowWebhookService";

const candidate = {
  id: "outbox-test-1",
  movideskId: 12345,
  attempts: 0,
  status: "PENDING",
  nextAttemptAt: new Date(Date.now() - 1_000),
  lockedUntil: null,
  subject: "AGRIQ - teste",
  client: "Cliente teste",
  createdDate: new Date("2026-10-22T12:00:00.000Z"),
  urgency: "Alta",
};

const ticket = {
  movideskId: 12345,
  subject: "AGRIQ - teste",
  client: "Cliente teste",
  createdDate: new Date("2026-10-22T12:00:00.000Z"),
  urgency: "Alta",
  status: "Novo",
  owner: "Suporte",
};

function mockQueue(t: TestContext, item = candidate) {
  const calls: { findFirst?: unknown; claim?: unknown; update?: unknown } = {};
  t.mock.method(prisma.teamsAlertOutbox, "findFirst", async (args: unknown) => {
    calls.findFirst = args;
    return item;
  });
  t.mock.method(prisma.teamsAlertOutbox, "updateMany", async (args: unknown) => {
    calls.claim = args;
    return { count: 1 };
  });
  t.mock.method(prisma.ticket, "findUnique", async () => ticket);
  t.mock.method(prisma.teamsAlertOutbox, "update", async (args: unknown) => {
    calls.update = args;
    return args;
  });
  return calls;
}

async function runOne(scheduler: MovideskTeamsAlertScheduler) {
  await (scheduler as unknown as { processOne: () => Promise<void> }).processOne();
}

test("worker recupera item PROCESSING sem lock ou com lease vencido", async (t) => {
  const calls = mockQueue(t, { ...candidate, status: "PROCESSING", lockedUntil: null });
  t.mock.method(TeamsWorkflowWebhookService.prototype, "sendNewTicket", async () => ({
    status: 202,
    durationMs: 1,
  }));

  await runOne(new MovideskTeamsAlertScheduler());

  const query = calls.findFirst as { where?: { OR?: unknown[] } };
  assert.ok(query.where?.OR?.some((entry: any) => entry.status === "PROCESSING"));
  const claim = calls.claim as { where?: { OR?: unknown[] }; data?: { attempts?: unknown } };
  assert.ok(claim.where?.OR?.some((entry: any) => entry.status === "PROCESSING"));
  assert.deepEqual(claim.data?.attempts, { increment: 1 });
  assert.equal((calls.update as any).data.status, "SENT");
});

test("worker respeita Retry-After e persiste HTTP 429 antes de tentar novamente", async (t) => {
  const calls = mockQueue(t);
  t.mock.method(TeamsWorkflowWebhookService.prototype, "sendNewTicket", async () => {
    throw new TeamsWebhookHttpError(429, 12_000);
  });

  const before = Date.now();
  await runOne(new MovideskTeamsAlertScheduler());

  const data = (calls.update as any).data;
  assert.equal(data.status, "PENDING");
  assert.equal(data.lastHttpStatus, 429);
  assert.match(data.lastError, /HTTP 429/);
  assert.ok(data.nextAttemptAt.getTime() >= before + 11_000);
  assert.ok(data.nextAttemptAt.getTime() <= Date.now() + 13_000);
  assert.equal(data.lockedUntil, null);
});

test("worker marca DEAD ao atingir oito tentativas e conserva status HTTP", async (t) => {
  const calls = mockQueue(t, { ...candidate, attempts: 7 });
  t.mock.method(TeamsWorkflowWebhookService.prototype, "sendNewTicket", async () => {
    throw new TeamsWebhookHttpError(503, null);
  });

  await runOne(new MovideskTeamsAlertScheduler());

  const data = (calls.update as any).data;
  assert.equal(data.status, "DEAD");
  assert.equal(data.lastHttpStatus, 503);
  assert.equal(data.lockedUntil, null);
});

test("worker não envia quando outro processo já reivindicou o item", async (t) => {
  const calls: { update?: unknown } = {};
  t.mock.method(prisma.teamsAlertOutbox, "findFirst", async () => candidate);
  t.mock.method(prisma.teamsAlertOutbox, "updateMany", async (args: unknown) => {
    calls.update = args;
    return { count: 0 };
  });
  const ticketMock = t.mock.method(prisma.ticket, "findUnique", async () => ticket);
  const sendMock = t.mock.method(TeamsWorkflowWebhookService.prototype, "sendNewTicket", async () => ({
    status: 202,
    durationMs: 1,
  }));

  await runOne(new MovideskTeamsAlertScheduler());

  assert.equal(ticketMock.mock.callCount(), 0);
  assert.equal(sendMock.mock.callCount(), 0);
  assert.ok(calls.update);
});
