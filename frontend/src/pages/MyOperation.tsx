import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress,
  Drawer, FormControl, IconButton, InputLabel, MenuItem, Select, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import {
  BlockOutlined, CloseOutlined, ConfirmationNumberOutlined, InfoOutlined,
  PriorityHighOutlined, SearchOutlined, TaskAltOutlined, ViewColumnOutlined,
  ViewListOutlined, WorkOutlineOutlined,
} from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";

type Ticket = { id: number; movideskId: number | null; subject: string; status: string; client: string | null; taskNumber: number | null; updatedAt: string };
type WorkItem = { id: number; workItemType: string; title: string; state: string; client: string | null; assignedToName: string | null; prioritized: boolean | null; blockedProcess: boolean | null; deliveredVersion: string | null; movideskTicket: number | null; azureChangedAt: string | null };
type Data = {
  summary: { tickets: number; openWorkItems: number; concludedRecently: number; prioritized: number; blocked: number };
  tickets: Ticket[]; workItems: WorkItem[]; filters: { clients: string[]; types: string[] };
};
type Unified = { key: string; source: "MOVIDESK" | "AZURE"; id: number; title: string; status: string; client: string | null; type: string; date: string; ticket?: Ticket; workItem?: WorkItem };

const cardDefinitions = [
  ["tickets", "Meus tickets", "Atendimentos Movidesk sob responsabilidade do usuário.", "tickets"],
  ["open", "Tarefas abertas", "Correções, Evoluções e Apoios ainda sem desfecho terminal.", "openWorkItems"],
  ["concluded", "Concluídas em 30 dias", "Tarefas vinculadas concluídas nos últimos 30 dias.", "concludedRecently"],
  ["prioritized", "Priorizadas", "Tarefas abertas marcadas como prioridade no Azure.", "prioritized"],
  ["blocked", "Bloqueadas", "Tarefas abertas com bloqueio de processo.", "blocked"],
] as const;
const lanes = ["Aguardando atendimento", "Em andamento", "Pausado", "Aguardando retorno", "Interno", "Concluído"];

