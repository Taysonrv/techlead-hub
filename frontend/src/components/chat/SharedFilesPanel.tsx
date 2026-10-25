import { InsertDriveFileOutlined, ImageOutlined, MovieOutlined } from "@mui/icons-material";
import { Box, Divider, Stack, Typography } from "@mui/material";
import { AttachmentChip } from "./AttachmentChip";
import type { Message } from "./chatTypes";

type Props = { channelId: number; messages: Message[] };

/** Displays only attachments actually loaded from the authorized conversation history. */
export function SharedFilesPanel({ channelId, messages }: Props) {
  const attachments = messages.filter((message) => message.kind === "ATTACHMENT" && message.attachment);
  const images = attachments.filter((message) => message.attachment?.mimeType.startsWith("image/"));
  const videos = attachments.filter((message) => message.attachment?.mimeType.startsWith("video/"));
  const documents = attachments.filter((message) => !message.attachment?.mimeType.startsWith("image/") && !message.attachment?.mimeType.startsWith("video/"));

  const sections = [
    { title: "Imagens", icon: <ImageOutlined fontSize="small" />, items: images },
    { title: "Vídeos", icon: <MovieOutlined fontSize="small" />, items: videos },
    { title: "Arquivos", icon: <InsertDriveFileOutlined fontSize="small" />, items: documents },
  ];

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>Compartilhados</Typography>
        <Typography variant="caption" color="text.secondary">Anexos das mensagens carregadas</Typography>
      </Box>
      {sections.map((section) => (
        <Box key={section.title}>
          <Stack direction="row" spacing={.75} sx={{ alignItems: "center", mb: 1, color: "text.secondary" }}>
            {section.icon}
            <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 750 }}>{section.title}</Typography>
            <Typography variant="caption">{section.items.length}</Typography>
          </Stack>
          {section.items.length ? (
            <Stack spacing={.8}>
              {section.items.slice(-6).reverse().map((message) => (
                <Box key={message.id} sx={{ p: 1, borderRadius: 2, bgcolor: "action.hover", minWidth: 0 }}>
                  {message.attachment && <AttachmentChip attachment={{ ...message.attachment, href: "" }} channelId={channelId} messageId={message.id} />}
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .5 }}>
                    {new Date(message.createdAt).toLocaleDateString("pt-BR")}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : <Typography variant="caption" color="text.secondary">Nenhum item nas mensagens carregadas.</Typography>}
          <Divider sx={{ mt: 1.5 }} />
        </Box>
      ))}
    </Stack>
  );
}
