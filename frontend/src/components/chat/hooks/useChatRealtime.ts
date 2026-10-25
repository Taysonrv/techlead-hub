import { useEffect, useRef } from "react";
import { getAccessToken, getApiBaseUrl } from "../../../services/api";
import type { Presence, RealtimeSnapshot } from "../chatTypes";

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
        if (handlers.selectedId && snapshot.latestMessage?.channelId === handlers.selectedId) {
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
          if (lastMessageId.current !== null) {
            void current.current.onChannelsChanged().catch(() => undefined);
            if (current.current.selectedId) void current.current.onMessagesChanged(current.current.selectedId).catch(() => undefined);
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() ?? "";
            for (const block of blocks) {
              const line = block.split("\n").filter((entry) => entry.startsWith("data:")).map((entry) => entry.slice(5).trimStart()).join("\n");
              if (!line) continue;
              try { apply(JSON.parse(line) as RealtimeSnapshot); } catch { /* Ignore malformed events without dropping the stream. */ }
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
    return () => { stopped = true; controller.abort(); retryWake?.(); };
  }, []);
}
