import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { api } from "../services/api";

type IncidentAction = {
  id: number; kind: string; title: string; details: string | null;
  status: string; createdAt: string; dueAt: string | null;
  author: { name: string }; assignee: { name: string } | null;
};

const kindLabels: Record<string, string> = {
  DECISION: "Decisão", ESCALATION: "Escalonamento", HANDOFF: "Passagem de turno", ACTION: "Ação",
};
const statusLabels: Record<string, string> = {
  OPEN: "Aberta", IN_PROGRESS: "Em andamento", DONE: "Concluída", CANCELLED: "Cancelada",
};

export function IncidentActionsPanel({ channelId, open, onClose }: {
  channelId: number; open: boolean; onClose: () => void;
}) {
  const [actions, setActions] = useState<IncidentAction[]>([]);
  const [kind, setKind] = useState("ACTION");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ actions: IncidentAction[] }>(`/chat/channels/${channelId}/actions`);
      setActions(data.actions);
      setError("");
    } catch {
      setError("Não foi possível consultar as ações do incidente.");
    } finally { setLoading(false); }
  }, [channelId]);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  async function create() {
    if (title.trim().length < 4 || saving) return;
    setSaving(true);
    try {
      await api.post(`/chat/channels/${channelId}/actions`, { kind, title: title.trim(), details: details.trim() });
      setTitle(""); setDetails("");
      await refresh();
    } catch { setError("Não foi possível registrar a ação."); }
    finally { setSaving(false); }
  }

  async function setStatus(actionId: number, status: string) {
    try {
      await api.patch(`/chat/channels/${channelId}/actions/${actionId}`, { status });
      await refresh();
    } catch { setError("Você não tem permissão para alterar esta ação ou ocorreu um erro."); }
  }

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="incident-actions-title">
    <DialogTitle id="incident-actions-title">Acompanhamento do incidente</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2}>
        {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
        <Typography variant="subtitle2">Registrar decisão, escalonamento ou passagem de turno</Typography>
        <TextField select size="small" label="Tipo" value={kind} onChange={(event) => setKind(event.target.value)}>
          {Object.entries(kindLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Título" value={title} onChange={(event) => setTitle(event.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
        <TextField size="small" label="Detalhes" multiline minRows={2} value={details} onChange={(event) => setDetails(event.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
        <Button variant="contained" disabled={saving || title.trim().length < 4} onClick={() => void create()}>
          {saving ? "Registrando..." : "Registrar no incidente"}
        </Button>
        <Typography variant="subtitle2">Histórico de ações</Typography>
        {loading && <CircularProgress size={22} />}
        {!loading && actions.length === 0 && <Typography variant="body2" color="text.secondary">Nenhuma ação registrada.</Typography>}
        {actions.map((action) => <Box key={action.id} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Chip size="small" variant="outlined" label={kindLabels[action.kind] ?? action.kind} />
            <Chip size="small" color={action.status === "DONE" ? "success" : "default"} label={statusLabels[action.status] ?? action.status} />
          </Stack>
          <Typography sx={{ fontWeight: 700, mt: 1 }}>{action.title}</Typography>
          {action.details && <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: .5 }}>{action.details}</Typography>}
          <Typography variant="caption" color="text.secondary">{action.author.name} · {new Date(action.createdAt).toLocaleString("pt-BR")}</Typography>
          {action.status !== "DONE" && action.status !== "CANCELLED" && <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {action.status === "OPEN" && <Button size="small" onClick={() => void setStatus(action.id, "IN_PROGRESS")}>Iniciar</Button>}
            <Button size="small" onClick={() => void setStatus(action.id, "DONE")}>Concluir</Button>
          </Stack>}
        </Box>)}
      </Stack>
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
  </Dialog>;
}
