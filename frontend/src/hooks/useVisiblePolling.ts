import { useEffect, useRef } from "react";

/** Polls only while the page is visible and refreshes promptly when it regains focus. */
export function useVisiblePolling(refresh: () => void | Promise<void>, intervalMs: number) {
  const refreshRef = useRef(refresh);
  const lastRunRef = useRef(0);

  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    let running = false;
    const run = (force = false) => {
      if (document.visibilityState !== "visible" || running) return;
      const now = Date.now();
      if (now - lastRunRef.current < (force ? 3_000 : intervalMs - 1_000)) return;
      lastRunRef.current = now;
      running = true;
      Promise.resolve(refreshRef.current()).catch(() => undefined).finally(() => { running = false; });
    };
    const onVisibility = () => { if (document.visibilityState === "visible") run(true); };
    const onFocus = () => run(true);
    const timer = window.setInterval(() => run(), intervalMs);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs]);
}
