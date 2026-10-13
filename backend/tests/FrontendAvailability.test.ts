import assert from "node:assert/strict";
import test from "node:test";
import { BackendAvailability } from "../../frontend/src/services/backendAvailability";
import { isSameSession } from "../../frontend/src/services/sessionToken";

test("canceled requests do not probe or announce a backend outage", async () => {
  let probes = 0;
  const changes: boolean[] = [];
  const monitor = new BackendAvailability(async () => { probes++; return false; }, (down) => changes.push(down));
  await monitor.reportFailure({ canceled: true });
  assert.equal(probes, 0);
  assert.equal(monitor.isUnavailable(), false);
  assert.deepEqual(changes, []);
});

test("an isolated timeout or 503 does not imply an outage when health responds", async () => {
  let probes = 0;
  const changes: boolean[] = [];
  const monitor = new BackendAvailability(async () => { probes++; return true; }, (down) => changes.push(down));
  await monitor.reportFailure({});
  await monitor.reportFailure({ status: 503 });
  assert.equal(probes, 2);
  assert.deepEqual(changes, []);
  assert.equal(monitor.isUnavailable(), false);
});

test("simultaneous connectivity failures share one health check", async () => {
  let probes = 0;
  let complete!: (healthy: boolean) => void;
  const monitor = new BackendAvailability(() => {
    probes++;
    return new Promise<boolean>((resolve) => { complete = resolve; });
  }, () => undefined);
  const first = monitor.reportFailure({});
  assert.equal(first, monitor.reportFailure({ status: 502 }));
  await Promise.resolve();
  complete(true);
  await first;
  assert.equal(probes, 1);
});

test("a confirmed outage automatically retries and clears when health recovers", async () => {
  let healthy = false;
  let retry: (() => void) | null = null;
  const changes: boolean[] = [];
  const monitor = new BackendAvailability(async () => healthy, (down) => changes.push(down), (callback) => {
    retry = () => { retry = null; callback(); };
    return () => { retry = null; };
  });
  await monitor.reportFailure({ status: 504 });
  assert.equal(monitor.isUnavailable(), true);
  assert.equal(typeof retry, "function");
  healthy = true;
  retry!();
  await monitor.check();
  assert.equal(monitor.isUnavailable(), false);
  assert.equal(retry, null);
  assert.deepEqual(changes, [true, false]);
});

test("a late failed health check cannot override a successful API response", async () => {
  let complete!: (healthy: boolean) => void;
  const changes: boolean[] = [];
  const monitor = new BackendAvailability(() => new Promise<boolean>((resolve) => { complete = resolve; }), (down) => changes.push(down));
  const pending = monitor.reportFailure({});
  await Promise.resolve();
  monitor.reportSuccess();
  complete(false);
  await pending;
  assert.equal(monitor.isUnavailable(), false);
  assert.deepEqual(changes, []);
});

test("a reachable API response clears an outage and its recovery timer", async () => {
  let canceled = false;
  const monitor = new BackendAvailability(async () => false, () => undefined, () => () => { canceled = true; });
  await monitor.reportFailure({});
  await monitor.reportFailure({ status: 403 });
  assert.equal(monitor.isUnavailable(), false);
  assert.equal(canceled, true);
});

function token(claims: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}

test("token rotation within the same user, session and role keeps the snapshot", () => {
  const before = token({ sub: "1", sid: "session-a", role: "ANALISTA", exp: 100 });
  const after = token({ sub: "1", sid: "session-a", role: "ANALISTA", exp: 200 });
  assert.equal(isSameSession(before, after), true);
});

test("a different user, login session or role requires invalidation", () => {
  const before = token({ sub: "1", sid: "session-a", role: "ANALISTA" });
  for (const claims of [
    { sub: "2", sid: "session-a", role: "ANALISTA" },
    { sub: "1", sid: "session-b", role: "ANALISTA" },
    { sub: "1", sid: "session-a", role: "ADMIN" },
  ]) assert.equal(isSameSession(before, token(claims)), false);
});

test("missing or malformed session claims never bypass invalidation", () => {
  const valid = token({ sub: "1", sid: "session-a", role: "ANALISTA" });
  for (const value of [null, "invalid", token({ sub: "1" }), token({ sub: 1, sid: "session-a", role: "ANALISTA" })]) {
    assert.equal(isSameSession(value, valid), false);
  }
  assert.equal(isSameSession(valid, "invalid"), false);
});
