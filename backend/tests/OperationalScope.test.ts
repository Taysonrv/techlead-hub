import assert from "node:assert/strict";
import test from "node:test";
import { azureOperationalScope, coordinationAzureScope, coordinationTicketScope, resolveSimerClient, scopedAzureWhere, scopedTicketWhere, SIMER_CLIENTS, SUPPORT_ANALYSTS, ticketOperationalScope } from "../src/domain/OperationalScope";
import { knownProblemBelongsToScope } from "../src/services/KnownProblemScopeService";

// Avalia os operadores usados pelo escopo em registros de carteiras diferentes.
function matches(row: Record<string, unknown>, where: any): boolean {
  return Object.entries(where).every(([field, condition]: [string, any]) => {
    if (field === "AND") return (Array.isArray(condition) ? condition : [condition]).every((item: any) => matches(row, item));
    if (field === "OR") return condition.some((item: any) => matches(row, item));
    if (field === "NOT") return !matches(row, condition);
    if (condition === null || typeof condition !== "object") return row[field] === condition;
    const value = row[field];
    const text = (v: unknown) => condition.mode === "insensitive" ? String(v).toLowerCase() : String(v);
    if (condition.in && !condition.in.some((candidate: unknown) => text(candidate) === text(value))) return false;
    if (condition.contains && (value == null || !text(value).includes(text(condition.contains)))) return false;
    if ("equals" in condition && text(value) !== text(condition.equals)) return false;
    if ("gte" in condition && (!(value instanceof Date) || value < condition.gte)) return false;
    return true;
  });
}
const ticket = { client: SIMER_CLIENTS[0], owner: SUPPORT_ANALYSTS[5], service: "SIMER", ownerTeam: "SIMER | Suporte N3", createdDate: new Date("2026-09-01"), isDeleted: false };
const task = { client: SIMER_CLIENTS[0], createdByName: "Tayson Araujo", assignedToName: "DESENVOLVEDOR", workItemType: "Correção Clientes", movideskTicket: 123 };

test("tickets require the portfolio and support owner even inside a SIMER team", () => {
  assert.equal(matches(ticket, ticketOperationalScope()), true);
  for (const bad of [{ client: "OUTRO CLIENTE" }, { owner: "OUTRO ANALISTA" }, { owner: null }, { isDeleted: true }, { service: "SIAGRI WEB" }]) {
    assert.equal(matches({ ...ticket, ...bad }, ticketOperationalScope()), false, JSON.stringify(bad));
  }
});
test("Azure requires client AND creator; a Movidesk link cannot widen the portfolio", () => {
  assert.equal(matches(task, azureOperationalScope()), true);
  assert.equal(matches({ ...task, client: "OUTRO CLIENTE" }, azureOperationalScope()), false);
  assert.equal(matches({ ...task, createdByName: "Joel Kunrath" }, azureOperationalScope()), false);
  assert.equal(matches({ ...task, createdByName: "Renan Stein" }, azureOperationalScope()), false);
  assert.equal(matches({ ...task, createdByName: null }, azureOperationalScope()), false);
});
test("Azure recognizes explicit team aliases and keeps developer assignment separate", () => {
  for (const name of ["Alan Neto", "Renan Sousa", "Tayson Araujo", ...SUPPORT_ANALYSTS]) assert.equal(matches({ ...task, createdByName: name }, azureOperationalScope()), true);
  assert.equal(matches({ ...task, client: "BOM JESUS" }, azureOperationalScope()), true);
});
test("optional OR filters and direct IDs cannot override the required portfolio", () => {
  const filter = { OR: [{ id: 123 }, { client: "OUTRO CLIENTE" }] };
  assert.equal(matches({ ...ticket, id: 123, owner: "OUTRO ANALISTA" }, scopedTicketWhere(filter)), false);
  assert.equal(matches({ ...task, id: 123, client: "OUTRO CLIENTE" }, scopedAzureWhere(filter)), false);
  assert.equal(matches({ ...task, id: 123 }, scopedAzureWhere(filter)), true);
});
test("Coordination shares the mandatory operational scope", () => {
  assert.deepEqual(coordinationTicketScope(), ticketOperationalScope());
  assert.deepEqual(coordinationAzureScope(), azureOperationalScope());
});
test("client aliases are exact and do not admit similarly named external clients", () => {
  assert.equal(resolveSimerClient("coap"), SIMER_CLIENTS[3]);
  assert.equal(resolveSimerClient("COAP OUTRO CLIENTE"), null);
  assert.equal(resolveSimerClient("NOVA COAGRO"), null);
});
test("known problems exclude external clients and out-of-scope links", () => {
  const tickets = new Set([123]); const tasks = new Set([45]);
  assert.equal(knownProblemBelongsToScope({ client: "COAP", movideskTicket: "123", azureWorkItem: "45" }, tickets, tasks), true);
  assert.equal(knownProblemBelongsToScope({ client: "OUTRO CLIENTE" }, tickets, tasks), false);
  assert.equal(knownProblemBelongsToScope({ client: "COAP", movideskTicket: "999" }, tickets, tasks), false);
  assert.equal(knownProblemBelongsToScope({ azureWorkItem: "999" }, tickets, tasks), false);
  assert.equal(knownProblemBelongsToScope({}, tickets, tasks), true);
});

test("direct Azure detail does not return an external client or creator", async () => {
  const { prisma } = await import("../src/database/prisma");
  const { AzureWorkItemService } = await import("../src/services/AzureWorkItemService");
  const original = prisma.azureWorkItem.findFirst;
  let record: Record<string, unknown> = { ...task, id: 123, client: "OUTRO CLIENTE" };
  prisma.azureWorkItem.findFirst = (async (args: any) => matches(record, args.where) ? record : null) as typeof original;
  try {
    const service = new AzureWorkItemService();
    assert.equal(await service.getById(123), null);
    record = { ...task, id: 123, createdByName: "OUTRO ANALISTA" };
    assert.equal(await service.getById(123), null);
  } finally {
    prisma.azureWorkItem.findFirst = original;
  }
});

test("direct ticket investigation returns 404 outside the operational portfolio", async () => {
  const { prisma } = await import("../src/database/prisma");
  const { GlobalController } = await import("../src/controllers/GlobalController");
  const original = prisma.ticket.findFirst;
  const record = { ...ticket, movideskId: 123, owner: "OUTRO ANALISTA" };
  prisma.ticket.findFirst = (async (args: any) => matches(record, args.where) ? record : null) as typeof original;
  let status = 200;
  const response = { status(code: number) { status = code; return this; }, json() { return this; } };
  try {
    await new GlobalController().investigate({ query: { q: "123" } } as any, response as any);
    assert.equal(status, 404);
  } finally {
    prisma.ticket.findFirst = original;
  }
});
