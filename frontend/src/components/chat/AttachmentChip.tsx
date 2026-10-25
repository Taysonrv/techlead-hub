import { AttachFileRounded, DownloadRounded } from "@mui/icons-material";
import { Box, Paper, Typography } from "@mui/material";

export type LegacyAttachment = { name: string; mimeType: string; size: number; href: string };

export function parseLegacyAttachment(content: string): LegacyAttachment | null {
  if (!content.startsWith("[anexo] ")) return null;
  const parts = content.slice(8).split("|");
  if (parts.length < 4) return null;
  const [name, mimeType, size, ...base64] = parts;
  const parsedSize = Number(size);
  if (!name || !mimeType || !Number.isFinite(parsedSize) || parsedSize < 0 || !base64.length) return null;
  return { name, mimeType, size: parsedSize, href: `data:${mimeType};base64,${base64.join("|")}` };
}

export function AttachmentChip({ attachment }: { attachment: LegacyAttachment }) {
  return (
    <Paper component="a" href={attachment.href} download={attachment.name} elevation={0}
      aria-label={`Baixar anexo ${attachment.name}`}
      sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, minWidth: 210, maxWidth: 340, textDecoration: "none", color: "inherit", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <Box sx={{ width: 34, height: 34, borderRadius: 1.5, display: "grid", placeItems: "center", bgcolor: "action.hover" }}><AttachFileRounded fontSize="small" /></Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 800 }} noWrap>{attachment.name}</Typography>
        <Typography variant="caption" color="text.secondary">{Math.max(1, Math.round(attachment.size / 1024))} KB</Typography>
      </Box>
      <DownloadRounded fontSize="small" />
    </Paper>
  );
}
