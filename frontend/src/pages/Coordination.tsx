import {
  GroupsOutlined,
  InfoOutlined,
  RadarOutlined,} from "@mui/icons-material";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Drawer,
  Button,
  LinearProgress,
  TextField,
  useTheme,
  Tooltip,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KpiCard } from "../components/KpiCard";
import { ExportTicketsButton } from "../components/ExportTicketsButton";
import { DetailFieldGrid, DetailPanelHeader, DetailSection } from "../components/DetailPanel";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { PageHeader } from "../components/PageHeader";
import { api, getApiErrorMessage } from "../services/api";
import { aliareColors } from "../theme/theme";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, ReferenceLine, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

type Data = {
  generatedAt: string;
  indicators: Record<string, number>;
  workload: Array<{ analyst: string; tickets: number; workItems: number; total: number }>;
  serviceAnalytics: {
    totalOpenTickets: number; classifiedServices: number; specificServices: number; withoutService: number;
    genericService: number; suspectedMismatch: number; classificationRate: number; catalogSize: number; periodDays?: number;
    ranking: Array<{ service: string; count: number }>;
    genericRanking?: Array<{ service: string; count: number }>;
    moduleRanking: Array<{ module: string; count: number }>;
    clientQuality: Array<{ client: string; total: number; issues: number; rate: number }>;
    analystQuality: Array<{ analyst: string; total: number; issues: number; rate: number }>;
    thirdLevel: { classified: number; missing: number; rate: number; ranking: Array<{ service: string; count: number }> };
  };
  integrations: Record<string, { configured: boolean; connected: boolean; items: number }>;
  scope: { coordinator: string; analysts: string[]; clients: string[] };
  intelligence: {
    health: "critical" | "attention" | "stable";
    medianLoad: number;
    overloadedAnalysts: Array<{ analyst: string; tickets: number; workItems: number; total: number }>;
    priorities: Array<{ key: string; kind: DetailKind; severity: "critical" | "high" | "medium"; title: string; count: number; description: string; action: string }>;
  };
  microsoft: {
    connected: boolean;
    plannerTasks: Array<{ id: string; title: string; percentComplete: number; dueDateTime?: string }>;
    events: Array<{ id: string; subject: string; start?: { dateTime?: string } }>;
    teams: Array<{ id: string; displayName: string }>;
    warnings: string[];
  };
};

type CsatOverview = {
  periodDays: number;
  summary: { responses: number; average: number; positivePct: number; comments: number };
  distribution: Array<{ value: number; count: number }>;
  monthly: Array<{ month: string; responses: number; average: number; positivePct: number }>;
  byClient: Array<{ name: string; responses: number; average: number; positivePct: number }>;
  byAnalyst: Array<{ name: string; responses: number; average: number; positivePct: number }>;
  byService: Array<{ name: string; responses: number; average: number; positivePct: number }>;
  recent: Array<{ id: string; ticketId: number | null; subject: string; client: string | null; owner: string | null; value: number | null; commentary: string | null; responseDate: string | null; service: string }>;
};

type IntegrationHealth = { tickets: number; linkedTasks: number; azureItems: number; csatResponses: number; catalogServices: number; taskLinkCoveragePct: number; serviceCoveragePct: number; causeCoveragePct: number; businessAreaCoveragePct: number; latestCsatSyncAt: string | null; latestCsatResponseAt: string | null; latestCatalogSyncAt: string | null; sources: Record<string,string> };

type SlaBreakdown = { total:number; concluded:number; openDevelopment:number; avgSupportMinutes:number; avgFactoryMinutes:number; avgTotalMinutes:number; supportWithinOla:number; factoryWithinOla:number; totalWithinSla:number };

type SlaDevelopment = {
  periodDays: number;
  rule: { taskEndState: string; schedule: string; profile: string; supportStart?:string;supportEnd?:string;factoryStart?:string;factoryEnd?:string };
  dataQuality: { bugsInPeriod: number; linked: number; linkageRate?:number; missingAzure: number; missingTaskCreatedAt: number; missingPriority: number; invalidTimeline?: number };
  health?:{score:number;status:"stable"|"attention"|"critical";formula:string;components:Array<{key:string;label:string;score:number;weight:number;detail:string}>;alerts:Array<{severity:"warning"|"error";title:string;detail:string}>};
  summary: { bugsWithTask: number; concluded: number; openDevelopment: number; avgSupportMinutes: number; avgFactoryMinutes: number; avgTotalMinutes: number; supportWithinOla: number; factoryWithinOla: number; totalWithinSla: number; openFactoryOverOla?: number; openTotalOverSla?: number };
  byPriority: Array<{ priority: string; total: number; concluded: number; avgSupportMinutes: number; avgFactoryMinutes: number; avgTotalMinutes: number; supportWithinOla: number; factoryWithinOla: number; totalWithinSla: number; rows:number[] }>;
  monthly: Array<{ month: string; label: string; total: number; concluded: number; supportWithinPct: number; factoryWithinPct: number; totalWithinPct: number }>;
  owners: Array<SlaBreakdown & { owner:string; rows:number[] }>;
  clients: Array<SlaBreakdown & { client:string; rows:number[] }>;
  outliers: { total: number; support: number; factory: number; totalSla: number; critical: number; top: Array<SlaRow> };
  rows: SlaRow[];
};

type SlaRow = { movideskId:number; subject:string; client:string|null; owner:string; taskNumber:number; taskTitle?:string|null; taskState?:string|null; urgency:string; supportMinutes:number; factoryMinutes:number|null; totalMinutes:number|null; supportPct:number; factoryPct:number|null; totalPct:number|null; bottleneck:string };
type CsatDetail = { periodDays:number; total:number; truncated:boolean; items:Array<{ id:string; ticketId:number|null; subject:string; client:string|null; owner:string|null; taskNumber:number|null; service:string; value:number|null; commentary:string|null; responseDate:string|null }> };

type DetailKind = "backlog" | "critical" | "stale" | "dueSoon" | "overdue" | "blocked" | "unassigned" | "analyst" | "service" | "serviceThirdLevel" | "serviceModule" | "serviceClient" | "serviceAnalyst";
type DetailData = {
  kind: DetailKind; analyst: string | null; total: number; loaded?: number; truncated: boolean;
  tickets: Array<{ movideskId: number; subject: string; status: string; urgency: string | null; client: string | null; owner: string | null; lastUpdate: string | null; dueDate: string | null; taskNumber: number | null; registeredVersion: string | null; deliveredVersion: string | null; service: string | null; serviceFirstLevel: string | null; serviceSecondLevel: string | null; serviceThirdLevel: string | null; category: string | null; cause: string | null }>;
  workItems: Array<{ id: number; workItemType: string; title: string; state: string; client: string | null; assignedToName: string | null; createdByName: string | null; criticality: string | null; blockedProcess: boolean | null; movideskTicket: number | null; registeredVersion: string | null; deliveredVersion: string | null; azureChangedAt: string | null; remoteUrl: string | null }>;
};

