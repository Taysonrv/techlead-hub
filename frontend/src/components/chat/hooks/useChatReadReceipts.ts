import { useCallback, useEffect, useRef } from "react";
import { api } from "../../../services/api";

type Options = {
  selectedId: number | null;
  onRead: (channelId: number) => void;
};

/** Deduplicate read receipts while the user remains at the bottom of a conversation. */
export function useChatReadReceipts({ selectedId, onRead }: Options) {
  const current = useRef({ selectedId, onRead });
  current.current = { selectedId, onRead };
  const lastRead = useRef<{ channelId: number; at: number } | null>(null);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    lastRead.current = null;
    pending.current = null;
  }, [selectedId]);

  const markRead = useCallback((channelId: number) => {
    if (document.visibilityState !== "visible" || current.current.selectedId !== channelId) return;
    const now = Date.now();
    if (pending.current === channelId) return;
    if (lastRead.current?.channelId === channelId && now - lastRead.current.at < 5000) return;
    pending.current = channelId;
    void api.post(`/chat/channels/${channelId}/read`).then(() => {
      if (current.current.selectedId !== channelId) return;
      lastRead.current = { channelId, at: Date.now() };
      current.current.onRead(channelId);
    }).catch(() => undefined).finally(() => {
      if (pending.current === channelId) pending.current = null;
    });
  }, []);

  return markRead;
}
