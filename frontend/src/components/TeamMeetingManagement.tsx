import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { DeleteOutlineRounded } from "@mui/icons-material";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { FavoriteAction } from "./FavoriteAction";

type Goal = { name: string; target: number };
type Highlight = { id: string; kind: "achievement" | "attention"; text: string };
type Action = { id: string; description: string; owner: string; due: string; status: "pending" | "doing" | "done" };
type MeetingData = { goals: Goal[]; highlights: Highlight[]; actions: Action[] };
type MeetingSnapshot = { periodStart: string; periodEnd: string; opened: number; resolved: number; closed: number; backlog: number; stopped: number; capturedAt: string };
type Meeting = MeetingData & { snapshot?: MeetingSnapshot | null; id: number; meetingDate: string; title: string; notes: string; version: number; updatedAt: string };
type MeetingSummary = Pick<Meeting, "id" | "meetingDate" | "title" | "version" | "updatedAt">;
const empty = (): MeetingData => ({ goals: [], highlights: [], actions: [] });
const uid = () => String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
const section = { borderRadius: 3, border: "1px solid", borderColor: "divider", scrollMarginTop: 110 };
const dateKey = (value: Date) => [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
const statusLabel: Record<Action["status"], string> = { pending: "Pendente", doing: "Em andamento", done: "Concluído" };
const messageOf = (error: unknown) => {
  const value = error as { response?: { data?: { message?: string }; status?: number } };
  return value.response?.data?.message || "Não foi possível concluir a operação. Verifique a conexão com o servidor.";
};
export function TeamMeetingManagement({ weekLabel, snapshot, initialDate }: {
  weekLabel: string;
  snapshot: MeetingSnapshot;
  initialDate?: string;
}) {
  const { user } = useAuth();
  const editable = user?.role === "ADMIN" || user?.role === "COORDENADOR";
  const [date, setDate] = useState(() => initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : dateKey(new Date()));
  const [history, setHistory] = useState<MeetingSummary[]>([]);
  const [data, setData] = useState<MeetingData>(empty);
  const [version, setVersion] = useState(0);
  const [savedSnapshot, setSavedSnapshot] = useState<MeetingSnapshot | null>(null);
  const [title, setTitle] = useState("Reunião de resultados");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [responsible, setResponsible] = useState("");
  const [due, setDue] = useState("");

  const loadHistory = async () => {
    const response = await api.get<MeetingSummary[]>("/team-results/meetings");
    setHistory(response.data);
    return response.data;
  };
  const loadMeeting = async (selected: string) => {
    setLoading(true); setError(""); setNotice("");
    try {
      const response = await api.get<Meeting | null>("/team-results/meetings/" + selected);
      const meeting = response.data;
      setData(meeting ? { goals: meeting.goals, highlights: meeting.highlights, actions: meeting.actions } : empty());
      setTitle(meeting?.title || "Reunião de resultados");
      setNotes(meeting?.notes || "");
      setVersion(meeting?.version ?? 0);
      setSavedSnapshot(meeting?.snapshot ?? null);
      setDirty(false);
    } catch (err) { setError(messageOf(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    void api.get<MeetingSummary[]>("/team-results/meetings").then(result => {
      if (!active) return;
      setHistory(result.data);
    }).catch(err => { if (active) setError(messageOf(err)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setNotice("");
    void api.get<Meeting | null>("/team-results/meetings/" + date).then(result => {
      if (!active) return;
      const meeting = result.data;
      setData(meeting ? { goals: meeting.goals, highlights: meeting.highlights, actions: meeting.actions } : empty());
      setTitle(meeting?.title || "Reunião de resultados");
      setNotes(meeting?.notes || "");
      setVersion(meeting?.version ?? 0);
      setSavedSnapshot(meeting?.snapshot ?? null);
      setDirty(false);
    }).catch(err => { if (active) setError(messageOf(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date]);
  const change = (update: (current: MeetingData) => MeetingData) => { setData(update); setDirty(true); };
  const save = async () => {
    if (!editable || loading || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await api.put<Meeting>("/team-results/meetings/" + date, { title, notes, goals: data.goals, highlights: data.highlights, actions: data.actions, snapshot, version });
      setVersion(response.data.version);
      setSavedSnapshot(response.data.snapshot ?? null);
      setDirty(false);
      setNotice("Reunião salva no servidor e disponível para os demais usuários.");
      await loadHistory();
    } catch (err) { setError(messageOf(err)); }
    finally { setSaving(false); }
  };
  const copyPending = async () => {
    if (!editable || dirty || version !== 0) return;
    const previous = history.find(item => item.meetingDate.slice(0, 10) < date);
    if (!previous) { setNotice("Não existe reunião anterior para importar compromissos."); return; }
    try {
      const response = await api.get<Meeting>("/team-results/meetings/" + previous.meetingDate.slice(0, 10));
      const actions = response.data.actions.filter(action => action.status !== "done");
      change(current => ({ ...current, actions: [...current.actions, ...actions.map(action => ({ ...action, id: uid() }))] }));
      setNotice(actions.length + " compromissos pendentes importados. Salve a reunião para compartilhar.");
    } catch (err) { setError(messageOf(err)); }
  };
  const canEdit = editable && !loading;
  return <Stack spacing={2} sx={{ mt: 2 }}>
    <Card sx={section}><CardContent>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
        <Box><Typography variant="h6" sx={{ fontWeight: 800 }}>Ata e compromissos da reunião</Typography><Typography variant="caption" color="text.secondary">Registre encaminhamentos, consulte reuniões anteriores e acompanhe os responsáveis.</Typography></Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", "@media print": { display: "none" } }}>
          <Button variant="outlined" disabled={loading || saving} onClick={() => { if (dirty && !window.confirm("Descartar alterações não salvas?")) return; void loadMeeting(date); }}>Atualizar</Button>
          <Button variant="contained" disabled={!canEdit || saving || !dirty} onClick={() => void save()}>{saving ? "Salvando..." : "Salvar reunião"}</Button>
        </Stack>
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2, "@media print": { display: "none" } }}>
        <TextField label="Data da reunião" type="date" size="small" value={date} onChange={event => { if (dirty && !window.confirm("Descartar alterações não salvas?")) return; setDate(event.target.value); }} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField select size="small" label="Reuniões anteriores" value="" onChange={event => { if (dirty && !window.confirm("Descartar alterações não salvas?")) return; setDate(event.target.value); }} sx={{ minWidth: 240 }}>
          <MenuItem value="">Selecionar reunião</MenuItem>{history.map(item => <MenuItem key={item.id} value={item.meetingDate.slice(0, 10)}>{new Date(item.meetingDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })} · {item.title}</MenuItem>)}
        </TextField>
        {editable && version === 0 && <Button variant="outlined" disabled={dirty || loading} onClick={() => void copyPending()}>Trazer pendências anteriores</Button>}
      </Stack>
      <TextField label="Título da reunião" fullWidth size="small" value={title} disabled={!canEdit} onChange={event => { setTitle(event.target.value); setDirty(true); }} sx={{ mt: 2 }} />
      <TextField label="Ata / resumo da reunião" fullWidth multiline minRows={3} value={notes} disabled={!canEdit} onChange={event => { setNotes(event.target.value); setDirty(true); }} sx={{ mt: 1.5 }} />
      <Typography variant="caption" color="text.secondary">Período dos indicadores na tela: {weekLabel}. Os indicadores apresentados acima seguem o filtro selecionado.</Typography>
      {savedSnapshot && <Alert severity="info" sx={{ mt: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>Resultado registrado na reunião · {new Date(savedSnapshot.capturedAt).toLocaleString("pt-BR")}</Typography>
        <Typography variant="body2">Período: {savedSnapshot.periodStart} a {savedSnapshot.periodEnd} · Abertos: {savedSnapshot.opened} · Resolvidos: {savedSnapshot.resolved} · Fechados: {savedSnapshot.closed} · Backlog: {savedSnapshot.backlog} · Parados: {savedSnapshot.stopped}</Typography>
        <Typography variant="caption">Registro histórico congelado no último salvamento. Os gráficos acima continuam refletindo os filtros e a base atual.</Typography>
      </Alert>}
      {loading && <CircularProgress size={18} sx={{ ml: 2 }} />}
      {dirty && <Chip label="Alterações não salvas" color="warning" size="small" sx={{ ml: 1 }} />}
      {notice && <Alert severity="success" sx={{ mt: 1.5 }}>{notice}</Alert>}
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      {!editable && <Alert severity="info" sx={{ mt: 1.5 }}>Consulta disponível. Apenas coordenadores e administradores podem editar as reuniões.</Alert>}
    </CardContent></Card>
    <Card id="meeting-actions" sx={section}><CardContent>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}><Typography variant="h6" sx={{ fontWeight: 800 }}>Plano de ação e compromissos</Typography><FavoriteAction title="Plano de ação" targetId="meeting-actions" /></Stack>
      {editable && <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ my: 2, "@media print": { display: "none" } }}>
        <TextField size="small" label="Compromisso" value={description} onChange={e => setDescription(e.target.value)} sx={{ flex: 2 }} />
        <TextField size="small" label="Responsável (nome cadastrado no Hub)" value={responsible} onChange={e => setResponsible(e.target.value)} sx={{ flex: 1 }} />
        <TextField size="small" type="date" label="Prazo" value={due} onChange={e => setDue(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button variant="contained" disabled={!canEdit || !description.trim() || !responsible.trim() || !due} onClick={() => { change(d => ({ ...d, actions: [...d.actions, { id: uid(), description: description.trim(), owner: responsible.trim(), due, status: "pending" }] })); setDescription(""); setResponsible(""); setDue(""); }}>Adicionar</Button>
      </Stack>}
      <Alert severity="info" sx={{ mb: 1 }}>Após salvar a reunião, os compromissos serão exibidos nas notificações do responsável cadastrado no Hub, incluindo lembretes próximos do prazo. Utilize o nome completo do analista.</Alert>
      {data.actions.length === 0 ? <Typography color="text.secondary">Nenhum compromisso registrado.</Typography> : <Stack spacing={1}>{data.actions.map(item => <Stack key={item.id} direction={{ xs: "column", md: "row" }} sx={{ gap: 1, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2, alignItems: { md: "center" } }}>
        <Box sx={{ flex: 1 }}><Typography sx={{ fontWeight: 700 }}>{item.description}</Typography><Typography variant="caption" color="text.secondary">{item.owner} · Prazo: {item.due.split("-").reverse().join("/")}</Typography></Box>
        {editable && <TextField select size="small" label="Situação" disabled={!canEdit} value={item.status} onChange={e => change(d => ({ ...d, actions: d.actions.map(a => a.id === item.id ? { ...a, status: e.target.value as Action["status"] } : a) }))} sx={{ minWidth: 160, "@media print": { display: "none" } }}>{(Object.keys(statusLabel) as Action["status"][]).map(status => <MenuItem key={status} value={status}>{statusLabel[status]}</MenuItem>)}</TextField>}
        <Chip label={statusLabel[item.status]} color={item.status === "done" ? "success" : item.status === "doing" ? "info" : "default"} />
        {editable && <IconButton aria-label="Excluir compromisso" disabled={!canEdit} onClick={() => change(d => ({ ...d, actions: d.actions.filter(a => a.id !== item.id) }))} sx={{ "@media print": { display: "none" } }}><DeleteOutlineRounded fontSize="small" /></IconButton>}
      </Stack>)}</Stack>}
    </CardContent></Card>
  </Stack>;
}
