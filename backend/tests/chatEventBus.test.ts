import assert from "node:assert/strict";
import test from "node:test";
import { chatEventBus } from "../src/services/ChatEventBus";

test("chat event bus isolates recipients and deduplicates recipient IDs", () => {
  let alice = 0;
  let bob = 0;
  const unsubscribeAlice = chatEventBus.subscribe(901001, () => { alice += 1; });
  const unsubscribeBob = chatEventBus.subscribe(901002, () => { bob += 1; });
  try {
    chatEventBus.publish([901001, 901001]);
    assert.equal(alice, 1);
    assert.equal(bob, 0);
    chatEventBus.publish([901002]);
    assert.equal(alice, 1);
    assert.equal(bob, 1);
  } finally {
    unsubscribeAlice();
    unsubscribeBob();
  }
});

test("chat event bus continues delivery after one listener throws", () => {
  let delivered = 0;
  const unsubscribeFailure = chatEventBus.subscribe(901003, () => { throw new Error("listener failed"); });
  const unsubscribeSuccess = chatEventBus.subscribe(901003, () => { delivered += 1; });
  try {
    assert.doesNotThrow(() => chatEventBus.publish([901003]));
    assert.equal(delivered, 1);
  } finally {
    unsubscribeFailure();
    unsubscribeSuccess();
  }
});

test("chat event bus removes listeners after unsubscribe", () => {
  let delivered = 0;
  const unsubscribe = chatEventBus.subscribe(901004, () => { delivered += 1; });
  unsubscribe();
  chatEventBus.publish([901004]);
  assert.equal(delivered, 0);
});

test("chat event bus safely handles unsubscribe during delivery", () => {
  const calls: string[] = [];
  let unsubscribeSecond = () => {};
  const unsubscribeFirst = chatEventBus.subscribe(901005, () => {
    calls.push("first");
    unsubscribeSecond();
  });
  unsubscribeSecond = chatEventBus.subscribe(901005, () => { calls.push("second"); });
  try {
    chatEventBus.publish([901005]);
    chatEventBus.publish([901005]);
    assert.deepEqual(calls, ["first", "first"]);
  } finally {
    unsubscribeFirst();
    unsubscribeSecond();
  }
});

test("chat event bus does not deliver after final unsubscribe", () => {
  let received = 0;
  const unsubscribe = chatEventBus.subscribe(901006, () => { received += 1; });
  chatEventBus.publish([901006]);
  unsubscribe();
  unsubscribe();
  chatEventBus.publish([901006]);
  assert.equal(received, 1);
});
