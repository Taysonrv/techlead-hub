import assert from "node:assert/strict";
import test from "node:test";
import { SnapshotCache, SnapshotInvalidatedError } from "../../frontend/src/services/snapshotCache";

test("snapshot shares concurrent requests and reloads after TTL", async () => {
  let time = 1_000;
  let calls = 0;
  const cache = new SnapshotCache(async () => [++calls], () => time);
  const first = cache.get();
  assert.equal(first, cache.get());
  assert.deepEqual(await first, [1]);
  assert.deepEqual(await cache.get(), [1]);
  time += 30_000;
  assert.deepEqual(await cache.get(), [2]);
});

test("failed refresh retains recent data with a warning but expires it after five minutes", async () => {
  let time = 1_000;
  let fail = false;
  const cache = new SnapshotCache(async () => {
    if (fail) throw new Error("backend offline");
    return [57];
  }, () => time);
  await cache.get();
  fail = true;
  time += 30_000;
  assert.deepEqual(await cache.get(), [57]);
  assert.equal(cache.state().stale, true);
  assert.equal(cache.state().lastErrorAt, time);
  time += 270_000;
  await assert.rejects(cache.get(), /backend offline/);
});

test("invalidation prevents pending old-session responses from overwriting fresh data", async () => {
  let completeOld!: (rows: number[]) => void;
  let calls = 0;
  const cache = new SnapshotCache(() => ++calls === 1
    ? new Promise<number[]>((resolve) => { completeOld = resolve; })
    : Promise.resolve([99]));
  const old = cache.get();
  const rejection = assert.rejects(old, SnapshotInvalidatedError);
  cache.invalidate();
  assert.deepEqual(await cache.get(), [99]);
  completeOld([57]);
  await rejection;
  assert.deepEqual(await cache.get(), [99]);
});

test("an obsolete request cannot clear a new pending request", async () => {
  let first!: (rows: number[]) => void;
  let second!: (rows: number[]) => void;
  let calls = 0;
  const cache = new SnapshotCache(() => new Promise<number[]>((resolve) => {
    if (++calls === 1) first = resolve;
    else second = resolve;
  }));
  const old = cache.get();
  const rejection = assert.rejects(old, SnapshotInvalidatedError);
  cache.invalidate();
  const fresh = cache.get();
  first([1]);
  await rejection;
  assert.equal(cache.get(), fresh);
  second([2]);
  assert.deepEqual(await fresh, [2]);
});
