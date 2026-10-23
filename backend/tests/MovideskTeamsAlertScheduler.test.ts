import assert from "node:assert/strict";
import test from "node:test";
import type { prisma as PrismaInstance } from "../src/database/prisma";
import { MovideskTeamsAlertScheduler } from "../src/jobs/MovideskTeamsAlertScheduler";
import { TeamsWebhookHttpError } from "../src/services/TeamsWorkflowWebhookService";

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

function harness(options: {
  item?: typeof candidate;
  claimCount?: number;
  send?: () => Promise<{ status: number; durationMs: number }>;
} = {}) {
  const calls: { findFirst?: any; claim?: any; update?: any; ticketLookups: number } = {
    ticketLookups: 0,
  };
  const db = {
    teamsAlertOutbox: {
      findFirst: async (args: any) => {
        calls.findFirst = args;
        return options.item ?? candidate;
      },
      updateMany: async (args: any) => {
        calls.claim = args;
        return { count: options.claimCount ?? 1 };
      },
      update: async (args: any) => {
        calls.update = args;
        return args;
      },
    },
    ticket: {
      findUnique: async () => {
        calls.ticketLookups += 1;
        return ticket;
      },
    },
  };
  const webhook = {
    sendNewTicket: options.send ?? (async () => ({ status: 202, durationMs: 1 })),
  };
  const scheduler = new MovideskTeamsAlertScheduler(
    db as unknown as typeof PrismaInstance,
    webhook as any,
  );
  return { scheduler, calls };
}

async function runOne(scheduler: MovideskTeamsAlertScheduler) {
  await (scheduler as unknown as { processOne: () => Promise<void> }).processOne();
}

test("worker recupera item PROCESSING sem lock ou com lease vencido", async () => {
  const { scheduler, calls } = harness({
    item: { ...candidate, status: "PROCESSING", lockedUntil: null },
  });

  await runOne(scheduler);

  assert.ok(calls.findFirst.where.OR.some((entry: any) => entry.status === "PROCESSING"));
  assert.ok(calls.claim.where.OR.some((entry: any) => entry.status === "PROCESSING"));
  assert.deepEqual(calls.claim.data.attempts, { increment: 1 });
  assert.equal(calls.update.data.status, "SENT");
});

test("worker respeita Retry-After e persiste HTTP 429 antes de tentar novamente", async () => {
  const { scheduler, calls } = harness({
    send: async () => {
      throw new TeamsWebhookHttpError(429, 12_000);
    },
  });

  const before = Date.now();
  await runOne(scheduler);

  const data = calls.update.data;
  assert.equal(data.status, "PENDING");
  assert.equal(data.lastHttpStatus, 429);
  assert.match(data.lastError, /HTTP 429/);
  assert.ok(data.nextAttemptAt.getTime() >= before + 11_000);
  assert.ok(data.nextAttemptAt.getTime() <= Date.now() + 13_000);
  assert.equal(data.lockedUntil, null);
});

test("worker marca DEAD ao atingir oito tentativas e conserva status HTTP", async () => {
  const { scheduler, calls } = harness({
    item: { ...candidate, attempts: 7 },
    send: async () => {
      throw new TeamsWebhookHttpError(503, null);
    },
  });

  await runOne(scheduler);

  const data = calls.update.data;
  assert.equal(data.status, "DEAD");
  assert.equal(data.lastHttpStatus, 503);
  assert.equal(data.lockedUntil, null);
});

test("worker encerra item recuperado que já atingiu oito tentativas sem reenviar", async () => {
  let sends = 0;
  const { scheduler, calls } = harness({
    item: { ...candidate, status: "PROCESSING", attempts: 8, lockedUntil: null },
    send: async () => {
      sends += 1;
      return { status: 202, durationMs: 1 };
    },
  });

  await runOne(scheduler);

  assert.equal(calls.claim.data.status, "DEAD");
  assert.equal(calls.claim.data.lockedUntil, null);
  assert.match(calls.claim.data.lastError, /8 tentativas/);
  assert.equal(calls.ticketLookups, 0);
  assert.equal(sends, 0);
});

test("worker não envia quando outro processo já reivindicou o item", async () => {
  let sends = 0;
  const { scheduler, calls } = harness({
    claimCount: 0,
    send: async () => {
      sends += 1;
      return { status: 202, durationMs: 1 };
    },
  });

  await runOne(scheduler);

  assert.equal(calls.ticketLookups, 0);
  assert.equal(sends, 0);
  assert.ok(calls.claim);
});
