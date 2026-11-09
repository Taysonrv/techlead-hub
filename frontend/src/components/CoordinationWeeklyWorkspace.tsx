import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";

type Status = "Pendente" | "Em andamento" | "Aguardando retorno" | "Concluído";
type Priority = "Crítica" | "Alta" | "Normal";
type RequestItem = {
  id: string; title: string; owner: string; due: string; priority: Priority;
  status: Status; ticket: string; notes: string; updatedAt: string;
};
const KEY = "techlead-hub:coordination-weekly-workspace:v1";
const empty = { title: "", owner: "", due: "", priority: "Alta" as Priority, status: "Pendente" as Status, ticket: "", notes: "" };
const statuses: Status[] = ["Pendente", "Em andamento", "Aguardando retorno", "Concluído"];
const priorities: Priority[] = ["Crítica", "Alta", "Normal"];
const templates = [
  { title: "Relatório gerencial — Bom Jesus", due: "2026-11-12", notes: "Apurar bugs confirmados, reclassificações em melhoria/blindagem, encaminhamentos ao Produto após OLA, falhas Vistra e recorrências. Validar evidências no Movidesk antes de reportar." },
  { title: "Semanal de sustentação — Bom Jesus", due: "2026-11-12", notes: "Consolidar pendências, responsáveis, respostas concretas e ata." },
  { title: "Checkpoint DETEC", due: "2026-11-13", notes: "Revisar pendências técnicas e registrar encaminhamentos." },
  { title: "Posicionar 15 tickets de relatórios", due: "2026-11-13", notes: "Verificar individualmente os tickets sem ação pública há mais de 90 dias." },
];
function readItems(): RequestItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is RequestItem => !!v && typeof v === "object" && typeof v.id === "string" && typeof v.title === "string" && statuses.includes(v.status) && priorities.includes(v.priority));
  } catch { return []; }
}
function today() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function csv(items: RequestItem[]) {
  const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"';
  return [["Título", "Responsável", "Prazo", "Prioridade", "Situação", "Ticket", "Notas", "Atualizado em"].map(quote).join(";"), ...items.map(x => [x.title, x.owner, x.due, x.priority, x.status, x.ticket, x.notes, x.updatedAt].map(quote).join(";"))].join("\r\n");
}
export function CoordinationWeeklyWorkspace() {
  const [items, setItems] = useState<RequestItem[]>(readItems);
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState("Ativas");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); setError(""); }
    catch { setError("Não foi possível salvar neste navegador. Exporte o CSV para preservar os registros."); }
  }, [items]);
  const active = items.filter(x => x.status !== "Concluído");
  const overdue = active.filter(x => x.due && x.due < today()).length;
  const visible = useMemo(() => items.filter(x =>
    (filter === "Todas" || (filter === "Ativas" ? x.status !== "Concluído" : x.status === filter)) &&
    [x.title, x.owner, x.ticket, x.notes].join(" ").toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))
  ).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.title.localeCompare(b.title)), [items, filter, query]);
  const save = () => {
    if (!draft.title.trim()) { setError("Informe o título da solicitação."); return; }
    const now = new Date().toISOString();
    const entry: RequestItem = { ...draft, title: draft.title.trim(), id: editing ?? (globalThis.crypto?.randomUUID?.() ?? String(Date.now())), updatedAt: now };
    setItems(prev => editing ? prev.map(x => x.id === editing ? entry : x) : [entry, ...prev]);
    setDraft(empty); setEditing(null); setError("");
  };
  const change = (id: string, status: Status) => setItems(prev => prev.map(x => x.id === id ? { ...x, status, updatedAt: new Date().toISOString() } : x));
  const exportCsv = () => {
    const blob = new Blob(["\uFEFF", csv(items)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "coordenacao-solicitacoes.csv"; anchor.click();
    URL.revokeObjectURL(url);
  };
  return <Card variant="outlined" sx={{ mb: 2, borderRadius: 3 }} id="solicitacoes-coordenacao">
    <CardContent>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1} sx={{ mb: 2 }}>
        <Box><Typography variant="h6">Solicitações e combinados da coordenação</Typography>
          <Typography variant="body2" color="text.secondary">Painel operacional para acompanhar entregas, reuniões e retornos durante a semana.</Typography></Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip label={`Ativas: ${active.length}`} size="small" />
          <Chip label={`Vencidas: ${overdue}`} color={overdue ? "error" : "default"} size="small" />
          <Button size="small" variant="outlined" onClick={exportCsv} disabled={!items.length}>Exportar CSV</Button>
        </Stack>
      </Stack>
      <Alert severity="info" sx={{ mb: 2 }}>Versão de uso local: os registros ficam somente neste navegador/perfil, não sincronizam com o servidor ou Movidesk. Não registre senhas nem dados sigilosos. Exporte o CSV como backup.</Alert>
      {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      <Stack direction={{ xs: "column", sm: "row" }} gap={1} sx={{ mb: 2 }} flexWrap="wrap">
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>Criar a partir de:</Typography>
        {templates.map(t => <Button key={t.title} size="small" variant="outlined" onClick={() => { setDraft({ ...empty, ...t }); setEditing(null); }}>{t.title}</Button>)}
      </Stack>
      <Box component="form" onSubmit={e => { e.preventDefault(); save(); }} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr 1fr" }, gap: 1.5, mb: 2 }}>
        <TextField size="small" label="Solicitação / entrega" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} required />
        <TextField size="small" label="Responsável" value={draft.owner} onChange={e => setDraft(d => ({ ...d, owner: e.target.value }))} />
        <TextField size="small" label="Prazo" type="date" slotProps={{ inputLabel: { shrink: true } }} value={draft.due} onChange={e => setDraft(d => ({ ...d, due: e.target.value }))} />
        <TextField select size="small" label="Prioridade" value={draft.priority} onChange={e => setDraft(d => ({ ...d, priority: e.target.value as Priority }))}>{priorities.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}</TextField>
        <TextField select size="small" label="Situação" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value as Status }))}>{statuses.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>
        <TextField size="small" label="Ticket / Task (referência)" value={draft.ticket} onChange={e => setDraft(d => ({ ...d, ticket: e.target.value }))} />
        <TextField size="small" label="Notas / próximos passos" multiline minRows={1} sx={{ gridColumn: { md: "span 2" } }} value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
        <Stack direction="row" spacing={1} alignItems="center">
          <Button type="submit" variant="contained">{editing ? "Salvar edição" : "Adicionar"}</Button>
          {editing && <Button onClick={() => { setDraft(empty); setEditing(null); }}>Cancelar</Button>}
        </Stack>
      </Box>
      <Divider sx={{ mb: 2 }} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
        <TextField size="small" label="Buscar solicitações" value={query} onChange={e => setQuery(e.target.value)} />
        <TextField select size="small" label="Exibir" value={filter} onChange={e => setFilter(e.target.value)} sx={{ minWidth: 190 }}>
          {["Ativas", "Todas", ...statuses].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
      </Stack>
      {!visible.length && <Typography color="text.secondary" variant="body2">Nenhuma solicitação neste filtro. Cadastre uma ou use um modelo acima.</Typography>}
      <Stack spacing={1}>
        {visible.map(x => <Box key={x.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography fontWeight={700}>{x.title}</Typography>
              <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 0.5 }}>
                <Chip size="small" label={x.priority} color={x.priority === "Crítica" ? "error" : x.priority === "Alta" ? "warning" : "default"} />
                {x.owner && <Chip size="small" variant="outlined" label={x.owner} />}
                {x.due && <Chip size="small" color={x.status !== "Concluído" && x.due < today() ? "error" : "default"} label={`Prazo: ${x.due.split("-").reverse().join("/")}`} />}
                {x.ticket && <Chip size="small" variant="outlined" label={`Ref.: ${x.ticket}`} />}
              </Stack>
              {x.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{x.notes}</Typography>}
            </Box>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
              <TextField select size="small" label="Situação" value={x.status} onChange={e => change(x.id, e.target.value as Status)} sx={{ minWidth: 160 }}>{statuses.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>
              <Button size="small" onClick={() => { setEditing(x.id); setDraft({ title: x.title, owner: x.owner, due: x.due, priority: x.priority, status: x.status, ticket: x.ticket, notes: x.notes }); document.getElementById("solicitacoes-coordenacao")?.scrollIntoView({ behavior: "smooth" }); }}>Editar</Button>
              <Button size="small" color="error" onClick={() => { if (window.confirm("Excluir esta solicitação?")) setItems(prev => prev.filter(item => item.id !== x.id)); }}>Excluir</Button>
            </Stack>
          </Stack>
        </Box>)}
      </Stack>
    </CardContent>
  </Card>;
}
