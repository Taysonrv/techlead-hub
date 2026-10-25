import { AddCommentOutlined, CleaningServicesOutlined, PersonOutlineRounded } from "@mui/icons-material";
import { Box, Chip, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";

type Props = {
  channelCount: number;
  unreadCount: number;
  canMaintain: boolean;
  maintenanceRunning: boolean;
  onConsolidate: () => void;
  onOpenDirect: () => void;
  onCreateChannel: () => void;
};

export function ConversationListHeader({ channelCount, unreadCount, canMaintain, maintenanceRunning, onConsolidate, onOpenDirect, onCreateChannel }: Props) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 2, pt: 2, pb: 1.25, minHeight: 68 }}>
      <Box sx={{ minWidth: 0, pl: .25 }}>
        <Stack direction="row" spacing={.7} sx={{ alignItems: "center" }}>
          <Typography sx={{ fontWeight: 800, fontSize: "1.13rem", letterSpacing: "-.02em", lineHeight: 1.2 }}>Conversas</Typography>
          {unreadCount > 0 && <Chip size="small" color="primary" label={unreadCount > 99 ? "99+" : unreadCount} sx={{ height: 20, fontWeight: 900 }} />}
        </Stack>
        <Typography variant="caption" color="text.secondary">{channelCount ? `${channelCount} conversas` : "Seu espaço de colaboração"}{unreadCount ? ` · ${unreadCount} não lidas` : ""}</Typography>
      </Box>
      <Stack direction="row">
        {canMaintain && <Tooltip title="Consolidar conversas privadas duplicadas"><span><IconButton size="small" aria-label="Consolidar conversas privadas duplicadas" disabled={maintenanceRunning} onClick={onConsolidate}>{maintenanceRunning ? <CircularProgress size={17} /> : <CleaningServicesOutlined fontSize="small" />}</IconButton></span></Tooltip>}
        <Tooltip title="Conversa privada"><IconButton size="small" aria-label="Iniciar conversa privada" onClick={onOpenDirect}><PersonOutlineRounded /></IconButton></Tooltip>
        <Tooltip title="Novo canal"><IconButton size="small" aria-label="Criar canal" onClick={onCreateChannel}><AddCommentOutlined /></IconButton></Tooltip>
      </Stack>
    </Stack>
  );
}
