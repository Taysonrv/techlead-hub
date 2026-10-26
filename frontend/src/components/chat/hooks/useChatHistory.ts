import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { api } from "../../../services/api";
import type { Message } from "../chatTypes";

type Options = {
  selectedId: number | null;
  messagesRef: RefObject<HTMLDivElement | null>;
  markRead: (channelId: number) => void;
  setError: (error: string) => void;
};

export function mergeRecentMessages(current: Message[], recent: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of recent) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function prependOlderMessages(current: Message[], older: Message[]): Message[] {
  return mergeRecentMessages(current, older);
}

/** Owns history requests, pagination, scroll restoration and active-channel race guards. */
export function useChatHistory({ selectedId, messagesRef, markRead, setError }: Options) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const olderCursor = useRef<number | null>(null);
  const initialRequest = useRef<AbortController | null>(null);
  const quietRequest = useRef<AbortController | null>(null);
  const olderRequest = useRef<AbortController | null>(null);
  const restoreScroll = useRef<{ channelId: number; height: number; top: number } | null>(null);
  const skipNextAutoScroll = useRef(false);
  const activeId = useRef(selectedId);
  activeId.current = selectedId;

  const loadMessages = useCallback(async (channelId: number, quiet = false) => {
    const request = quiet ? quietRequest : initialRequest;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      if (!quiet) setLoading(true);
      const response = await api.get<{ messages: Message[] }>(`/chat/channels/${channelId}/messages`, { signal: controller.signal });
      if (controller.signal.aborted || activeId.current !== channelId) return;
      if (quiet) {
        setMessages((current) => mergeRecentMessages(current, response.data.messages));
      } else {
        setMessages(response.data.messages);
        olderCursor.current = response.data.messages[0]?.id ?? null;
        setHasOlder(response.data.messages.length === 100);
        const container = messagesRef.current;
        if (!container || container.scrollHeight - container.scrollTop - container.clientHeight < 160) markRead(channelId);
      }
      setError("");
    } catch (error: unknown) {
      if (!controller.signal.aborted && !quiet) {
        const failure = error as { response?: { data?: { error?: string } } };
        setError(failure.response?.data?.error || "Não foi possível carregar a conversa.");
      }
    } finally {
      if (!quiet && !controller.signal.aborted) setLoading(false);
    }
  }, [markRead, messagesRef, setError]);

  useEffect(() => {
    initialRequest.current?.abort();
    quietRequest.current?.abort();
    olderRequest.current?.abort();
    olderCursor.current = null;
    restoreScroll.current = null;
    skipNextAutoScroll.current = false;
    setMessages([]);
    setHasOlder(false);
    setLoadingOlder(false);
    setShowJumpToLatest(false);
    if (selectedId) void loadMessages(selectedId);
    else setLoading(false);
    const initial = initialRequest.current;
    const quiet = quietRequest.current;
    const older = olderRequest.current;
    return () => {
      initial?.abort();
      quiet?.abort();
      older?.abort();
    };
  }, [selectedId, loadMessages]);

  const loadOlder = useCallback(async () => {
    const channelId = activeId.current;
    const beforeId = olderCursor.current;
    if (!channelId || !beforeId || olderRequest.current) return;
    const controller = new AbortController();
    olderRequest.current = controller;
    setLoadingOlder(true);
    const element = messagesRef.current;
    const position = element ? { channelId, height: element.scrollHeight, top: element.scrollTop } : null;
    try {
      const response = await api.get<{ messages: Message[] }>(`/chat/channels/${channelId}/messages`, { params: { beforeId }, signal: controller.signal });
      if (controller.signal.aborted || activeId.current !== channelId) return;
      const older = response.data.messages;
      setHasOlder(older.length === 100);
      if (older.length) {
        olderCursor.current = older[0].id;
        const additions = older.filter((message) => message.id < beforeId);
        if (additions.length) {
          restoreScroll.current = position;
          skipNextAutoScroll.current = true;
          setMessages((current) => prependOlderMessages(current, additions));
        }
      }
    } catch {
      if (!controller.signal.aborted && activeId.current === channelId) setError("Não foi possível carregar o histórico anterior.");
    } finally {
      if (olderRequest.current === controller) olderRequest.current = null;
      if (activeId.current === channelId) setLoadingOlder(false);
    }
  }, [messagesRef, setError]);

  useLayoutEffect(() => {
    const position = restoreScroll.current;
    const element = messagesRef.current;
    if (!position || !element || position.channelId !== selectedId) return;
    element.scrollTop = position.top + element.scrollHeight - position.height;
    restoreScroll.current = null;
  }, [messages, messagesRef, selectedId]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 140;
    if (skipNextAutoScroll.current) { skipNextAutoScroll.current = false; return; }
    if (!restoreScroll.current && (nearBottom || !showJumpToLatest)) {
      container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
      setShowJumpToLatest(false);
    }
  }, [messages, messagesRef, selectedId, showJumpToLatest]);

  const handleMessagesScroll = useCallback((search: string) => {
    const container = messagesRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowJumpToLatest(distance > 180);
    if (container.scrollTop < 120 && hasOlder && !loadingOlder && !search.trim()) void loadOlder();
    if (distance < 140 && activeId.current) markRead(activeId.current);
  }, [hasOlder, loadingOlder, loadOlder, markRead, messagesRef]);

  const jumpToLatest = useCallback(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    setShowJumpToLatest(false);
  }, [messagesRef]);

  return { messages, setMessages, loading, hasOlder, loadingOlder, showJumpToLatest, setShowJumpToLatest, loadMessages, loadOlder, handleMessagesScroll, jumpToLatest };
}
