import { useMemo } from "react";
import type { Message } from "../chatTypes";

export function useMessageView(messages: Message[], messageSearch: string) {
  const pinState = useMemo(() => {
    const ids = new Set<number>();
    messages.forEach((message) => {
      if (message.content.startsWith("[chat-pin]")) ids.add(Number(message.content.slice(10)));
      if (message.content.startsWith("[chat-unpin]")) ids.delete(Number(message.content.slice(12)));
    });
    return ids;
  }, [messages]);

  const visibleMessages = useMemo(() => messages.filter((message) =>
    !message.content.startsWith("[chat-pin]") &&
    !message.content.startsWith("[chat-unpin]") &&
    (!messageSearch.trim() || message.content.toLowerCase().includes(messageSearch.toLowerCase()))
  ), [messages, messageSearch]);

  const pinnedMessages = useMemo(() => visibleMessages.filter((message) => pinState.has(message.id)).slice(-4).reverse(), [visibleMessages, pinState]);
  const coordinationHighlights = useMemo(() => visibleMessages.filter((message) =>
    /PRIORIDADE DO TIME|ALINHAMENTO \/ DECISÃO|ESCALONAMENTO PARA COORDENAÇÃO/.test(message.content)
  ).slice(-5).reverse(), [visibleMessages]);
  const channelPendencies = useMemo(() => visibleMessages.filter((message) =>
    /PRIORIDADE DO TIME|ESCALONAMENTO PARA COORDENAÇÃO|PASSAGEM DE TURNO/.test(message.content)
  ).slice(-4).reverse(), [visibleMessages]);

  return { pinState, visibleMessages, pinnedMessages, coordinationHighlights, channelPendencies };
}
