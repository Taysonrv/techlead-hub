import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress,
  Drawer, FormControl, InputLabel, MenuItem, Select, Stack,
  TextField, Typography,
} from "@mui/material";
import { DownloadOutlined, SearchOutlined } from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { DetailFieldGrid, DetailPanelHeader, DetailSection } from "../components/DetailPanel";
import { detailDrawerPaperSx } from "../theme/layoutTokens";

type Sample = {
  id: number; workItemType: string; title: string; state: string; client: string | null;
  module: string | null; assignedToName: string | null; movideskTicket: number | null;
  participantClients?: string | string[] | null;
  participantMovideskTickets?: string | number[] | null;
  deliveredVersion: string | null; taskNumber: number | null; taskState?: string | null;
  taskTitle?: string | null; taskClient?: string | null; source: "AZURE" | "MOVIDESK";
};
type Data = {
  summary: Record<string, number>;
  samples: Sample[];
  filters: { clients: string[]; users: string[]; types: string[] };
};
const metrics = [
  ["ticketOpenTaskFinished", "Pronto para encerrar", "Ticket ainda pendente, mas a Task foi cancelada ou concluída e possui versão efetivamente entregue. Aguardando validar versão não entra neste recorte.", "Fluxo"],
  ["ticketOpenTaskWithoutDelivery", "Task finalizada sem entrega", "Task concluída vinculada a ticket aberto, porém sem versão de entrega importada no Movidesk. Exige validar publicação antes de encerrar.", "Fluxo"],
  ["ticketClosedTaskOpen", "Ticket encerrado com Task ativa", "Ticket concluído, fechado ou resolvido enquanto a Task relacionada ainda está em andamento.", "Fluxo"],
  ["activeTaskWithVersion", "Task ativa com versão informada", "Task não finalizada que já possui versão preenchida. Pode indicar classificação antecipada ou estado desatualizado.", "Versão"],
  ["completedWithoutVersion", "Task finalizada sem versão", "Correção, evolução ou apoio concluído no Azure sem versão de entrega informada.", "Versão"],
  ["clientMismatch", "Cliente divergente", "O cliente principal do ticket difere do cliente principal da Correção ou Evolução relacionada. APOIO não exige cliente.", "Vínculo"],
  ["supportLinkDivergence", "APOIO com vínculo divergente", "APOIO referencia ticket inexistente no recorte ou ticket que aponta para outra Task. Cliente e versão não são obrigatórios para APOIO.", "APOIO"],
  ["danglingTaskTickets", "Referência de Task inexistente", "Ticket aponta para um ID de Task ausente no snapshot atual do Azure.", "Vínculo"],
  ["duplicatedMovideskLinks", "Ticket ligado a várias Tasks", "O mesmo atendimento Movidesk está como vínculo principal em mais de uma Task; revisar se todas as relações são válidas.", "Vínculo"],
  ["withoutTicket", "Task sem ticket", "Work Item sem atendimento principal, participante ou vínculo reverso no Movidesk.", "Cadastro"],
  ["withoutClient", "Task sem cliente", "Work Item sem cliente principal e sem clientes participantes identificados.", "Cadastro"],
  ["withoutModule", "Task sem módulo", "Work Item sem módulo ou rotina funcional preenchida.", "Cadastro"],
  ["withoutOwner", "Task sem responsável", "Work Item sem responsável definido no Azure DevOps.", "Cadastro"],
] as const;

