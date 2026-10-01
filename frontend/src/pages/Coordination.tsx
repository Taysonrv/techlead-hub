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
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

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

type IntegrationHealth = { tickets: number; linkedTasks: number; azureItems: number; csatResponses: number; catalogServices: number; taskLinkCoveragePct: number; latestCsatSyncAt: string | null; latestCsatResponseAt: string | null; latestCatalogSyncAt: string | null; sources: Record<string,string> };

type SlaBreakdown = { total:number; concluded:number; openDevelopment:number; avgSupportMinutes:number; avgFactoryMinutes:number; avgTotalMinutes:number; supportWithinOla:number; factoryWithinOla:number; totalWithinSla:number };

type SlaDevelopment = {
  periodDays: number;
  rule: { taskEndState: string; schedule: string; profile: string };
  dataQuality: { bugsInPeriod: number; linked: number; missingAzure: number; missingTaskCreatedAt: number; missingPriority: number };
  summary: { bugsWithTask: number; concluded: number; openDevelopment: number; avgSupportMinutes: number; avgFactoryMinutes: number; avgTotalMinutes: number; supportWithinOla: number; factoryWithinOla: number; totalWithinSla: number };
  byPriority: Array<{ priority: string; total: number; concluded: number; avgSupportMinutes: number; avgFactoryMinutes: number; avgTotalMinutes: number; supportWithinOla: number; factoryWithinOla: number; totalWithinSla: number; rows:number[] }>;
  monthly: Array<{ month: string; label: string; total: number; concluded: number; supportWithinPct: number; factoryWithinPct: number; totalWithinPct: number }>;
  owners: Array<SlaBreakdown & { owner:string; rows:number[] }>;
  clients: Array<SlaBreakdown & { client:string; rows:number[] }>;
  outliers: { total: number; support: number; factory: number; totalSla: number; critical: number; top: Array<SlaRow> };
  rows: SlaRow[];
};

type SlaRow = { movideskId:number; subject:string; client:string|null; owner:string; taskNumber:number; taskTitle?:string|null; taskState?:string|null; urgency:string; supportMinutes:number; factoryMinutes:number|null; totalMinutes:number|null; supportPct:number; factoryPct:number|null; totalPct:number|null; bottleneck:string };
type CsatDetail = { periodDays:number; total:number; truncated:boolean; items:Array<{ id:string; ticketId:number|null; subject:string; client:string|null; owner:string|null; taskNumber:number|null; service:string; value:number|null; commentary:string|null; responseDate:string|null }> };

type DetailKind = "backlog" | "critical" | "stale" | "dueSoon" | "overdue" | "blocked" | "unassigned" | "analyst" | "service" | "serviceModule" | "serviceClient" | "serviceAnalyst";
type DetailData = {
  kind: DetailKind; analyst: string | null; total: number; loaded?: number; truncated: boolean;
  tickets: Array<{ movideskId: number; subject: string; status: string; urgency: string | null; client: string | null; owner: string | null; lastUpdate: string | null; dueDate: string | null; taskNumber: number | null; registeredVersion: string | null; deliveredVersion: string | null; service: string | null; serviceFirstLevel: string | null; serviceSecondLevel: string | null; serviceThirdLevel: string | null; category: string | null; cause: string | null }>;
  workItems: Array<{ id: number; workItemType: string; title: string; state: string; client: string | null; assignedToName: string | null; createdByName: string | null; criticality: string | null; blockedProcess: boolean | null; movideskTicket: number | null; registeredVersion: string | null; deliveredVersion: string | null; azureChangedAt: string | null; remoteUrl: string | null }>;
};

