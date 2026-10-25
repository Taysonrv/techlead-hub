import { api } from "../../services/api";
import { useState } from "react";
import { AttachFileRounded, DownloadRounded } from "@mui/icons-material";
import { Box, Paper, Typography } from "@mui/material";

import type { LegacyAttachment } from "./legacyAttachment";

export function AttachmentChip({ attachment, channelId, messageId }: { attachment: LegacyAttachment; channelId?: number; messageId?: number }) {
  const [downloading, setDownloading] = useState(false);
  const secure = channelId !== undefined && messageId !== undefined;
  async function downloadSecure(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!secure) return;
    event.preventDefault();
    if (downloading) return;
    setDownloading(true);
    try {
      const response = await api.get(`/chat/channels/${channelId}/attachments/${messageId}`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.alert("Não foi possível baixar o anexo.");
    } finally {
      setDownloading(false);
    }
  }
  return (
    <Paper component="a" href={secure ? "#" : attachment.href} download={secure ? undefined : attachment.name} onClick={(event) => { if (secure) void downloadSecure(event); }} elevation={0}
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
