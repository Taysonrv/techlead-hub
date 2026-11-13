import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";

type Status = "Pendente" | "Em andamento" | "Aguardando retorno" | "Concluído";
type Priority = "Crítica" | "Alta" | "Normal";
type RequestItem = {
  id: string; title: string; owner: string; due: string; priority: Priority;
  status: Status; ticket: string; notes: string; updatedAt: string;
  emailRequired?: boolean; emailTo?: string; emailCc?: string; emailSubject?: string; emailBody?: string;
};
const KEY = "techlead-hub:coordination-weekly-workspace:v1";
const empty = { title: "", owner: "", due: "", priority: "Alta" as Priority, status: "Pendente" as Status, ticket: "", notes: "", emailRequired: false, emailTo: "", emailCc: "", emailSubject: "", emailBody: "" };
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
function emailDraft(x: RequestItem) {
  const subject = x.emailSubject?.trim() || `Acompanhamento — ${x.title}`;
  const body = x.emailBody?.trim() || `Olá, bom dia!

Em acompanhamento à solicitação "${x.title}", referente a ${x.ticket || "[informar ticket/Task]"}, solicito, por gentileza, um posicionamento atualizado sobre o andamento e os próximos passos.

${x.notes ? `Contexto e pontos de atenção:\n${x.notes}\n\n` : ""}Prazo de referência: ${x.due ? x.due.split("-").reverse().join("/") : "[informar prazo]"}.

Peço que sinalizem eventuais impedimentos e a previsão de retorno, para alinharmos os encaminhamentos necessários.

Agradeço desde já.

Atenciosamente,`;
  return `Para: ${x.emailTo || "[preencher destinatário]"}\nCc: ${x.emailCc || "[preencher cópia, se aplicável]"}\nAssunto: ${subject}\n\n${body}`;
}
function csv(items: RequestItem[]) {
  const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"';
  return [["Título", "Responsável", "Prazo", "Prioridade", "Situação", "Ticket", "Notas", "Atualizado em", "Exige e-mail", "Para", "Cc", "Assunto", "Corpo"].map(quote).join(";"), ...items.map(x => [x.title, x.owner, x.due, x.priority, x.status, x.ticket, x.notes, x.updatedAt, x.emailRequired ? "Sim" : "Não", x.emailTo || "", x.emailCc || "", x.emailSubject || "", x.emailBody || ""].map(quote).join(";"))].join("\r\n");
}
export function CoordinationWeeklyWorkspace() {
  const [items, setItems] = useState<RequestItem[]>(readItems);
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState("Ativas");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [mailPreview, setMailPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); setError(""); }
    catch { setError("Não foi possível salvar neste navegador. Exporte o CSV para preservar os registros."); }
  }, [items]);
  const active = items.filter(x => x.status !== "Concluído");
  const overdue = active.filter(x => x.due && x.due < today()).length;
  const dueSoon = active.filter(x => {
    if (!x.due) return false;
    const delta = Math.round((new Date(x.due + "T12:00:00").getTime() - new Date(today() + "T12:00:00").getTime()) / 86400000);
    return delta >= 0 && delta <= 2;
  });
  const awaiting = active.filter(x => x.status === "Aguardando retorno");
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(x => x + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  void nowTick;
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
      <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", gap: 1, mb: 2 }}>
        <Box><Typography variant="h6">Solicitações e combinados da coordenação</Typography>
          <Typography variant="body2" color="text.secondary">Painel operacional para acompanhar entregas, reuniões e retornos durante a semana.</Typography></Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Chip label={`Ativas: ${active.length}`} size="small" />
          <Chip label={`Vencidas: ${overdue}`} color={overdue ? "error" : "default"} size="small" />
          <Chip label={`Próximas 48h: ${dueSoon.length}`} color={dueSoon.length ? "warning" : "default"} size="small" />
          <Button size="small" variant="outlined" onClick={exportCsv} disabled={!items.length}>Exportar CSV</Button>
        </Stack>
      </Stack>
      <Alert severity="info" sx={{ mb: 2 }}>Versão de uso local: os registros ficam somente neste navegador/perfil, não sincronizam com o servidor ou Movidesk. Não registre senhas nem dados sigilosos. Exporte o CSV como backup.</Alert>
      {(overdue > 0 || dueSoon.length > 0 || awaiting.length > 0) && <Alert severity={overdue ? "warning" : "info"} sx={{ mb: 2 }}>
        <Typography variant="subtitle2">Notificações da coordenação</Typography>
        <Typography variant="body2">{overdue} vencida(s) · {dueSoon.length} com prazo em até 2 dias · {awaiting.length} aguardando retorno.</Typography>
        {active.filter(x => x.due && x.due < today()).concat(dueSoon).slice(0, 5).map(x => <Typography key={x.id} variant="body2">• {x.title} — {x.due.split("-").reverse().join("/")}</Typography>)}
      </Alert>}
      {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1, mb: 2, flexWrap: "wrap" }}>
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
        <Box sx={{ gridColumn: { md: "span 4" }, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Button size="small" variant={draft.emailRequired ? "contained" : "outlined"} onClick={() => setDraft(d => ({ ...d, emailRequired: !d.emailRequired }))}>
            {draft.emailRequired ? "E-mail necessário ✓" : "Marcar envio de e-mail"}
          </Button>
          <Typography variant="caption" color="text.secondary">Gera texto para copiar e colar. Não envia mensagens automaticamente.</Typography>
        </Box>
        {draft.emailRequired && <>
          <TextField size="small" label="Para (destinatários)" value={draft.emailTo} onChange={e => setDraft(d => ({ ...d, emailTo: e.target.value }))} />
          <TextField size="small" label="Cc (cópia)" value={draft.emailCc} onChange={e => setDraft(d => ({ ...d, emailCc: e.target.value }))} />
          <TextField size="small" label="Assunto (opcional)" value={draft.emailSubject} onChange={e => setDraft(d => ({ ...d, emailSubject: e.target.value }))} sx={{ gridColumn: { md: "span 2" } }} />
          <TextField size="small" multiline minRows={2} label="Corpo personalizado (opcional)" value={draft.emailBody} onChange={e => setDraft(d => ({ ...d, emailBody: e.target.value }))} sx={{ gridColumn: { md: "span 4" } }} />
        </>}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
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
      {mailPreview !== null && <Card variant="outlined" sx={{ mb: 2, bgcolor: "action.hover" }}><CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>E-mail pronto para revisão e cópia</Typography>
        <TextField fullWidth multiline minRows={8} label="Texto editável — Para, Cc, assunto e mensagem" value={mailPreview} onChange={e => { setMailPreview(e.target.value); setCopied(false); }} />
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button variant="contained" onClick={() => { void navigator.clipboard.writeText(mailPreview).then(() => setCopied(true)).catch(() => setError("Cópia automática indisponível. Selecione e copie o texto manualmente.")); }}>{copied ? "Copiado!" : "Copiar texto completo"}</Button>
          <Button onClick={() => setMailPreview(null)}>Fechar</Button>
        </Stack>
      </CardContent></Card>}
      <Stack spacing={1}>
        {visible.map(x => <Box key={x.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
          <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 700 }}>{x.title}</Typography>
              <Stack direction="row" sx={{ gap: 0.75, flexWrap: "wrap", mt: 0.5 }}>
                <Chip size="small" label={x.priority} color={x.priority === "Crítica" ? "error" : x.priority === "Alta" ? "warning" : "default"} />
                {x.owner && <Chip size="small" variant="outlined" label={x.owner} />}
                {x.due && <Chip size="small" color={x.status !== "Concluído" && x.due < today() ? "error" : "default"} label={`Prazo: ${x.due.split("-").reverse().join("/")}`} />}
                {x.ticket && <Chip size="small" variant="outlined" label={`Ref.: ${x.ticket}`} />}
                {x.emailRequired && <Chip size="small" color="info" label="E-mail a preparar" />}
              </Stack>
              {x.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{x.notes}</Typography>}
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <TextField select size="small" label="Situação" value={x.status} onChange={e => change(x.id, e.target.value as Status)} sx={{ minWidth: 160 }}>{statuses.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>
              {x.emailRequired && <Button size="small" variant="outlined" onClick={() => { setMailPreview(emailDraft(x)); setCopied(false); }}>Preparar e-mail</Button>}
              <Button size="small" onClick={() => { setEditing(x.id); setDraft({ title: x.title, owner: x.owner, due: x.due, priority: x.priority, status: x.status, ticket: x.ticket, notes: x.notes, emailRequired: !!x.emailRequired, emailTo: x.emailTo || "", emailCc: x.emailCc || "", emailSubject: x.emailSubject || "", emailBody: x.emailBody || "" }); document.getElementById("solicitacoes-coordenacao")?.scrollIntoView({ behavior: "smooth" }); }}>Editar</Button>
              <Button size="small" color="error" onClick={() => { if (window.confirm("Excluir esta solicitação?")) setItems(prev => prev.filter(item => item.id !== x.id)); }}>Excluir</Button>
            </Stack>
          </Stack>
        </Box>)}
      </Stack>
    </CardContent>
  </Card>;
}
