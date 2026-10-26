import { useEffect, useRef } from "react";
import { getAccessToken, getApiBaseUrl } from "../../../services/api";
import type { Presence, RealtimeSnapshot } from "../chatTypes";
import { consumeSseFrames } from "../sseFrames";

type Options = {
  selectedId: number | null;
  onChannelsChanged: () => Promise<unknown>;
  onMessagesChanged: (channelId: number) => Promise<unknown>;
  setPresence: (value: Presence[]) => void;
  setRemoteTyping: (value: RealtimeSnapshot["typing"]) => void;
};

const MAX_RETRY_MS = 30_000;

/** One reconnecting SSE subscription. The latest callbacks are read from refs to avoid
 * reconnecting the stream whenever the selected channel changes. */
export function useChatRealtime({ selectedId, onChannelsChanged, onMessagesChanged, setPresence, setRemoteTyping }: Options) {
  const current = useRef({ selectedId, onChannelsChanged, onMessagesChanged, setPresence, setRemoteTyping });
  current.current = { selectedId, onChannelsChanged, onMessagesChanged, setPresence, setRemoteTyping };
  const lastMessageId = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let retryMs = 1800;
    let retryWake: (() => void) | null = null;
    let lastRefreshAt = Date.now();
    let refreshInFlight = false;
    let connectedOnce = false;
    let refreshQueued = false;
    const refresh = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (refreshInFlight) { refreshQueued = true; return; }
      refreshInFlight = true;
      try {
        await current.current.onChannelsChanged();
        if (current.current.selectedId) await current.current.onMessagesChanged(current.current.selectedId);
        lastRefreshAt = Date.now();
      } catch { /* A próxima verificação tentará novamente. */ }
      finally {
        refreshInFlight = false;
        if (refreshQueued && !stopped) { refreshQueued = false; void refresh(); }
      }
    };
    const fallback = window.setInterval(() => {
      if (Date.now() - lastRefreshAt >= 30_000) void refresh();
    }, 30_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    const wait = (ms: number) => new Promise<void>((resolve) => {
      if (stopped) { resolve(); return; }
      const timer = window.setTimeout(() => { retryWake = null; resolve(); }, ms);
      retryWake = () => { window.clearTimeout(timer); retryWake = null; resolve(); };
    });
    const apply = (snapshot: RealtimeSnapshot) => {
      if (!Array.isArray(snapshot.presence) || !Array.isArray(snapshot.typing)) return;
      const handlers = current.current;
      handlers.setPresence(snapshot.presence);
      handlers.setRemoteTyping(snapshot.typing);
      const latestId = snapshot.latestMessage?.id ?? null;
      if (lastMessageId.current !== null && latestId !== lastMessageId.current) {
        void handlers.onChannelsChanged().catch(() => undefined);
        if (handlers.selectedId) {
          void handlers.onMessagesChanged(handlers.selectedId).catch(() => undefined);
        }
      }
      lastMessageId.current = latestId;
    };
    const connect = async () => {
      while (!stopped) {
        try {
          const token = getAccessToken();
          const url = new URL(`${getApiBaseUrl().replace(/\/$/, "")}/chat/events`, window.location.origin);
          const response = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          });
          if (response.status === 429) {
            const seconds = Number(response.headers.get("Retry-After") ?? 5);
            await wait(Math.min(60_000, Math.max(5, Number.isFinite(seconds) ? seconds : 5) * 1000));
            continue;
          }
          if (!response.ok || !response.body) throw new Error("Stream indisponível");
          retryMs = 1800;
          // A reconexão recupera alterações ocorridas durante a desconexão.
          if (connectedOnce) void refresh();
          connectedOnce = true;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
            const { value, done } = await reader.read();
            if (done) break;
            const decoded = consumeSseFrames(buffer, decoder.decode(value, { stream: true }));
            buffer = decoded.remainder;
            for (const frame of decoded.frames) {
              try { apply(JSON.parse(frame.data) as RealtimeSnapshot); } catch { /* Ignore malformed events without dropping the stream. */ }
            }
          }
        } catch {
          // Reconnect with bounded exponential backoff.
        }
        if (!stopped) {
          await wait(retryMs + Math.floor(Math.random() * Math.min(500, retryMs / 4)));
          retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
        }
      }
    };
    void connect();
    return () => { stopped = true; controller.abort(); retryWake?.(); window.clearInterval(fallback); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
}