export function MyOperation() {
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [client, setClient] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [metric, setMetric] = useState("");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [selected, setSelected] = useState<Unified | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(false);
      const response = await api.get<Data>("/workspace/my-operation", { params: {
        client: client || undefined, type: type || undefined, search: search || undefined,
      } });
      setData(response.data);
    } catch { setError(true); } finally { setLoading(false); }
  }, [client, type, search]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [load]);

  const items = useMemo<Unified[]>(() => {
    if (!data) return [];
    const tickets: Unified[] = data.tickets.map((item) => ({
      key: `ticket-${item.id}`, source: "MOVIDESK" as const, id: item.movideskId ?? item.id,
      title: item.subject, status: item.status, client: item.client, type: "Ticket",
      date: item.updatedAt, ticket: item,
    }));
    const workItems: Unified[] = data.workItems.map((item) => ({
      key: `azure-${item.id}`, source: "AZURE" as const, id: item.id, title: item.title,
      status: item.state, client: item.client, type: item.workItemType,
      date: item.azureChangedAt ?? "", workItem: item,
    }));
    const all = [...tickets, ...workItems];
    return all.filter((item) => {
      if (metric === "tickets") return item.source === "MOVIDESK";
      if (metric === "open") return item.source === "AZURE" && lane(item.status) !== "Concluído";
      if (metric === "concluded") return item.source === "AZURE" && lane(item.status) === "Concluído";
      if (metric === "prioritized") return Boolean(item.workItem?.prioritized);
      if (metric === "blocked") return Boolean(item.workItem?.blockedProcess);
      return true;
    });
  }, [data, metric]);

  return <Box sx={{ pt: 5 }}>
    <Typography variant="overline" sx={{ color: aliareColors.greenDark, fontWeight: 850 }}>Área de trabalho</Typography>
    <Typography variant="h3" sx={{ fontWeight: 850 }}>Minha Operação</Typography>
    <Typography color="text.secondary" sx={{ mt: .5 }}>Acompanhe Movidesk e Azure em uma única experiência operacional.</Typography>

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr auto auto" }, gap: 1.2 }}>
      <TextField size="small" label="Pesquisar ticket, tarefa ou assunto" value={search} onChange={(event) => setSearch(event.target.value)} slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: 1, color: "text.disabled" }} /> } }} />
      <Autocomplete size="small" options={data?.filters.clients ?? []} value={client || null} onChange={(_, value) => setClient(value ?? "")} renderInput={(params) => <TextField {...params} label="Cliente" />} />
      <FormControl size="small"><InputLabel>Tipo</InputLabel><Select label="Tipo" value={type} onChange={(event) => setType(event.target.value)}><MenuItem value="">Todos</MenuItem>{data?.filters.types.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
      <Button onClick={() => { setClient(""); setType(""); setSearch(""); setMetric(""); }}>Limpar</Button>
      <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, value) => value && setView(value)}><ToggleButton value="kanban"><ViewColumnOutlined /></ToggleButton><ToggleButton value="list"><ViewListOutlined /></ToggleButton></ToggleButtonGroup>
    </Box></CardContent></Card>

    {error && <Alert severity="error" sx={{ mt: 2 }}>Não foi possível carregar sua operação.</Alert>}
    <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(5,1fr)" }, gap: 2 }}>
      {cardDefinitions.map(([key, label, info, valueKey]) => {
        const Icon = key === "tickets" ? ConfirmationNumberOutlined : key === "open" ? WorkOutlineOutlined : key === "concluded" ? TaskAltOutlined : key === "prioritized" ? PriorityHighOutlined : BlockOutlined;
        return <Card key={key} variant="outlined" onClick={() => setMetric(metric === key ? "" : key)} sx={{ cursor: "pointer", borderTop: `3px solid ${metric === key ? aliareColors.green : "transparent"}` }}><CardContent><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}><Icon sx={{ color: aliareColors.greenDark }} /><Tooltip title={info}><IconButton size="small" onClick={(event) => event.stopPropagation()}><InfoOutlined fontSize="small" /></IconButton></Tooltip></Stack><Typography variant="h4" sx={{ mt: 1, fontWeight: 850 }}>{data?.summary[valueKey] ?? 0}</Typography><Typography sx={{ fontWeight: 750 }}>{label}</Typography></CardContent></Card>;
      })}
    </Box>

    {loading ? <Box sx={{ py: 10, textAlign: "center" }}><CircularProgress /></Box> : view === "kanban" ? (
      <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: `repeat(${lanes.length}, minmax(260px, 1fr))`, gap: 1.2, overflowX: "auto", pb: 2 }}>
        {lanes.map((column) => { const columnItems = items.filter((item) => lane(item.status) === column); return <Box key={column} sx={{ minWidth: 260, bgcolor: "rgba(16,24,40,.035)", borderRadius: 2, p: 1 }}><Stack direction="row" sx={{ justifyContent: "space-between", px: .5, mb: 1 }}><Typography sx={{ fontWeight: 800, fontSize: ".78rem" }}>{column}</Typography><Chip size="small" label={columnItems.length} /></Stack><Stack spacing={1}>{columnItems.map((item) => <OperationCard key={item.key} item={item} onClick={() => setSelected(item)} />)}</Stack></Box>; })}
      </Box>
    ) : <Stack spacing={1} sx={{ mt: 2 }}>{items.map((item) => <OperationCard key={item.key} item={item} onClick={() => setSelected(item)} />)}</Stack>}

    <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 580 }, p: 3 } } }}>
      <Stack direction="row" sx={{ justifyContent: "space-between" }}><Box><Typography variant="overline" color="text.secondary">{selected?.source} · {selected?.type}</Typography><Typography variant="h5" sx={{ fontWeight: 850 }}>#{selected?.id}</Typography></Box><IconButton onClick={() => setSelected(null)}><CloseOutlined /></IconButton></Stack>
      <Typography variant="h6" sx={{ mt: 2, fontWeight: 750 }}>{selected?.title}</Typography>
      <Stack spacing={1.2} sx={{ mt: 2 }}>{selected && Object.entries({ Estado: selected.status, Cliente: selected.client, Responsável: selected.workItem?.assignedToName, Versão: selected.workItem?.deliveredVersion, "Ticket relacionado": selected.workItem?.movideskTicket, "Task relacionada": selected.ticket?.taskNumber }).map(([label, value]) => <Box key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography>{String(value ?? "Não informado")}</Typography></Box>)}</Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 3 }}><Button variant="contained" onClick={() => selected && navigate(selected.source === "MOVIDESK" ? `/tickets?movidesk=${selected.id}` : `${route(selected.type)}?task=${selected.id}`)}>Abrir detalhes completos</Button>{selected?.workItem?.movideskTicket && <Button onClick={() => navigate(`/tickets?movidesk=${selected.workItem?.movideskTicket}`)}>Abrir atendimento</Button>}</Stack>
    </Drawer>
  </Box>;
}

function OperationCard({ item, onClick }: { item: Unified; onClick: () => void }) {
  return <Card variant="outlined" onClick={onClick} sx={{ cursor: "pointer", borderLeft: `4px solid ${item.source === "MOVIDESK" ? "#1f7acb" : aliareColors.green}`, "&:hover": { boxShadow: "0 8px 24px rgba(0,0,0,.08)" } }}><CardContent sx={{ p: 1.3, "&:last-child": { pb: 1.3 } }}><Stack direction="row" sx={{ justifyContent: "space-between" }}><Typography sx={{ fontWeight: 850, fontSize: ".75rem" }}>#{item.id}</Typography><Chip size="small" label={item.type} sx={{ height: 20, fontSize: ".62rem" }} /></Stack><Typography sx={{ mt: .6, fontSize: ".78rem", lineHeight: 1.35, fontWeight: 650 }}>{item.title}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .7 }}>{item.client ?? "Cliente não informado"}</Typography>{(item.workItem?.prioritized || item.workItem?.blockedProcess) && <Stack direction="row" spacing={.5} sx={{ mt: .7 }}>{item.workItem.prioritized && <Chip size="small" color="warning" label="Prioridade" />}{item.workItem.blockedProcess && <Chip size="small" color="error" label="Bloqueio" />}</Stack>}</CardContent></Card>;
}
function lane(status: string) { const value = status.toLocaleLowerCase("pt-BR"); if (/(conclu|closed|done|resolv|cancel)/.test(value)) return "Concluído"; if (/(paus|suspens)/.test(value)) return "Pausado"; if (/(retorno|cliente)/.test(value)) return "Aguardando retorno"; if (/(intern|desenvolv|qualifica)/.test(value)) return "Interno"; if (/(andamento|active|doing|progress)/.test(value)) return "Em andamento"; return "Aguardando atendimento"; }
function route(type: string) { const value = type.toLocaleLowerCase("pt-BR"); return value.includes("apoio") ? "/apoios" : value.includes("evolu") ? "/evolucoes" : "/correcoes"; }
