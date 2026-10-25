import assert from "node:assert/strict";
import test from "node:test";
import { chatEventBus } from "../src/services/ChatEventBus";

test("chat events reach only subscribed members and unsubscribe cleanly", () => {
  const calls: string[] = [];
  const stopA = chatEventBus.subscribe(901001, () => calls.push("A"));
  const stopB = chatEventBus.subscribe(901002, () => calls.push("B"));
  chatEventBus.publish([901001, 901001]);
  assert.deepEqual(calls, ["A"]);
  chatEventBus.publish([901002]);
  assert.deepEqual(calls, ["A", "B"]);
  stopA();
  stopB();
  chatEventBus.publish([901001, 901002]);
  assert.deepEqual(calls, ["A", "B"]);
});
