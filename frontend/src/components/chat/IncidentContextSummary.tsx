import { Button, Chip, Divider, Stack, Typography } from "@mui/material";
import type { Channel } from "./chatTypes";

type Props = {
  channel: Channel;
  onOpenActions: () => void;
  onSearchHistory: () => void;
};

/** Context metadata only: live ticket data must be loaded through authorized backend routes. */
export function IncidentContextSummary({ channel, onOpenActions, onSearchHistory }: Props) {
  return (
    <Stack spacing={1.2}>
      <Chip size="small" color="primary" label={channel.contextType === "TICKET" ? "Atendimento Movidesk" : "Tarefa Azure"} />
      <Typography variant="body2"><b>Registro:</b> #{channel.contextId}</Typography>
      {channel.clientName && <Typography variant="body2"><b>Cliente:</b> {channel.clientName}</Typography>}
      <Button variant="contained" size="small" onClick={onOpenActions}>Decisões e acompanhamento</Button>
      <Button variant="outlined" size="small" onClick={onSearchHistory}>Pesquisar histórico</Button>
      <Divider />
    </Stack>
  );
}
