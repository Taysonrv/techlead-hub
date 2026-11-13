import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Chip, Divider, Stack, Typography } from "@mui/material";
import { api } from "../../services/api";
import type { Channel } from "./chatTypes";

type ContextRecord = {
  id?: number;
  movideskId?: number;
  title?: string;
  subject?: string;
  status?: string;
  state?: string;
  urgency?: string | null;
  criticality?: string | null;
  client?: string | null;
  owner?: string | null;
  assignedToName?: string | null;
  solutionSlaIndicator?: string | null;
  responseSlaIndicator?: string | null;
  dueDate?: string | null;
  slaLimit?: string | null;
};
type ContextResponse = {
  source: "MOVIDESK" | "AZURE" | "UNAVAILABLE";
  record: ContextRecord | null;
  linked: ContextRecord | null;
  syncedAt: string | null;
};
type Props = { channel: Channel; onOpenActions: () => void; onSearchHistory: () => void };

export function IncidentContextSummary({ channel, onOpenActions, onSearchHistory }: Props) {
  const [context, setContext] = useState<ContextResponse | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await api.get<ContextResponse>(`/chat/channels/${channel.id}/context`, { signal });
      if (!signal.aborted) { setContext(response.data); setError(""); }
    } catch {
      if (!signal.aborted) setError("Não foi possível carregar o contexto atualizado.");
    }
  }, [channel.id]);
  useEffect(() => {
    const controller = new AbortController();
    setContext(null);
    setError("");
    void refresh(controller.signal);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(controller.signal); };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(onVisible, 60_000);
    return () => { controller.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  const record = context?.record;
  const title = record?.subject ?? record?.title;
  const status = record?.status ?? record?.state;
  const owner = record?.owner ?? record?.assignedToName;
  const priority = record?.urgency ?? record?.criticality;
  const deadline = record?.dueDate ?? record?.slaLimit;
  return (
    <Stack spacing={1.2}>
      <Chip size="small" color="primary" label={context?.source === "MOVIDESK" ? "Atendimento Movidesk" : context?.source === "AZURE" ? "Tarefa Azure" : "Contexto operacional"} />
      <Typography variant="body2"><b>Registro:</b> #{channel.contextId}</Typography>
      {channel.clientName && <Typography variant="body2"><b>Cliente da sala:</b> {channel.clientName}</Typography>}
      {error && <Alert severity="warning">{error}</Alert>}
      {context && !record && <Typography variant="caption" color="text.secondary">Registro ainda não encontrado na base sincronizada.</Typography>}
      {title && <Typography variant="body2" sx={{ fontWeight: 700 }}>{title}</Typography>}
      {status && <Typography variant="body2"><b>Situação:</b> {status}</Typography>}
      {record?.client && <Typography variant="body2"><b>Cliente:</b> {record.client}</Typography>}
      {priority && <Typography variant="body2"><b>Prioridade:</b> {priority}</Typography>}
      {owner && <Typography variant="body2"><b>Responsável:</b> {owner}</Typography>}
      {record?.solutionSlaIndicator && <Typography variant="body2"><b>SLA solução:</b> {record.solutionSlaIndicator}</Typography>}
      {record?.responseSlaIndicator && <Typography variant="body2"><b>SLA resposta:</b> {record.responseSlaIndicator}</Typography>}
      {deadline && <Typography variant="body2"><b>Prazo:</b> {new Date(deadline).toLocaleString("pt-BR")}</Typography>}
      {context?.linked && <Typography variant="body2"><b>Registro relacionado:</b> #{context.linked.id ?? context.linked.movideskId} · {context.linked.state ?? context.linked.status ?? "Sem situação"}</Typography>}
      {context?.syncedAt && <Typography variant="caption" color="text.secondary">Base sincronizada em {new Date(context.syncedAt).toLocaleString("pt-BR")}</Typography>}
      <Button variant="contained" size="small" onClick={onOpenActions}>Decisões e acompanhamento</Button>
      <Button variant="outlined" size="small" onClick={onSearchHistory}>Pesquisar histórico</Button>
      <Divider />
    </Stack>
  );
}
