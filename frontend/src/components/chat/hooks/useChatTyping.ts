import { useCallback, useEffect, useRef } from "react";
import { api } from "../../../services/api";

/** Throttles typing activity and stops it when the user changes conversations. */
export function useChatTyping(channelId: number | null) {
  const lastSent = useRef<{ channelId: number; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeChannel = useRef<number | null>(null);

  const sendTyping = useCallback((id: number, active: boolean) => {
    void api.post(`/chat/channels/${id}/typing`, { active }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const previous = activeChannel.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (previous && previous !== channelId) sendTyping(previous, false);
    activeChannel.current = channelId;
    lastSent.current = null;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (channelId) sendTyping(channelId, false);
    };
  }, [channelId, sendTyping]);

  const notifyTyping = useCallback((value: string) => {
    if (!channelId) return;
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) {
      sendTyping(channelId, false);
      lastSent.current = null;
      return;
    }
    const now = Date.now();
    if (lastSent.current?.channelId !== channelId || now - lastSent.current.at > 2500) {
      lastSent.current = { channelId, at: now };
      sendTyping(channelId, true);
    }
    timer.current = setTimeout(() => {
      sendTyping(channelId, false);
      lastSent.current = null;
      timer.current = null;
    }, 1200);
  }, [channelId, sendTyping]);

  return notifyTyping;
}
