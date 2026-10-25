import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { api } from "../../../services/api";
import type { Message } from "../chatTypes";

type Options = {
  selectedId: number | null;
  content: string;
  replyTo: Message | null;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setContent: (value: string) => void;
  setReplyTo: (message: Message | null) => void;
  setShowJumpToLatest: (value: boolean) => void;
  setError: (message: string) => void;
};

/** Uses server-side idempotency and ignores responses for conversations no longer selected. */
export function useChatSend({ selectedId, content, replyTo, setMessages, setContent, setReplyTo, setShowJumpToLatest, setError }: Options) {
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const send = useCallback(async () => {
    const text = content.trim();
    if (!selectedId || !text || sendingRef.current) return;
    const channelId = selectedId;
    sendingRef.current = true;
    setSending(true);
    try {
      const response = await api.post<Message>(`/chat/channels/${channelId}/messages`, {
        content: text,
        parentId: replyTo?.id ?? null,
        clientMessageId: crypto.randomUUID(),
      });
      if (selectedRef.current !== channelId) return;
      setMessages((current) => current.some((message) => message.id === response.data.id)
        ? current : [...current, response.data]);
      setShowJumpToLatest(false);
      setContent("");
      setReplyTo(null);
      setError("");
    } catch (error: unknown) {
      if (selectedRef.current === channelId) {
        const failure = error as { response?: { data?: { error?: string } } };
        setError(failure.response?.data?.error || "Não foi possível enviar a mensagem.");
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [selectedId, content, replyTo, setMessages, setContent, setReplyTo, setShowJumpToLatest, setError]);
  return { send, sending };
}
