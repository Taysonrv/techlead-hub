import { AttachFileRounded, BoltOutlined, CelebrationOutlined, EmojiEmotionsOutlined, NotificationsActiveOutlined, SendRounded } from "@mui/icons-material";
import { Box, Button, CircularProgress, IconButton, Stack, TextField, Tooltip } from "@mui/material";
import type { RefObject } from "react";

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

export function Composer({ channelId, channelType, content, sending, uploadingAttachment, soundEnabled, attachmentInputRef, onAttach, onOpenEmoji, onOpenStickers, onOpenQuickActions, onToggleSound, onContentChange, onSend }: Props) {
  return (
        <Stack direction="row" spacing={.55} sx={{ mx: 1, mb: .8, mt: .55, px: .8, py: .55, alignItems: "flex-end", bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(15,32,47,.92)" : "rgba(255,255,255,.96)", border: "1px solid", borderColor: "divider", borderRadius: 3.5, boxShadow: "0 10px 28px rgba(15,23,42,.07)" }}>
          <input ref={attachmentInputRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onAttach(file); }} /><Tooltip title="Anexar arquivo (máx. 8 MB)"><span><IconButton disabled={!channelId || uploadingAttachment} onClick={() => attachmentInputRef.current?.click()}><AttachFileRounded /></IconButton></span></Tooltip><Tooltip title="Emojis"><IconButton onClick={(event) => onOpenEmoji(event.currentTarget)} disabled={!selectedId}><EmojiEmotionsOutlined /></IconButton></Tooltip>
          <Tooltip title="Figurinhas"><IconButton onClick={() => onOpenStickers()} disabled={!selectedId}><CelebrationOutlined /></IconButton></Tooltip>
          {channelType === "TEAM" && <Tooltip title="Ações rápidas da equipe"><IconButton color="primary" onClick={(event) => onOpenQuickActions(event.currentTarget)}><BoltOutlined /></IconButton></Tooltip>}
          <Tooltip title={soundEnabled ? "Desativar som" : "Ativar som"}><IconButton color={soundEnabled ? "primary" : "default"} onClick={onToggleSound}><NotificationsActiveOutlined /></IconButton></Tooltip>
          <TextField size="small" fullWidth multiline maxRows={4} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,.035)" : "#f6f8fa", pr: .5 }, "& fieldset": { borderColor: "transparent" }, "& .Mui-focused fieldset": { borderColor: "primary.main" } }}  value={content} disabled={!selectedId || sending} placeholder="Mensagem · Enter envia, Shift+Enter quebra linha" slotProps={{ htmlInput: { maxLength: 4000 } }} onChange={(event) => onContentChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend(); } }} />
          <Button variant="contained" endIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendRounded />} disabled={!selectedId || !content.trim() || sending} onClick={() => onSend()} sx={{ minWidth: 42, width: 42, height: 38, px: 0, borderRadius: 2.5, boxShadow: "none", "&:hover": { boxShadow: "0 6px 16px rgba(24,199,122,.18)" }, "& .MuiButton-endIcon": { m: 0 } }}><Box component="span" sx={{ display: "none" }}>Enviar</Box></Button>
        </Stack>
  );
}
