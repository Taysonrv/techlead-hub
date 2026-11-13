import { useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { api } from "../services/api";

type Key = "CAUSES" | "INTERNAL_ESCALATION" | "KNOWLEDGE" | "EXTERNAL_ESCALATION";
type Status = "PLANNED" | "IN_PROGRESS" | "VERIFIED" | "CANCELLED";
type RecordItem = { id: number; deliverable: Key; title: string; description: string; owner: string; status: Status; evidenceUrl: string | null; dueDate: string | null; updatedAt: string };
type FormData = { deliverable: Key; title: string; description: string; owner: string; status: Status; evidenceUrl: string; dueDate: string };
const definitions: { key: Key; title: string; weight: number; goal: string; checks: string[] }[] = [
  { key: "CAUSES", title: "Análise de causas e padrões", weight: 1, goal: "Identificar recorrências, validar a causa raiz e medir o efeito das ações corretivas.", checks: ["Registrar evidências e causa raiz validada", "Definir responsável e ação preventiva", "Reavaliar reincidência após intervenção"] },
  { key: "INTERNAL_ESCALATION", title: "Qualidade dos escalonamentos N1 → N2/N3", weight: 15, goal: "Avaliar completude, classificação, devoluções e retrabalho nos encaminhamentos internos.", checks: ["Definir checklist de qualidade N1 → N2/N3", "Registrar amostra avaliada e devoluções", "Acompanhar melhoria mensal por equipe"] },
  { key: "KNOWLEDGE", title: "Gestão técnica da base de conhecimento", weight: 1, goal: "Garantir artigos revisados, responsáveis e evidência de utilização pelo Suporte.", checks: ["Definir responsáveis e calendário de revisão", "Registrar artigos revisados e aprovados", "Medir utilização e eficácia do conteúdo"] },
  { key: "EXTERNAL_ESCALATION", title: "Qualidade das escalações externas", weight: 1, goal: "Avaliar qualidade dos encaminhamentos para Produto, Desenvolvimento e Arquitetura.", checks: ["Definir critérios e checklist externo", "Registrar devoluções e complementações", "Acompanhar qualidade e retrabalho por período"] },
];
const empty: FormData = { deliverable: "INTERNAL_ESCALATION", title: "", description: "", owner: "", status: "PLANNED", evidenceUrl: "", dueDate: "2026-12-31" };
const labels: Record<Status, string> = { PLANNED: "Planejado", IN_PROGRESS: "Em andamento", VERIFIED: "Evidência validada", CANCELLED: "Cancelado" };

export function LeadershipOkrPanel() {
  const [items, setItems] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(empty);
  const [saving, setSaving] = useState(false);
  const load = async () => {
    try {
      const response = await api.get<RecordItem[]>("/leadership/okrs");
      setItems(response.data);
      setError("");
    } catch { setError("Não foi possível carregar as evidências. Verifique a conexão e as permissões."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const open = (key: Key, item?: RecordItem) => {
    setEditingId(item?.id ?? null);
    setForm(item ? { deliverable: item.deliverable, title: item.title, description: item.description, owner: item.owner, status: item.status, evidenceUrl: item.evidenceUrl || "", dueDate: item.dueDate?.slice(0, 10) || "" } : { ...empty, deliverable: key });
    setDialog(true);
  };
  const save = async () => {
    if (!form.title.trim() || !form.description.trim() || !form.owner.trim() || (form.status === "VERIFIED" && !form.evidenceUrl.trim())) {
      setError("Informe título, descrição, responsável e, para evidência validada, o link de comprovação."); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, dueDate: form.dueDate || null, evidenceUrl: form.evidenceUrl || null };
      if (editingId) await api.put("/leadership/okrs/" + editingId, payload);
      else await api.post("/leadership/okrs", payload);
      setDialog(false); setError(""); await load();
    } catch { setError("Não foi possível salvar. Apenas administradores e coordenadores podem alterar registros."); }
    finally { setSaving(false); }
  };
  const verified = items.filter(item => item.status === "VERIFIED");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = items.filter(item => item.dueDate && !["VERIFIED", "CANCELLED"].includes(item.status) && new Date(item.dueDate.slice(0, 10) + "T23:59:59").getTime() < today.getTime());
  const withoutOwner = items.filter(item => !item.owner.trim());
  return <Stack spacing={2}>
    <Card variant="outlined"><CardContent>
      <Typography variant="h6" sx={{ fontWeight: 850 }}>OKRs · Qualidade e melhoria contínua</Typography>
      <Typography variant="body2" color="text.secondary">Objetivo: tornar o Suporte mais resolutivo, previsível e autônomo. Prazo: 31/12/2026. Os quatro entregáveis apresentados somam 18 pontos de peso; o progresso abaixo é documental, não uma nota oficial do OKR.</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 1.5 }}>
        <Chip color="primary" label={items.length + " registros de acompanhamento"} />
        <Chip color="success" variant="outlined" label={verified.length + " evidências validadas"} />
        <Chip variant="outlined" label={items.filter(item => item.status === "IN_PROGRESS").length + " em andamento"} />
        <Chip color={overdue.length ? "warning" : "default"} variant="outlined" label={overdue.length + " ações em atraso"} />
      </Stack>
    </CardContent></Card>
    {error && <Alert severity="warning" onClose={() => setError("")}>{error}</Alert>}
    {loading && <Typography color="text.secondary">Carregando evidências...</Typography>}
    {!loading && overdue.length > 0 && <Alert severity="warning">{overdue.length} ação(ões) com prazo vencido e ainda sem validação. Revise responsáveis, prazos e evidências.</Alert>}
    {!loading && withoutOwner.length > 0 && <Alert severity="info">{withoutOwner.length} registro(s) sem responsável identificado.</Alert>}
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2 }}>
      {definitions.map(def => {
        const related = items.filter(item => item.deliverable === def.key);
        return <Card key={def.key} variant="outlined"><CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
            <Box><Typography variant="subtitle1" sx={{ fontWeight: 850 }}>{def.title}</Typography><Typography variant="caption" color="text.secondary">Peso {def.weight} · Entrega até 31/12/2026</Typography></Box>
            <Button size="small" variant="outlined" onClick={() => open(def.key)}>Registrar</Button>
          </Stack>
          <Typography variant="body2" sx={{ my: 1.5 }}>{def.goal}</Typography>
          <Divider sx={{ mb: 1.5 }} />
          <Typography variant="caption" sx={{ fontWeight: 800 }}>Critérios de comprovação</Typography>
          {def.checks.map(check => <Typography key={check} variant="body2" color="text.secondary" sx={{ mt: .7 }}>• {check}</Typography>)}
          <Stack spacing={1} sx={{ mt: 2 }}>
            {related.length === 0 && <Alert severity="info">Nenhuma evidência registrada. A funcionalidade existente no Hub, isoladamente, não comprova a entrega.</Alert>}
            {related.map(item => <Box key={item.id} sx={{ p: 1.25, borderRadius: 2, bgcolor: "action.hover" }}>
              <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="body2" sx={{ fontWeight: 750 }}>{item.title}</Typography>
                <Chip size="small" color={item.status === "VERIFIED" ? "success" : item.status === "IN_PROGRESS" ? "warning" : "default"} label={labels[item.status]} />
              </Stack>
              <Typography variant="caption" color="text.secondary">{item.owner} · {item.dueDate ? new Date(item.dueDate).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Sem prazo"}</Typography>
              {overdue.some(overdueItem => overdueItem.id === item.id) && <Chip size="small" color="warning" sx={{ ml: 1 }} label="Prazo vencido" />}
              <Typography variant="body2" sx={{ mt: .5, whiteSpace: "pre-wrap" }}>{item.description}</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center" }}>
                {item.evidenceUrl && <Button size="small" component="a" href={item.evidenceUrl} target="_blank" rel="noopener noreferrer">Ver evidência</Button>}
                <Button size="small" onClick={() => open(def.key, item)}>Editar</Button>
              </Stack>
            </Box>)}
          </Stack>
        </CardContent></Card>;
      })}
    </Box>
    <Dialog open={dialog} onClose={() => !saving && setDialog(false)} fullWidth maxWidth="sm">
      <DialogTitle>{editingId ? "Atualizar acompanhamento" : "Registrar ação ou evidência"}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
        <TextField select size="small" label="Entregável" value={form.deliverable} onChange={e => setForm({ ...form, deliverable: e.target.value as Key })}>{definitions.map(def => <MenuItem key={def.key} value={def.key}>{def.title}</MenuItem>)}</TextField>
        <TextField size="small" label="Título" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} slotProps={{ htmlInput: { maxLength: 200 } }} />
        <TextField size="small" multiline minRows={3} label="Análise, ação executada e resultado observado" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <TextField size="small" label="Responsável" value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} />
        <TextField select size="small" label="Situação" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Status })}>{Object.entries(labels).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField>
        <TextField size="small" label="Link da evidência (obrigatório para validada)" value={form.evidenceUrl} onChange={e => setForm({ ...form, evidenceUrl: e.target.value })} />
        <TextField size="small" type="date" label="Prazo" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setDialog(false)} disabled={saving}>Cancelar</Button><Button variant="contained" onClick={() => void save()} disabled={saving}>{saving ? "Salvando..." : "Salvar no servidor"}</Button></DialogActions>
    </Dialog>
  </Stack>;
}
