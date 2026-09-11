import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, Drawer, FormControl, InputLabel, MenuItem, Select, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { InfoOutlined, OpenInNewOutlined, SearchOutlined, ViewColumnOutlined, ViewListOutlined } from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { DetailFieldGrid, DetailPanelHeader, DetailSection } from "../components/DetailPanel";
import { detailDrawerPaperSx } from "../theme/layoutTokens";

type Ticket = { id: number; movideskId: number; subject: string; status: string; client: string | null; taskNumber: number | null; updatedAt: string };
type WorkItem = { id: number; workItemType: string; title: string; state: string; client: string | null; participantClients?: string | string[] | null; assignedToName: string | null; prioritized: boolean | null; blockedProcess: boolean | null; deliveredVersion: string | null; movideskTicket: number | null; participantMovideskTickets?: string | number[] | null; azureChangedAt: string | null };
type VersionGroup = { channel: string; version: string; tasks: Array<Pick<WorkItem, "id" | "workItemType" | "title" | "state" | "deliveredVersion">> };
type Data = { summary: { tickets: number; openWorkItems: number; concludedRecently: number; prioritized: number; blocked: number }; tickets: Ticket[]; workItems: WorkItem[]; latestVersions: VersionGroup[]; filters: { clients: string[]; types: string[] } };
type TicketDetail = { ticket: Ticket & Record<string, unknown>; relatedWorkItems: WorkItem[] };
type KnowledgeItem = { id?: number | null; title: string; path?: string; excerpt: string; webUrl: string | null; score?: number; source?: "azure-wiki" | "sharepoint" | "bpmn" };
type Unified = { key: string; source: "MOVIDESK" | "AZURE"; id: number; title: string; status: string; client: string | null; type: string; ticket?: Ticket; workItem?: WorkItem };
type SourceView = "tickets" | "tasks" | "both";

const metrics = [
  ["tickets", "Meus atendimentos", "Atendimentos Movidesk sob sua responsabilidade.", "tickets"],
  ["open", "Tarefas abertas", "Correções, Evoluções e Apoios abertos por você ou atribuídos a você.", "openWorkItems"],
  ["concluded", "Concluídas em 30 dias", "Tarefas relacionadas concluídas nos últimos 30 dias.", "concludedRecently"],
  ["prioritized", "Priorizadas", "Tarefas abertas marcadas como prioridade no Azure.", "prioritized"],
  ["blocked", "Bloqueadas", "Tarefas abertas com bloqueio de processo.", "blocked"],
] as const;
const lanes = ["Aguardando atendimento", "Em andamento", "Pausado", "Aguardando retorno", "Interno", "Concluídos/Fechados"];
const SHAREPOINT_SITE = "https://siagri365.sharepoint.com/sites/cooperativas-agroindustrias-simer";

