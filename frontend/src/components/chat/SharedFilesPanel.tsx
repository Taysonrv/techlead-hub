import { useState } from "react";
import { ExpandLessRounded, ExpandMoreRounded, ImageOutlined, InsertDriveFileOutlined, MovieOutlined } from "@mui/icons-material";
import { Box, Chip, Collapse, Divider, IconButton, Stack, Typography } from "@mui/material";
import { AttachmentChip } from "./AttachmentChip";
import type { Message } from "./chatTypes";

type Props = { channelId: number; messages: Message[] };

type SectionKey = "images" | "videos" | "files";

/** Lists only attachments from messages already authorized and loaded for this channel. */
export function SharedFilesPanel({ channelId, messages }: Props) {
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({ images: true, videos: true, files: true });
  const [showAll, setShowAll] = useState<Record<SectionKey, boolean>>({ images: false, videos: false, files: false });
  const attachments = messages.filter((message) => message.channelId === channelId && message.kind === "ATTACHMENT" && Boolean(message.attachment));
  const newestFirst = [...attachments].sort((a, b) => b.id - a.id);
  const sections = [
    { key: "images" as const, title: "Imagens", icon: <ImageOutlined fontSize="small" />, items: newestFirst.filter((message) => message.attachment?.mimeType.startsWith("image/")) },
    { key: "videos" as const, title: "Vídeos", icon: <MovieOutlined fontSize="small" />, items: newestFirst.filter((message) => message.attachment?.mimeType.startsWith("video/")) },
    { key: "files" as const, title: "Arquivos", icon: <InsertDriveFileOutlined fontSize="small" />, items: newestFirst.filter((message) => !message.attachment?.mimeType.startsWith("image/") && !message.attachment?.mimeType.startsWith("video/")) },
  ];
  const total = attachments.length;

  return (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Box>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: .25 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>Compartilhados</Typography>
          <Chip size="small" label={total} sx={{ height: 22, fontWeight: 700 }} />
        </Stack>
        <Typography variant="caption" color="text.secondary">Arquivos do histórico carregado nesta conversa</Typography>
      </Box>
      {sections.map((section) => {
        const isOpen = expanded[section.key];
        const visible = showAll[section.key] ? section.items : section.items.slice(0, 5);
        return (
          <Box key={section.key}>
            <Box sx={{ display: "flex", alignItems: "center", gap: .75, py: .5 }}>
              <Box sx={{ color: "text.secondary", display: "flex" }}>{section.icon}</Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 750, flex: 1 }}>{section.title}</Typography>
              <Typography variant="caption" color="text.secondary">{section.items.length}</Typography>
              <IconButton size="small" aria-label={`${isOpen ? "Recolher" : "Expandir"} ${section.title.toLowerCase()}`}
                aria-expanded={isOpen} onClick={() => setExpanded((current) => ({ ...current, [section.key]: !current[section.key] }))}>
                {isOpen ? <ExpandLessRounded fontSize="small" /> : <ExpandMoreRounded fontSize="small" />}
              </IconButton>
            </Box>
            <Collapse in={isOpen}>
              {section.items.length ? <Stack spacing={.75} sx={{ pb: 1 }}>
                {visible.map((message) => (
                  <Box key={message.id} sx={{ minWidth: 0, borderRadius: 2, bgcolor: "action.hover", p: .65, "& a": { width: "100%", minWidth: 0, maxWidth: "100%" } }}>
                    {message.attachment && <AttachmentChip attachment={{ ...message.attachment, href: "" }} channelId={channelId} messageId={message.id} />}
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: .75, pt: .5 }}>
                      {new Date(message.createdAt).toLocaleDateString("pt-BR")}
                    </Typography>
                  </Box>
                ))}
                {section.items.length > 5 && <Box component="button" type="button" onClick={() => setShowAll((current) => ({ ...current, [section.key]: !current[section.key] }))}
                  sx={{ alignSelf: "flex-start", border: 0, bgcolor: "transparent", color: "primary.main", cursor: "pointer", fontSize: ".75rem", fontWeight: 750, py: .5 }}>
                  {showAll[section.key] ? "Mostrar menos" : `Ver todos (${section.items.length})`}
                </Box>}
              </Stack> : <Typography variant="caption" color="text.secondary" sx={{ display: "block", pb: 1 }}>
                Nenhum {section.key === "files" ? "arquivo" : section.key === "images" ? "imagem" : "vídeo"} nas mensagens carregadas.
              </Typography>}
            </Collapse>
            <Divider />
          </Box>
        );
      })}
    </Stack>
  );
}
