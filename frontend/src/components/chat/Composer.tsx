import { useState } from "react";
import type { DragEvent, ClipboardEvent, RefObject } from "react";
import { AttachFileRounded, BoltOutlined, CelebrationOutlined, CloseRounded, EmojiEmotionsOutlined, NotificationsActiveOutlined, SendRounded, UploadFileOutlined } from "@mui/icons-material";
import { Box, Button, CircularProgress, IconButton, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";

type Props = {
  channelId: number | null;
  channelType?: string;
  content: string;
  sending: boolean;
  uploadingAttachment: boolean;
  soundEnabled: boolean;
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  onAttach: (file: File) => void;
  onOpenEmoji: (anchor: HTMLElement) => void;
  onOpenStickers: () => void;
  onOpenQuickActions: (anchor: HTMLElement) => void;
  onToggleSound: () => void;
  onContentChange: (value: string) => void;
  onSend: () => void;
};

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/csv", "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export function Composer({ channelId, channelType, content, sending, uploadingAttachment, soundEnabled, attachmentInputRef, onAttach, onOpenEmoji, onOpenStickers, onOpenQuickActions, onToggleSound, onContentChange, onSend }: Props) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");

  function stageFile(file: File) {
    setFileError("");
    if (!channelId) return;
    if (!ALLOWED_MIME.has(file.type)) {
      setFileError("Tipo de arquivo não permitido. Utilize PDF, imagem, texto, CSV, ZIP ou Office.");
      return;
    }
    if (!file.size || file.size > MAX_FILE_SIZE) {
      setFileError("O arquivo deve ter entre 1 byte e 8 MB.");
      return;
    }
    setPendingFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) stageFile(file);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (!channelId || event.clipboardData.files.length === 0) return;
    const file = event.clipboardData.files[0];
    if (file) {
      event.preventDefault();
      stageFile(file);
    }
  }

  return (
    <Box onDragOver={(event) => { if (channelId && event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={handleDrop} onPaste={handlePaste}
      sx={{ position: "relative", px: { xs: 1, md: 1.5 }, pb: 1, pt: .5, bgcolor: "background.paper" }}>
      {dragging && <Box sx={{ position: "absolute", inset: 0, zIndex: 2, bgcolor: "action.hover", border: "2px dashed", borderColor: "primary.main", borderRadius: 2, display: "grid", placeItems: "center", pointerEvents: "none" }}><Typography fontWeight={800}>Solte o arquivo para anexar</Typography></Box>}
      {pendingFile && <Paper variant="outlined" sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.25, py: .75, mb: 1, borderRadius: 2, bgcolor: "action.hover" }}>
        <UploadFileOutlined color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" noWrap fontWeight={700}>{pendingFile.name}</Typography><Typography variant="caption" color="text.secondary">{(pendingFile.size / 1024).toFixed(1)} KB · Pronto para anexar</Typography></Box>
        <Tooltip title="Cancelar anexo"><IconButton size="small" onClick={() => setPendingFile(null)} disabled={uploadingAttachment} aria-label="Cancelar anexo"><CloseRounded fontSize="small" /></IconButton></Tooltip>
        <Button size="small" variant="contained" disabled={uploadingAttachment || !channelId} onClick={() => { onAttach(pendingFile); setPendingFile(null); }} startIcon={uploadingAttachment ? <CircularProgress size={14} /> : <UploadFileOutlined />}>Enviar arquivo</Button>
      </Paper>}
      {fileError && <Typography role="alert" color="error" variant="caption" sx={{ display: "block", mb: .75 }}>{fileError}</Typography>}
      <Stack direction="row" spacing={.5} sx={{ alignItems: "flex-end", p: .65, border: "1px solid", borderColor: "divider", borderRadius: 3, bgcolor: "background.default", "&:focus-within": { borderColor: "primary.main" } }}>
        <input ref={attachmentInputRef} type="file" hidden accept={[...ALLOWED_MIME].join(",")} onChange={(event) => { const file = event.target.files?.[0]; if (file) stageFile(file); event.target.value = ""; }} />
        <Tooltip title="Anexar arquivo (máx. 8 MB)"><span><IconButton aria-label="Anexar arquivo" disabled={!channelId || uploadingAttachment} onClick={() => attachmentInputRef.current?.click()}><AttachFileRounded /></IconButton></span></Tooltip>
        <Box sx={{ display: { xs: "none", sm: "flex" } }}>
          <Tooltip title="Emojis"><span><IconButton aria-label="Emojis" onClick={(event) => onOpenEmoji(event.currentTarget)} disabled={!channelId}><EmojiEmotionsOutlined /></IconButton></span></Tooltip>
          <Tooltip title="Figurinhas"><span><IconButton aria-label="Figurinhas" onClick={onOpenStickers} disabled={!channelId}><CelebrationOutlined /></IconButton></span></Tooltip>
        </Box>
        {channelType === "TEAM" && <Tooltip title="Ações rápidas da equipe"><IconButton aria-label="Ações rápidas da equipe" color="primary" onClick={(event) => onOpenQuickActions(event.currentTarget)}><BoltOutlined /></IconButton></Tooltip>}
        <Tooltip title={soundEnabled ? "Desativar som" : "Ativar som"}><IconButton aria-label={soundEnabled ? "Desativar som" : "Ativar som"} color={soundEnabled ? "primary" : "default"} onClick={onToggleSound}><NotificationsActiveOutlined /></IconButton></Tooltip>
        <TextField size="small" fullWidth multiline maxRows={5} value={content} disabled={!channelId || sending}
          placeholder={channelId ? "Escreva sua mensagem..." : "Selecione uma conversa"}
          slotProps={{ htmlInput: { maxLength: 4000, "aria-label": "Mensagem" } }}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2, bgcolor: "transparent", pr: .5 }, "& fieldset": { borderColor: "transparent" }, "& .Mui-focused fieldset": { borderColor: "transparent" } }}
          onChange={(event) => onContentChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend(); } }} />
        <Button variant="contained" aria-label="Enviar mensagem" disabled={!channelId || !content.trim() || sending} onClick={onSend}
          sx={{ minWidth: 40, width: 40, height: 38, px: 0, borderRadius: 2, boxShadow: "none" }}>
          {sending ? <CircularProgress size={17} color="inherit" /> : <SendRounded fontSize="small" />}
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", sm: "block" }, mt: .5, px: .75 }}>Enter envia · Shift+Enter quebra linha · Arraste ou cole arquivos para anexar</Typography>
    </Box>
  );
}
