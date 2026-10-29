import { api } from "./api";
import { SnapshotCache } from "./snapshotCache";

const cache = new SnapshotCache<unknown>(async () => {
  const response = await api.get<unknown[]>("/dashboard/tickets", { timeout: 60_000 });
  return response.data;
});

/** Shared snapshot, refreshed after imports and isolated from previous sessions. */
export async function getTicketSnapshot<T>(): Promise<T[]> {
  return cache.get() as Promise<T[]>;
}

export function getTicketSnapshotState() { return cache.state(); }

export function invalidateTicketSnapshot() {
  cache.refresh();
  window.dispatchEvent(new Event("techlead-hub:tickets-changed"));
}

window.addEventListener("techlead-hub:session-changed", () => cache.invalidate());

const subscribers = new Set<() => void>();
let refreshTimer: number | null = null;
let listenersInstalled = false;

function notifySubscribers() {
  if (document.visibilityState !== "visible") return;
  // Prime the shared cache before consumers read it, avoiding the previous TTL race.
  void cache.get().catch(() => undefined).finally(() => subscribers.forEach((refresh) => refresh()));
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") notifySubscribers();
}

function installRefreshListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;
  window.addEventListener("focus", notifySubscribers);
  window.addEventListener("techlead-hub:tickets-changed", notifySubscribers);
  window.addEventListener("techlead-hub:backend-available", notifySubscribers);
  document.addEventListener("visibilitychange", onVisibilityChange);
  refreshTimer = window.setInterval(notifySubscribers, 30_000);
}

function removeRefreshListeners() {
  if (!listenersInstalled || subscribers.size) return;
  listenersInstalled = false;
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
  refreshTimer = null;
  window.removeEventListener("focus", notifySubscribers);
  window.removeEventListener("techlead-hub:tickets-changed", notifySubscribers);
  window.removeEventListener("techlead-hub:backend-available", notifySubscribers);
  document.removeEventListener("visibilitychange", onVisibilityChange);
}

export function subscribeTicketSnapshotRefresh(refresh: () => void) {
  subscribers.add(refresh);
  installRefreshListeners();
  return () => {
    subscribers.delete(refresh);
    removeRefreshListeners();
  };
}
