import {
  BusinessOutlined,
  FactCheckOutlined,
  GroupsOutlined,
  InsightsOutlined,
  IntegrationInstructionsOutlined,
  TrendingUpOutlined,
  WarningAmberOutlined,
  InfoOutlined,
  SearchOutlined,
  BugReportOutlined,
  AutoFixHighOutlined,
  SupportAgentOutlined,
  Inventory2Outlined,
  ConfirmationNumberOutlined,
  MenuBookOutlined,
  UploadFileOutlined,
  RadarOutlined,
  StarBorderOutlined,
  StarRounded,
} from "@mui/icons-material";
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
  IconButton,
  useTheme,
  Tooltip,
  Stack,
  Tab,
  Tabs,
  Typography,
  TextField,
  InputAdornment,
} from "@mui/material";
import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KpiCard } from "../components/KpiCard";
import { DetailFieldGrid, DetailPanelHeader, DetailSection } from "../components/DetailPanel";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

type Data = {
  generatedAt: string;
  indicators: Record<string, number>;
  workload: Array<{ analyst: string; tickets: number; workItems: number; total: number }>;
  serviceAnalytics: {
    totalOpenTickets: number; classifiedServices: number; specificServices: number; withoutService: number;
    genericService: number; suspectedMismatch: number; classificationRate: number; catalogSize: number;
    ranking: Array<{ service: string; count: number }>;
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

type MainTab = "cadastros" | "movimentos" | "analises" | "desenvolvimento" | "gestao";
type Routine = { label: string; path: string; icon: ElementType; description: string; keywords?: string[] };
type DetailKind = "backlog" | "critical" | "stale" | "dueSoon" | "overdue" | "blocked" | "unassigned" | "analyst";
type DetailData = {
  kind: DetailKind; analyst: string | null; total: number; truncated: boolean;
  tickets: Array<{ movideskId: number; subject: string; status: string; urgency: string | null; client: string | null; owner: string | null; lastUpdate: string | null; dueDate: string | null; taskNumber: number | null; registeredVersion: string | null; deliveredVersion: string | null }>;
  workItems: Array<{ id: number; workItemType: string; title: string; state: string; client: string | null; assignedToName: string | null; createdByName: string | null; criticality: string | null; blockedProcess: boolean | null; movideskTicket: number | null; registeredVersion: string | null; deliveredVersion: string | null; azureChangedAt: string | null; remoteUrl: string | null }>;
};

const mainTabs: Array<{ key: MainTab; label: string; icon: ElementType; info: string }> = [
  { key: "cadastros", label: "Cadastros", icon: GroupsOutlined, info: "Acessos rápidos para equipe e clientes do escopo operacional." },
  { key: "movimentos", label: "Movimentos", icon: InsightsOutlined, info: "Rotinas para acompanhar execução, atenção e pendências da operação." },
  { key: "analises", label: "Análises", icon: TrendingUpOutlined, info: "Visões gerenciais de desempenho, relatórios e liderança." },
  { key: "desenvolvimento", label: "Desenvolvimento", icon: IntegrationInstructionsOutlined, info: "Correções, evoluções, apoios e versões do produto." },
  { key: "gestao", label: "Gestão", icon: FactCheckOutlined, info: "Conhecimento, sincronizações e governança da operação." },
];

const routines: Record<MainTab, Routine[]> = {
  cadastros: [
    { label: "Analistas", path: "/analistas", icon: GroupsOutlined, description: "Equipe oficial de suporte e sustentação.", keywords: ["equipe", "usuários", "responsáveis"] },
    { label: "Clientes", path: "/clientes", icon: BusinessOutlined, description: "Clientes cooperativas do escopo SIMER.", keywords: ["cooperativas", "carteira"] },
  ],
  movimentos: [
    { label: "Minha Operação", path: "/minha-operacao", icon: InsightsOutlined, description: "Fila operacional, tarefas e atendimentos em execução.", keywords: ["kanban", "fila", "trabalho"] },
    { label: "Tickets", path: "/tickets", icon: ConfirmationNumberOutlined, description: "Atendimentos Movidesk e seus vínculos operacionais.", keywords: ["movidesk", "atendimentos"] },
    { label: "Pontos de Atenção", path: "/atencao", icon: WarningAmberOutlined, description: "Riscos, criticidades e itens que exigem atuação.", keywords: ["risco", "crítico", "sla"] },
    { label: "Pendências", path: "/qualidade-dados", icon: FactCheckOutlined, description: "Qualidade, vínculos e divergências entre fontes.", keywords: ["qualidade", "dados", "divergências"] },
  ],
  analises: [
    { label: "Dashboard", path: "/", icon: InsightsOutlined, description: "Visão executiva consolidada da operação.", keywords: ["indicadores", "kpi", "executivo"] },
    { label: "Desempenho", path: "/desempenho", icon: TrendingUpOutlined, description: "Produtividade, SLA e acompanhamento de performance.", keywords: ["performance", "produtividade", "sla"] },
    { label: "Relatórios", path: "/relatorios", icon: InsightsOutlined, description: "Relatórios gerenciais e executivos.", keywords: ["excel", "pdf", "gerencial"] },
    { label: "Central de Liderança", path: "/lideranca-tecnica", icon: RadarOutlined, description: "Radar executivo, recorrências, gaps e desenvolvimento técnico.", keywords: ["liderança", "radar", "recorrências", "gaps"] },
  ],
  desenvolvimento: [
    { label: "Correções", path: "/correcoes", icon: BugReportOutlined, description: "Bugs e correções acompanhadas no Azure DevOps.", keywords: ["bug", "task", "azure"] },
    { label: "Evoluções", path: "/evolucoes", icon: AutoFixHighOutlined, description: "Melhorias e evoluções funcionais do produto.", keywords: ["melhoria", "produto", "azure"] },
    { label: "Apoios", path: "/apoios", icon: SupportAgentOutlined, description: "APOIOs vinculados aos atendimentos e à sustentação.", keywords: ["apoio", "azure", "atendimento"] },
    { label: "Versões", path: "/versoes", icon: Inventory2Outlined, description: "Entregas, cobertura e distribuição por versão.", keywords: ["lte", "lts", "rc", "release"] },
  ],
  gestao: [
    { label: "Base de Conhecimento", path: "/conhecimento", icon: MenuBookOutlined, description: "Wiki, procedimentos e conhecimento operacional.", keywords: ["wiki", "procedimento", "sharepoint"] },
    { label: "Dados e Sincronizações", path: "/importar", icon: UploadFileOutlined, description: "Sincronizações, integrações e cargas de dados.", keywords: ["sincronizar", "azure", "movidesk", "importar"] },
  ],
};

const allRoutines = mainTabs.flatMap((group) => routines[group.key].map((routine) => ({ ...routine, group: group.key, groupLabel: group.label })));

export function Coordination() {
  const navigate = useNavigate();
  const theme = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("aba") as MainTab | null;
  const [tab, setTab] = useState<MainTab>(
    requestedTab && mainTabs.some((item) => item.key === requestedTab) ? requestedTab : "movimentos",
  );
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTitle, setDetailTitle] = useState("");
  const [details, setDetails] = useState<DetailData | null>(null);
  const [routineSearch, setRoutineSearch] = useState("");
  const [favoriteRoutines, setFavoriteRoutines] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("coordination-favorite-routines") || "[]"); } catch { return []; }
  });
  const [recentRoutines, setRecentRoutines] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("coordination-recent-routines") || "[]"); } catch { return []; }
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get<Data>("/coordination/summary");
      setData(response.data);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || "Não foi possível carregar a central.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maximum = useMemo(
    () => Math.max(...(data?.workload.map((item) => item.total) ?? [1]), 1),
    [data],
  );

  const cards: Array<[DetailKind, string, number, string]> = data
    ? [
        ["backlog", "Backlog atual", data.indicators.openTickets, "Atendimentos abertos do escopo cooperativas."],
        ["critical", "Críticos", data.indicators.criticalTickets, "Atendimentos críticos em aberto."],
        ["stale", "Sem movimento 72h", data.indicators.staleTickets, "Tickets sem atualização há pelo menos 72 horas."],
        ["overdue", "Prazos vencidos", data.indicators.overdueTickets, "Atendimentos abertos com prazo já ultrapassado."],
        ["dueSoon", "Vencem em 7 dias", data.indicators.dueSoon, "Itens com prazo nos próximos sete dias."],
        ["blocked", "Itens bloqueados", data.indicators.blockedItems, "Tarefas Azure bloqueadas no escopo da operação."],
        ["unassigned", "Sem responsável", data.indicators.unassignedItems, "Tarefas sem responsável identificado."],
      ]
    : [];

  async function openDetails(kind: DetailKind, title: string, analyst?: string) {
    try {
      setDetailTitle(title); setDetails(null); setDetailLoading(true);
      const response = await api.get<DetailData>("/coordination/details", { params: { kind, analyst, limit: 50 } });
      setDetails(response.data);
    } catch {
      setError("Não foi possível carregar os detalhes da coordenação.");
    } finally { setDetailLoading(false); }
  }

  const normalizedRoutineSearch = routineSearch.trim().toLocaleLowerCase("pt-BR");
  const matchingRoutines = normalizedRoutineSearch
    ? allRoutines.filter((routine) => [routine.label, routine.description, routine.groupLabel, ...(routine.keywords ?? [])].join(" ").toLocaleLowerCase("pt-BR").includes(normalizedRoutineSearch))
    : [];

  function openRoutine(routine: Routine) {
    const next = [routine.path, ...recentRoutines.filter((path) => path !== routine.path)].slice(0, 5);
    setRecentRoutines(next);
    localStorage.setItem("coordination-recent-routines", JSON.stringify(next));
    navigate(routine.path);
  }

  function toggleFavorite(path: string) {
    const next = favoriteRoutines.includes(path) ? favoriteRoutines.filter((item) => item !== path) : [...favoriteRoutines, path];
    setFavoriteRoutines(next);
    localStorage.setItem("coordination-favorite-routines", JSON.stringify(next));
  }

  function changeTab(value: MainTab) {
    setTab(value);
    const next = new URLSearchParams(searchParams);
    next.set("aba", value);
    setSearchParams(next, { replace: true });
  }

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        eyebrow="Coordenação"
        title="Central da Coordenação"
        description="Gestão operacional da equipe e dos clientes cooperativas em um único ponto."
        meta={data ? `Coordenação: ${data.scope.coordinator} · ${data.scope.analysts.length} analistas · ${data.scope.clients.length} clientes cooperativas` : undefined}
      />

      <Card variant="outlined" sx={{ overflow: "hidden", borderRadius: 2.5, backgroundColor: "background.paper", mb: 2 }}>
        <Box sx={{ p: { xs: 1.5, md: 2 }, borderBottom: "1px solid", borderColor: "divider", background: theme.palette.mode === "dark" ? "linear-gradient(110deg,rgba(24,199,122,.055),rgba(47,111,237,.035),transparent)" : "linear-gradient(110deg,rgba(24,199,122,.045),rgba(47,111,237,.025),transparent)" }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: "1rem" }}>Navegador de rotinas</Typography>
              <Typography variant="body2" color="text.secondary">Localize rapidamente qualquer rotina da coordenação por área, nome ou finalidade.</Typography>
            </Box>
            <TextField
              size="small"
              value={routineSearch}
              onChange={(event) => setRoutineSearch(event.target.value)}
              placeholder="Buscar rotina, ação ou assunto..."
              sx={{ width: { xs: "100%", md: 360 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment> } }}
            />
          </Stack>
        </Box>

        {normalizedRoutineSearch ? (
          <Box sx={{ p: { xs: 1.5, md: 2 } }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>{matchingRoutines.length} ROTINA(S) ENCONTRADA(S)</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)", xl: "repeat(3,1fr)" }, gap: 1, mt: 1 }}>
              {matchingRoutines.map((routine) => (
                <Button key={routine.path} onClick={() => openRoutine(routine)} sx={{ justifyContent: "flex-start", textAlign: "left", textTransform: "none", p: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 1.75 }}>
                  <Stack direction="row" spacing={1.1} sx={{ alignItems: "center", minWidth: 0 }}>
                    <Box sx={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 1.4, bgcolor: "action.hover", color: "primary.main", flexShrink: 0 }}>{createElement(routine.icon, { fontSize: "small" })}</Box>
                    <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 800, color: "text.primary" }}>{routine.label}</Typography><Typography variant="caption" color="text.secondary">{routine.groupLabel} · {routine.description}</Typography></Box>
                  </Stack>
                </Button>
              ))}
            </Box>
            {!matchingRoutines.length && <Alert severity="info" sx={{ mt: 1.5 }}>Nenhuma rotina corresponde à pesquisa. Tente pelo nome da tela, processo ou ação desejada.</Alert>}
          </Box>
        ) : (
          <>
            <Tabs value={tab} onChange={(_, value: MainTab) => changeTab(value)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 58, borderBottom: "1px solid", borderColor: "divider", "& .MuiTab-root": { minHeight: 58, fontWeight: 800, px: { xs: 2, md: 2.5 } }, "& .Mui-selected": { color: `${aliareColors.info} !important` }, "& .MuiTabs-indicator": { height: 3, backgroundColor: aliareColors.info } }}>
              {mainTabs.map((item) => <Tab key={item.key} value={item.key} label={<Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}><span>{item.label}</span><Tooltip title={item.info}><InfoOutlined onClick={(event) => event.stopPropagation()} sx={{ fontSize: 15, color: "text.secondary" }} /></Tooltip></Stack>} icon={createElement(item.icon, { fontSize: "small" })} iconPosition="start" />)}
            </Tabs>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1fr) 250px" }, minHeight: 220 }}>
              <Box sx={{ p: { xs: 1.5, md: 2 }, borderRight: { lg: "1px solid" }, borderColor: "divider" }}>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 850 }}>{mainTabs.find((item) => item.key === tab)?.label}</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))" }, gap: 1, mt: .75 }}>
                  {routines[tab].map((routine) => (
                    <Box key={routine.path} sx={{ position: "relative", border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden", transition: ".16s", "&:hover": { borderColor: "primary.main", transform: "translateY(-1px)", boxShadow: "0 10px 26px rgba(16,24,40,.08)" } }}>
                      <Button onClick={() => openRoutine(routine)} sx={{ width: "100%", minHeight: 82, justifyContent: "flex-start", textAlign: "left", textTransform: "none", p: 1.35, pr: 5 }}>
                        <Stack direction="row" spacing={1.2} sx={{ alignItems: "flex-start" }}>
                          <Box sx={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 1.5, bgcolor: theme.palette.mode === "dark" ? "rgba(24,199,122,.09)" : "rgba(24,199,122,.065)", color: "primary.main", flexShrink: 0 }}>{createElement(routine.icon, { fontSize: "small" })}</Box>
                          <Box><Typography sx={{ fontWeight: 850, color: "text.primary" }}>{routine.label}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .25, lineHeight: 1.35 }}>{routine.description}</Typography></Box>
                        </Stack>
                      </Button>
                      <Tooltip title={favoriteRoutines.includes(routine.path) ? "Remover dos favoritos" : "Adicionar aos favoritos"}><IconButton size="small" onClick={() => toggleFavorite(routine.path)} sx={{ position: "absolute", top: 8, right: 8 }}>{favoriteRoutines.includes(routine.path) ? <StarRounded sx={{ color: aliareColors.warning }} fontSize="small" /> : <StarBorderOutlined fontSize="small" />}</IconButton></Tooltip>
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box sx={{ p: { xs: 1.5, md: 2 }, bgcolor: theme.palette.mode === "dark" ? "rgba(7,20,35,.22)" : "rgba(248,250,252,.7)" }}>
                <Typography sx={{ fontWeight: 850, fontSize: ".82rem" }}>Acesso rápido</Typography>
                <Typography variant="caption" color="text.secondary">Favoritos e rotinas utilizadas recentemente.</Typography>
                <Stack spacing={.5} sx={{ mt: 1.25 }}>
                  {[...favoriteRoutines, ...recentRoutines].filter((path, index, values) => values.indexOf(path) === index).slice(0, 6).map((path) => {
                    const routine = allRoutines.find((item) => item.path === path);
                    return routine ? <Button key={path} size="small" onClick={() => openRoutine(routine)} startIcon={createElement(routine.icon, { fontSize: "small" })} sx={{ justifyContent: "flex-start", textTransform: "none", color: "text.primary" }}>{routine.label}</Button> : null;
                  })}
                  {!favoriteRoutines.length && !recentRoutines.length && <Typography variant="caption" color="text.secondary" sx={{ py: 1 }}>Abra ou favorite uma rotina para criar seus atalhos.</Typography>}
                </Stack>
              </Box>
            </Box>
          </>
        )}

        <CardContent sx={{ p: { xs: 1.5, md: 2.25 } }}>
          <Alert
            severity="info"
            icon={<GroupsOutlined />}
            sx={{ mb: 2, bgcolor: "rgba(47,111,237,.07)", borderColor: "rgba(47,111,237,.18)" }}
          >
            A Central usa somente os analistas oficiais da equipe e os clientes cooperativas definidos no escopo operacional do TechLead Hub.
          </Alert>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

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
                    subtitle={tab === "analises" ? "Análise gerencial" : "Operação atual"}
                    info={info}
                    onClick={() => void openDetails(kind, label)}
                    accent={
                      label === "Críticos" || label === "Sem movimento 72h"
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
                      <Typography variant="body2" color="text.secondary">Leitura dos atendimentos abertos SIMER e da especificidade do Serviço informado no Movidesk.</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                      <Chip label={`${data.serviceAnalytics.classificationRate}% específicos`} color={data.serviceAnalytics.classificationRate >= 90 ? "success" : data.serviceAnalytics.classificationRate >= 75 ? "warning" : "error"} variant="outlined" />
                      <Chip label={`${data.serviceAnalytics.catalogSize} serviços conhecidos`} variant="outlined" />
                    </Stack>
                  </Stack>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(4,1fr)" }, gap: 1.25, mb: 2 }}>
                    <KpiCard title="Com serviço específico" value={data.serviceAnalytics.specificServices} subtitle="Atendimentos abertos" info="Tickets com Serviço preenchido além dos níveis genéricos do SIMER." accent={aliareColors.green} />
                    <KpiCard title="Sem serviço" value={data.serviceAnalytics.withoutService} subtitle="Requer classificação" info="Atendimentos abertos sem Serviço identificado." onClick={() => navigate("/qualidade-dados?issue=withoutService")} accent={aliareColors.error} />
                    <KpiCard title="SIMER genérico" value={data.serviceAnalytics.genericService} subtitle="Requer revisão" info="Tickets classificados apenas como SIMER, sem rotina específica." onClick={() => navigate("/qualidade-dados?issue=genericSimerService")} accent={aliareColors.warning} />
                    <KpiCard title="Possível incorreto" value={data.serviceAnalytics.suspectedMismatch} subtitle="Sugestão assistiva" info="Serviço atual diverge de uma sugestão com evidência suficiente. Exige validação humana." onClick={() => navigate("/qualidade-dados?issue=suspectedServiceMismatch")} accent={aliareColors.info} />
                  </Box>
                  {data.serviceAnalytics.ranking.length ? (
                    <Box sx={{ width: "100%", height: Math.max(260, data.serviceAnalytics.ranking.length * 38) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.serviceAnalytics.ranking} layout="vertical" margin={{ top: 4, right: 18, left: 12, bottom: 4 }}>
                          <CartesianGrid stroke={theme.palette.divider} strokeDasharray="4 4" horizontal={false} opacity={0.55} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="service" width={260} tick={{ fontSize: 10, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} tickFormatter={(value: string) => value.split("»").at(-1)?.trim() ?? value} />
                          <ChartTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper }} formatter={(value) => [value, "Atendimentos"]} labelFormatter={(value) => String(value)} />
                          <Bar dataKey="count" name="Atendimentos" fill={aliareColors.info} radius={[0, 6, 6, 0]} />
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
                          <Stack key={item.module} direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                            <Typography variant="body2" noWrap title={item.module}>{item.module}</Typography>
                            <Chip size="small" label={item.count} variant="outlined" />
                          </Stack>
                        ))}
                        {!data.serviceAnalytics.moduleRanking.length && <Typography variant="caption" color="text.secondary">Sem módulos classificados.</Typography>}
                      </Stack>
                    </Box>

                    <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                      <Typography sx={{ fontWeight: 850 }}>Qualidade por cliente</Typography>
                      <Typography variant="caption" color="text.secondary">Clientes com maior quantidade de ausências, classificações genéricas ou divergências sugeridas.</Typography>
                      <Stack spacing={.75} sx={{ mt: 1.25 }}>
                        {data.serviceAnalytics.clientQuality.slice(0, 6).map((item) => (
                          <Stack key={item.client} direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                            <Box sx={{ minWidth: 0 }}><Typography variant="body2" noWrap title={item.client}>{item.client}</Typography><Typography variant="caption" color="text.secondary">{item.issues} revisão(ões) de {item.total}</Typography></Box>
                            <Chip size="small" label={`${item.rate}%`} color={item.rate >= 90 ? "success" : item.rate >= 75 ? "warning" : "error"} variant="outlined" />
                          </Stack>
                        ))}
                      </Stack>
                    </Box>

                    <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                      <Typography sx={{ fontWeight: 850 }}>Qualidade por analista</Typography>
                      <Typography variant="caption" color="text.secondary">Indicador de apoio à revisão de classificação, sem avaliação individual automática.</Typography>
                      <Stack spacing={.75} sx={{ mt: 1.25 }}>
                        {data.serviceAnalytics.analystQuality.slice(0, 6).map((item) => (
                          <Stack key={item.analyst} direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                            <Box sx={{ minWidth: 0 }}><Typography variant="body2" noWrap title={item.analyst}>{item.analyst}</Typography><Typography variant="caption" color="text.secondary">{item.issues} revisão(ões) de {item.total}</Typography></Box>
                            <Chip size="small" label={`${item.rate}%`} color={item.rate >= 90 ? "success" : item.rate >= 75 ? "warning" : "error"} variant="outlined" />
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  </Box>
                </CardContent>
              </Card>

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
                        <Bar dataKey="tickets" name="Tickets" stackId="load" fill={aliareColors.info} radius={[0, 0, 0, 0]} />
                        <Bar dataKey="workItems" name="Azure" stackId="load" fill={aliareColors.green} radius={[0, 6, 6, 0]} />
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

              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 850, mb: 0.4 }}>
                    Integrações Microsoft 365
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Planner, Outlook e Teams vinculados à conta conectada.
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {Object.entries(data.integrations).map(([name, integration]) => (
                      <Chip
                        key={name}
                        label={`${name}: ${
                          integration.connected
                            ? `${integration.items} item(ns)`
                            : integration.configured
                              ? "conecte sua conta"
                              : "aguardando configuração"
                        }`}
                        color={integration.connected ? "success" : "default"}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                  {data.microsoft.warnings.map((warning) => (
                    <Alert key={warning} severity="warning" sx={{ mt: 1.5 }}>
                      {warning}
                    </Alert>
                  ))}
                </CardContent>
              </Card>
            </Stack>
          )}
        </CardContent>
      </Card>
      <Drawer anchor="right" open={Boolean(detailTitle)} onClose={() => { setDetailTitle(""); setDetails(null); }} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
        <DetailPanelHeader eyebrow="Coordenação" title={detailTitle || "Detalhes"} identifier={details ? `${details.total} item(ns) carregado(s)` : undefined} onClose={() => { setDetailTitle(""); setDetails(null); }} />
        {detailLoading ? <Box sx={{ py: 8, display: "grid", placeItems: "center" }}><CircularProgress /></Box> : details ? (
          <Stack spacing={2}>
            {details.truncated && <Alert severity="info">Exibindo os primeiros 50 registros do recorte.</Alert>}
            {details.tickets.length > 0 && <DetailSection title="Atendimentos Movidesk"><Stack spacing={1}>{details.tickets.map((ticket) => (
              <Button key={ticket.movideskId} variant="outlined" onClick={() => navigate(`/tickets?movidesk=${ticket.movideskId}`)} sx={{ justifyContent: "flex-start", textTransform: "none", textAlign: "left", p: 1.25 }}>
                <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 800 }}>#{ticket.movideskId} · {ticket.subject}</Typography><Typography variant="caption" color="text.secondary">{[ticket.status, ticket.urgency, ticket.client, ticket.owner].filter(Boolean).join(" · ")}</Typography></Box>
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
