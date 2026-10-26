import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.CHAT_INTEGRATION_URL;
const aliceToken = process.env.CHAT_INTEGRATION_TOKEN_A;
const bobToken = process.env.CHAT_INTEGRATION_TOKEN_B;
const aliceChannel = Number(process.env.CHAT_INTEGRATION_CHANNEL_A);
const bobChannel = Number(process.env.CHAT_INTEGRATION_CHANNEL_B);
const ready = Boolean(base && aliceToken && bobToken && Number.isSafeInteger(aliceChannel) && aliceChannel > 0 && Number.isSafeInteger(bobChannel) && bobChannel > 0);

async function request(path: string, token: string) {
  const response = await fetch(new URL(path, base), { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

test("two-user integration: unauthorized context and message access is denied", { skip: !ready }, async () => {
  const [aliceOwn, bobOwn, bobForeign, aliceForeign] = await Promise.all([
    request(`/chat/channels/${aliceChannel}/messages`, aliceToken!),
    request(`/chat/channels/${bobChannel}/messages`, bobToken!),
    request(`/chat/channels/${aliceChannel}/messages`, bobToken!),
    request(`/chat/channels/${bobChannel}/messages`, aliceToken!),
  ]);
  assert.equal(aliceOwn.status, 200);
  assert.equal(bobOwn.status, 200);
  assert.equal(bobForeign.status, 404);
  assert.equal(aliceForeign.status, 404);
});

test("two-user integration: event journal only exposes own delivery changes", { skip: !ready }, async () => {
  const [alice, bob] = await Promise.all([
    request("/chat/events/changes?after=0", aliceToken!),
    request("/chat/events/changes?after=0", bobToken!),
  ]);
  assert.equal(alice.status, 200);
  assert.equal(bob.status, 200);
  assert.equal(Array.isArray(alice.body.changedChannelIds), true);
  assert.equal(Array.isArray(bob.body.changedChannelIds), true);
  assert.equal((alice.body.changedChannelIds as number[]).includes(bobChannel), false);
  assert.equal((bob.body.changedChannelIds as number[]).includes(aliceChannel), false);
});

test("two-user integration: foreign incident context is denied", { skip: !ready }, async () => {
  const [alice, bob] = await Promise.all([
    request(`/chat/channels/${bobChannel}/context`, aliceToken!),
    request(`/chat/channels/${aliceChannel}/context`, bobToken!),
  ]);
  assert.equal(alice.status, 404);
  assert.equal(bob.status, 404);
});
