import { MessageBubble } from "./MessageBubble";
import { prepareMessagePresentation } from "./messagePresentation";
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
    <div role="log" aria-label="Histórico de mensagens" aria-live="off" style={{ maxWidth: 1120, margin: "0 auto", width: "100%" }}>
      {prepareMessagePresentation(visibleMessages, messages, currentUserId, currentUsername).map(({ message, parent, mine, messageDay, showDay, sameAuthor, mentioned }) => {
        return <MessageBubble key={message.id} message={message} parent={parent} mine={mine} messageDay={messageDay} showDay={showDay} sameAuthor={sameAuthor} mentioned={mentioned} pinned={pinnedIds.has(message.id)} onTogglePinned={onTogglePinned} onReply={onReply} onOpenRecord={onOpenRecord} />;
      })}
    </div>
  );
}
