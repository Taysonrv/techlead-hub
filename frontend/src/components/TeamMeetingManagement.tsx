import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { DeleteOutlineRounded } from "@mui/icons-material";
import { useAuth } from "../context/AuthContext";
import { FavoriteAction } from "./FavoriteAction";

type Goal = { name: string; target: number };
type Highlight = { id: string; kind: "achievement" | "attention"; text: string };
type Action = { id: string; description: string; owner: string; due: string; status: "pending" | "doing" | "done" };
type MeetingData = { goals: Goal[]; highlights: Highlight[]; actions: Action[] };
const empty = (): MeetingData => ({ goals: [], highlights: [], actions: [] });
const keyFor = (id: string | number) => "techlead.team-meeting.v1." + id;
const uid = () => String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
const section = { borderRadius: 3, border: "1px solid", borderColor: "divider", scrollMarginTop: 110 };
export function TeamMeetingManagement({ actual, team, weekLabel }: {
  actual: number;
  team: { name: string; resolved: number }[];
  weekLabel: string;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<MeetingData>(empty);
  const [ready, setReady] = useState(false);
  const [highlight, setHighlight] = useState("");
  const [kind, setKind] = useState<Highlight["kind"]>("achievement");
  const [description, setDescription] = useState("");
  const [responsible, setResponsible] = useState("");
  const [due, setDue] = useState("");
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setReady(false);
    if (user?.id == null) { setData(empty()); return; }
    try {
      const raw = window.localStorage.getItem(keyFor(user.id));
      const parsed = raw ? JSON.parse(raw) as Partial<MeetingData> : {};
      setData({ goals: Array.isArray(parsed.goals) ? parsed.goals : [], highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [], actions: Array.isArray(parsed.actions) ? parsed.actions : [] });
      setStorageError(false);
    } catch { setData(empty()); setStorageError(true); }
    setReady(true);
  }, [user?.id]);
  useEffect(() => {
    if (!ready || user?.id == null) return;
    try { window.localStorage.setItem(keyFor(user.id), JSON.stringify(data)); }
    catch { setStorageError(true); }
  }, [data, ready, user?.id]);
  const goals = useMemo(() => new Map(data.goals.map(item => [item.name, item.target])), [data.goals]);
  const teamGoal = goals.get("__team__") ?? 0;
  const updateGoal = (name: string, value: string) => {
    if (value !== "" && (!/^\d+$/.test(value) || Number(value) > 1000000)) return;
    const next = value === "" ? data.goals.filter(item => item.name !== name) : [...data.goals.filter(item => item.name !== name), { name, target: Number(value) }];
    setData(previous => ({ ...previous, goals: next }));
  };
  const attainment = (value: number, goal: number) => goal > 0 ? Math.round(value / goal * 100) + "%" : "Sem meta";
  const statusLabel: Record<Action["status"], string> = { pending: "Pendente", doing: "Em andamento", done: "Concluído" };
  return <Stack spacing={2} sx={{ mt: 2 }}>
    <Alert severity="info" sx={{ "@media print": { display: "none" } }}>Metas, destaques e compromissos são registrados neste navegador, por usuário. Ainda não são compartilhados com a equipe nem sincronizados com o servidor. As metas são manuais e referem-se a resoluções no período selecionado.</Alert>
    {storageError && <Alert severity="warning">Não foi possível acessar o armazenamento local. Os registros podem não persistir.</Alert>}
    <Card id="meeting-goals" sx={section}><CardContent>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}><Typography variant="h6" sx={{ fontWeight: 800 }}>Metas e atingimento</Typography><FavoriteAction title="Metas da equipe" targetId="meeting-goals" /></Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" }, mb: 2 }}>
        <TextField label="Meta de resoluções da equipe" type="number" size="small" value={goals.has("__team__") ? String(teamGoal) : ""} onChange={event => updateGoal("__team__", event.target.value)} slotProps={{ htmlInput: { min: 0, max: 1000000 } }} />
        <Typography sx={{ fontWeight: 700 }}>Realizado: {actual} · Atingimento: {attainment(actual, teamGoal)}</Typography>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 1.5 }}>
        {team.map(person => <Stack key={person.name} spacing={.5} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{person.name}</Typography>
          <TextField size="small" type="number" label="Meta de resoluções" value={goals.has(person.name) ? String(goals.get(person.name)) : ""} onChange={event => updateGoal(person.name, event.target.value)} slotProps={{ htmlInput: { min: 0, max: 1000000 } }} />
          <Typography variant="caption">Realizado: {person.resolved} · {attainment(person.resolved, goals.get(person.name) ?? 0)}</Typography>
        </Stack>)}
      </Box>
    </CardContent></Card>
    <Card id="meeting-highlights" sx={section}><CardContent>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}><Typography variant="h6" sx={{ fontWeight: 800 }}>Destaques e pontos de atenção</Typography><FavoriteAction title="Destaques da reunião" targetId="meeting-highlights" /></Stack>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 2, "@media print": { display: "none" } }}>
        <TextField select size="small" label="Tipo" value={kind} onChange={e => setKind(e.target.value as Highlight["kind"])} sx={{ minWidth: 180 }}><MenuItem value="achievement">Entrega / avanço</MenuItem><MenuItem value="attention">Ponto de atenção</MenuItem></TextField>
        <TextField size="small" label="Registrar destaque" value={highlight} onChange={e => setHighlight(e.target.value)} sx={{ flex: 1 }} />
        <Button variant="contained" disabled={!highlight.trim()} onClick={() => { setData(d => ({ ...d, highlights: [...d.highlights, { id: uid(), kind, text: highlight.trim() }] })); setHighlight(""); }}>Adicionar</Button>
      </Stack>
      {data.highlights.length === 0 ? <Typography color="text.secondary">Nenhum destaque registrado.</Typography> : <Stack spacing={1}>{data.highlights.map(item => <Stack key={item.id} direction="row" sx={{ alignItems: "center", gap: 1 }}><Chip size="small" color={item.kind === "achievement" ? "success" : "warning"} label={item.kind === "achievement" ? "Avanço" : "Atenção"} /><Typography sx={{ flex: 1 }}>{item.text}</Typography><IconButton aria-label="Excluir destaque" onClick={() => setData(d => ({ ...d, highlights: d.highlights.filter(h => h.id !== item.id) }))} sx={{ "@media print": { display: "none" } }}><DeleteOutlineRounded fontSize="small" /></IconButton></Stack>)}</Stack>}
    </CardContent></Card>
    <Card id="meeting-actions" sx={section}><CardContent>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}><Typography variant="h6" sx={{ fontWeight: 800 }}>Plano de ação e compromissos</Typography><FavoriteAction title="Plano de ação" targetId="meeting-actions" /></Stack>
      <Typography variant="caption" color="text.secondary">Acompanhamento contínuo entre reuniões. Referência atual: {weekLabel}.</Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ my: 2, "@media print": { display: "none" } }}>
        <TextField size="small" label="Compromisso" value={description} onChange={e => setDescription(e.target.value)} sx={{ flex: 2 }} />
        <TextField size="small" label="Responsável" value={responsible} onChange={e => setResponsible(e.target.value)} sx={{ flex: 1 }} />
        <TextField size="small" type="date" label="Prazo" value={due} onChange={e => setDue(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button variant="contained" disabled={!description.trim() || !responsible.trim() || !due} onClick={() => { setData(d => ({ ...d, actions: [...d.actions, { id: uid(), description: description.trim(), owner: responsible.trim(), due, status: "pending" }] })); setDescription(""); setResponsible(""); setDue(""); }}>Adicionar</Button>
      </Stack>
      {data.actions.length === 0 ? <Typography color="text.secondary">Nenhum compromisso registrado.</Typography> : <Stack spacing={1}>{data.actions.map(item => <Stack key={item.id} direction={{ xs: "column", md: "row" }} sx={{ gap: 1, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2, alignItems: { md: "center" } }}>
        <Box sx={{ flex: 1 }}><Typography sx={{ fontWeight: 700 }}>{item.description}</Typography><Typography variant="caption" color="text.secondary">{item.owner} · Prazo: {item.due.split("-").reverse().join("/")}</Typography></Box>
        <TextField select size="small" label="Situação" value={item.status} onChange={e => setData(d => ({ ...d, actions: d.actions.map(a => a.id === item.id ? { ...a, status: e.target.value as Action["status"] } : a) }))} sx={{ minWidth: 160, "@media print": { display: "none" } }}>{(Object.keys(statusLabel) as Action["status"][]).map(status => <MenuItem key={status} value={status}>{statusLabel[status]}</MenuItem>)}</TextField>
        <Chip label={statusLabel[item.status]} color={item.status === "done" ? "success" : item.status === "doing" ? "info" : "default"} />
        <IconButton aria-label="Excluir compromisso" onClick={() => setData(d => ({ ...d, actions: d.actions.filter(a => a.id !== item.id) }))} sx={{ "@media print": { display: "none" } }}><DeleteOutlineRounded fontSize="small" /></IconButton>
      </Stack>)}</Stack>}
    </CardContent></Card>
  </Stack>;
}
