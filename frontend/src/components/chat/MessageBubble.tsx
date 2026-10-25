import { Box, Chip, Divider, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { PushPinOutlined, ReplyOutlined } from "@mui/icons-material";
import { AttachmentChip } from "./AttachmentChip";
import { parseLegacyAttachment } from "./legacyAttachment";
import { SharedRecordCard } from "./SharedRecordCard";
import type { SharedRecord } from "./SharedRecordCard";
import type { Message } from "./chatTypes";

type Props = {
  message: Message;
  parent: Message | null | undefined;
  mine: boolean;
  showDay: boolean;
  messageDay: string;
  sameAuthor: boolean;
  mentioned: boolean;
  pinned: boolean;
  onTogglePinned: (id: number) => void;
  onReply: (message: Message) => void;
  onOpenRecord: (record: SharedRecord) => void;
};

export function MessageBubble({ message, parent, mine, showDay, messageDay, sameAuthor, mentioned, pinned, onTogglePinned, onReply, onOpenRecord }: Props) {
  const renderContent = (value: string) => value.split(/(@[\\w.-]+)/g).map((part, index) => part.startsWith("@") ? <Box component="span" key={index} sx={{ fontWeight: 900, textDecoration: "underline" }}>{part}</Box> : part);
  const attachment = parseLegacyAttachment(message.content);
  const storedAttachment = message.kind === "ATTACHMENT" && message.attachment ? { ...message.attachment, href: "" } : null;
  return (
<Box key={message.id}>{showDay && <Stack direction="row" spacing={1} sx={{ alignItems: "center", my: 1.4 }}><Divider sx={{ flex: 1 }} /><Chip size="small" variant="outlined" label={messageDay === new Date().toLocaleDateString("pt-BR") ? "Hoje" : messageDay} sx={{ height: 22, fontSize: ".68rem", color: "text.secondary" }} /><Divider sx={{ flex: 1 }} /></Stack>}<Box sx={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", mb: sameAuthor ? .2 : .85, mt: sameAuthor ? 0 : .4 }}><Paper elevation={0} sx={{
  maxWidth: { xs: "94%", sm: "82%", md: "72%", xl: "64%" },
  minWidth: 0,
  px: 1.5, py: 1,
  bgcolor: mine ? "action.selected" : mentioned ? "warning.light" : "background.paper",
  color: "text.primary",
  border: "1px solid",
  borderColor: mentioned ? "warning.main" : mine ? "primary.light" : "divider",
  borderRadius: mine ? "16px 16px 5px 16px" : "16px 16px 16px 5px",
  boxShadow: (theme) => theme.shadows[1],
  transition: (theme) => theme.transitions.create(["box-shadow", "border-color"], { duration: theme.transitions.duration.shorter }),
  "&:hover": { boxShadow: (theme) => theme.shadows[3] },
  "& .message-actions": { opacity: { xs: 1, md: 0 }, transition: "opacity .15s" },
  "&:hover .message-actions, &:focus-within .message-actions": { opacity: 1 },
}}><Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}><Typography variant="caption" sx={{ fontWeight: 800, opacity: .8 }}>{sameAuthor ? "" : message.author.name}</Typography><Stack className="message-actions" direction="row" spacing={.15}><Tooltip title={pinned ? "Desafixar mensagem" : "Fixar mensagem"}><IconButton size="small" onClick={() => onTogglePinned(message.id)} aria-label={pinned ? "Desafixar mensagem" : "Fixar mensagem"} sx={{ color: pinned ? "primary.main" : "inherit", opacity: pinned ? 1 : .55 }}><PushPinOutlined sx={{ fontSize: 15 }} /></IconButton></Tooltip><Tooltip title="Responder"><IconButton size="small" onClick={() => onReply(message)} aria-label="Responder à mensagem" sx={{ color: "inherit", opacity: .65 }}><ReplyOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip></Stack></Stack>{parent && <Box sx={{ px: 1, py: .6, mb: .6, borderLeft: "3px solid", borderColor: "primary.main", bgcolor: "action.hover", borderRadius: 1 }}><Typography variant="caption" sx={{ fontWeight: 800 }}>{parent.author.name}</Typography><Typography variant="caption" noWrap sx={{ display: "block", maxWidth: 420 }}>{parent.content}</Typography></Box>}{message.content.startsWith("[hub-card]") ? <SharedRecordCard content={message.content} onOpen={onOpenRecord} /> : storedAttachment ? <AttachmentChip attachment={storedAttachment} channelId={message.channelId} messageId={message.id} /> : attachment ? <AttachmentChip attachment={attachment} /> : <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{renderContent(message.content)}</Typography>}<Typography variant="caption" sx={{ display: "block", textAlign: "right", opacity: .7 }}>{new Date(message.createdAt).toLocaleString("pt-BR")}</Typography></Paper></Box></Box>
  );
}