export function MyOperation() {
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [client, setClient] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [metric, setMetric] = useState("");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [sourceView, setSourceView] = useState<SourceView>("tickets");
  const [selected, setSelected] = useState<Unified | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dragged, setDragged] = useState<Ticket | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const response = await api.get<Data>("/workspace/my-operation", { params: { client: client || undefined, type: type || undefined, search: search || undefined } });
      setData(response.data);
    } catch { setError("Não foi possível carregar sua operação."); } finally { setLoading(false); }
  }, [client, type, search]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [load]);

  const items = useMemo<Unified[]>(() => {
    if (!data) return [];
    const tickets = data.tickets.map<Unified>((item) => ({ key: `ticket-${item.id}`, source: "MOVIDESK", id: item.movideskId, title: item.subject, status: item.status, client: item.client, type: "Atendimento", ticket: item }));
    const tasks = data.workItems.map<Unified>((item) => ({ key: `azure-${item.id}`, source: "AZURE", id: item.id, title: item.title, status: item.state, client: item.client, type: item.workItemType, workItem: item }));
    const sourceItems = sourceView === "tickets" ? tickets : sourceView === "tasks" ? tasks : [...tickets, ...tasks];
    return sourceItems.filter((item) => {
      if (metric === "tickets") return item.source === "MOVIDESK";
      if (metric === "open") return item.source === "AZURE" && lane(item.status) !== "Concluídos/Fechados";
      if (metric === "concluded") return item.source === "AZURE" && lane(item.status) === "Concluídos/Fechados";
      if (metric === "prioritized") return Boolean(item.workItem?.prioritized);
      if (metric === "blocked") return Boolean(item.workItem?.blockedProcess);
      return true;
    });
  }, [data, metric, sourceView]);

  const searchKnowledge = async (query: string) => {
    const normalized = query.trim();
    setKnowledgeQuery(normalized);
    if (normalized.length < 3) { setKnowledge([]); return; }
    try {
      setKnowledgeLoading(true);
      const response = await api.get<{ items: KnowledgeItem[] }>("/knowledge/search", { params: { q: normalized } });
      setKnowledge(response.data.items);
    } catch { setKnowledge([]); } finally { setKnowledgeLoading(false); }
  };

  const openItem = async (item: Unified) => {
    setSelected(item); setDetail(null);
    setKnowledge([]);
    void searchKnowledge(item.title);
    if (!item.ticket) return;
    try {
      setDetailLoading(true);
      const response = await api.get<TicketDetail>(`/workspace/my-operation/tickets/${item.ticket.id}`);
      setDetail(response.data);
    } catch { setError("Não foi possível carregar os detalhes completos do atendimento."); } finally { setDetailLoading(false); }
  };

  const changeStatus = async (targetLane: string) => {
    if (!dragged || savingStatus || lane(dragged.status) === targetLane) { setDragged(null); return; }
    const status = statusForLane(targetLane);
    try {
      setSavingStatus(true); setError("");
      await api.patch(`/workspace/my-operation/tickets/${dragged.id}/status`, { status });
      await load();
    } catch (requestError: unknown) {
      setError((requestError as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Não foi possível salvar a mudança de status.");
    } finally { setSavingStatus(false); setDragged(null); }
  };

  return <Box sx={{ pb: 4, minHeight: 0 }}>
    <PageHeader eyebrow="Operação" title="Minha Operação" description="Seus atendimentos Movidesk e tarefas Azure em uma única experiência operacional." meta={`${items.length} registro(s) no recorte atual`} />

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr 1fr 1fr auto auto" }, gap: 1.2 }}>
      <TextField size="small" label="Pesquisar ticket, tarefa ou assunto" value={search} onChange={(event) => setSearch(event.target.value)} slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: 1, color: "text.disabled" }} /> } }} />
      <Autocomplete size="small" options={data?.filters.clients ?? []} value={client || null} onChange={(_, value) => setClient(value ?? "")} renderInput={(params) => <TextField {...params} label="Cliente" />} />
      <FormControl size="small"><InputLabel>Conteúdo</InputLabel><Select label="Conteúdo" value={sourceView} onChange={(event) => setSourceView(event.target.value as SourceView)}><MenuItem value="tickets">Atendimentos</MenuItem><MenuItem value="tasks">Tarefas</MenuItem><MenuItem value="both">Ambos</MenuItem></Select></FormControl>
      <FormControl size="small"><InputLabel>Tipo de tarefa</InputLabel><Select label="Tipo de tarefa" value={type} onChange={(event) => setType(event.target.value)} disabled={sourceView === "tickets"}><MenuItem value="">Todas</MenuItem>{data?.filters.types.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
      <Button onClick={() => { setClient(""); setType(""); setSearch(""); setMetric(""); }}>Limpar</Button>
      <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, value) => value && setView(value)}><ToggleButton value="kanban" aria-label="Kanban"><ViewColumnOutlined /></ToggleButton><ToggleButton value="list" aria-label="Lista"><ViewListOutlined /></ToggleButton></ToggleButtonGroup>
    </Box></CardContent></Card>

    {error && <Alert severity="error" onClose={() => setError("")} sx={{ mt: 2 }}>{error}</Alert>}
    {savingStatus && <Alert severity="info" sx={{ mt: 2 }}>Salvando a organização do atendimento…</Alert>}
    <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(5,1fr)" }, gap: 2 }}>
      {metrics.map(([key, label, info, valueKey]) => <KpiCard key={key} title={label} value={data?.summary[valueKey] ?? 0} subtitle="Clique para filtrar a operação" info={info} accent={metric === key ? aliareColors.green : aliareColors.greenDark} active={metric === key} onClick={() => setMetric(metric === key ? "" : key)} />)}
    </Box>

    {loading ? <Box sx={{ py: 10, textAlign: "center" }}><CircularProgress /></Box> : items.length === 0 ? <Alert severity="info" sx={{ mt: 2 }}>Nenhum registro encontrado para os filtros selecionados.</Alert> : view === "kanban" ?
      <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))", xxl: "repeat(6, minmax(0, 1fr))" }, alignItems: "start", gap: 1.2, width: "100%", minWidth: 0, overflowX: "hidden", pb: 2 }}>
        {lanes.map((column) => { const columnItems = items.filter((item) => lane(item.status) === column); return <Box key={column} onDragOver={(event) => dragged && event.preventDefault()} onDrop={() => void changeStatus(column)} sx={{ minWidth: 0, maxHeight: "calc(100vh - 360px)", overflowY: "auto", overflowX: "hidden", bgcolor: dragged ? "rgba(22,196,127,.07)" : "rgba(16,24,40,.035)", borderRadius: 2.5, border: "1px solid", borderColor: dragged ? "success.light" : "divider", p: 1 }}><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", px: .5, mb: 1, minHeight: 28 }}><Typography sx={{ fontWeight: 800, fontSize: ".78rem", lineHeight: 1.2 }}>{column}</Typography><Chip size="small" label={columnItems.length} /></Stack><Stack spacing={1}>{columnItems.map((item) => <OperationCard key={item.key} item={item} draggable={Boolean(item.ticket)} onDragStart={() => item.ticket && setDragged(item.ticket)} onDragEnd={() => setDragged(null)} onClick={() => void openItem(item)} />)}</Stack></Box>; })}
      </Box> : <Stack spacing={1} sx={{ mt: 2 }}>{items.map((item) => <OperationCard key={item.key} item={item} draggable={false} onClick={() => void openItem(item)} />)}</Stack>}

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent><Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}><Box><Typography variant="h6" sx={{ fontWeight: 850 }}>Versões atuais para consulta</Typography><Typography variant="body2" color="text.secondary">Últimas versões LTS, LTE e RC identificadas no Azure, com suas tarefas.</Typography></Box><Button endIcon={<OpenInNewOutlined />} onClick={() => navigate("/versoes")}>Abrir versões</Button></Stack>
      {data?.latestVersions.length ? <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3,1fr)" }, gap: 1.5 }}>{data.latestVersions.map((group) => <Card key={group.channel} variant="outlined"><CardContent><Stack direction="row" sx={{ justifyContent: "space-between" }}><Chip label={group.channel} color="success" size="small" /><Typography sx={{ fontWeight: 850 }}>{group.version}</Typography></Stack><Stack spacing={.7} sx={{ mt: 1.5 }}>{group.tasks.map((task) => <Button key={task.id} onClick={() => navigate(`${route(task.workItemType)}?task=${task.id}`)} sx={{ justifyContent: "flex-start", textTransform: "none", textAlign: "left" }}>#{task.id} · {task.title}</Button>)}</Stack></CardContent></Card>)}</Box> : <Alert severity="info" sx={{ mt: 2 }}>Nenhuma versão LTS, LTE ou RC foi identificada.</Alert>}
    </CardContent></Card>

    <Drawer anchor="right" open={Boolean(selected)} onClose={() => { setSelected(null); setDetail(null); }} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
      <DetailPanelHeader eyebrow={`${selected?.source ?? ""} · ${selected?.type ?? ""}`} title={selected?.title ?? "Detalhes do registro"} identifier={`#${selected?.id ?? ""}`} onClose={() => { setSelected(null); setDetail(null); }} />
      {detailLoading && <CircularProgress size={24} sx={{ mb: 2 }} />}
      <DetailSection title="Visão operacional"><DetailFieldGrid fields={selected ? Object.entries({ Estado: selected.status, "Cliente principal": detail?.ticket.client ?? selected.client, "Clientes participantes": formatList(selected.workItem?.participantClients), Contato: detail?.ticket.contact, Categoria: detail?.ticket.category, Urgência: detail?.ticket.urgency, Serviço: detail?.ticket.service, Equipe: detail?.ticket.ownerTeam, Responsável: detail?.ticket.owner ?? selected.workItem?.assignedToName, "Prazo de solução": detail?.ticket.dueDate, Versão: selected.workItem?.deliveredVersion, "Ticket principal": selected.workItem?.movideskTicket, "Tickets participantes": formatList(selected.workItem?.participantMovideskTickets), "Task relacionada": selected.ticket?.taskNumber }).map(([label, value]) => [label, String(value ?? "Não informado")]) : []} /></DetailSection>
      {detail?.relatedWorkItems.length ? <Box sx={{ mt: 3 }}><Typography sx={{ fontWeight: 850 }}>Tarefas vinculadas</Typography><Stack spacing={1} sx={{ mt: 1 }}>{detail.relatedWorkItems.map((task) => <Button key={task.id} variant="outlined" endIcon={<OpenInNewOutlined />} onClick={() => navigate(`${route(task.workItemType)}?task=${task.id}`)} sx={{ justifyContent: "space-between", textTransform: "none" }}>#{task.id} · {task.workItemType}</Button>)}</Stack></Box> : null}
      <Card variant="outlined" sx={{ mt: 3 }}><CardContent>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}><Box><Typography sx={{ fontWeight: 850 }}>Base de conhecimento</Typography><Typography variant="caption" color="text.secondary">Sugestões da Wiki e pesquisa contextual no SharePoint SIMER.</Typography></Box><Tooltip title="A pesquisa usa palavras do assunto do atendimento. Você pode refinar por rotina, módulo ou mensagem de erro."><InfoOutlined color="action" fontSize="small" /></Tooltip></Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.5 }}><TextField fullWidth size="small" label="Pesquisar procedimento, rotina ou erro" value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void searchKnowledge(knowledgeQuery)} /><Button variant="contained" onClick={() => void searchKnowledge(knowledgeQuery)}>Pesquisar</Button></Stack>
        {knowledgeLoading ? <CircularProgress size={22} sx={{ mt: 2 }} /> : knowledge.length ? <Stack spacing={1} sx={{ mt: 1.5 }}>{knowledge.map((item, index) => <Card key={`${item.id}-${item.path}-${index}`} variant="outlined"><CardContent sx={{ p: 1.4, "&:last-child": { pb: 1.4 } }}><Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}><Typography sx={{ fontWeight: 800 }}>{item.title}</Typography><Chip size="small" label={item.source === "bpmn" ? "BPMN" : item.source === "sharepoint" ? "SharePoint" : "Wiki"} /></Stack>{item.path && <Typography variant="caption" color="text.secondary">{item.path}</Typography>}<Typography variant="body2" sx={{ mt: .5 }}>{item.excerpt}</Typography>{item.webUrl && <Button size="small" component="a" href={item.webUrl} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewOutlined />} sx={{ mt: .5, px: 0 }}>Abrir conteúdo</Button>}</CardContent></Card>)}</Stack> : <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>Nenhum conteúdo correspondente foi localizado. Tente informar o nome da rotina ou módulo.</Typography>}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.5 }}><Button variant="outlined" component="a" href={`${SHAREPOINT_SITE}/_layouts/15/search.aspx/siteall?q=${encodeURIComponent(knowledgeQuery)}`} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewOutlined />}>Pesquisar no SharePoint</Button><Button component="a" href={SHAREPOINT_SITE} target="_blank" rel="noopener noreferrer">Abrir portal SIMER</Button></Stack>
      </CardContent></Card>
      <Stack direction="row" spacing={1} sx={{ mt: 3, flexWrap: "wrap" }}><Button variant="contained" onClick={() => selected && navigate(selected.source === "MOVIDESK" ? `/tickets?movidesk=${selected.id}` : `${route(selected.type)}?task=${selected.id}`)}>Abrir registro completo</Button>{selected?.workItem?.movideskTicket && <Button onClick={() => navigate(`/tickets?movidesk=${selected?.workItem?.movideskTicket}`)}>Abrir atendimento</Button>}</Stack>
    </Drawer>
  </Box>;
}