export function Coordination() {
  const navigate = useNavigate();
  const theme = useTheme();
  const [data, setData] = useState<Data | null>(null);
  const [capacity, setCapacity] = useState<{ days: number; businessDays: number; hoursPerDay: number; expectedHours: number; registeredHours: number; coverageRate: number | null; analysts: Array<{ analyst: string; expectedHours: number; registeredHours: number; coverageRate: number | null }> } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailError, setDetailError] = useState("");
  const [details, setDetails] = useState<DetailData | null>(null);
  const [serviceDays, setServiceDays] = useState(0);
  const [slaDays, setSlaDays] = useState(180);
  const [slaDevelopment, setSlaDevelopment] = useState<SlaDevelopment | null>(null);
  const [slaLoading, setSlaLoading] = useState(false);
  const [csat, setCsat] = useState<CsatOverview | null>(null);
  const [csatLoading, setCsatLoading] = useState(false);
  const [integrationHealth, setIntegrationHealth] = useState<IntegrationHealth | null>(null);
  const [slaDetail, setSlaDetail] = useState<{ title:string; rows:SlaRow[] } | null>(null);
  const [csatDetail, setCsatDetail] = useState<CsatDetail | null>(null);
  const [csatDetailTitle, setCsatDetailTitle] = useState("");
  const [csatDetailLoading, setCsatDetailLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get<Data>("/coordination/summary", { params: { serviceDays } });
      setData(response.data);
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Não foi possível carregar a central."));
    } finally {
      setLoading(false);
    }
  }, [serviceDays]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api.get("/coordination/productivity-capacity", { params: { days: 28 }, signal: controller.signal })
        .then((response) => setCapacity(response.data))
        .catch(() => { if (!controller.signal.aborted) setCapacity(null); });
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [Boolean(data)]);

  useEffect(() => {
    const controller = new AbortController();
    api.get<IntegrationHealth>("/coordination/integration-health", { signal: controller.signal })
      .then((response) => setIntegrationHealth(response.data))
      .catch(() => { if (!controller.signal.aborted) setIntegrationHealth(null); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setSlaLoading(true);
    api.get<SlaDevelopment>("/coordination/sla-development", { params: { days: slaDays }, signal: controller.signal })
      .then((response) => setSlaDevelopment(response.data))
      .catch(() => { if (!controller.signal.aborted) setSlaDevelopment(null); })
      .finally(() => { if (!controller.signal.aborted) setSlaLoading(false); });
    return () => controller.abort();
  }, [slaDays]);

  const formatHours = (minutes: number) => minutes ? `${(minutes / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h` : "—";
  const rate = (within: number, total: number) => total ? Math.round(within / total * 1000) / 10 : 0;

  useEffect(() => {
    const controller = new AbortController();
    setCsatLoading(true);
    api.get<CsatOverview>("/coordination/csat", { params: { days: slaDays }, signal: controller.signal })
      .then((response) => setCsat(response.data))
      .catch(() => { if (!controller.signal.aborted) setCsat(null); })
      .finally(() => { if (!controller.signal.aborted) setCsatLoading(false); });
    return () => controller.abort();
  }, [slaDays]);

  const maximum = useMemo(
    () => Math.max(...(data?.workload.map((item) => item.total) ?? [1]), 1),
    [data],
  );

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
      const response=await api.get<CsatDetail>("/coordination/csat/details",{params:{days:slaDays,...params}});
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
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
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
                <Chip size="small" variant="outlined" label={`${integrationHealth.taskLinkCoveragePct}% tickets com Task vinculada`} />
              </Stack>
              <Box sx={{ display:"grid", gridTemplateColumns:{ xs:"1fr 1fr", md:"repeat(5,1fr)" }, gap:1 }}>
                <KpiCard title="Tickets" value={integrationHealth.tickets} subtitle="Movidesk" info="Tickets do escopo operacional." accent={aliareColors.info}/>
                <KpiCard title="Vínculos Task" value={integrationHealth.linkedTasks} subtitle="Movidesk → Azure" info="Tickets com número de Task relacionado." accent={aliareColors.green}/>
                <KpiCard title="Work Items" value={integrationHealth.azureItems} subtitle="Azure DevOps" info="Itens Azure no escopo da coordenação." accent={aliareColors.info}/>
                <KpiCard title="CSAT" value={integrationHealth.csatResponses} subtitle="Respostas" info="Respostas da pesquisa Movidesk persistidas." accent={aliareColors.warning}/>
                <KpiCard title="Serviços" value={integrationHealth.catalogServices} subtitle="Catálogo Movidesk" info="Serviços persistidos do catálogo oficial." accent={aliareColors.green}/>
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
                  {[90,180,365].map((days) => <Chip key={days} clickable size="small" label={days === 365 ? "12 meses" : `${days} dias`} color={slaDays === days ? "primary" : "default"} variant={slaDays === days ? "filled" : "outlined"} onClick={() => setSlaDays(days)} />)}
                </Stack>
              </Stack>
              {slaLoading ? <LinearProgress sx={{ borderRadius: 2 }} /> : slaDevelopment ? (
                <Stack spacing={1.5}>
                  <Alert severity={slaDevelopment.dataQuality.missingAzure || slaDevelopment.dataQuality.missingTaskCreatedAt || slaDevelopment.dataQuality.missingPriority ? "warning" : "success"} variant="outlined">
                    Cobertura: {slaDevelopment.dataQuality.linked}/{slaDevelopment.dataQuality.bugsInPeriod} correções vinculadas. Sem Azure: {slaDevelopment.dataQuality.missingAzure} · sem abertura da Task: {slaDevelopment.dataQuality.missingTaskCreatedAt} · sem prioridade: {slaDevelopment.dataQuality.missingPriority}.
                  </Alert>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(4,1fr)" }, gap: 1.25 }}>
                    <KpiCard title="OLA Suporte" value={`${rate(slaDevelopment.summary.supportWithinOla, slaDevelopment.summary.bugsWithTask)}%`} subtitle={`${formatHours(slaDevelopment.summary.avgSupportMinutes)} em média`} info="Da abertura do ticket Movidesk até a abertura da Task no Azure." accent={aliareColors.info} />
                    <KpiCard title="OLA Desenvolvimento" value={`${rate(slaDevelopment.summary.factoryWithinOla, slaDevelopment.summary.concluded)}%`} subtitle={`${formatHours(slaDevelopment.summary.avgFactoryMinutes)} em média`} info="Da abertura da Task até sua conclusão no Azure." accent={aliareColors.green} />
                    <KpiCard title="SLA total" value={`${rate(slaDevelopment.summary.totalWithinSla, slaDevelopment.summary.concluded)}%`} subtitle={`${formatHours(slaDevelopment.summary.avgTotalMinutes)} em média`} info="Ciclo completo medido para correções concluídas." accent={aliareColors.warning} />
                    <KpiCard title="Fora da meta" value={slaDevelopment.outliers.total} subtitle={`${slaDevelopment.outliers.critical} crítico(s)`} info="Correções cujo consumo ultrapassou pelo menos uma meta operacional." accent={aliareColors.error} />
                  </Box>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1.4fr" }, gap: 1.25 }}>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5, p: 1.5 }}>
                      <Typography sx={{ fontWeight: 850, mb: 1 }}>Cumprimento por prioridade</Typography>
                      <Stack spacing={1}>
                        {slaDevelopment.byPriority.map((item) => (
                          <Box key={item.priority} onClick={()=>openSlaRows(`SLA × OLA · ${item.priority}`,item.rows)} sx={{ cursor:"pointer", borderRadius:1.5, p:.45, mx:-.45, "&:hover":{ bgcolor:"action.hover" } }}>
                            <Stack direction="row" sx={{ justifyContent: "space-between", mb: .35 }}>
                              <Typography variant="body2" sx={{ fontWeight: 800 }}>{item.priority} · {item.total} item(ns)</Typography>
                              <Typography variant="caption" color="text.secondary">Suporte {rate(item.supportWithinOla,item.total)}% · Dev {rate(item.factoryWithinOla,item.concluded)}% · Total {rate(item.totalWithinSla,item.concluded)}%</Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={rate(item.totalWithinSla,item.concluded)} sx={{ height: 7, borderRadius: 5 }} />
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5, p: 1.5, minHeight: 250 }}>
                      <Typography sx={{ fontWeight: 850, mb: 1 }}>Tendência mensal de cumprimento</Typography>
                      <ResponsiveContainer width="100%" height={210}>
                        <LineChart data={slaDevelopment.monthly} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="label" />
                          <YAxis domain={[0,100]} />
                          <ChartTooltip />
                          <Line type="monotone" dataKey="supportWithinPct" name="OLA Suporte %" stroke={aliareColors.info} strokeWidth={2.5} dot={false} />
                          <Line type="monotone" dataKey="factoryWithinPct" name="OLA Desenvolvimento %" stroke={aliareColors.green} strokeWidth={2.5} dot={false} />
                          <Line type="monotone" dataKey="totalWithinPct" name="SLA total %" stroke={aliareColors.warning} strokeWidth={2.5} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  </Box>
                  <Box sx={{ display:"grid", gridTemplateColumns:{ xs:"1fr", xl:"1fr 1fr" }, gap:1.25 }}>
                    {[{title:"Por analista",items:slaDevelopment.owners.map(x=>({name:x.owner,...x}))},{title:"Por cliente",items:slaDevelopment.clients.map(x=>({name:x.client,...x}))}].map((group)=>(
                      <Box key={group.title} sx={{ border:"1px solid", borderColor:"divider", borderRadius:2.5, p:1.5 }}>
                        <Typography sx={{ fontWeight:850, mb:1 }}>{group.title}</Typography>
                        <Stack spacing={.8}>{group.items.slice(0,8).map((item)=><Box key={item.name} onClick={()=>openSlaRows(`${group.title} · ${item.name}`,item.rows)} sx={{ cursor:"pointer", borderRadius:1.5, p:.45, mx:-.45, "&:hover":{ bgcolor:"action.hover" } }}><Stack direction="row" sx={{ justifyContent:"space-between", gap:1 }}><Typography variant="body2" noWrap sx={{ fontWeight:750 }}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.total} · SLA {rate(item.totalWithinSla,item.concluded)}%</Typography></Stack><LinearProgress variant="determinate" value={rate(item.totalWithinSla,item.concluded)} sx={{ height:6,borderRadius:4,mt:.3 }}/></Box>)}</Stack>
                      </Box>
                    ))}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Regra operacional: {slaDevelopment.rule.schedule} · conclusão da Task: {slaDevelopment.rule.taskEndState}. Os percentuais são calculados pelo Hub a partir dos timestamps Movidesk/Azure e não usam os indicadores SLA não suportados pelo TicketApiDto.
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
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(4,1fr)" }, gap: 1.25 }}>
                    <KpiCard title="CSAT médio" value={csat.summary.responses ? csat.summary.average.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"} subtitle="escala da pesquisa Movidesk" info="Média das notas respondidas no período." accent={aliareColors.green} />
                    <KpiCard title="Avaliações 4–5" value={csat.summary.responses ? `${csat.summary.positivePct}%` : "—"} subtitle="respostas positivas" info="Percentual de respostas com nota 4 ou 5." accent={aliareColors.info} />
                    <KpiCard title="Respostas" value={csat.summary.responses} subtitle={`${csat.summary.comments} com comentário`} info="Pesquisas vinculadas a tickets do escopo SIMER." accent={aliareColors.warning} />
                    <KpiCard title="Comentários" value={csat.summary.comments} subtitle="feedback qualitativo" info="Respostas que possuem comentário textual do cliente." accent={aliareColors.purple} />
                  </Box>
                  {csat.summary.responses > 0 && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1.4fr" }, gap: 1.25 }}>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5, p: 1.5 }}>
                      <Typography sx={{ fontWeight: 850, mb: 1 }}>Distribuição das notas</Typography>
                      <ResponsiveContainer width="100%" height={210}>
                        <BarChart data={csat.distribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid vertical={false} /><XAxis dataKey="value" /><YAxis allowDecimals={false} /><ChartTooltip />
                          <Bar dataKey="count" name="Respostas" fill={aliareColors.green} radius={[6,6,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5, p: 1.5 }}>
                      <Typography sx={{ fontWeight: 850, mb: 1 }}>CSAT por analista</Typography>
                      <Stack spacing={.8}>
                        {csat.byAnalyst.slice(0,8).map((item) => <Stack key={item.name} direction="row" spacing={1} onClick={()=>void openCsatDetails(`CSAT · ${item.name}`,{analyst:item.name})} sx={{ alignItems:"center", cursor:"pointer", borderRadius:1.5, p:.5, mx:-.5, "&:hover":{bgcolor:"action.hover"} }}>
                          <Typography variant="body2" sx={{ flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{item.responses} resp.</Typography>
                          <Chip size="small" variant="outlined" label={item.average.toLocaleString("pt-BR",{maximumFractionDigits:2})} />
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
                    subtitle="Operação atual"
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
                      <Typography variant="h6" sx={{ fontWeight: 850 }}>Qualidade da classificação por Serviço</Typography>
                      <Typography variant="body2" color="text.secondary">Atendimentos abertos da carteira da squad (cliente ou analista da squad) e qualidade do Serviço informado no Movidesk.</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                      <Chip label={`${data.serviceAnalytics.classificationRate}% específicos`} color={data.serviceAnalytics.classificationRate >= 90 ? "success" : data.serviceAnalytics.classificationRate >= 75 ? "warning" : "error"} variant="outlined" />
                      <Chip label={`${data.serviceAnalytics.catalogSize} serviços conhecidos`} variant="outlined" />
                      <Chip label="Escopo: clientes ou analistas da squad" variant="outlined" />
                    </Stack>
                  </Stack>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, mb: 1.5 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>Período dos atendimentos abertos</Typography>
                      <Typography variant="body2" color="text.secondary">Aplicado aos indicadores, ranking, detalhamento e exportação.</Typography>
                    </Box>
                    <Stack direction="row" spacing={0.6} useFlexGap sx={{ flexWrap: "wrap" }}>
                      {[{ v: 30, l: "30 dias" }, { v: 90, l: "90 dias" }, { v: 180, l: "6 meses" }, { v: 365, l: "12 meses" }, { v: 0, l: "Todo período" }].map((period) => (
                        <Chip key={period.v} label={period.l} clickable color={serviceDays === period.v ? "primary" : "default"} variant={serviceDays === period.v ? "filled" : "outlined"} onClick={() => setServiceDays(period.v)} />
                      ))}
                    </Stack>
                  </Stack>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(4,1fr)" }, gap: 1.25, mb: 2 }}>
                    <KpiCard title="Com serviço específico" value={data.serviceAnalytics.specificServices} subtitle="Atendimentos abertos" info="Tickets com Serviço preenchido além dos níveis genéricos do SIMER." accent={aliareColors.green} />
                    <KpiCard title="Sem serviço" value={data.serviceAnalytics.withoutService} subtitle="Requer classificação" info="Atendimentos abertos sem Serviço identificado." onClick={() => navigate("/qualidade-dados?issue=withoutService")} accent={aliareColors.error} />
                    <KpiCard title="SIMER genérico" value={data.serviceAnalytics.genericService} subtitle="Requer revisão" info="Tickets classificados apenas como SIMER, sem rotina específica." onClick={() => navigate("/qualidade-dados?issue=genericSimerService")} accent={aliareColors.warning} />
                    <KpiCard title="Possível incorreto" value={data.serviceAnalytics.suspectedMismatch} subtitle="Sugestão assistiva" info="Serviço atual diverge de uma sugestão com evidência suficiente. Exige validação humana." onClick={() => navigate("/qualidade-dados?issue=suspectedServiceMismatch")} accent={aliareColors.info} />
                  </Box>
                  {data.serviceAnalytics.genericService > 0 && <Alert severity="warning" sx={{mb:1.5}}><strong>{data.serviceAnalytics.genericService}</strong> atendimento(s) estão apenas em níveis genéricos do SIMER e foram retirados do ranking abaixo para não distorcer a leitura das rotinas específicas. Use o card “SIMER genérico” para revisar esses casos.</Alert>}
                  {data.serviceAnalytics.ranking.length ? (
                    <Box sx={{ width: "100%", height: Math.max(220, Math.min(420, data.serviceAnalytics.ranking.length * 42 + 30)) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.serviceAnalytics.ranking} layout="vertical" margin={{ top: 4, right: 52, left: 8, bottom: 4 }}>
                          <CartesianGrid stroke={theme.palette.divider} strokeDasharray="4 4" horizontal={false} opacity={0.55} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="service" width={210} tick={{ fontSize: 10, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} tickFormatter={(value: string) => { const label = value.split("»").at(-1)?.trim() ?? value; return label.length > 28 ? `${label.slice(0, 27)}…` : label; }} />
                          <ChartTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, boxShadow: "0 14px 36px rgba(0,0,0,.24)" }} wrapperStyle={{ outline: "none" }} cursor={{ fill: theme.palette.action.hover }} formatter={(value) => [value, "Atendimentos"]} labelFormatter={(value) => String(value)} />
                          <Bar dataKey="count" name="Atendimentos" fill={aliareColors.info} radius={[0, 6, 6, 0]} maxBarSize={28} label={{position:"right",fill:theme.palette.text.secondary,fontSize:11,fontWeight:800}} cursor="pointer" onClick={(_, index) => { const service = data.serviceAnalytics.ranking[index]?.service; if (service) void openDetails("service", `Serviço · ${service.split("»").at(-1)?.trim() ?? service}`, undefined, undefined, undefined, service); }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  ) : <Alert severity="info">Ainda não há Serviços suficientes no histórico sincronizado para montar o ranking.</Alert>}

                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "repeat(3,minmax(0,1fr))" }, gap: 1.5, mt: 2 }}>
                    <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                      <Typography sx={{ fontWeight: 850 }}>Módulos mais demandados</Typography>
                      <Typography variant="caption" color="text.secondary">Distribuição dos atendimentos abertos pelos módulos derivados do Serviço.</Typography>
                      <Stack spacing={.75} sx={{ mt: 1.25 }}>
                        {data.serviceAnalytics.moduleRanking.slice(0, 6).map((item) => (
                          <Button key={item.module} onClick={() => void openDetails("serviceModule", `Serviço · ${item.module}`, undefined, item.module)} sx={{ justifyContent: "space-between", textTransform: "none", color: "text.primary", px: .5 }}>
                            <Typography variant="body2" noWrap title={item.module}>{item.module}</Typography>
                            <Chip size="small" label={item.count} variant="outlined" />
                          </Button>
                        ))}
                        {!data.serviceAnalytics.moduleRanking.length && <Typography variant="caption" color="text.secondary">Sem módulos classificados.</Typography>}
                      </Stack>
                    </Box>

                    <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                      <Typography sx={{ fontWeight: 850 }}>Qualidade por cliente</Typography>
                      <Typography variant="caption" color="text.secondary">Clientes com maior quantidade de ausências, classificações genéricas ou divergências sugeridas.</Typography>
                      <Stack spacing={.75} sx={{ mt: 1.25 }}>
                        {data.serviceAnalytics.clientQuality.slice(0, 6).map((item) => (
                          <Button key={item.client} onClick={() => void openDetails("serviceClient", `Serviços · ${item.client}`, undefined, undefined, item.client)} sx={{ justifyContent: "space-between", textTransform: "none", color: "text.primary", px: .5 }}>
                            <Box sx={{ minWidth: 0, textAlign: "left" }}><Typography variant="body2" noWrap title={item.client}>{item.client}</Typography><Typography variant="caption" color="text.secondary">{item.issues} revisão(ões) de {item.total}</Typography></Box>
                            <Chip size="small" label={`${item.rate}%`} color={item.rate >= 90 ? "success" : item.rate >= 75 ? "warning" : "error"} variant="outlined" />
                          </Button>
                        ))}
                      </Stack>
                    </Box>

                    <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                      <Typography sx={{ fontWeight: 850 }}>Qualidade por analista</Typography>
                      <Typography variant="caption" color="text.secondary">Indicador de apoio à revisão de classificação, sem avaliação individual automática.</Typography>
                      <Stack spacing={.75} sx={{ mt: 1.25 }}>
                        {data.serviceAnalytics.analystQuality.slice(0, 6).map((item) => (
                          <Button key={item.analyst} onClick={() => void openDetails("serviceAnalyst", `Serviços · ${item.analyst}`, item.analyst)} sx={{ justifyContent: "space-between", textTransform: "none", color: "text.primary", px: .5 }}>
                            <Box sx={{ minWidth: 0, textAlign: "left" }}><Typography variant="body2" noWrap title={item.analyst}>{item.analyst}</Typography><Typography variant="caption" color="text.secondary">{item.issues} revisão(ões) de {item.total}</Typography></Box>
                            <Chip size="small" label={`${item.rate}%`} color={item.rate >= 90 ? "success" : item.rate >= 75 ? "warning" : "error"} variant="outlined" />
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
                    <Box><Typography variant="h6" sx={{ fontWeight: 850 }}>Capacidade e horas registradas</Typography><Typography variant="body2" color="text.secondary">Últimos {capacity.days} dias. A cobertura compara apontamentos Movidesk com a jornada prevista e deve ser lida junto com volume, SLA e complexidade.</Typography></Box>
                    <Button variant="outlined" onClick={() => navigate("/analistas")}>Abrir análise completa</Button>
                  </Stack>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" }, gap: 1.25, mt: 1.5 }}>
                    <KpiCard title="Horas previstas" value={`${capacity.expectedHours.toLocaleString("pt-BR")}h`} subtitle={`${capacity.businessDays} dias úteis · ${capacity.hoursPerDay}h/dia`} info="Capacidade teórica da equipe no período, antes de ajustes individuais por férias ou afastamentos." accent={aliareColors.info}/>
                    <KpiCard title="Horas registradas" value={`${capacity.registeredHours.toLocaleString("pt-BR")}h`} subtitle="Apontamentos Movidesk" info="Soma dos apontamentos de tempo encontrados nos atendimentos da equipe." accent={aliareColors.green}/>
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
                      <Typography variant="body2" color="text.secondary">Tickets e itens Azure por analista da equipe oficial.</Typography>
                    </Box>
                    <Chip label="Visão comparativa" variant="outlined" />
                  </Stack>
                  {data.workload.length ? <Box sx={{ width: "100%", height: Math.max(250, data.workload.length * 42) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.workload} layout="vertical" margin={{ top: 6, right: 18, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={theme.palette.divider} strokeDasharray="4 4" horizontal={false} opacity={0.55} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="analyst" width={118} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
                        <ChartTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, boxShadow: "0 14px 36px rgba(0,0,0,.18)" }} cursor={{ fill: theme.palette.action.hover }} />
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
                        Somente a equipe oficial de Suporte e Sustentação.
                      </Typography>
                    </Box>
                    <Chip label={`${data.workload.length} analista(s) com carga`} variant="outlined" />
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
                        <LinearProgress
                          variant="determinate"
                          value={(item.total / maximum) * 100}
                          sx={{
                            height: 8,
                            borderRadius: 5,
                            bgcolor: "rgba(47,111,237,.08)",
                            "& .MuiLinearProgress-bar": { bgcolor: aliareColors.info },
                          }}
                        />
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
