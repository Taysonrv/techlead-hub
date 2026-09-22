import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, Drawer, FormControl, InputLabel, MenuItem, Select, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { BookmarkAddOutlined, CalendarMonthOutlined, DeleteOutlined, DragIndicatorOutlined, FilterAltOutlined, GroupsOutlined, InfoOutlined, OpenInNewOutlined, ScheduleOutlined, SearchOutlined, TaskAltOutlined, ViewColumnOutlined, ViewListOutlined } from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { DetailFieldGrid, DetailPanelHeader, DetailSection } from "../components/DetailPanel";
import { detailDrawerPaperSx } from "../theme/layoutTokens";

type Ticket = { id: number; movideskId: number; subject: string; status: string; client: string | null; taskNumber: number | null; updatedAt: string };
type WorkItem = { id: number; workItemType: string; title: string; state: string; client: string | null; participantClients?: string | string[] | null; assignedToName: string | null; prioritized: boolean | null; blockedProcess: boolean | null; registeredVersion: string | null; deliveredVersion: string | null; movideskTicket: number | null; participantMovideskTickets?: string | number[] | null; azureChangedAt: string | null };
type VersionGroup = { channel: string; version: string; tasks: Array<Pick<WorkItem, "id" | "workItemType" | "title" | "state" | "deliveredVersion">> };
type Data = { summary: { tickets: number; openWorkItems: number; concludedRecently: number; prioritized: number; blocked: number }; tickets: Ticket[]; workItems: WorkItem[]; latestVersions: VersionGroup[]; filters: { clients: string[]; types: string[]; analysts: string[]; teams: Array<{ name: string; members: string[] }> } };
type TicketDetail = { ticket: Ticket & Record<string, unknown>; relatedWorkItems: WorkItem[] };
type KnowledgeItem = { id?: number | null; title: string; path?: string; excerpt: string; webUrl: string | null; score?: number; source?: "azure-wiki" | "sharepoint" | "bpmn" };
type Unified = { key: string; source: "MOVIDESK" | "AZURE"; id: number; title: string; status: string; client: string | null; type: string; updatedAt: string | null; ticket?: Ticket; workItem?: WorkItem };
type SourceView = "tickets" | "tasks" | "both";
type SortMode = "priority" | "recent" | "oldest";
type SavedView = { id: string; name: string; client: string; type: string; search: string; metric: string; sourceView: SourceView; view: "kanban" | "list"; sort: SortMode };
type MicrosoftOperation = {
  connected: boolean;
  plannerTasks: Array<{ id: string; title: string; percentComplete?: number; dueDateTime?: string | null; planId?: string }>;
  events: Array<{ id: string; subject: string; start?: { dateTime?: string; timeZone?: string }; end?: { dateTime?: string; timeZone?: string }; webLink?: string }>;
  teams: Array<{ id: string; displayName: string; webUrl?: string }>;
  warnings: string[];
};

const metrics = [
  ["tickets", "Meus atendimentos", "Atendimentos Movidesk sob sua responsabilidade.", "tickets"],
  ["open", "Tarefas abertas", "Correções, Evoluções e Apoios abertos por você ou atribuídos a você.", "openWorkItems"],
  ["concluded", "Concluídas em 30 dias", "Tarefas relacionadas concluídas nos últimos 30 dias.", "concludedRecently"],
  ["prioritized", "Priorizadas", "Tarefas abertas marcadas como prioridade no Azure.", "prioritized"],
  ["blocked", "Bloqueadas", "Tarefas abertas com bloqueio de processo.", "blocked"],
] as const;
const lanes = ["Aguardando atendimento", "Em andamento", "Pausado", "Aguardando retorno", "Interno", "Concluídos/Fechados"];
const INITIAL_LANE_LIMIT = 6;
const LANE_INCREMENT = 12;
const laneColors: Record<string, string> = {
  "Aguardando atendimento": "#2878c8",
  "Em andamento": "#0f9f6e",
  "Pausado": "#e7a500",
  "Aguardando retorno": "#8b5cf6",
  "Interno": "#64748b",
  "Concluídos/Fechados": "#15805d",
};
const SHAREPOINT_SITE = "https://siagri365.sharepoint.com/sites/cooperativas-agroindustrias-simer";

