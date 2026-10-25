import { Avatar, Box, Chip, Divider, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
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

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "?";
}

export function MessageBubble({ message, parent, mine, showDay, messageDay, sameAuthor, mentioned, pinned, onTogglePinned, onReply, onOpenRecord }: Props) {
  const renderContent = (value: string) => value.split(/(@[\w.-]+)/g).map((part, index) => part.startsWith("@") ? <Box component="span" key={index} sx={{ fontWeight: 800, color: "primary.main" }}>{part}</Box> : part);
  const attachment = parseLegacyAttachment(message.content);
  const storedAttachment = message.kind === "ATTACHMENT" && message.attachment ? { ...message.attachment, href: "" } : null;
  const time = new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <Box>
      {showDay && <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", my: 2.5, mx: { xs: 1, md: 3 } }}>
        <Divider sx={{ flex: 1 }} />
        <Chip size="small" label={messageDay === new Date().toLocaleDateString("pt-BR") ? "Hoje" : messageDay} sx={{ height: 25, fontSize: ".72rem", bgcolor: "action.hover", fontWeight: 700 }} />
        <Divider sx={{ flex: 1 }} />
      </Stack>}
      <Box sx={{ display: "flex", flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-start", gap: 1.1, mt: sameAuthor ? .2 : 1.4, mb: .3 }}>
        <Box sx={{ width: { xs: 32, sm: 38 }, flexShrink: 0, display: "flex", justifyContent: "center" }}>
          {!sameAuthor && <Avatar aria-label={message.author.name} sx={{ width: { xs: 30, sm: 36 }, height: { xs: 30, sm: 36 }, fontSize: ".72rem", fontWeight: 800, bgcolor: mine ? "primary.main" : "action.selected", color: mine ? "primary.contrastText" : "text.primary" }}>{initials(message.author.name)}</Avatar>}
        </Box>
        <Box sx={{ maxWidth: { xs: "calc(100% - 50px)", sm: "78%", md: "72%", xl: "66%" }, minWidth: 0, display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
          {!sameAuthor && <Stack direction="row" spacing={.8} sx={{ alignItems: "baseline", px: .65, mb: .35, maxWidth: "100%" }}>
            <Typography variant="caption" noWrap sx={{ fontWeight: 850, color: "text.primary" }}>{mine ? "Você" : message.author.name}</Typography>
            <Typography variant="caption" color="text.disabled">{time}</Typography>
          </Stack>}
          <Paper elevation={0} sx={{
            width: "fit-content", maxWidth: "100%", minWidth: 0,
            px: 1.5, py: .95,
            bgcolor: mine ? "action.selected" : mentioned ? "warning.light" : "background.default",
            color: "text.primary",
            border: "1px solid",
            borderColor: mentioned ? "warning.main" : "transparent",
            borderRadius: mine ? "16px 5px 16px 16px" : "5px 16px 16px 16px",
            boxShadow: "none",
            transition: (theme) => theme.transitions.create(["background-color", "border-color"], { duration: theme.transitions.duration.shorter }),
            "&:hover": { bgcolor: mine ? "action.selected" : "action.hover" },
            "& .message-actions": { opacity: { xs: 1, md: 0 }, transition: "opacity .15s" },
            "&:hover .message-actions, &:focus-within .message-actions": { opacity: 1 },
          }}>
            {parent && <Box sx={{ px: 1, py: .65, mb: .7, borderLeft: "3px solid", borderColor: "primary.main", bgcolor: "action.hover", borderRadius: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 800 }}>{parent.author.name}</Typography>
              <Typography variant="caption" noWrap sx={{ display: "block", maxWidth: 420 }}>{parent.content}</Typography>
            </Box>}
            {message.content.startsWith("[hub-card]") ? <SharedRecordCard content={message.content} onOpen={onOpenRecord} /> : storedAttachment ? <AttachmentChip attachment={storedAttachment} channelId={message.channelId} messageId={message.id} /> : attachment ? <AttachmentChip attachment={attachment} /> : <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.65 }}>{renderContent(message.content)}</Typography>}
            <Stack direction="row" spacing={.25} sx={{ alignItems: "center", justifyContent: "flex-end", mt: .35 }}>
              {sameAuthor && <Typography variant="caption" color="text.disabled" sx={{ fontSize: ".65rem", mr: .5 }}>{time}</Typography>}
              <Stack className="message-actions" direction="row" spacing={.1}>
                <Tooltip title={pinned ? "Desafixar mensagem" : "Fixar mensagem"}><IconButton size="small" aria-label={pinned ? "Desafixar mensagem" : "Fixar mensagem"} onClick={() => onTogglePinned(message.id)} sx={{ color: pinned ? "primary.main" : "text.secondary", p: .4 }}><PushPinOutlined sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                <Tooltip title="Responder"><IconButton size="small" aria-label="Responder à mensagem" onClick={() => onReply(message)} sx={{ color: "text.secondary", p: .4 }}><ReplyOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip>
              </Stack>
            </Stack>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