export function Coordination() {
  const navigate = useNavigate();
  const theme = useTheme();
  const chartColors = [aliareColors.info, aliareColors.green, aliareColors.warning, aliareColors.purple, "#ff6b57", "#22d3ee"];
  const analyticsPanelSx = {
    border: "1px solid",
    borderColor: theme.palette.mode === "dark" ? "rgba(94,151,255,.24)" : "rgba(47,111,237,.14)",
    borderRadius: 3,
    background: theme.palette.mode === "dark"
      ? "linear-gradient(145deg,rgba(12,31,55,.94),rgba(8,22,40,.98))"
      : "linear-gradient(145deg,rgba(255,255,255,.98),rgba(246,250,255,.98))",
    boxShadow: theme.palette.mode === "dark" ? "0 18px 48px rgba(0,0,0,.18)" : "0 14px 34px rgba(30,64,175,.06)",
    overflow: "hidden",
  } as const;
  const rankingRowSx = {
    justifyContent: "flex-start",
    textTransform: "none",
    color: "text.primary",
    borderRadius: 2,
    px: 1,
    py: .8,
    minHeight: 42,
    transition: "transform .16s ease, background-color .16s ease",
    "&:hover": { bgcolor: "action.hover", transform: "translateX(2px)" },
  } as const;
  const [data, setData] = useState<Data | null>(null);
  const [capacity, setCapacity] = useState<{ days: number; businessDays: number; hoursPerDay: number; expectedHours: number; registeredHours: number; coverageRate: number | null; dataSource?: string; hasRegisteredTimeData?: boolean; analysts: Array<{ analyst: string; expectedHours: number; registeredHours: number; coverageRate: number | null }> } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailError, setDetailError] = useState("");
  const [details, setDetails] = useState<DetailData | null>(null);
  const [serviceDays, setServiceDays] = useState(30);
  const [analyticPeriod, setAnalyticPeriod] = useState<"thisMonth" | "lastMonth" | "3m" | "6m" | "12m" | "all">("thisMonth");
  const [slaDays, setSlaDays] = useState(30);
  const [slaPeriod, setSlaPeriod] = useState<"thisMonth" | "lastMonth" | "30d" | "custom">("30d");
  const [slaCustomStart, setSlaCustomStart] = useState("");
  const [slaCustomEnd, setSlaCustomEnd] = useState("");
  const [slaDevelopment, setSlaDevelopment] = useState<SlaDevelopment | null>(null);
  const [slaLoading, setSlaLoading] = useState(false);
  const [csat, setCsat] = useState<CsatOverview | null>(null);
  const [csatLoading, setCsatLoading] = useState(false);
  const [integrationHealth, setIntegrationHealth] = useState<IntegrationHealth | null>(null);
  const [slaDetail, setSlaDetail] = useState<{ title:string; rows:SlaRow[] } | null>(null);
  const [csatDetail, setCsatDetail] = useState<CsatDetail | null>(null);
  const [csatDetailTitle, setCsatDetailTitle] = useState("");
  const [csatDetailLoading, setCsatDetailLoading] = useState(false);

  const analyticParams = useMemo(() => {
    const now = new Date();
    const iso = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    if (analyticPeriod === "thisMonth") return { startDate: iso(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: iso(now), days: serviceDays };
    if (analyticPeriod === "lastMonth") return { startDate: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), endDate: iso(new Date(now.getFullYear(), now.getMonth(), 0)), days: serviceDays };
    if (analyticPeriod === "all") return { startDate: "2026-01-01", endDate: iso(now), days: 0 };
    const months = analyticPeriod === "3m" ? 3 : analyticPeriod === "6m" ? 6 : 12;
    return { startDate: iso(new Date(now.getFullYear(), now.getMonth() - months + 1, 1)), endDate: iso(now), days: serviceDays };
  }, [analyticPeriod, serviceDays]);

  const analyticPeriodLabel = analyticPeriod === "thisMonth" ? "Este mês"
    : analyticPeriod === "lastMonth" ? "Mês passado"
    : analyticPeriod === "3m" ? "Últimos 3 meses"
    : analyticPeriod === "6m" ? "Últimos 6 meses"
    : analyticPeriod === "12m" ? "Últimos 12 meses" : "Desde 01/01/2026";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get<Data>("/coordination/summary", { params: { serviceDays: analyticParams.days, startDate: analyticParams.startDate, endDate: analyticParams.endDate } });
      setData(response.data);
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Não foi possível carregar a central."));
    } finally {
      setLoading(false);
    }
  }, [analyticParams.days, analyticParams.endDate, analyticParams.startDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api.get("/coordination/productivity-capacity", { params: { days: serviceDays || 730 }, signal: controller.signal })
        .then((response) => setCapacity(response.data))
        .catch(() => { if (!controller.signal.aborted) setCapacity(null); });
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [data, serviceDays]);

  useEffect(() => {
    const controller = new AbortController();
    api.get<IntegrationHealth>("/coordination/integration-health", { params: { days: analyticParams.days, startDate: analyticParams.startDate, endDate: analyticParams.endDate }, signal: controller.signal })
      .then((response) => setIntegrationHealth(response.data))
      .catch(() => { if (!controller.signal.aborted) setIntegrationHealth(null); });
    return () => controller.abort();
  }, [analyticParams.days, analyticParams.endDate, analyticParams.startDate]);

  useEffect(() => {
    const controller = new AbortController();
    setSlaLoading(true);
    const now = new Date();
    const iso = (date: Date) => [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");
    let params: Record<string, string | number> = { days: slaDays };
    if (slaPeriod === "thisMonth") params = { startDate: iso(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: iso(now) };
    if (slaPeriod === "lastMonth") params = { startDate: iso(new Date(now.getFullYear(), now.getMonth()-1, 1)), endDate: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
    if (slaPeriod === "custom" && slaCustomStart && slaCustomEnd) params = { startDate: slaCustomStart, endDate: slaCustomEnd };
    api.get<SlaDevelopment>("/coordination/sla-development", { params, signal: controller.signal })
      .then((response) => setSlaDevelopment(response.data))
      .catch(() => { if (!controller.signal.aborted) setSlaDevelopment(null); })
      .finally(() => { if (!controller.signal.aborted) setSlaLoading(false); });
    return () => controller.abort();
  }, [slaDays, slaPeriod, slaCustomStart, slaCustomEnd]);

  const formatHours = (minutes: number) => minutes ? `${(minutes / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h` : "—";
  const clampPercent = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const rate = (within: number, total: number) => total ? clampPercent(Math.round(within / total * 1000) / 10) : 0;

  useEffect(() => {
    const controller = new AbortController();
    setCsatLoading(true);
    api.get<CsatOverview>("/coordination/csat", { params: { days: serviceDays || 730 }, signal: controller.signal })
      .then((response) => setCsat(response.data))
      .catch(() => { if (!controller.signal.aborted) setCsat(null); })
      .finally(() => { if (!controller.signal.aborted) setCsatLoading(false); });
    return () => controller.abort();
  }, [serviceDays]);

  const maximum = useMemo(
    () => Math.max(...(data?.workload.map((item) => item.total) ?? [1]), 1),
    [data],
  );

  const workloadSummary = useMemo(() => {
    const rows = data?.workload ?? [];
    const tickets = rows.reduce((sum, item) => sum + item.tickets, 0);
    const workItems = rows.reduce((sum, item) => sum + item.workItems, 0);
    const total = tickets + workItems;
    return {
      tickets, workItems, total,
      average: rows.length ? Number((total / rows.length).toFixed(1)) : 0,
    };
  }, [data]);

  const cards: Array<[DetailKind, string, number, string]> = data
    ? [
        ["backlog", "Backlog atual", data.indicators.openTickets, "Atendimentos abertos do escopo cooperativas."],
        ["critical", "Críticos", data.indicators.criticalTickets, "Atendimentos críticos em aberto."],
        ["stale", "Sem atualização 72h", data.indicators.staleTickets, "Tickets cujo lastUpdate do Movidesk não é atualizado há pelo menos 72 horas."],
        ["overdue", "Prazos vencidos", data.indicators.overdueTickets, "Atendimentos abertos com prazo já ultrapassado."],
        ["dueSoon", "Vencem em 7 dias", data.indicators.dueSoon, "Itens com prazo nos próximos sete dias."],
        ["blocked", "Itens bloqueados", data.indicators.blockedItems, "Tarefas Azure bloqueadas no escopo da operação."],
        ["unassigned", "Sem responsável", data.indicators.unassignedItems, "Tarefas sem responsável identificado."],
      ]
    : [];

  function openSlaRows(title:string, ids:number[]) {
    if (!slaDevelopment) return;
    const idSet=new Set(ids);
    setSlaDetail({ title, rows:slaDevelopment.rows.filter((row)=>idSet.has(row.movideskId)) });
  }

  async function openCsatDetails(title:string, params:Record<string,string|number>) {
    try {
      setCsatDetailTitle(title); setCsatDetail(null); setCsatDetailLoading(true);
      const response=await api.get<CsatDetail>("/coordination/csat/details",{params:{days:serviceDays || 730,...params}});
      setCsatDetail(response.data);
    } finally { setCsatDetailLoading(false); }
  }

  async function openDetails(kind: DetailKind, title: string, analyst?: string, serviceModule?: string, serviceClient?: string, serviceName?: string) {
    try {
      setDetailTitle(title); setDetails(null); setDetailError(""); setDetailLoading(true);
      const response = await api.get<DetailData>("/coordination/details", { params: { kind, analyst, serviceModule, serviceClient, serviceName, serviceDays, limit: 500 } });
      setDetails(response.data);
    } catch {
      setDetailError("Não foi possível carregar este recorte. Tente novamente.");
    } finally { setDetailLoading(false); }
  }


  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        eyebrow="Coordenação"
        title="Central da Coordenação"
        description="Prioridades, capacidade, qualidade e desenvolvimento da operação em uma visão executiva."
        meta={data ? `Coordenação: ${data.scope.coordinator} · ${data.scope.analysts.length} analistas · ${data.scope.clients.length} clientes cooperativas` : undefined}
      />

      <Card variant="outlined" sx={{ overflow: "hidden", borderRadius: 2.5, backgroundColor: "background.paper", mb: 2 }}>
        <Box sx={{ p: { xs: 1.5, md: 2 }, borderBottom: "1px solid", borderColor: "divider", background: theme.palette.mode === "dark" ? "linear-gradient(110deg,rgba(24,199,122,.055),rgba(47,111,237,.035),transparent)" : "linear-gradient(110deg,rgba(24,199,122,.045),rgba(47,111,237,.025),transparent)" }}>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={1.25} sx={{ justifyContent: "space-between", alignItems: { lg: "center" } }}>
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: "1rem" }}>Cockpit da coordenação</Typography>
              <Typography variant="body2" color="text.secondary">Leitura rápida para decidir onde atuar primeiro, com acesso direto aos recortes operacionais.</Typography>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, mr: .25 }}>Período analítico</Typography>
              {([
                { v:"thisMonth", l:"Este mês", days:30 },
                { v:"lastMonth", l:"Mês passado", days:30 },
                { v:"3m", l:"3 meses", days:90 },
                { v:"6m", l:"6 meses", days:180 },
                { v:"12m", l:"12 meses", days:365 },
                { v:"all", l:"Todo 2026", days:0 },
              ] as const).map((period)=><Chip key={period.v} clickable size="small" label={period.l} color={analyticPeriod===period.v?"primary":"default"} variant={analyticPeriod===period.v?"filled":"outlined"} onClick={()=>{setAnalyticPeriod(period.v);setServiceDays(period.days);setSlaPeriod("30d");setSlaDays(period.days || 730)}} />)}
              <Button size="small" variant="outlined" onClick={() => navigate("/atencao")}>Riscos</Button>
              <Button size="small" variant="outlined" onClick={() => navigate("/qualidade-dados")}>Pendências</Button>
              <Button size="small" variant="outlined" onClick={() => navigate("/desempenho")}>Desempenho</Button>
              <Button size="small" variant="outlined" onClick={() => navigate("/lideranca-tecnica")}>Liderança</Button>
            </Stack>
          </Stack>
        </Box>

        <CardContent sx={{ p: { xs: 1.5, md: 2.25 } }}>
          <Alert
            severity="info"
            icon={<GroupsOutlined />}
            sx={{ mb: 2, bgcolor: "rgba(47,111,237,.07)", borderColor: "rgba(47,111,237,.18)" }}
          >
            A Central usa somente os analistas oficiais da equipe e os clientes cooperativas definidos no escopo operacional do TechLead Hub.
          </Alert>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {integrationHealth && <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction={{ xs:"column", md:"row" }} spacing={1} sx={{ justifyContent:"space-between", mb:1.25 }}>
                <Box><Typography sx={{ fontWeight:900 }}>Saúde das integrações</Typography><Typography variant="body2" color="text.secondary">Cobertura das fontes que alimentam os indicadores executivos.</Typography></Box>
                <Chip size="small" variant="outlined" label={`${integrationHealth.taskLinkCoveragePct}% com Task vinculada`} />
              <Chip size="small" variant="outlined" label={`${integrationHealth.serviceCoveragePct}% com serviço`} />
              <Chip size="small" variant="outlined" label={`${integrationHealth.causeCoveragePct}% com causa`} />
              <Chip size="small" variant="outlined" label={`${integrationHealth.businessAreaCoveragePct}% com área de negócio`} />
              </Stack>
              <Box sx={{ display:"grid", gridTemplateColumns:{ xs:"1fr", sm:"repeat(2,minmax(0,1fr))", lg:"repeat(3,minmax(0,1fr))", xl:"repeat(5,minmax(0,1fr))" }, gap:1 }}>
                <KpiCard title="Tickets" value={integrationHealth.tickets} subtitle="Movidesk" info="Tickets dos clientes da carteira SIMER." accent={aliareColors.info}/>
                <KpiCard title="Vínculos Task" value={integrationHealth.linkedTasks} subtitle="Movidesk → Azure" info="Tickets com número de Task relacionado." accent={aliareColors.green}/>
                <KpiCard title="Work Items" value={integrationHealth.azureItems} subtitle="Azure DevOps" info="Itens Azure no escopo da coordenação." accent={aliareColors.info}/>
                <KpiCard title="CSAT" value={integrationHealth.csatResponses} subtitle="CSAT 1–5" info="Respostas Movidesk do tipo Carinhas/Smiley (escala 1–5) persistidas para a carteira." accent={aliareColors.warning}/>
                <KpiCard title="Serviços" value={integrationHealth.catalogServices} subtitle="Recorte enriquecido" info="Metadados Movidesk sincronizados para os Serviços observados na carteira; não representa o catálogo global." accent={aliareColors.green}/>
              </Box>
            </CardContent>
          </Card>}
          <Card variant="outlined" sx={{ mb: 2, overflow: "hidden" }}>
            <CardContent>
              <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} sx={{ alignItems: { lg: "center" }, justifyContent: "space-between", mb: 1.5 }}>
                <Box>
                  <Typography sx={{ fontWeight: 900 }}>SLA × OLA · Suporte x Desenvolvimento</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>
                    Ticket Movidesk → abertura da Task → conclusão no Azure, calculado em horas úteis.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={.6} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {([["thisMonth","Este mês"],["lastMonth","Mês passado"],["30d","Últimos 30 dias"],["custom","Personalizado"]] as const).map(([value,label]) => <Chip key={value} clickable size="small" label={label} color={slaPeriod === value ? "primary" : "default"} variant={slaPeriod === value ? "filled" : "outlined"} onClick={() => { setSlaPeriod(value); if(value==="30d") setSlaDays(30); }} />)}
                  {slaPeriod === "custom" && <><TextField size="small" type="date" value={slaCustomStart} onChange={(e)=>setSlaCustomStart(e.target.value)} sx={{width:145}}/><TextField size="small" type="date" value={slaCustomEnd} onChange={(e)=>setSlaCustomEnd(e.target.value)} sx={{width:145}}/></>}
                </Stack>
              </Stack>
              {slaLoading ? <LinearProgress sx={{ borderRadius: 2 }} /> : slaDevelopment ? (
                <Stack spacing={1.5}>
                  {slaDevelopment.health&&<Box sx={{...analyticsPanelSx,p:1.5}}>
                    <Stack direction={{xs:"column",md:"row"}} spacing={1.5} sx={{justifyContent:"space-between",alignItems:{md:"center"},mb:1.25}}>
                      <Box><Typography sx={{fontWeight:900}}>Saúde SLA × OLA</Typography><Typography variant="body2" color="text.secondary">Índice transparente para leitura executiva; cada componente permanece disponível separadamente.</Typography></Box>
                      <Stack direction="row" spacing={1} sx={{alignItems:"center"}}><Chip color={slaDevelopment.health.status==="stable"?"success":slaDevelopment.health.status==="attention"?"warning":"error"} label={`${slaDevelopment.health.score}% · ${slaDevelopment.health.status==="stable"?"Estável":slaDevelopment.health.status==="attention"?"Atenção":"Crítico"}`}/><Tooltip title={slaDevelopment.health.formula}><InfoOutlined sx={{fontSize:18,color:"text.secondary"}}/></Tooltip></Stack>
                    </Stack>
                    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(2,minmax(0,1fr))",xl:"repeat(4,minmax(0,1fr))"},gap:1}}>
                      {slaDevelopment.health.components.map(component=><Box key={component.key} sx={{p:1.1,border:"1px solid",borderColor:"divider",borderRadius:2,bgcolor:"background.paper"}}><Stack direction="row" sx={{justifyContent:"space-between",gap:1}}><Typography variant="caption" color="text.secondary" sx={{fontWeight:800}}>{component.label}</Typography><Typography variant="caption" color="text.secondary">{component.weight}% peso</Typography></Stack><Typography sx={{fontSize:"1.35rem",fontWeight:900,my:.4}}>{component.score}%</Typography><LinearProgress variant="determinate" value={clampPercent(component.score)} sx={{height:5,borderRadius:99,mb:.6}}/><Typography variant="caption" color="text.secondary">{component.detail}</Typography></Box>)}
                    </Box>
                    {slaDevelopment.health.alerts.length>0&&<Stack spacing={.7} sx={{mt:1}}>{slaDevelopment.health.alerts.map((alert,i)=><Alert key={i} severity={alert.severity} variant="outlined"><Typography sx={{fontWeight:800}}>{alert.title}</Typography><Typography variant="body2">{alert.detail}</Typography></Alert>)}</Stack>}
                  </Box>}
                  <Alert severity={slaDevelopment.dataQuality.missingAzure || slaDevelopment.dataQuality.missingTaskCreatedAt || slaDevelopment.dataQuality.missingPriority || slaDevelopment.dataQuality.invalidTimeline ? "warning" : "success"} variant="outlined">
                    Cobertura: {slaDevelopment.dataQuality.linked}/{slaDevelopment.dataQuality.bugsInPeriod} correções vinculadas. Sem Azure: {slaDevelopment.dataQuality.missingAzure} · sem abertura da Task: {slaDevelopment.dataQuality.missingTaskCreatedAt} · sem prioridade: {slaDevelopment.dataQuality.missingPriority} · linha temporal inválida: {slaDevelopment.dataQuality.invalidTimeline ?? 0}.
                  </Alert>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))", lg: "repeat(3,minmax(0,1fr))", xl: "repeat(5,minmax(0,1fr))" }, gap: 1.1 }}>
                    <KpiCard title="OLA Suporte" value={`${rate(slaDevelopment.summary.supportWithinOla, slaDevelopment.summary.bugsWithTask)}%`} subtitle={`${formatHours(slaDevelopment.summary.avgSupportMinutes)} em média`} info="Da abertura do ticket Movidesk até a abertura da Task no Azure. Considera todas as correções com Task válida." accent={aliareColors.info} />
                    <KpiCard title="OLA Desenvolvimento" value={`${rate(slaDevelopment.summary.factoryWithinOla, slaDevelopment.summary.bugsWithTask)}%`} subtitle={`${formatHours(slaDevelopment.summary.avgFactoryMinutes)} consumidas em média`} info="Da abertura da Task até a conclusão; para itens ainda abertos, mede o consumo acumulado até o fim do recorte." accent={aliareColors.green} />
                    <KpiCard title="SLA concluídos" value={slaDevelopment.summary.concluded ? `${rate(slaDevelopment.summary.totalWithinSla, slaDevelopment.summary.concluded)}%` : "—"} subtitle={`${slaDevelopment.summary.concluded} concluída(s) · ${formatHours(slaDevelopment.summary.avgTotalMinutes)} média`} info="SLA final calculado somente para correções cuja Task já foi concluída." accent={aliareColors.warning} />
                    <KpiCard title="Em desenvolvimento" value={slaDevelopment.summary.openDevelopment} subtitle={`${slaDevelopment.summary.openFactoryOverOla ?? 0} acima do OLA Dev`} info="Correções com Task aberta. O consumo continua sendo calculado para identificar risco antes da conclusão." accent={aliareColors.purple} />
                    <KpiCard title="Fora da meta" value={slaDevelopment.outliers.total} subtitle={`${slaDevelopment.outliers.support} suporte · ${slaDevelopment.outliers.factory} desenvolvimento`} info="Itens que já ultrapassaram pelo menos uma meta operacional, incluindo Tasks ainda abertas." accent={aliareColors.error} />
                  </Box>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1.4fr" }, gap: 1.25 }}>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5, p: 1.5 }}>
                      <Typography sx={{ fontWeight: 850, mb: 1 }}>Cumprimento por prioridade</Typography>
                      <Stack spacing={1}>
                        {slaDevelopment.byPriority.map((item) => (
                          <Box key={item.priority} onClick={()=>openSlaRows(`SLA × OLA · ${item.priority}`,item.rows)} sx={{ cursor:"pointer", borderRadius:1.5, p:.45, mx:-.45, "&:hover":{ bgcolor:"action.hover" } }}>
                            <Stack direction="row" sx={{ justifyContent: "space-between", mb: .35 }}>
                              <Typography variant="body2" sx={{ fontWeight: 800 }}>{item.priority} · {item.total} item(ns)</Typography>
                              <Typography variant="caption" color="text.secondary">Suporte {rate(item.supportWithinOla,item.total)}% · Dev {rate(item.factoryWithinOla,item.total)}% · SLA concluído {rate(item.totalWithinSla,item.concluded)}%</Typography>
                            </Stack>
                            <Stack spacing={.35}>
                              <LinearProgress variant="determinate" value={rate(item.supportWithinOla,item.total)} sx={{height:4,borderRadius:4,"& .MuiLinearProgress-bar":{bgcolor:aliareColors.info}}}/>
                              <LinearProgress variant="determinate" value={rate(item.factoryWithinOla,item.total)} sx={{height:4,borderRadius:4,"& .MuiLinearProgress-bar":{bgcolor:aliareColors.green}}}/>
                              <LinearProgress variant="determinate" value={item.concluded ? rate(item.totalWithinSla,item.concluded) : 0} sx={{height:4,borderRadius:4,"& .MuiLinearProgress-bar":{bgcolor:aliareColors.warning}}}/>
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5, p: 1.5, minHeight: 250 }}>
                      <Typography sx={{ fontWeight: 850, mb: 1 }}>Tendência mensal de cumprimento</Typography>
                      <ResponsiveContainer width="100%" height={210}>
                        <LineChart data={slaDevelopment.monthly} margin={{ top: 8, right: 16, left: -8, bottom: 4 }}>
                          <CartesianGrid vertical={false} stroke={theme.palette.divider} strokeDasharray="3 3" opacity={.55} />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize:11,fill:theme.palette.text.secondary}} />
                          <YAxis domain={[0,100]} tickFormatter={(value)=>`${value}%`} axisLine={false} tickLine={false} tick={{fontSize:11,fill:theme.palette.text.secondary}} />
                          <ReferenceLine y={100} stroke={theme.palette.text.disabled} strokeDasharray="5 5" />
                          <ChartTooltip contentStyle={{borderRadius:12,border:`1px solid ${theme.palette.divider}`,backgroundColor:theme.palette.background.paper,color:theme.palette.text.primary}} formatter={(value)=>[`${Number(value).toLocaleString("pt-BR",{maximumFractionDigits:1})}%`]} />
                          <Legend iconType="circle" wrapperStyle={{fontSize:11,paddingTop:8}} />
                          <Line type="monotone" dataKey="supportWithinPct" name="OLA Suporte" stroke={aliareColors.info} strokeWidth={2.5} dot={{r:2}} activeDot={{r:5}} />
                          <Line type="monotone" dataKey="factoryWithinPct" name="OLA Desenvolvimento" stroke={aliareColors.green} strokeWidth={2.5} dot={{r:2}} activeDot={{r:5}} />
                          <Line type="monotone" dataKey="totalWithinPct" name="SLA concluído" stroke={aliareColors.warning} strokeWidth={2.5} dot={{r:2}} activeDot={{r:5}} />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  </Box>
                  <Box sx={{ display:"grid", gridTemplateColumns:{ xs:"1fr", xl:"1fr 1fr" }, gap:1.25 }}>
                    {[{title:"Por analista",items:slaDevelopment.owners.map(x=>({name:x.owner,...x}))},{title:"Por cliente",items:slaDevelopment.clients.map(x=>({name:x.client,...x}))}].map((group)=>(
                      <Box key={group.title} sx={{ border:"1px solid", borderColor:"divider", borderRadius:2.5, p:1.5 }}>
                        <Typography sx={{ fontWeight:850, mb:1 }}>{group.title}</Typography>
                        <Stack spacing={.8}>{group.items.slice(0,8).map((item,index)=><Box key={`${item.name}-${index}`} onClick={()=>openSlaRows(`${group.title} · ${item.name}`,item.rows)} sx={{ cursor:"pointer", borderRadius:1.5, p:.45, mx:-.45, "&:hover":{ bgcolor:"action.hover" } }}><Stack direction="row" sx={{ justifyContent:"space-between", gap:1 }}><Typography variant="body2" noWrap sx={{ fontWeight:750 }}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.total} · SLA {rate(item.totalWithinSla,item.concluded)}%</Typography></Stack><LinearProgress variant="determinate" value={rate(item.totalWithinSla,item.concluded)} sx={{ height:6,borderRadius:4,mt:.3 }}/></Box>)}</Stack>
                      </Box>
                    ))}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Regra operacional: {slaDevelopment.rule.schedule} · conclusão da Task: {slaDevelopment.rule.taskEndState}. Suporte = {slaDevelopment.rule.supportStart ?? "abertura do ticket"} → {slaDevelopment.rule.supportEnd ?? "abertura da Task"}. Fábrica = {slaDevelopment.rule.factoryStart ?? "abertura da Task"} → {slaDevelopment.rule.factoryEnd ?? "Task Concluída"}; enquanto aberta, o consumo é atualizado até o fim do recorte. SLA final usa apenas Tasks concluídas. O índice de saúde é explicável pela fórmula exibida no card e não substitui os indicadores individuais.
                  </Typography>
                </Stack>
              ) : <Alert severity="warning">Não foi possível carregar a análise SLA × OLA.</Alert>}
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ mb: 2, overflow: "hidden" }}>
            <CardContent>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", mb: 1.5 }}>
                <Box>
                  <Typography sx={{ fontWeight: 900 }}>CSAT · Experiência do atendimento</Typography>
                  <Typography variant="body2" color="text.secondary">Fonte oficial: respostas da Pesquisa de Satisfação Movidesk relacionadas aos tickets SIMER.</Typography>
                </Box>
                {csat && <Chip size="small" variant="outlined" label={`${csat.summary.responses} resposta(s) no período`} />}
              </Stack>
              {csatLoading ? <LinearProgress sx={{ borderRadius: 2 }} /> : csat ? (
                <Stack spacing={1.5}>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))", xl: "repeat(4,minmax(0,1fr))" }, gap: 1.1 }}>
                    <KpiCard title="CSAT médio" value={csat.summary.responses ? csat.summary.average.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"} subtitle="escala da pesquisa Movidesk" info="Média das notas respondidas no período. Clique para detalhar." accent={aliareColors.green} onClick={()=>void openCsatDetails("CSAT · Todas as avaliações",{})} />
                    <KpiCard title="Avaliações 4–5" value={csat.summary.responses ? `${csat.summary.positivePct}%` : "—"} subtitle="respostas positivas" info="Percentual de respostas com nota 4 ou 5." accent={aliareColors.info} onClick={()=>void openCsatDetails("CSAT · Avaliações positivas",{minValue:4})} />
                    <KpiCard title="Respostas" value={csat.summary.responses} subtitle={`${csat.summary.comments} com comentário`} info="Pesquisas vinculadas a tickets do escopo SIMER. Clique para detalhar." accent={aliareColors.warning} onClick={()=>void openCsatDetails("CSAT · Respostas",{})} />
                    <KpiCard title="Comentários" value={csat.summary.comments} subtitle="feedback qualitativo" info="Respostas que possuem comentário textual do cliente. Clique para detalhar." accent={aliareColors.purple} onClick={()=>void openCsatDetails("CSAT · Comentários",{commentsOnly:"true"})} />
                  </Box>
                  {csat.summary.responses > 0 && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) minmax(0, 1fr)" }, gap: 1.5, alignItems: "stretch" }}>
                    <Box sx={{ ...analyticsPanelSx, p: 1.75, minWidth: 0, display: "flex", flexDirection: "column" }}>
                      <Stack direction="row" sx={{alignItems:"flex-start",justifyContent:"space-between",gap:1,mb:.25}}>
                        <Box><Typography sx={{ fontWeight: 850 }}>Distribuição das notas</Typography><Typography variant="caption" color="text.secondary">Escala CSAT 1–5 · respostas vinculadas à carteira SIMER</Typography></Box>
                        <Tooltip title="Quantidade de respostas da Pesquisa de Satisfação Movidesk em cada nota da escala 1–5."><InfoOutlined sx={{fontSize:17,color:"text.secondary",mt:.25}}/></Tooltip>
                      </Stack>
                      <Box sx={{ flex: 1, minHeight: 260, mt: 1 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={csat.distribution} margin={{ top: 12, right: 12, left: -12, bottom: 4 }}>
                            <CartesianGrid vertical={false} stroke={theme.palette.divider} strokeDasharray="3 3" opacity={.55} /><XAxis dataKey="value" axisLine={false} tickLine={false} tick={{fill:theme.palette.text.secondary}} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{fill:theme.palette.text.secondary}} /><ChartTooltip contentStyle={{borderRadius:12,border:`1px solid ${theme.palette.divider}`,backgroundColor:theme.palette.background.paper,color:theme.palette.text.primary}} cursor={{fill:theme.palette.action.hover}} />
                            <Bar dataKey="count" name="Respostas" radius={[7,7,0,0]} maxBarSize={72} cursor="pointer" onClick={(_, index)=>{const score=csat.distribution[index]?.value;if(score)void openCsatDetails(`CSAT · Nota ${score}`,{value:score})}}>{csat.distribution.map((item,index)=><Cell key={item.value} fill={chartColors[index % chartColors.length]}/>)}</Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    </Box>
                    <Box sx={{ ...analyticsPanelSx, p: 1.75, minWidth: 0, display: "flex", flexDirection: "column" }}>
                      <Stack direction="row" sx={{alignItems:"flex-start",justifyContent:"space-between",gap:1,mb:1}}>
                        <Box><Typography sx={{ fontWeight: 850 }}>CSAT por analista</Typography><Typography variant="caption" color="text.secondary">Equipe oficial de Suporte e Sustentação · clique para detalhar</Typography></Box>
                        <Tooltip title="Média e quantidade de avaliações por analista da operação SIMER. Pessoas fora da equipe oficial não compõem este ranking."><InfoOutlined sx={{fontSize:17,color:"text.secondary",mt:.25}}/></Tooltip>
                      </Stack>
                      <Stack spacing={.35} sx={{ flex: 1 }}>
                        {csat.byAnalyst.filter((item) => data?.scope.analysts.some((analyst) => analyst.localeCompare(item.name, "pt-BR", { sensitivity: "base" }) === 0)).slice(0,8).map((item,index) => <Stack key={`${item.name}-${index}`} direction="row" spacing={1} role="button" tabIndex={0} onClick={()=>void openCsatDetails(`CSAT · ${item.name}`,{analyst:item.name})} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" ")void openCsatDetails(`CSAT · ${item.name}`,{analyst:item.name})}} sx={{ alignItems:"center", cursor:"pointer", borderRadius:1.5, px:1, py:.75, mx:-1, transition:"background-color .15s ease", "&:hover":{bgcolor:"action.hover"} }}>
                          <Typography variant="body2" sx={{ flex:1, minWidth:0, fontWeight:650, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{whiteSpace:"nowrap"}}>{item.responses} resp.</Typography>
                          <Chip size="small" variant="outlined" label={`${item.average.toLocaleString("pt-BR",{maximumFractionDigits:2})} · ${item.positivePct}%`} sx={{minWidth:92,fontWeight:750}} />
                        </Stack>)}
                      </Stack>
                    </Box>
                  </Box>}
                  {!csat.summary.responses && <Alert severity="info" variant="outlined">Ainda não há respostas CSAT sincronizadas para os tickets SIMER deste período. Execute a sincronização de Catálogo + CSAT em Dados e Sincronizações.</Alert>}
                </Stack>
              ) : <Alert severity="warning">Não foi possível carregar o CSAT.</Alert>}
            </CardContent>
          </Card>

          {loading || !data ? (
            <Box sx={{ minHeight: 320, display: "grid", placeItems: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={2}>
              <Card variant="outlined" sx={{ overflow: "hidden", borderColor: data.intelligence.health === "critical" ? "error.light" : data.intelligence.health === "attention" ? "warning.light" : "success.light" }}>
                <CardContent>
                  <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { lg: "center" }, mb: 1.5 }}>
                    <Box>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <RadarOutlined sx={{ color: data.intelligence.health === "critical" ? "error.main" : data.intelligence.health === "attention" ? "warning.main" : "success.main" }} />
                        <Typography variant="h6" sx={{ fontWeight: 900 }}>Prioridades de atuação</Typography>
                        <Chip
                          size="small"
                          label={data.intelligence.health === "critical" ? "Ação imediata" : data.intelligence.health === "attention" ? "Requer atenção" : "Operação estável"}
                          color={data.intelligence.health === "critical" ? "error" : data.intelligence.health === "attention" ? "warning" : "success"}
                          variant="outlined"
                        />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: .4 }}>
                        Leitura automática dos sinais operacionais para orientar a atuação da coordenação.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                      <Chip size="small" label={`Carga mediana: ${data.intelligence.medianLoad}`} variant="outlined" />
                      <Chip size="small" label={`${data.intelligence.overloadedAnalysts.length} analista(s) acima da faixa`} variant="outlined" />
                    </Stack>
                  </Stack>

                  {data.intelligence.priorities.length ? (
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,minmax(0,1fr))", xl: "repeat(3,minmax(0,1fr))" }, gap: 1 }}>
                      {data.intelligence.priorities.map((priority) => (
                        <Button
                          key={priority.key}
                          onClick={() => void openDetails(priority.kind, priority.title)}
                          sx={{
                            justifyContent: "flex-start",
                            textAlign: "left",
                            textTransform: "none",
                            p: 1.25,
                            border: "1px solid",
                            borderColor: priority.severity === "critical" ? "error.light" : priority.severity === "high" ? "warning.light" : "divider",
                            borderRadius: 2,
                            bgcolor: priority.severity === "critical"
                              ? (theme.palette.mode === "dark" ? "rgba(239,68,68,.07)" : "rgba(239,68,68,.035)")
                              : "transparent",
                          }}
                        >
                          <Box sx={{ width: "100%" }}>
                            <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                              <Typography sx={{ fontWeight: 850, color: "text.primary" }}>{priority.title}</Typography>
                              <Chip size="small" label={priority.count} color={priority.severity === "critical" ? "error" : priority.severity === "high" ? "warning" : "default"} />
                            </Stack>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .6, lineHeight: 1.35 }}>{priority.description}</Typography>
                            <Typography variant="caption" sx={{ display: "block", mt: .65, color: "primary.main", fontWeight: 750 }}>{priority.action}</Typography>
                          </Box>
                        </Button>
                      ))}
                    </Box>
                  ) : <Alert severity="success">Nenhum sinal prioritário foi identificado no momento.</Alert>}

                  {data.intelligence.overloadedAnalysts.length > 0 && (
                    <Alert severity="warning" sx={{ mt: 1.25 }}>
                      Carga acima da faixa: {data.intelligence.overloadedAnalysts.map((item) => `${item.analyst} (${item.total})`).join(" · ")}. Avalie redistribuição considerando complexidade e contexto, não apenas quantidade.
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(3,1fr)" },
                  gap: 2,
                }}
              >
                {cards.map(([kind, label, value, info]) => (
                  <KpiCard
                    key={label}
                    title={label}
                    value={value}
                    subtitle={serviceDays ? `Recorte · últimos ${serviceDays} dias` : "Recorte · histórico disponível"}
                    info={info}
                    onClick={() => void openDetails(kind, label)}
                    accent={
                      label === "Críticos" || label === "Sem atualização 72h"
                        ? aliareColors.error
                        : label === "Vencem em 7 dias"
                          ? aliareColors.warning
                          : aliareColors.info
                    }
                  />
                ))}
              </Box>

              <Card variant="outlined" sx={{ overflow: "hidden" }}>
                <CardContent>
                  <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { lg: "center" }, mb: 1.5 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 850 }}>Qualidade da classificação por Serviço · 2º nível</Typography>
                      <Typography variant="body2" color="text.secondary">Atendimentos abertos da equipe SIMER classificados pelo Serviço de 2º nível sincronizado do Movidesk.</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                      <Chip label={`${data.serviceAnalytics.classificationRate}% específicos`} color={data.serviceAnalytics.classificationRate >= 90 ? "success" : data.serviceAnalytics.classificationRate >= 75 ? "warning" : "error"} variant="outlined" />
                      <Chip label={`${data.serviceAnalytics.catalogSize} serviços conhecidos`} variant="outlined" />
                      <Chip label="Escopo: carteira SIMER + equipe oficial" variant="outlined" />
                    </Stack>
                  </Stack>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, mb: 1.5 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>Período dos atendimentos abertos</Typography>
                      <Typography variant="body2" color="text.secondary">Aplicado aos indicadores, ranking, detalhamento e exportação.</Typography>
                    </Box>
                    <Stack direction="row" spacing={0.6} useFlexGap sx={{ flexWrap: "wrap" }}>
                      <Chip size="small" label={serviceDays ? `Sincronizado com o filtro global · ${serviceDays} dias` : "Sincronizado com o filtro global · todo período"} variant="outlined" />
                    </Stack>
                  </Stack>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(4,1fr)" }, gap: 1.25, mb: 2 }}>
                    <KpiCard title="Com serviço específico" value={data.serviceAnalytics.specificServices} subtitle="Atendimentos abertos" info="Tickets da equipe com Serviço de 2º nível informado no Movidesk. O 1º nível é apenas agrupador e o 3º nível permanece disponível no detalhamento." accent={aliareColors.green} />
                    <KpiCard title="Sem serviço" value={data.serviceAnalytics.withoutService} subtitle="Requer classificação" info="Atendimentos da equipe sem Serviço de 2º nível informado." onClick={() => navigate("/qualidade-dados?issue=withoutService")} accent={aliareColors.error} />
                    <KpiCard title="SIMER genérico" value={data.serviceAnalytics.genericService} subtitle="Requer revisão" info="Tickets cujo Serviço de 2º nível ainda é genérico (por exemplo SIMER), exigindo refinamento da classificação." onClick={() => navigate("/qualidade-dados?issue=genericSimerService")} accent={aliareColors.warning} />
                    <KpiCard title="Possível incorreto" value={data.serviceAnalytics.suspectedMismatch} subtitle="Sugestão assistiva" info="No escopo da equipe, o Serviço informado diverge de uma sugestão assistiva com evidência suficiente. Exige validação humana." onClick={() => navigate("/qualidade-dados?issue=suspectedServiceMismatch")} accent={aliareColors.info} />
                  </Box>
                  {data.serviceAnalytics.genericService > 0 && <Alert severity="warning" sx={{mb:1.5}}><strong>{data.serviceAnalytics.genericService}</strong> atendimento(s) estão apenas em níveis genéricos do SIMER e foram retirados do ranking abaixo para não distorcer a leitura das rotinas específicas. Use o card “SIMER genérico” para revisar esses casos.</Alert>}
                  {data.serviceAnalytics.ranking.length ? (
                    <Box sx={{ width: "100%", height: Math.max(210, Math.min(360, data.serviceAnalytics.ranking.length * 38 + 28)) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.serviceAnalytics.ranking} layout="vertical" margin={{ top: 4, right: 52, left: 8, bottom: 4 }}>
                          <CartesianGrid stroke={theme.palette.divider} strokeDasharray="4 4" horizontal={false} opacity={0.55} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="service" width={210} tick={{ fontSize: 10, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} tickFormatter={(value: string) => { const label = value.split("»").at(-1)?.trim() ?? value; return label.length > 28 ? `${label.slice(0, 27)}…` : label; }} />
                          <ChartTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, boxShadow: "0 14px 36px rgba(0,0,0,.24)" }} wrapperStyle={{ outline: "none" }} cursor={{ fill: theme.palette.action.hover }} formatter={(value) => [value, "Atendimentos"]} labelFormatter={(value) => String(value)} />
                          <Bar dataKey="count" name="Atendimentos" radius={[0, 6, 6, 0]} maxBarSize={28} label={{position:"right",fill:theme.palette.text.secondary,fontSize:11,fontWeight:800}} cursor="pointer" onClick={(_, index) => { const service = data.serviceAnalytics.ranking[index]?.service; if (service) void openDetails("service", `Serviço · ${service.split("»").at(-1)?.trim() ?? service}`, undefined, undefined, undefined, service); }}>{data.serviceAnalytics.ranking.map((item,index)=><Cell key={`${item.service}-${index}`} fill={chartColors[index % chartColors.length]}/>)}</Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  ) : <Alert severity="info">Ainda não há Serviços suficientes no histórico sincronizado para montar o ranking.</Alert>}

                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "repeat(2,minmax(0,1fr))" }, gap: 1.5, mt: 2 }}>
                    <Box sx={{ ...analyticsPanelSx, p: 1.75 }}>
                      <Stack direction="row" sx={{justifyContent:"space-between",alignItems:"flex-start",mb:1}}>
                        <Box><Typography sx={{ fontWeight: 850 }}>Qualidade da classificação · 3º nível</Typography><Typography variant="caption" color="text.secondary">Cobertura das rotinas detalhadas do Serviço no Movidesk.</Typography></Box>
                        <Chip size="small" label={`${data.serviceAnalytics.thirdLevel.rate}% classificados`} color={data.serviceAnalytics.thirdLevel.rate >= 90 ? "success" : data.serviceAnalytics.thirdLevel.rate >= 75 ? "warning" : "error"} variant="outlined"/>
                      </Stack>
                      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"180px minmax(0,1fr)"},gap:1,alignItems:"center"}}>
                        <Box sx={{height:180,position:"relative"}}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart><Pie data={[{name:"Classificados",value:data.serviceAnalytics.thirdLevel.classified},{name:"Sem 3º nível",value:data.serviceAnalytics.thirdLevel.missing}]} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={3} stroke="none"><Cell fill={aliareColors.green}/><Cell fill={aliareColors.warning}/></Pie><ChartTooltip/><Legend verticalAlign="bottom" height={28}/></PieChart>
                          </ResponsiveContainer><Box sx={{position:"absolute",inset:0,display:"grid",placeItems:"center",pointerEvents:"none",pb:3}}><Box sx={{textAlign:"center"}}><Typography sx={{fontWeight:950,fontSize:20}}>{data.serviceAnalytics.thirdLevel.rate}%</Typography><Typography variant="caption" color="text.secondary">classificados</Typography></Box></Box>
                        </Box>
                        <Stack spacing={.55}>{data.serviceAnalytics.thirdLevel.ranking.slice(0,5).map((item,index)=><Button key={`${item.service}-${index}`} onClick={()=>void openDetails("serviceThirdLevel",`3º nível · ${item.service}`,undefined,undefined,undefined,item.service)} sx={{justifyContent:"space-between",textTransform:"none",color:"text.primary",px:.5,minWidth:0}}><Typography variant="body2" noWrap title={item.service} sx={{maxWidth:"75%"}}>{item.service}</Typography><Chip size="small" label={item.count} variant="outlined"/></Button>)}</Stack>
                      </Box>
                    </Box>
                    <Box sx={{ ...analyticsPanelSx, p: 1.75, minHeight:220 }}>
                      <Typography sx={{ fontWeight: 850 }}>Top Serviços · 3º nível</Typography>
                      <Typography variant="caption" color="text.secondary">Clique em uma barra para abrir os atendimentos classificados naquela rotina.</Typography>
                      <Box sx={{height:180,mt:1}}>
                        <ResponsiveContainer width="100%" height="100%"><BarChart data={data.serviceAnalytics.thirdLevel.ranking.slice(0,6)} layout="vertical" margin={{top:2,right:28,left:8,bottom:2}}><CartesianGrid horizontal={false} strokeDasharray="3 3"/><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="service" width={120} axisLine={false} tickLine={false} tickFormatter={(v:string)=>v.length>18?`${v.slice(0,17)}…`:v}/><ChartTooltip contentStyle={{borderRadius:12,border:`1px solid ${theme.palette.divider}`,backgroundColor:theme.palette.background.paper,color:theme.palette.text.primary}}/><Bar dataKey="count" radius={[0,6,6,0]} cursor="pointer" onClick={(_,index)=>{const service=data.serviceAnalytics.thirdLevel.ranking[index]?.service;if(service)void openDetails("serviceThirdLevel",`3º nível · ${service}`,undefined,undefined,undefined,service)}}>{data.serviceAnalytics.thirdLevel.ranking.slice(0,6).map((item,index)=><Cell key={`${item.service}-${index}`} fill={chartColors[index % chartColors.length]}/>)}</Bar></BarChart></ResponsiveContainer>
                      </Box>
                    </Box>
                  </Box>

                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "repeat(3,minmax(0,1fr))" }, gap: 1.5, mt: 2 }}>
                    <Box sx={{ ...analyticsPanelSx, p: 1.75 }}>
                      <Typography sx={{ fontWeight: 850 }}>Módulos mais demandados</Typography>
                      <Typography variant="caption" color="text.secondary">Distribuição dos atendimentos abertos pelos módulos derivados do Serviço.</Typography>
                      <Stack spacing={.75} sx={{ mt: 1.25 }}>
                        {data.serviceAnalytics.moduleRanking.slice(0, 6).map((item,index) => (
                          <Button key={`${item.module}-${index}`} onClick={() => void openDetails("serviceModule", `Serviço · ${item.module}`, undefined, item.module)} sx={rankingRowSx}>
                            <Box sx={{width:26,height:26,borderRadius:"50%",display:"grid",placeItems:"center",flexShrink:0,fontSize:12,fontWeight:900,color:chartColors[index%chartColors.length],border:"1px solid currentColor",mr:1}}>{index+1}</Box>
                            <Box sx={{minWidth:0,flex:1,textAlign:"left"}}><Typography variant="body2" noWrap title={item.module} sx={{fontWeight:750}}>{item.module}</Typography><LinearProgress variant="determinate" value={clampPercent(data.serviceAnalytics.moduleRanking[0]?.count ? item.count/data.serviceAnalytics.moduleRanking[0].count*100 : 0)} sx={{height:5,borderRadius:5,mt:.55,"& .MuiLinearProgress-bar":{background:chartColors[index%chartColors.length]}}}/></Box>
                            <Chip size="small" label={item.count} variant="outlined" sx={{ml:1,fontWeight:850}} />
                          </Button>
                        ))}
                        {!data.serviceAnalytics.moduleRanking.length && <Typography variant="caption" color="text.secondary">Sem módulos classificados.</Typography>}
                      </Stack>
                    </Box>

                    <Box sx={{ ...analyticsPanelSx, p: 1.75 }}>
                      <Typography sx={{ fontWeight: 850 }}>Qualidade por cliente</Typography>
                      <Typography variant="caption" color="text.secondary">Clientes com maior quantidade de ausências, classificações genéricas ou divergências sugeridas.</Typography>
                      <Stack spacing={.75} sx={{ mt: 1.25 }}>
                        {data.serviceAnalytics.clientQuality.slice(0, 6).map((item,index) => (
                          <Button key={item.client} onClick={() => void openDetails("serviceClient", `Serviços · ${item.client}`, undefined, undefined, item.client)} sx={rankingRowSx}>
                            <Box sx={{width:26,height:26,borderRadius:"50%",display:"grid",placeItems:"center",flexShrink:0,fontSize:12,fontWeight:900,color:chartColors[index%chartColors.length],border:"1px solid currentColor",mr:1}}>{index+1}</Box>
                            <Box sx={{ minWidth: 0, flex:1, textAlign: "left" }}><Typography variant="body2" noWrap title={item.client} sx={{fontWeight:750}}>{item.client}</Typography><Typography variant="caption" color="text.secondary">{item.issues} revisão(ões) de {item.total}</Typography><LinearProgress variant="determinate" value={clampPercent(item.rate)} sx={{height:5,borderRadius:5,mt:.45}}/></Box>
                            <Chip size="small" label={`${item.rate}%`} color={item.rate >= 90 ? "success" : item.rate >= 75 ? "warning" : "error"} variant="outlined" sx={{ml:1,fontWeight:850}} />
                          </Button>
                        ))}
                      </Stack>
                    </Box>

                    <Box sx={{ ...analyticsPanelSx, p: 1.75 }}>
                      <Typography sx={{ fontWeight: 850 }}>Qualidade por analista</Typography>
                      <Typography variant="caption" color="text.secondary">Indicador de apoio à revisão de classificação, sem avaliação individual automática.</Typography>
                      <Stack spacing={.75} sx={{ mt: 1.25 }}>
                        {data.serviceAnalytics.analystQuality.slice(0, 6).map((item,index) => (
                          <Button key={item.analyst} onClick={() => void openDetails("serviceAnalyst", `Serviços · ${item.analyst}`, item.analyst)} sx={rankingRowSx}>
                            <Box sx={{width:26,height:26,borderRadius:"50%",display:"grid",placeItems:"center",flexShrink:0,fontSize:12,fontWeight:900,color:chartColors[index%chartColors.length],border:"1px solid currentColor",mr:1}}>{index+1}</Box>
                            <Box sx={{ minWidth: 0, flex:1, textAlign: "left" }}><Typography variant="body2" noWrap title={item.analyst} sx={{fontWeight:750}}>{item.analyst}</Typography><Typography variant="caption" color="text.secondary">{item.issues} revisão(ões) de {item.total}</Typography><LinearProgress variant="determinate" value={clampPercent(item.rate)} sx={{height:5,borderRadius:5,mt:.45}}/></Box>
                            <Chip size="small" label={`${item.rate}%`} color={item.rate >= 90 ? "success" : item.rate >= 75 ? "warning" : "error"} variant="outlined" sx={{ml:1,fontWeight:850}} />
                          </Button>
                        ))}
                      </Stack>
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              {capacity && <Card variant="outlined">
                <CardContent>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                    <Box><Typography variant="h6" sx={{ fontWeight: 850 }}>Capacidade e horas registradas</Typography><Typography variant="body2" color="text.secondary">{capacity.days > 0 ? `Últimos ${capacity.days} dias` : "Desde 01/01/2026"}. A cobertura usa os apontamentos estruturados do Movidesk já enriquecidos e deve ser lida junto com volume, SLA, complexidade e cobertura atual do enriquecimento.</Typography></Box>
                    <Button variant="outlined" onClick={() => navigate("/analistas")}>Abrir análise completa</Button>
                  </Stack>
                  {capacity.hasRegisteredTimeData === false && <Alert severity="warning" variant="outlined" sx={{mt:1.5}}>A API/snapshot atual não contém apontamentos de tempo utilizáveis para este período. As horas previstas são capacidade teórica; horas registradas não serão inferidas a partir de duração do ticket.</Alert>}
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))", lg: "repeat(3,minmax(0,1fr))" }, gap: 1.1, mt: 1.5 }}>
                    <KpiCard title="Horas previstas" value={`${capacity.expectedHours.toLocaleString("pt-BR")}h`} subtitle={`${capacity.businessDays} dias úteis · ${capacity.hoursPerDay}h/dia`} info="Capacidade teórica da equipe no período, antes de ajustes individuais por férias ou afastamentos." accent={aliareColors.info}/>
                    <KpiCard title="Horas registradas" value={`${capacity.registeredHours.toLocaleString("pt-BR")}h`} subtitle="Apontamentos estruturados Movidesk" info="Soma de accountedTime dos apontamentos estruturados já enriquecidos nos atendimentos da carteira SIMER." accent={aliareColors.green}/>
                    <KpiCard title="Cobertura de apontamento" value={capacity.coverageRate === null ? "—" : `${capacity.coverageRate.toLocaleString("pt-BR")}%`} subtitle="Registradas ÷ previstas" info="Indicador de cobertura de registro de tempo; não representa isoladamente produtividade ou desempenho." accent={aliareColors.warning}/>
                  </Box>
                  <Stack spacing={.5} sx={{ mt: 1.25 }}>{capacity.analysts.map((item) => <Button key={item.analyst} onClick={() => navigate(`/analistas?analyst=${encodeURIComponent(item.analyst)}`)} sx={{ justifyContent: "space-between", textTransform: "none", color: "text.primary", borderBottom: "1px solid", borderColor: "divider", borderRadius: 0 }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{item.analyst}</Typography><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Typography variant="caption" color="text.secondary">{item.registeredHours.toLocaleString("pt-BR")}h / {item.expectedHours.toLocaleString("pt-BR")}h</Typography><Chip size="small" variant="outlined" label={item.coverageRate === null ? "—" : `${item.coverageRate.toLocaleString("pt-BR")}%`} /></Stack></Button>)}</Stack>
                </CardContent>
              </Card>}

              <Card variant="outlined" sx={{ overflow: "hidden" }}>
                <CardContent>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, mb: 1.5 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 850 }}>Distribuição da carga operacional</Typography>
                      <Typography variant="body2" color="text.secondary">Backlog Movidesk + Work Items Azure atribuídos atualmente a cada analista · {analyticPeriodLabel}.</Typography>
                    </Box>
                    <Stack direction="row" spacing={.75} useFlexGap sx={{flexWrap:"wrap"}}><Chip size="small" label={`${workloadSummary.total} itens`} variant="outlined" /><Chip size="small" label={`Média ${workloadSummary.average}/analista`} variant="outlined" /></Stack>
                  </Stack>
                  {data.workload.length ? <Box sx={{ width: "100%", height: Math.max(220, Math.min(420, data.workload.length * 38)) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.workload} layout="vertical" margin={{ top: 6, right: 18, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={theme.palette.divider} strokeDasharray="4 4" horizontal={false} opacity={0.55} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="analyst" width={104} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} tickFormatter={(value:string)=>{const parts=value.trim().split(/\s+/);return parts.length>1?`${parts[0]} ${parts.at(-1)?.charAt(0)}.`:value}} />
                        <ChartTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, boxShadow: "0 14px 36px rgba(0,0,0,.18)" }} cursor={{ fill: theme.palette.action.hover }} /><Legend iconType="circle" wrapperStyle={{fontSize:11,paddingTop:8}} />
                        <Bar dataKey="tickets" name="Tickets" stackId="load" fill={aliareColors.info} radius={[0, 0, 0, 0]} cursor="pointer" onClick={(_, index) => { const analyst = data.workload[index]?.analyst; if (analyst) void openDetails("analyst", `Carga de ${analyst}`, analyst); }} />
                        <Bar dataKey="workItems" name="Azure" stackId="load" fill={aliareColors.green} radius={[0, 6, 6, 0]} cursor="pointer" onClick={(_, index) => { const analyst = data.workload[index]?.analyst; if (analyst) void openDetails("analyst", `Carga de ${analyst}`, analyst); }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box> : <Typography color="text.secondary">Nenhuma carga pendente localizada para os analistas da equipe.</Typography>}
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1}
                    sx={{ justifyContent: "space-between", alignItems: { md: "center" }, mb: 2 }}
                  >
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 850 }}>
                        Carga consolidada por analista
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Composição da carga por fonte, participação no backlog da equipe e acesso ao recorte individual.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={.75}><Chip size="small" label={`${workloadSummary.tickets} tickets`} variant="outlined" /><Chip size="small" label={`${workloadSummary.workItems} Azure`} variant="outlined" /></Stack>
                  </Stack>

                  <Stack spacing={2}>
                    {data.workload.map((item) => (
                      <Box key={item.analyst} role="button" tabIndex={0}
                        onClick={() => void openDetails("analyst", `Carga de ${item.analyst}`, item.analyst)}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") void openDetails("analyst", `Carga de ${item.analyst}`, item.analyst); }}
                        sx={{ p: 1, mx: -1, borderRadius: 1.5, cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" } }}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={0.5}
                          sx={{ justifyContent: "space-between", mb: 0.6 }}
                        >
                          <Typography sx={{ fontWeight: 750 }}>{item.analyst}</Typography>
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                            <Typography variant="body2" color="text.secondary">
                              {item.tickets} tickets · {item.workItems} itens Azure
                            </Typography>
                            <Tooltip title="Clique para abrir o recorte operacional deste analista."><InfoOutlined sx={{ fontSize: 15, color: "text.secondary" }} /></Tooltip>
                          </Stack>
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{alignItems:"center",mb:.7}}>
                          <Box sx={{flex:1,height:9,borderRadius:5,overflow:"hidden",display:"flex",bgcolor:"rgba(47,111,237,.08)"}}>
                            <Box sx={{width:`${item.total ? item.tickets/item.total*100 : 0}%`,bgcolor:aliareColors.info,transition:"width .2s ease"}} />
                            <Box sx={{width:`${item.total ? item.workItems/item.total*100 : 0}%`,bgcolor:aliareColors.green,transition:"width .2s ease"}} />
                          </Box>
                          <Typography variant="caption" sx={{minWidth:72,textAlign:"right",fontWeight:800}}>{workloadSummary.total ? (item.total/workloadSummary.total*100).toLocaleString("pt-BR",{maximumFractionDigits:1}) : 0}% da carga</Typography>
                        </Stack>
                        <LinearProgress variant="determinate" value={(item.total / maximum) * 100} sx={{height:3,borderRadius:3,bgcolor:"rgba(47,111,237,.06)","& .MuiLinearProgress-bar":{bgcolor:"text.disabled"}}} />
                      </Box>
                    ))}
                    {!data.workload.length && (
                      <Typography color="text.secondary">
                        Nenhuma carga pendente localizada para os analistas da equipe.
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>

            </Stack>
          )}
        </CardContent>
      </Card>
      <Drawer anchor="right" open={Boolean(slaDetail)} onClose={()=>setSlaDetail(null)} slotProps={{ paper:{ sx:detailDrawerPaperSx } }}>
        <DetailPanelHeader eyebrow="SLA × OLA" title={slaDetail?.title ?? "Detalhes"} identifier={slaDetail ? `${slaDetail.rows.length} item(ns)` : undefined} onClose={()=>setSlaDetail(null)} />
        <Stack spacing={1.2} sx={{ p:2 }}>{slaDetail?.rows.map((row)=><Button key={row.movideskId} variant="outlined" onClick={()=>navigate(`/tickets?movidesk=${row.movideskId}`)} sx={{ textTransform:"none", textAlign:"left", justifyContent:"flex-start", p:1.25 }}><Box><Typography sx={{fontWeight:800}}>#{row.movideskId} · {row.subject}</Typography><Typography variant="caption" color="text.secondary">{[row.client,row.owner,row.urgency,`Task #${row.taskNumber}`].filter(Boolean).join(" · ")}</Typography><Typography variant="caption" sx={{display:"block",mt:.35}}>Suporte {formatHours(row.supportMinutes)} · Desenvolvimento {formatHours(row.factoryMinutes ?? 0)} · Total {formatHours(row.totalMinutes ?? 0)}</Typography></Box></Button>)}</Stack>
      </Drawer>
      <Drawer anchor="right" open={Boolean(csatDetailTitle)} onClose={()=>{setCsatDetailTitle("");setCsatDetail(null)}} slotProps={{ paper:{ sx:detailDrawerPaperSx } }}>
        <DetailPanelHeader eyebrow="CSAT" title={csatDetailTitle || "Avaliações"} identifier={csatDetail ? `${csatDetail.total} resposta(s)` : undefined} onClose={()=>{setCsatDetailTitle("");setCsatDetail(null)}} />
        {csatDetailLoading ? <Box sx={{py:8,display:"grid",placeItems:"center"}}><CircularProgress/></Box> : <Stack spacing={1.2} sx={{p:2}}>{csatDetail?.items.map((item)=><Button key={item.id} variant="outlined" onClick={()=>item.ticketId&&navigate(`/tickets?movidesk=${item.ticketId}`)} sx={{textTransform:"none",textAlign:"left",justifyContent:"flex-start",p:1.25}}><Box><Stack direction="row" spacing={1} sx={{alignItems:"center"}}><Typography sx={{fontWeight:800}}>#{item.ticketId} · {item.subject}</Typography><Chip size="small" label={item.value ?? "—"}/></Stack><Typography variant="caption" color="text.secondary">{[item.client,item.owner,item.service].filter(Boolean).join(" · ")}</Typography>{item.commentary&&<Typography variant="body2" sx={{mt:.65}}>{item.commentary}</Typography>}</Box></Button>)}{csatDetail?.truncated&&<Alert severity="info">Recorte limitado aos 500 registros mais recentes.</Alert>}</Stack>}
      </Drawer>
      <Drawer anchor="right" open={Boolean(detailTitle)} onClose={() => { setDetailTitle(""); setDetails(null); setDetailError(""); }} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
        <DetailPanelHeader eyebrow="Coordenação" title={detailTitle || "Detalhes"} identifier={details ? `${details.total} item(ns) no recorte · ${details.loaded ?? (details.tickets.length + details.workItems.length)} carregado(s)` : undefined} onClose={() => { setDetailTitle(""); setDetails(null); setDetailError(""); }} />
        {detailLoading ? <Box sx={{ py: 8, display: "grid", placeItems: "center" }}><CircularProgress /></Box> : detailError ? <Alert severity="error" sx={{m:2}}>{detailError}</Alert> : details ? (
          <Stack spacing={2}>
            {details.truncated && <Alert severity="info">Este recorte possui {details.total} item(ns). Exibindo {details.loaded ?? (details.tickets.length + details.workItems.length)} registro(s) carregado(s).</Alert>}
            {details.tickets.length > 0 && <ExportTicketsButton tickets={details.tickets.map((ticket) => ({ ...ticket, service: [ticket.serviceFirstLevel, ticket.serviceSecondLevel, ticket.serviceThirdLevel].filter(Boolean).join(" » ") || ticket.service }))} title={detailTitle || "Recorte operacional"} subtitle="Central da Coordenação · recorte para análise" />}
            {details.tickets.length > 0 && <DetailSection title="Atendimentos Movidesk"><Stack spacing={1}>{details.tickets.map((ticket) => (
              <Button key={ticket.movideskId} variant="outlined" onClick={() => navigate(`/tickets?movidesk=${ticket.movideskId}`)} sx={{ justifyContent: "flex-start", textTransform: "none", textAlign: "left", p: 1.25 }}>
                <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 800 }}>#{ticket.movideskId} · {ticket.subject}</Typography><Typography variant="caption" color="text.secondary">{[ticket.status, ticket.urgency, ticket.client, ticket.owner].filter(Boolean).join(" · ")}</Typography>
                {(ticket.serviceThirdLevel || ticket.serviceSecondLevel || ticket.serviceFirstLevel || ticket.service) && <Typography variant="caption" color="primary.main" sx={{ display: "block", mt: .35 }}>{[ticket.serviceFirstLevel, ticket.serviceSecondLevel, ticket.serviceThirdLevel].filter(Boolean).join(" » ") || ticket.service}</Typography>}
                {(ticket.category || ticket.cause) && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{[ticket.category, ticket.cause].filter(Boolean).join(" · ")}</Typography>}</Box>
              </Button>
            ))}</Stack></DetailSection>}
            {details.workItems.length > 0 && <DetailSection title="Work Items Azure"><Stack spacing={1}>{details.workItems.map((item) => (
              <Button key={item.id} variant="outlined" onClick={() => navigate(item.workItemType.toLocaleLowerCase("pt-BR").includes("apoio") ? `/apoios?task=${item.id}` : item.workItemType.toLocaleLowerCase("pt-BR").includes("evolu") ? `/evolucoes?task=${item.id}` : `/correcoes?task=${item.id}`)} sx={{ justifyContent: "flex-start", textTransform: "none", textAlign: "left", p: 1.25 }}>
                <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 800 }}>#{item.id} · {item.title}</Typography><Typography variant="caption" color="text.secondary">{[item.workItemType, item.state, item.client, item.assignedToName ?? "Sem responsável"].filter(Boolean).join(" · ")}</Typography></Box>
              </Button>
            ))}</Stack></DetailSection>}
            {details.total === 0 && <Alert severity="info">Nenhum registro encontrado para este recorte.</Alert>}
            {details.analyst && <DetailSection title="Escopo do analista"><DetailFieldGrid fields={[["Analista", details.analyst], ["Total carregado", details.total]]} /></DetailSection>}
          </Stack>
        ) : null}
      </Drawer>
    </Box>
  );
}
