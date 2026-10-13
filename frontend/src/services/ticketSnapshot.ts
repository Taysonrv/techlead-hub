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

export function subscribeTicketSnapshotRefresh(refresh: () => void) {
  const visibleRefresh = () => {
    if (document.visibilityState === "visible") refresh();
  };
  const timer = window.setInterval(visibleRefresh, 30_000);
  window.addEventListener("focus", visibleRefresh);
  window.addEventListener("techlead-hub:tickets-changed", visibleRefresh);
  window.addEventListener("techlead-hub:backend-available", visibleRefresh);
  document.addEventListener("visibilitychange", visibleRefresh);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", visibleRefresh);
    window.removeEventListener("techlead-hub:tickets-changed", visibleRefresh);
    window.removeEventListener("techlead-hub:backend-available", visibleRefresh);
    document.removeEventListener("visibilitychange", visibleRefresh);
  };
}