export function MyOperation() {
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [client, setClient] = useState("");
  const [analyst, setAnalyst] = useState("");
  const [team, setTeam] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [metric, setMetric] = useState("");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [sourceView, setSourceView] = useState<SourceView>("tickets");
  const [selected, setSelected] = useState<Unified | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [dragged, setDragged] = useState<Ticket | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [visibleByLane, setVisibleByLane] = useState<Record<string, number>>({});
  const [sort, setSort] = useState<SortMode>("priority");
  const [microsoft, setMicrosoft] = useState<MicrosoftOperation | null>(null);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    try { return JSON.parse(localStorage.getItem("my-operation-saved-views") || "[]"); } catch { return []; }
  });

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const response = await api.get<Data>("/workspace/my-operation", { params: { client: client || undefined, analyst: analyst || undefined, team: team || undefined, type: type || undefined, search: search || undefined } });
      setData(response.data);
    } catch { setError("Não foi possível carregar sua operação."); } finally { setLoading(false); }
  }, [client, analyst, team, type, search]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    let active = true;
    setMicrosoftLoading(true);
    api.get<MicrosoftOperation>("/knowledge/microsoft/operation")
      .then((response) => { if (active) setMicrosoft(response.data); })
      .catch(() => { if (active) setMicrosoft(null); })
      .finally(() => { if (active) setMicrosoftLoading(false); });
    return () => { active = false; };
  }, []);

  const items = useMemo<Unified[]>(() => {
    if (!data) return [];
    const tickets = data.tickets.map<Unified>((item) => ({ key: `ticket-${item.id}`, source: "MOVIDESK", id: item.movideskId, title: item.subject, status: item.status, client: item.client, type: "Atendimento", updatedAt: item.updatedAt, ticket: item }));
    const tasks = data.workItems.map<Unified>((item) => ({ key: `azure-${item.id}`, source: "AZURE", id: item.id, title: item.title, status: item.state, client: item.client, type: item.workItemType, updatedAt: item.azureChangedAt, workItem: item }));
    const sourceItems = sourceView === "tickets" ? tickets : sourceView === "tasks" ? tasks : [...tickets, ...tasks];
    return sourceItems.filter((item) => {
      if (metric === "tickets") return item.source === "MOVIDESK";
      if (metric === "open") return item.source === "AZURE" && lane(item.status) !== "Concluídos/Fechados";
      if (metric === "concluded") return item.source === "AZURE" && lane(item.status) === "Concluídos/Fechados";
      if (metric === "prioritized") return Boolean(item.workItem?.prioritized);
      if (metric === "blocked") return Boolean(item.workItem?.blockedProcess);
      if (metric === "attention") return Boolean(item.workItem?.blockedProcess)
        || Boolean(item.workItem?.prioritized)
        || (item.updatedAt ? Date.now() - new Date(item.updatedAt).getTime() >= 3 * 86_400_000 : false);
      return true;
    }).sort((a, b) => sort === "recent"
      ? new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
      : sort === "oldest"
        ? new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime()
        : operationPriority(a, b));
  }, [data, metric, sourceView, sort]);

  const focusItems = useMemo(() => items.filter((item) =>
    Boolean(item.workItem?.blockedProcess)
    || Boolean(item.workItem?.prioritized)
    || (item.updatedAt ? Date.now() - new Date(item.updatedAt).getTime() >= 3 * 86_400_000 : false),
  ).length, [items]);

  function saveCurrentView() {
    const name = window.prompt("Nome da visão:", client || type || metric || "Minha visão");
    if (!name?.trim()) return;
    const saved: SavedView = {
      id: String(Date.now()), name: name.trim(), client, type, search, metric, sourceView, view, sort,
    };
    const next = [saved, ...savedViews].slice(0, 8);
    setSavedViews(next);
    localStorage.setItem("my-operation-saved-views", JSON.stringify(next));
  }

  function applySavedView(saved: SavedView) {
    setClient(saved.client); setType(saved.type); setSearch(saved.search); setMetric(saved.metric);
    setSourceView(saved.sourceView); setView(saved.view); setSort(saved.sort);
  }

  function deleteSavedView(id: string) {
    const next = savedViews.filter((item) => item.id !== id);
    setSavedViews(next);
    localStorage.setItem("my-operation-saved-views", JSON.stringify(next));
  }

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
    if (item.ticket) {
      navigate(`/tickets?movidesk=${item.id}`);
      return;
    }
    setSelected(item); setDetail(null);
    setKnowledge([]);
    void searchKnowledge(item.title);
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

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2fr repeat(5, minmax(150px, 1fr)) auto auto" }, gap: 1.2 }}>
      <TextField size="small" label="Pesquisar ticket, tarefa ou assunto" value={search} onChange={(event) => setSearch(event.target.value)} slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: 1, color: "text.disabled" }} /> } }} />
      <Autocomplete size="small" options={data?.filters.clients ?? []} value={client || null} onChange={(_, value) => setClient(value ?? "")} renderInput={(params) => <TextField {...params} label="Cliente" />} />
      <Autocomplete size="small" options={data?.filters.analysts ?? []} value={analyst || null} onChange={(_, value) => { setAnalyst(value ?? ""); if (value) setTeam(""); }} renderInput={(params) => <TextField {...params} label="Analista" />} />
      <FormControl size="small"><InputLabel>Equipe</InputLabel><Select label="Equipe" value={team} onChange={(event) => { setTeam(event.target.value); if (event.target.value) setAnalyst(""); }}><MenuItem value="">Minha operação</MenuItem>{data?.filters.teams.map((item) => <MenuItem key={item.name} value={item.name}>{item.name}</MenuItem>)}</Select></FormControl>
      <FormControl size="small"><InputLabel>Conteúdo</InputLabel><Select label="Conteúdo" value={sourceView} onChange={(event) => setSourceView(event.target.value as SourceView)}><MenuItem value="tickets">Atendimentos</MenuItem><MenuItem value="tasks">Tarefas</MenuItem><MenuItem value="both">Ambos</MenuItem></Select></FormControl>
      <FormControl size="small"><InputLabel>Tipo de tarefa</InputLabel><Select label="Tipo de tarefa" value={type} onChange={(event) => setType(event.target.value)} disabled={sourceView === "tickets"}><MenuItem value="">Todas</MenuItem>{data?.filters.types.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl>
      <Button onClick={() => { setClient(""); setAnalyst(""); setTeam(""); setType(""); setSearch(""); setMetric(""); setSort("priority"); }}>Limpar</Button>
      <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, value) => value && setView(value)}><ToggleButton value="kanban" aria-label="Kanban"><ViewColumnOutlined /></ToggleButton><ToggleButton value="list" aria-label="Lista"><ViewListOutlined /></ToggleButton></ToggleButtonGroup>
    </Box>
    <Stack direction={{ xs: "column", md: "row" }} spacing={1} useFlexGap sx={{ mt: 1.5, alignItems: { md: "center" }, flexWrap: "wrap" }}>
      <FormControl size="small" sx={{ minWidth: 170 }}><InputLabel>Ordenação</InputLabel><Select label="Ordenação" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><MenuItem value="priority">Prioridade operacional</MenuItem><MenuItem value="recent">Mais recentes</MenuItem><MenuItem value="oldest">Mais antigos</MenuItem></Select></FormControl>
      <Button size="small" variant="outlined" startIcon={<BookmarkAddOutlined />} onClick={saveCurrentView}>Salvar visão</Button>
      <Chip
        icon={<FilterAltOutlined />}
        label={metric === "attention" ? `Foco ativo · ${focusItems} item(ns)` : `${focusItems} item(ns) de atenção no recorte`}
        color={metric === "attention" ? "warning" : "default"}
        variant={metric === "attention" ? "filled" : "outlined"}
        onClick={() => setMetric(metric === "attention" ? "" : "attention")}
        sx={{ cursor: "pointer" }}
      />
      {savedViews.map((saved) => <Chip key={saved.id} label={saved.name} onClick={() => applySavedView(saved)} onDelete={() => deleteSavedView(saved.id)} deleteIcon={<DeleteOutlined />} variant="outlined" />)}
    </Stack>
    </CardContent></Card>

    {error && <Alert severity="error" onClose={() => setError("")} sx={{ mt: 2 }}>{error}</Alert>}
    {savingStatus && <Alert severity="info" sx={{ mt: 2 }}>Salvando a organização do atendimento…</Alert>}
    <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(5,1fr)" }, gap: 2 }}>
      {metrics.map(([key, label, info, valueKey]) => <KpiCard key={key} title={label} value={data?.summary[valueKey] ?? 0} subtitle="Clique para filtrar a operação" info={info} accent={metric === key ? aliareColors.green : aliareColors.greenDark} active={metric === key} onClick={() => setMetric(metric === key ? "" : key)} />)}
    </Box>

    {loading ? <Box sx={{ py: 10, textAlign: "center" }}><CircularProgress /></Box> : items.length === 0 ? <Alert severity="info" sx={{ mt: 2 }}>Nenhum registro encontrado para os filtros selecionados.</Alert> : view === "kanban" ?
      <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))", lg: "repeat(6, minmax(0, 1fr))" }, alignItems: "stretch", gap: .8, width: "100%", minWidth: 0, pb: 2 }}>
        {lanes.map((column) => {
          const columnItems = items.filter((item) => lane(item.status) === column);
          const visibleLimit = visibleByLane[column] ?? INITIAL_LANE_LIMIT;
          const visibleItems = columnItems.slice(0, visibleLimit);
          const remaining = columnItems.length - visibleItems.length;
          return <Box key={column} onDragOver={(event) => dragged && event.preventDefault()} onDrop={() => void changeStatus(column)} sx={{ minWidth: 0, height: "clamp(390px, calc(100vh - 405px), 620px)", display: "flex", flexDirection: "column", overflow: "hidden", background: dragged ? "linear-gradient(180deg,rgba(22,196,127,.10),rgba(22,196,127,.035))" : "linear-gradient(180deg,rgba(47,111,237,.035),rgba(16,24,40,.018))", borderRadius: 2.25, border: "1px solid", borderColor: dragged ? "success.light" : "divider", boxShadow: dragged ? "0 0 24px rgba(22,196,127,.10)" : "inset 0 1px rgba(255,255,255,.02)" }}>
            <Stack direction="row" sx={{ position: "sticky", top: 0, zIndex: 1, justifyContent: "space-between", alignItems: "center", gap: .5, px: 1, py: .85, bgcolor: "background.paper", borderTop: `3px solid ${laneColors[column]}`, borderBottom: "1px solid", borderBottomColor: "divider", minHeight: 43 }}>
              <Typography title={column} sx={{ minWidth: 0, fontWeight: 850, fontSize: ".72rem", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis" }}>{column}</Typography>
              <Chip size="small" label={columnItems.length} sx={{ height: 21, fontSize: ".68rem", fontWeight: 800, flexShrink: 0 }} />
            </Stack>
            <Stack spacing={.7} sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", p: .7 }}>
              {visibleItems.length ? visibleItems.map((item) => <OperationCard key={item.key} item={item} compact draggable={Boolean(item.ticket)} onDragStart={() => item.ticket && setDragged(item.ticket)} onDragEnd={() => setDragged(null)} onClick={() => void openItem(item)} />) : <Typography variant="caption" color="text.secondary" sx={{ py: 3, px: 1, textAlign: "center" }}>Nenhum registro</Typography>}
              {remaining > 0 && <Button size="small" onClick={() => setVisibleByLane((current) => ({ ...current, [column]: visibleLimit + LANE_INCREMENT }))} sx={{ textTransform: "none", fontSize: ".7rem" }}>Mostrar mais {Math.min(remaining, LANE_INCREMENT)} de {remaining}</Button>}
            </Stack>
          </Box>;
        })}
      </Box> : <Stack spacing={1} sx={{ mt: 2 }}>{items.map((item) => <OperationCard key={item.key} item={item} draggable={false} onClick={() => void openItem(item)} />)}</Stack>}

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
        <Box><Typography variant="h6" sx={{ fontWeight: 850 }}>Microsoft 365 na operação</Typography><Typography variant="body2" color="text.secondary">Agenda Outlook, tarefas Planner e equipes Teams vinculadas à sua conta corporativa.</Typography></Box>
        <Chip size="small" color={microsoft?.connected ? "success" : "default"} variant="outlined" label={microsoftLoading ? "Consultando..." : microsoft?.connected ? "Conta conectada" : "Microsoft não conectado"} />
      </Stack>
      {microsoftLoading ? <Box sx={{ py: 3, textAlign: "center" }}><CircularProgress size={24} /></Box> : !microsoft?.connected ? <Alert severity="info" sx={{ mt: 1.5 }} action={<Button size="small" onClick={() => navigate("/conhecimento")}>Conectar</Button>}>Conecte sua conta Microsoft na Base de Conhecimento para trazer Planner, Outlook e Teams para esta operação.</Alert> : <>
        {microsoft.warnings.map((warning) => <Alert key={warning} severity="warning" sx={{ mt: 1 }}>{warning}</Alert>)}
        <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3,minmax(0,1fr))" }, gap: 1.25 }}>
          <Card variant="outlined"><CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><TaskAltOutlined color="primary" /><Typography sx={{ fontWeight: 850 }}>Planner</Typography><Chip size="small" label={microsoft.plannerTasks.length} /></Stack><Stack spacing={.6} sx={{ mt: 1 }}>{microsoft.plannerTasks.slice(0, 5).map((task) => <Box key={task.id}><Typography variant="body2" sx={{ fontWeight: 700 }}>{task.title}</Typography><Typography variant="caption" color="text.secondary">{task.percentComplete ?? 0}% concluído{task.dueDateTime ? ` · prazo ${new Date(task.dueDateTime).toLocaleDateString("pt-BR")}` : ""}</Typography></Box>)}</Stack>{!microsoft.plannerTasks.length && <Typography variant="caption" color="text.secondary">Nenhuma tarefa disponível.</Typography>}</CardContent></Card>
          <Card variant="outlined"><CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><CalendarMonthOutlined color="primary" /><Typography sx={{ fontWeight: 850 }}>Próximos 7 dias</Typography><Chip size="small" label={microsoft.events.length} /></Stack><Stack spacing={.6} sx={{ mt: 1 }}>{microsoft.events.slice(0, 5).map((event) => <Box key={event.id}><Typography variant="body2" sx={{ fontWeight: 700 }}>{event.subject}</Typography><Typography variant="caption" color="text.secondary">{event.start?.dateTime ? new Date(event.start.dateTime).toLocaleString("pt-BR") : "Horário não informado"}</Typography>{event.webLink && <Button size="small" component="a" href={event.webLink} target="_blank" rel="noopener noreferrer" sx={{ ml: .5, minWidth: 0, p: 0 }}>Abrir</Button>}</Box>)}</Stack>{!microsoft.events.length && <Typography variant="caption" color="text.secondary">Nenhum compromisso disponível.</Typography>}</CardContent></Card>
          <Card variant="outlined"><CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><GroupsOutlined color="primary" /><Typography sx={{ fontWeight: 850 }}>Teams</Typography><Chip size="small" label={microsoft.teams.length} /></Stack><Stack spacing={.6} sx={{ mt: 1 }}>{microsoft.teams.slice(0, 5).map((team) => <Button key={team.id} size="small" component={team.webUrl ? "a" : "button"} href={team.webUrl || undefined} target={team.webUrl ? "_blank" : undefined} rel={team.webUrl ? "noopener noreferrer" : undefined} sx={{ justifyContent: "flex-start", textTransform: "none", px: 0 }}>{team.displayName}</Button>)}</Stack>{!microsoft.teams.length && <Typography variant="caption" color="text.secondary">Nenhuma equipe disponível.</Typography>}</CardContent></Card>
        </Box>
      </>}
    </CardContent></Card>

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent><Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}><Box><Typography variant="h6" sx={{ fontWeight: 850 }}>Versões atuais para consulta</Typography><Typography variant="body2" color="text.secondary">Últimas versões LTS, LTE e RC identificadas no Azure, com suas tarefas.</Typography></Box><Button endIcon={<OpenInNewOutlined />} onClick={() => navigate("/versoes")}>Abrir versões</Button></Stack>
      {data?.latestVersions.length ? <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3,1fr)" }, gap: 1.5 }}>{data.latestVersions.map((group) => <Card key={group.channel} variant="outlined"><CardContent><Stack direction="row" sx={{ justifyContent: "space-between" }}><Chip label={group.channel} color="success" size="small" /><Typography sx={{ fontWeight: 850 }}>{group.version}</Typography></Stack><Stack spacing={.7} sx={{ mt: 1.5 }}>{group.tasks.map((task) => <Button key={task.id} onClick={() => navigate(`${route(task.workItemType)}?task=${task.id}`)} sx={{ justifyContent: "flex-start", textTransform: "none", textAlign: "left" }}>#{task.id} · {task.title}</Button>)}</Stack></CardContent></Card>)}</Box> : <Alert severity="info" sx={{ mt: 2 }}>Nenhuma versão LTS, LTE ou RC foi identificada.</Alert>}
    </CardContent></Card>

    <Drawer anchor="right" open={Boolean(selected)} onClose={() => { setSelected(null); setDetail(null); }} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
      <DetailPanelHeader eyebrow={`${selected?.source ?? ""} · ${selected?.type ?? ""}`} title={selected?.title ?? "Detalhes do registro"} identifier={`#${selected?.id ?? ""}`} onClose={() => { setSelected(null); setDetail(null); }} />
      <DetailSection title="Visão operacional"><DetailFieldGrid fields={selected ? Object.entries({ Estado: selected.status, "Cliente principal": detail?.ticket.client ?? selected.client, "Clientes participantes": formatList(selected.workItem?.participantClients), Contato: detail?.ticket.contact, Categoria: detail?.ticket.category, Urgência: detail?.ticket.urgency, Serviço: detail?.ticket.service, Equipe: detail?.ticket.ownerTeam, Responsável: detail?.ticket.owner ?? selected.workItem?.assignedToName, "Prazo de solução": detail?.ticket.dueDate, "Versão cadastrada": selected.workItem?.registeredVersion, "Versão entregue": selected.workItem?.deliveredVersion, "Ticket principal": selected.workItem?.movideskTicket, "Tickets participantes": formatList(selected.workItem?.participantMovideskTickets), "Task relacionada": selected.ticket?.taskNumber }).map(([label, value]) => [label, String(value ?? "Não informado")]) : []} /></DetailSection>
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

