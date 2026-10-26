import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { api } from "../../services/api";

type Action = {
  id: number;
  kind: string;
  title: string;
  status: string;
  dueAt: string | null;
  assignee: { name: string } | null;
};
type Response = { actions: Action[] };
const kinds: Record<string, string> = {
  DECISION: "Decisão",
  ESCALATION: "Escalonamento",
  HANDOFF: "Passagem de turno",
  ACTION: "Ação",
};
const statuses: Record<string, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  CANCELLED: "Cancelada",
};

/** Authorized, read-only incident work summary; full editing remains in IncidentActionsPanel. */
export function IncidentWorkSummary({ channelId, onManage }: { channelId: number; onManage: () => void }) {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const { data } = await api.get<Response>(`/chat/channels/${channelId}/actions`, { signal });
      if (signal?.aborted) return;
      setActions(data.actions ?? []);
      setError("");
    } catch {
      if (!signal?.aborted) setError("Não foi possível consultar o acompanhamento.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setActions([]);
    void refresh(controller.signal);
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(controller.signal); };
    document.addEventListener("visibilitychange", onFocus);
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ channelId: number }>).detail?.channelId === channelId) void refresh(controller.signal);
    };
    window.addEventListener("techlead-hub:incident-actions-changed", onChanged);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("techlead-hub:incident-actions-changed", onChanged);
    };
  }, [refresh, channelId]);

  const pending = actions.filter((action) => action.status === "OPEN" || action.status === "IN_PROGRESS");
  const latest = pending.slice(0, 4);
  return (
    <Stack spacing={1.1}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2" fontWeight={800}>Acompanhamento do incidente</Typography>
        <Chip size="small" label={`${pending.length} pendentes`} color={pending.length ? "warning" : "default"} />
      </Stack>
      {loading && <Stack direction="row" alignItems="center" spacing={1}><CircularProgress size={15} /><Typography variant="caption">Consultando ações...</Typography></Stack>}
      {error && <Alert severity="warning" action={<Button size="small" onClick={() => void refresh()}>Tentar</Button>}>{error}</Alert>}
      {!loading && !error && !pending.length && <Typography variant="body2" color="text.secondary">Nenhuma ação pendente registrada.</Typography>}
      {latest.map((action) => (
        <Box key={action.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1 }}>
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            <Chip size="small" variant="outlined" label={kinds[action.kind] ?? action.kind} />
            <Chip size="small" label={statuses[action.status] ?? action.status} />
          </Stack>
          <Typography variant="body2" fontWeight={700} sx={{ mt: .7, overflowWrap: "anywhere" }}>{action.title}</Typography>
          {action.assignee?.name && <Typography variant="caption" color="text.secondary">Responsável: {action.assignee.name}</Typography>}
          {action.dueAt && <Typography variant="caption" color="text.secondary" display="block">Prazo: {new Date(action.dueAt).toLocaleDateString("pt-BR")}</Typography>}
        </Box>
      ))}
      <Button size="small" variant="outlined" onClick={onManage}>Ver decisões, escalonamentos e passagem de turno</Button>
    </Stack>
  );
}
