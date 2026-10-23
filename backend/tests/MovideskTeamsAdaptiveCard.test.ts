import assert from "node:assert/strict";
import test from "node:test";

import { buildMovideskAdaptiveCard } from "../src/services/MovideskTeamsAdaptiveCard";

const ticket = {
  movideskId: 123456,
  subject: "AGRIQ — receita não transmitida",
  client: "Cooperativa Exemplo",
  createdDate: "2026-10-22T13:30:00.000Z",
  urgency: "Alta",
  status: "Novo",
  owner: "Equipe Suporte",
};

test("builds a direct Adaptive Card body with requested ticket fields", () => {
  const card = buildMovideskAdaptiveCard(ticket, "https://techhub.example.com");
  assert.equal(card.type, "AdaptiveCard");
  assert.equal(card.version, "1.4");
  const serialized = JSON.stringify(card);
  for (const expected of ["123456", ticket.subject, ticket.client!, "Alta", "Novo", ticket.owner!]) {
    assert.ok(serialized.includes(expected));
  }
  assert.ok(serialized.includes("https://techhub.example.com/Ticket/Edit/123456"));
});

test("rejects non-HTTPS or malformed ticket base URLs", () => {
  assert.throws(() => buildMovideskAdaptiveCard(ticket, "http://example.com/tickets"));
  assert.throws(() => buildMovideskAdaptiveCard(ticket, "not a url"));
});

test("does not allow invalid ticket IDs", () => {
  assert.throws(() => buildMovideskAdaptiveCard({ ...ticket, movideskId: -1 }, "https://example.com/tickets"));
});
