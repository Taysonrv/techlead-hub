import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress,
  Drawer, FormControl, IconButton, InputLabel, MenuItem, Select, Stack,
  TextField, Tooltip, Typography,
} from "@mui/material";
import { CloseOutlined, InfoOutlined, SearchOutlined } from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";

type Sample = {
  id: number; workItemType: string; title: string; state: string; client: string | null;
  module: string | null; assignedToName: string | null; movideskTicket: number | null;
  deliveredVersion: string | null; taskNumber: number | null; source: "AZURE" | "MOVIDESK";
};
type Data = {
  summary: Record<string, number>;
  samples: Sample[];
  filters: { clients: string[]; users: string[]; types: string[] };
};
const metrics = [
  ["withoutTicket", "Sem ticket Movidesk", "Work Items sem número de atendimento informado."],
  ["withoutClient", "Sem cliente", "Work Items sem Cliente Principal identificado."],
  ["withoutModule", "Sem módulo", "Work Items sem módulo funcional preenchido."],
  ["withoutOwner", "Sem responsável", "Work Items sem Assigned To no Azure."],
  ["completedWithoutVersion", "Concluídas sem versão", "Itens concluídos sem versão de entrega."],
  ["danglingTaskTickets", "Tickets com Task inexistente", "Tickets que apontam para um ID ausente no snapshot Azure."],
  ["duplicatedMovideskLinks", "Vínculos Movidesk duplicados", "Atendimentos relacionados a mais de um Work Item."],
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

  const hasFilters = Boolean(type || client || user || search || issue);
  const title = useMemo(() => metrics.find(([key]) => key === issue)?.[1] ?? "Pendências encontradas", [issue]);

  return <Box sx={{ pt: 5 }}>
    <Typography variant="overline" sx={{ color: aliareColors.greenDark, fontWeight: 850 }}>Governança</Typography>
    <Typography variant="h3" sx={{ fontWeight: 850 }}>Qualidade dos Dados</Typography>
    <Typography color="text.secondary" sx={{ mt: 0.5 }}>Inconsistências do time de suporte e dos clientes SIMER entre Movidesk e Azure DevOps.</Typography>

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
      {metrics.map(([key, label, info]) => <Card key={key} variant="outlined" onClick={() => setIssue(issue === key ? "" : key)} sx={{ cursor: "pointer", borderTop: `3px solid ${issue === key ? aliareColors.green : "#e49b0f"}`, boxShadow: issue === key ? "0 8px 24px rgba(24,199,122,.12)" : undefined }}><CardContent>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }}><Typography variant="h4" sx={{ fontWeight: 850 }}>{data?.summary[key] ?? 0}</Typography><Tooltip title={info}><IconButton size="small" onClick={(event) => event.stopPropagation()}><InfoOutlined fontSize="small" /></IconButton></Tooltip></Stack>
        <Typography sx={{ fontWeight: 750 }}>{label}</Typography><Typography variant="caption" color="text.secondary">Clique para analisar os registros</Typography>
      </CardContent></Card>)}
    </Box>

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
      <Typography variant="caption" color="text.secondary">{data?.samples.length ?? 0} registro(s) no recorte atual</Typography>
      {loading ? <Box sx={{ py: 8, textAlign: "center" }}><CircularProgress /></Box> : <Stack spacing={1} sx={{ mt: 2 }}>{data?.samples.map((item) => <Button key={`${item.source}-${item.id}`} onClick={() => void open(item)} sx={{ justifyContent: "flex-start", textTransform: "none", border: "1px solid", borderColor: "divider", p: 1.3, borderRadius: 1.5 }}><Box sx={{ textAlign: "left", minWidth: 0 }}><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Chip size="small" label={item.workItemType} /><Typography sx={{ fontWeight: 750 }}>#{item.source === "MOVIDESK" ? item.movideskTicket ?? item.id : item.id} · {item.title}</Typography></Stack><Typography variant="caption" color="text.secondary">{[item.state, item.client ?? "Sem cliente", item.module ?? "Sem módulo", item.assignedToName ?? "Sem responsável", item.movideskTicket ? `Ticket ${item.movideskTicket}` : "Sem ticket", item.deliveredVersion ?? "Sem versão"].join(" · ")}</Typography></Box></Button>)}</Stack>}
    </CardContent></Card>

    <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 560 }, p: 3 } } }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }}><Box><Typography variant="overline" color="text.secondary">{selected?.workItemType}</Typography><Typography variant="h5" sx={{ fontWeight: 850 }}>#{selected?.source === "MOVIDESK" ? selected.movideskTicket : selected?.id}</Typography></Box><IconButton onClick={() => setSelected(null)}><CloseOutlined /></IconButton></Stack>
      <Typography variant="h6" sx={{ mt: 2, fontWeight: 750 }}>{selected?.title}</Typography>
      <Stack spacing={1} sx={{ mt: 2 }}>{selected && Object.entries({ Estado: selected.state, Cliente: selected.client, Módulo: selected.module, Responsável: selected.assignedToName, Movidesk: selected.movideskTicket, Versão: selected.deliveredVersion }).map(([label, value]) => <Box key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography>{String(value ?? "Não informado")}</Typography></Box>)}</Stack>
      {detail && <Alert severity="info" sx={{ mt: 2 }}>Detalhes completos e histórico carregados do Azure.</Alert>}
      <Button variant="contained" sx={{ mt: 3 }} onClick={() => selected && navigate(selected.source === "MOVIDESK" ? `/tickets?movidesk=${selected.movideskTicket}` : `${route(selected.workItemType)}?task=${selected.id}`)}>Abrir registro completo</Button>
    </Drawer>
  </Box>;
}

function route(type: string) { const value = type.toLocaleLowerCase("pt-BR"); return value.includes("apoio") ? "/apoios" : value.includes("evolu") ? "/evolucoes" : "/correcoes"; }
