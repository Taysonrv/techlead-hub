import { MessageBubble } from "./MessageBubble";
import type { Message } from "./chatTypes";
import type { SharedRecord } from "./SharedRecordCard";

type Props = {
  visibleMessages: Message[];
  messages: Message[];
  currentUserId?: number;
  currentUsername?: string;
  pinnedIds: ReadonlySet<number>;
  onTogglePinned: (id: number) => void;
  onReply: (message: Message) => void;
  onOpenRecord: (record: SharedRecord) => void;
};

export function MessageList({ visibleMessages, messages, currentUserId, currentUsername, pinnedIds, onTogglePinned, onReply, onOpenRecord }: Props) {
  return (
    <>
      {visibleMessages.map((message, messageIndex) => {
        const mine = message.author.id === currentUserId;
        const messageDay = new Date(message.createdAt).toLocaleDateString("pt-BR");
        const previousDay = messageIndex ? new Date(visibleMessages[messageIndex - 1].createdAt).toLocaleDateString("pt-BR") : null;
        const showDay = messageDay !== previousDay;
        const parent = message.parentId ? messages.find((item) => item.id === message.parentId) : null;
        const previous = visibleMessages[messageIndex - 1];
        const sameAuthor = previous?.author.id === message.author.id && (new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime()) < 5 * 60_000;
        const mentioned = Boolean(currentUsername && message.content.toLowerCase().includes(`@${currentUsername.toLowerCase()}`));
        return <MessageBubble key={message.id} message={message} parent={parent} mine={mine} messageDay={messageDay} showDay={showDay} sameAuthor={sameAuthor} mentioned={mentioned} pinned={pinnedIds.has(message.id)} onTogglePinned={onTogglePinned} onReply={onReply} onOpenRecord={onOpenRecord} />;
      })}
    </>
  );
}
