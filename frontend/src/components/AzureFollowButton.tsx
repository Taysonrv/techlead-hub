import { useCallback, useEffect, useState } from "react";
import { Alert, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { NotificationsActiveOutlined, NotificationsNoneOutlined } from "@mui/icons-material";
import { api } from "../services/api";

export function AzureFollowButton({ workItemId }: { workItemId: number }) {
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setError("");
    try {
      const response = await api.get<{following:boolean}>(`/azure-work-items/${workItemId}/follow`);
      setFollowing(response.data.following);
    } catch {
      setError("Não foi possível consultar o acompanhamento.");
    }
  }, [workItemId]);
  useEffect(() => { setFollowing(false); void refresh(); }, [refresh]);
  async function toggle() {
    setBusy(true); setError("");
    try {
      if (following) {
        await api.delete(`/azure-work-items/${workItemId}/follow`);
      } else {
        await api.put(`/azure-work-items/${workItemId}/follow`);
      }
      setFollowing(!following);
    } catch {
      setError("Não foi possível alterar o acompanhamento.");
    } finally { setBusy(false); }
  }
  return <Stack spacing={0.5} sx={{ mt: 1 }}>
    <Button size="small" variant={following ? "contained" : "outlined"}
      startIcon={busy ? <CircularProgress size={15}/> : following ? <NotificationsActiveOutlined/> : <NotificationsNoneOutlined/>}
      disabled={busy || Boolean(error)} onClick={() => void toggle()}>
      {following ? "Seguindo no Hub · Deixar de seguir" : "Seguir tarefa no Hub"}
    </Button>
    <Typography variant="caption" color="text.secondary">Notificações pelo sino do TechLead Hub. O acompanhamento no Azure é independente.</Typography>
    {error && <Alert severity="warning" action={<Button size="small" onClick={() => void refresh()}>Tentar novamente</Button>}>{error}</Alert>}
  </Stack>;
}