function OperationCard({ item, draggable, onDragStart, onDragEnd, onClick }: { item: Unified; draggable: boolean; onDragStart?: () => void; onDragEnd?: () => void; onClick: () => void }) {
  return <Card elevation={0} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick} sx={{ width: "100%", minWidth: 0, minHeight: 142, cursor: draggable ? "grab" : "pointer", border: "1px solid", borderColor: "divider", borderLeft: `4px solid ${item.source === "MOVIDESK" ? "#1f7acb" : aliareColors.green}`, borderRadius: 2.5, bgcolor: "background.paper", transition: "transform .15s ease, box-shadow .15s ease, border-color .15s ease", "&:hover": { transform: "translateY(-1px)", boxShadow: "0 4px 12px rgba(16,24,40,.06)", borderColor: "rgba(16,24,40,.16)" }, "&:active": { cursor: draggable ? "grabbing" : "pointer" } }}><CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}><Stack direction="row" spacing={.75} sx={{ justifyContent: "space-between", alignItems: "center", minWidth: 0 }}><Typography sx={{ fontWeight: 800, fontSize: ".78rem", flexShrink: 0 }}>#{item.id}</Typography><Chip size="small" label={item.type} sx={{ height: 22, minWidth: 0, maxWidth: "65%", fontSize: ".65rem", "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }} /></Stack><Typography sx={{ mt: .75, fontSize: ".8rem", lineHeight: 1.35, fontWeight: 700, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{item.title}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.client ?? "Cliente não informado"}</Typography>{(item.workItem?.prioritized || item.workItem?.blockedProcess) && <Stack direction="row" spacing={.5} sx={{ mt: .75, flexWrap: "wrap" }}>{item.workItem.prioritized && <Chip size="small" color="warning" label="Prioridade" />}{item.workItem.blockedProcess && <Chip size="small" color="error" label="Bloqueio" />}</Stack>}</CardContent></Card>;
}
function lane(status: string) { const value = status.toLocaleLowerCase("pt-BR"); if (/(conclu|closed|done|resolv|fech|cancel)/.test(value)) return "Concluídos/Fechados"; if (/(paus|suspens)/.test(value)) return "Pausado"; if (/(retorno|cliente)/.test(value)) return "Aguardando retorno"; if (/(intern|desenvolv|qualifica)/.test(value)) return "Interno"; if (/(andamento|active|doing|progress)/.test(value)) return "Em andamento"; if (/(novo|new|atribu|assigned)/.test(value)) return "Aguardando atendimento"; return "Aguardando atendimento"; }
function statusForLane(targetLane: string) { if (targetLane === "Concluídos/Fechados") return "Fechado"; if (targetLane === "Aguardando atendimento") return "Atribuído"; return targetLane; }
function route(type: string) { const value = type.toLocaleLowerCase("pt-BR"); return value.includes("apoio") ? "/apoios" : value.includes("evolu") ? "/evolucoes" : "/correcoes"; }
function formatList(value: string | string[] | number[] | null | undefined) { if (Array.isArray(value)) return value.join(", ") || "Não informado"; return value?.replace(/^,|,$/g, "").replace(/\r?\n/g, ", ") || "Não informado"; }
