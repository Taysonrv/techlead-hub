import type { Message } from "./chatTypes";

export type MessagePresentation = {
  message: Message;
  parent: Message | null;
  mine: boolean;
  messageDay: string;
  showDay: boolean;
  sameAuthor: boolean;
  mentioned: boolean;
};

/** One-pass presentation preparation; avoids scanning the history for every reply. */
export function prepareMessagePresentation(
  visibleMessages: Message[],
  messages: Message[],
  currentUserId?: number,
  currentUsername?: string,
): MessagePresentation[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const mention = currentUsername?.trim().toLocaleLowerCase("pt-BR");
  return visibleMessages.map((message, index) => {
    const previous = visibleMessages[index - 1];
    const messageDay = new Date(message.createdAt).toLocaleDateString("pt-BR");
    const previousDay = previous ? new Date(previous.createdAt).toLocaleDateString("pt-BR") : null;
    const showDay = messageDay !== previousDay;
    const elapsed = previous ? new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() : -1;
    return {
      message,
      parent: message.parentId ? byId.get(message.parentId) ?? null : null,
      mine: message.author.id === currentUserId,
      messageDay,
      showDay,
      sameAuthor: !showDay && previous?.author.id === message.author.id && elapsed >= 0 && elapsed < 5 * 60_000,
      mentioned: Boolean(mention && message.content.toLocaleLowerCase("pt-BR").includes(`@${mention}`)),
    };
  });
}
