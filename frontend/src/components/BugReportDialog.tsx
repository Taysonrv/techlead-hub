import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from "@mui/material";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../services/api";

export function BugReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  const [type, setType] = useState<"BUG" | "IMPROVEMENT">("BUG");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit() {
    if (!title.trim() || !description.trim()) { setMessage("Informe o título e a descrição."); return; }
    try {
      setSending(true); setMessage(null);
      const appVersion = window.techLeadHub ? await window.techLeadHub.getVersion().catch(() => "") : "";
      await api.post("/global/feedback", { type, title: title.trim(), description: description.trim(), path: location.pathname + location.search, appVersion });
      setTitle(""); setDescription(""); setMessage("Enviado com sucesso. Obrigado pelo registro.");
    } catch { setMessage("Não foi possível enviar o registro."); } finally { setSending(false); }
  }
  return <Dialog open={open} onClose={sending ? undefined : onClose} maxWidth="sm" fullWidth>
    <DialogTitle>Reportar bug ou melhoria</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ mt: .5 }}>
      {message && <Alert severity={message.startsWith("Enviado") ? "success" : "warning"}>{message}</Alert>}
      <FormControl size="small" fullWidth><InputLabel>Tipo</InputLabel><Select value={type} label="Tipo" onChange={(event) => setType(event.target.value as "BUG" | "IMPROVEMENT")}><MenuItem value="BUG">Bug / problema</MenuItem><MenuItem value="IMPROVEMENT">Melhoria / sugestão</MenuItem></Select></FormControl>
      <TextField label="Título" value={title} onChange={(event) => setTitle(event.target.value)} slotProps={{ htmlInput: { maxLength: 160 } }} fullWidth />
      <TextField label="Descrição" value={description} onChange={(event) => setDescription(event.target.value)} multiline minRows={5} helperText={`Tela atual: ${location.pathname}`} fullWidth />
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={sending}>Fechar</Button><Button variant="contained" onClick={() => void submit()} disabled={sending || !title.trim() || !description.trim()}>{sending ? "Enviando..." : "Enviar"}</Button></DialogActions>
  </Dialog>;
}