export function DataQuality() {
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [type, setType] = useState("");
  const [client, setClient] = useState("");
  const [user, setUser] = useState("");
  const [search, setSearch] = useState("");
  const [issue, setIssue] = useState("");
  const [selected, setSelected] = useState<Sample | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(false);
      const response = await api.get<Data>("/workspace/data-quality", { params: {
        type: type || undefined, client: client || undefined, user: user || undefined,
        issue: issue || undefined, search: search || undefined,
      } });
      setData(response.data);
    } catch { setError(true); } finally { setLoading(false); }
  }, [type, client, user, issue, search]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [load]);

  async function open(item: Sample) {
    setSelected(item); setDetail(null);
    if (item.source === "AZURE") {
      const response = await api.get<Record<string, unknown>>(`/azure-work-items/${item.id}`);
      setDetail(response.data);
    }
  }

  function exportPendingList() {
    const rows = data?.samples ?? [];
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = ["Origem", "Tipo", "Atendimento", "Assunto / Título", "Cliente do ticket", "Cliente da Task", "Analista", "Status do ticket / Task", "Task", "Estado da Task", "Versão entregue"];
    const csv = [header, ...rows.map((item) => [
      item.source,
      item.workItemType,
      item.movideskTicket ?? item.id,
      item.title,
      item.client,
      item.taskClient,
      item.assignedToName,
      item.state,
      item.taskNumber,
      item.taskState,
      item.deliveredVersion,
    ])].map((row) => row.map(escape).join(";")).join("\\r\\n");
    const blob = new Blob(["\\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const analyst = user ? user.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() : "equipe";
    anchor.href = url;
    const recorte = (issue || "todas-pendencias").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    anchor.download = `pendencias-${recorte}-${analyst}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const hasFilters = Boolean(type || client || user || search || issue);
  const title = useMemo(() => metrics.find(([key]) => key === issue)?.[1] ?? "Pendências encontradas", [issue]);

  return <Box sx={{ pb: 4 }}>
    <PageHeader eyebrow="Governança" title="Pendências" description="Central de inconsistências cadastrais, vínculos e etapas divergentes entre tickets, Tasks e versões." meta={`${data?.samples.length ?? 0} registro(s) no recorte atual`} />

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr repeat(3, minmax(170px, 1fr)) auto" }, gap: 1.2 }}>
        <TextField size="small" label="Pesquisar ID ou título" value={search} onChange={(e) => setSearch(e.target.value)} slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: 1, color: "text.disabled" }} /> } }} />
        <FormControl size="small"><InputLabel>Tipo</InputLabel><Select label="Tipo" value={type} onChange={(e) => setType(e.target.value)}><MenuItem value="">Todos</MenuItem>{data?.filters.types.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
        <Autocomplete size="small" options={data?.filters.clients ?? []} value={client || null} onChange={(_, value) => setClient(value ?? "")} renderInput={(params) => <TextField {...params} label="Cliente" />} />
        <Autocomplete size="small" options={data?.filters.users ?? []} value={user || null} onChange={(_, value) => setUser(value ?? "")} renderInput={(params) => <TextField {...params} label="Usuário do suporte" />} />
        <Button disabled={!hasFilters} onClick={() => { setType(""); setClient(""); setUser(""); setSearch(""); setIssue(""); }}>Limpar</Button>
      </Box>
    </CardContent></Card>

    {error && <Alert severity="error" sx={{ mt: 2 }}>Não foi possível analisar a qualidade dos dados.</Alert>}
    <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", lg: "repeat(4,1fr)" }, gap: 2 }}>
      {metrics.map(([key, label, info, group]) => <KpiCard key={key} title={label} value={data?.summary[key] ?? 0} subtitle={group} info={info} accent={issue === key ? aliareColors.green : group === "Fluxo" ? "#ef4444" : group === "Versão" ? "#8b5cf6" : group === "Vínculo" ? "#f59e0b" : group === "APOIO" ? "#0891b2" : "#2676b9"} active={issue === key} onClick={() => setIssue(issue === key ? "" : key)} />)}
    </Box>

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">{data?.samples.length ?? 0} registro(s) no recorte atual</Typography>
        </Box>
        <Button variant="outlined" startIcon={<DownloadOutlined />} disabled={!data?.samples.length} onClick={exportPendingList}>
          Exportar lista{user ? " do analista" : ""}
        </Button>
      </Stack>
      {loading ? <Box sx={{ py: 8, textAlign: "center" }}><CircularProgress /></Box> : <Stack spacing={1} sx={{ mt: 2 }}>{data?.samples.map((item) => <Button key={`${item.source}-${item.id}`} onClick={() => void open(item)} sx={{ justifyContent: "flex-start", textTransform: "none", border: "1px solid", borderColor: "divider", p: 1.3, borderRadius: 1.5 }}><Box sx={{ textAlign: "left", minWidth: 0 }}><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Chip size="small" label={item.workItemType} /><Typography sx={{ fontWeight: 750 }}>#{item.source === "MOVIDESK" ? item.movideskTicket ?? item.id : item.id} · {item.title}</Typography></Stack><Typography variant="caption" color="text.secondary">{[item.state, item.client ?? "Sem cliente", item.module ?? "Sem módulo", item.assignedToName ?? "Sem responsável", item.movideskTicket ? `Ticket ${item.movideskTicket}` : "Sem ticket", item.taskNumber ? `Task #${item.taskNumber}` : "Sem Task", item.taskState ?? null, item.deliveredVersion ?? "Sem versão"].filter(Boolean).join(" · ")}</Typography></Box></Button>)}</Stack>}
    </CardContent></Card>

    <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
      <DetailPanelHeader eyebrow={selected?.workItemType} title={selected?.title ?? "Detalhes do registro"} identifier={`#${selected?.source === "MOVIDESK" ? selected.movideskTicket : selected?.id}`} onClose={() => setSelected(null)} />
      <DetailSection title="Visão operacional"><DetailFieldGrid fields={selected ? Object.entries({ Estado: selected.state, "Cliente principal": selected.client, "Clientes participantes": formatList(selected.participantClients), Módulo: selected.module, Responsável: selected.assignedToName, "Ticket principal": selected.movideskTicket, "Tickets participantes": formatList(selected.participantMovideskTickets), "Task relacionada": selected.taskNumber ? `#${selected.taskNumber}` : null, "Estado da Task": selected.taskState, "Título da Task": selected.taskTitle, "Cliente da Task": selected.taskClient, Versão: selected.deliveredVersion }).map(([label, value]) => [label, String(value ?? "Não informado")]) : []} /></DetailSection>
      {detail && <Alert severity="info" sx={{ mt: 2 }}>Detalhes completos e histórico carregados do Azure.</Alert>}
      <Button variant="contained" sx={{ mt: 3 }} onClick={() => selected && navigate(selected.source === "MOVIDESK" ? `/tickets?movidesk=${selected.movideskTicket}` : `${route(selected.workItemType)}?task=${selected.id}`)}>Abrir registro completo</Button>
    </Drawer>
  </Box>;
}

function route(type: string) { const value = type.toLocaleLowerCase("pt-BR"); return value.includes("apoio") ? "/apoios" : value.includes("evolu") ? "/evolucoes" : "/correcoes"; }
function formatList(value: string | string[] | number[] | null | undefined) { if (Array.isArray(value)) return value.join(", ") || "Não informado"; return value?.replace(/^,|,$/g, "").replace(/\r?\n/g, ", ") || "Não informado"; }