function OperationCard({ item, compact = false, draggable, onDragStart, onDragEnd, onClick }: { item: Unified; compact?: boolean; draggable: boolean; onDragStart?: () => void; onDragEnd?: () => void; onClick: () => void }) {
  return <Card elevation={0} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick} sx={{ width: "100%", minWidth: 0, minHeight: compact ? 132 : 112, cursor: draggable ? "grab" : "pointer", border: "1px solid", borderColor: item.workItem?.blockedProcess ? "error.light" : "divider", borderLeft: `3px solid ${item.source === "MOVIDESK" ? "#1f7acb" : aliareColors.green}`, borderRadius: 1.75, bgcolor: "background.paper", transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease", "&:hover": { transform: "translateY(-2px)", boxShadow: "0 10px 24px rgba(16,24,40,.10)", borderColor: "primary.main" }, "&:active": { cursor: draggable ? "grabbing" : "pointer" } }}><CardContent sx={{ p: compact ? 1.1 : 1.25, "&:last-child": { pb: compact ? 1.1 : 1.25 } }}>
    <Stack direction="row" spacing={.4} sx={{ justifyContent: "space-between", alignItems: "center", minWidth: 0 }}><Stack direction="row" spacing={.25} sx={{ alignItems: "center", minWidth: 0 }}>{draggable && <DragIndicatorOutlined sx={{ fontSize: 14, color: "text.disabled" }} />}<Typography sx={{ fontWeight: 850, fontSize: ".7rem", flexShrink: 0 }}>#{item.id}</Typography></Stack><Chip size="small" label={item.type} sx={{ height: 19, minWidth: 0, maxWidth: "58%", fontSize: ".58rem", "& .MuiChip-label": { px: .7, overflow: "hidden", textOverflow: "ellipsis" } }} /></Stack>
    <Typography title={item.title} sx={{ mt: .55, fontSize: compact ? ".72rem" : ".78rem", lineHeight: 1.3, fontWeight: 750, display: "-webkit-box", WebkitLineClamp: compact ? 3 : 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{item.title}</Typography>
    <Typography title={item.client ?? "Cliente não informado"} variant="caption" color="text.secondary" sx={{ display: "block", mt: .55, fontSize: ".62rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.client ?? "Cliente não informado"}</Typography>
    <Stack direction="row" spacing={.35} sx={{ mt: .55, alignItems: "center", flexWrap: "wrap", rowGap: .35 }}>
      {item.updatedAt && <Chip size="small" icon={<ScheduleOutlined />} label={relativeDate(item.updatedAt)} variant="outlined" sx={{ height: 19, fontSize: ".57rem", "& .MuiChip-icon": { fontSize: 12 }, "& .MuiChip-label": { px: .55 } }} />}
      {!compact && <Chip size="small" label={item.status || "Status não informado"} color={statusColor(item.status)} variant="outlined" sx={{ height: 21, fontSize: ".64rem", fontWeight: 750, "& .MuiChip-label": { px: .7 } }} />}
      {item.ticket?.taskNumber && <Chip size="small" label={`Task #${item.ticket.taskNumber}`} color="info" variant="outlined" sx={{ height: 19, fontSize: ".57rem", "& .MuiChip-label": { px: .55 } }} />}
      {item.workItem?.prioritized && <Chip size="small" color="warning" label="Prioridade" sx={{ height: 19, fontSize: ".57rem", "& .MuiChip-label": { px: .55 } }} />}
      {item.workItem?.blockedProcess && <Chip size="small" color="error" label="Bloqueio" sx={{ height: 19, fontSize: ".57rem", "& .MuiChip-label": { px: .55 } }} />}
    </Stack>
  </CardContent></Card>;
}
function operationPriority(a: Unified, b: Unified) { const weight = (item: Unified) => (item.workItem?.blockedProcess ? 4 : 0) + (item.workItem?.prioritized ? 2 : 0); const difference = weight(b) - weight(a); if (difference) return difference; return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(); }
function relativeDate(value: string) { const timestamp = new Date(value).getTime(); if (!Number.isFinite(timestamp)) return "Atualização recente"; const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000)); if (days === 0) return "Hoje"; if (days === 1) return "Ontem"; return `${days}d atrás`; }
function statusColor(status: string): "default" | "info" | "warning" | "success" | "secondary" { const currentLane = lane(status); if (currentLane === "Concluídos/Fechados") return "success"; if (currentLane === "Pausado" || currentLane === "Aguardando retorno") return "warning"; if (currentLane === "Em andamento") return "info"; if (currentLane === "Interno") return "secondary"; return "default"; }
function lane(status: string) {
  const value = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
  if (/(conclu|closed|done|resolv|fech|cancel)/.test(value)) return "Concluídos/Fechados";
  if (/aguardando.*retorno.*cliente|retorno.*cliente/.test(value)) return "Aguardando retorno";
  if (/aguardando.*desenvolv|aguardando|intern|desenvolv|qualifica/.test(value)) return "Interno";
  if (/(andamento|active|doing|progress)/.test(value)) return "Em andamento";
  if (/(^|\b)(pausad|atribu|assigned|novo|new)(\b|$)/.test(value)) return "Aguardando atendimento";
  if (/(paus|suspens)/.test(value)) return "Pausado";
  return "Interno";
}
function statusForLane(targetLane: string) { if (targetLane === "Concluídos/Fechados") return "Fechado"; if (targetLane === "Aguardando atendimento") return "Atribuído"; return targetLane; }
function route(type: string) { const value = type.toLocaleLowerCase("pt-BR"); return value.includes("apoio") ? "/apoios" : value.includes("evolu") ? "/evolucoes" : "/correcoes"; }
function formatList(value: string | string[] | number[] | null | undefined) { if (Array.isArray(value)) return value.join(", ") || "Não informado"; return value?.replace(/^,|,$/g, "").replace(/\r?\n/g, ", ") || "Não informado"; }
