import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Drawer,
  FormControl, IconButton, InputLabel, MenuItem, Select, Stack, Tab, Tabs, Tooltip, Typography,
} from "@mui/material";
import {
  AssignmentTurnedInOutlined, AutoGraphOutlined, BoltOutlined,
  ErrorOutlineOutlined, GroupsOutlined, InfoOutlined, OpenInNewOutlined, RadarOutlined,
  SchoolOutlined, TrackChangesOutlined, TrendingDownOutlined, TrendingUpOutlined, InsightsOutlined,
} from "@mui/icons-material";
import { useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { ExportTicketsButton } from "../components/ExportTicketsButton";
import type { TicketExportRow } from "../components/ExportTicketsButton";
import { DetailFieldGrid, DetailPanelHeader, DetailSection } from "../components/DetailPanel";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { aliareColors } from "../theme/theme";
import { useColorMode } from "../context/ColorModeContext";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

type Ticket = {
  id: number; movideskId: number; subject: string; status: string; client: string | null; owner: string | null;
  urgency?: string | null; category?: string | null; cause?: string | null; dueDate?: string | null; taskNumber?: number | null;
};
type Task = {
  id: number; workItemType: string; title: string; state: string; client: string | null; assignedToName: string | null;
  blockedProcess?: boolean | null; remoteUrl?: string | null;
};
type Recurrence = {
  topic: string; count: number; previous: number; changePct: number | null; clients: string[]; analysts: string[];
  action: string; examples: Ticket[]; linkedExamples?: number; confidence?: "ALTA" | "MÉDIA";
  concentration?: { topClient: string | null; topClientCount: number; topModule: string | null; topModuleCount: number; clientSharePct: number };
};
type Gap = { id: string; type: string; title: string; evidence: string; impact: string; action: string; status: string; confidence?: string; ticketCount?: number; azureLinked?: number; blockedLinked?: number; deliveredLinked?: number; examples?: Ticket[]; tasks?: Task[] };
type Development = { analyst: string; tickets: number; stale: number; linkedTasks?: number; blockedTasks?: number; finishedTasks?: number; themes: Array<{ topic: string; count: number }>; examples?: Ticket[] };
type Data = {
  generatedAt: string; periodDays: number; periodStart?: string; periodEnd?: string;
  radar: Record<string, number>;
  radarSamples: Record<string, Array<Ticket | Task>>;
  audit: { candidates: number; sample: Array<Ticket & { reason: string }> };
  recurrences: Recurrence[]; gaps: Gap[]; development: Development[];
  weekly: { current: number; previous: number; changePct: number | null; open: number; previousOpen: number; overdue: number; paused: number; stale: number; blocked: number };
  analytics: {
    daily: Array<{ date: string; opened: number; resolved: number; closed: number; reopened: number; pending: number }>;
    resolutionSla: { within: number; outside: number; unmeasured: number };
    responseSla: { within: number; outside: number; unmeasured: number };
    byOwner: Array<{ analyst: string; resolved: number; reopened: number; accepted: number; within: number; outside: number }>;
    responseByOwner: Array<{ analyst: string; total: number; within: number; outside: number; unmeasured: number }>;
    categoryDistribution: Array<{ label: string; total: number }>;
    contactDistribution: Array<{ label: string; total: number }>;
    clientDistribution: Array<{ label: string; total: number }>;
    aging: Array<{ label: string; total: number }>;
    operational: { reopenRate: number | null; firstContactResolutionRate: number | null; resolutionSlaRate: number | null; responseSlaRate: number | null; flowBalance: number | null; criticalAging: number };
    samples: Record<string, Ticket[] | Record<string, Ticket[]>> & {
      opened: Ticket[]; backlog: Ticket[]; resolved: Ticket[]; reopened: Ticket[];
      responseOutside: Ticket[]; resolutionOutside: Ticket[]; criticalAging: Ticket[]; firstContact: Ticket[];
      aging: Record<string, Ticket[]>; categories: Record<string, Ticket[]>; clients: Record<string, Ticket[]>; contacts: Record<string, Ticket[]>;
    };
  };
  recommendations: string[];
  filters: { clients: string[]; users: string[] };
};

type TabKey = "indicators" | "radar" | "audit" | "recurrences" | "gaps" | "development";
type PeriodPreset = "7" | "30" | "60" | "90" | "month" | "semester" | "year" | "custom";

function dateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function resolvePeriod(preset: PeriodPreset, customStart: string, customEnd: string) {
  const now = new Date();
  if (preset === "custom") return { days: 30, startDate: customStart || undefined, endDate: customEnd || undefined };
  if (["7", "30", "60", "90"].includes(preset)) return { days: Number(preset) };
  const start = new Date(now);
  if (preset === "month") start.setDate(1);
  if (preset === "semester") { start.setMonth(now.getMonth() < 6 ? 0 : 6, 1); }
  if (preset === "year") start.setMonth(0, 1);
  return { days: Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000)), startDate: dateInputValue(start), endDate: dateInputValue(now) };
}
type DrawerState =
  | { kind: "radar"; key: string; title: string; items: Array<Ticket | Task> }
  | { kind: "audit"; title: string; items: Array<Ticket & { reason: string }> }
  | { kind: "recurrence"; title: string; recurrence: Recurrence }
  | { kind: "gap"; title: string; gap: Gap }
  | { kind: "development"; title: string; development: Development }
  | null;

const radarMeta: Array<[string, string, string, string]> = [
  ["slaOverdue", "SLA vencido", "Atendimentos com prazo vencido ou indicador de SLA violado.", aliareColors.error],
  ["slaSoon", "SLA próximo", "Atendimentos com prazo previsto nas próximas 24 horas.", aliareColors.warning],
  ["newTooLong", "Novo há +7 dias", "Tickets ainda como Novo há mais de sete dias.", aliareColors.error],
  ["pausedTooLong", "Pausado há +5 dias", "Tickets pausados ou parados sem avanço há mais de cinco dias.", aliareColors.warning],
  ["noMovement", "Sem movimento 72h", "Atendimentos abertos sem ação recente há pelo menos 72 horas.", aliareColors.cyan],
  ["blocked", "Tasks bloqueadas", "Work Items ativos sinalizados com bloqueio de processo.", aliareColors.purple],
  ["taskStale", "Task sem evolução", "Work Items ativos sem atualização há mais de cinco dias.", aliareColors.info],
  ["unassigned", "Sem responsável", "Work Items ativos sem responsável identificado no Azure.", aliareColors.warning],
  ["closedTicketActiveTask", "Ticket fechado + Task ativa", "Possível inconsistência entre encerramento do ticket e estado da Task.", aliareColors.error],
  ["openTicketFinishedTask", "Ticket aberto + Task concluída", "Possível pendência de encerramento ou validação do atendimento.", aliareColors.greenDark],
];

const tabInfo: Record<TabKey, string> = {
  indicators: "Consolida os relatórios operacionais do Movidesk em uma leitura moderna de volume, SLA, resoluções, backlog e distribuição.",
  radar: "Prioriza situações operacionais que merecem intervenção antes de virarem recorrência ou estouro.",
  audit: "Seleciona candidatos para revisão humana. O sistema sinaliza indícios; não altera classificações automaticamente.",
  recurrences: "Agrupa temas repetidos e compara o período atual com o anterior para sugerir investigação, treinamento ou causa raiz.",
  gaps: "Transforma sinais recorrentes da operação em pontos de atenção técnicos, explicando o motivo, a prioridade e a próxima ação sugerida.",
  development: "Mostra concentração de temas e pontos de apoio por analista para orientar desenvolvimento técnico, sem ranking.",
};

function AreaTitle({ title, info, icon }: { title: string; info: string; icon?: ReactNode }) {
  return <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center", width: "100%", textAlign: "center" }}>
    {icon}<Typography sx={{ fontWeight: 850 }}>{title}</Typography>
    <Tooltip title={info}><IconButton size="small" aria-label={`Informações sobre ${title}`}><InfoOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip>
  </Stack>;
}

function AnalystMultiSelect({ options, value, onChange, label }: { options: string[]; value: string[]; onChange: (value: string[]) => void; label: string }) {
  const allSelected = value.length === 0;
  const toggleAll = () => onChange([]);
  return <FormControl size="small" sx={{ width: 168, minWidth: 168, "& .MuiSelect-select": { py: .65, fontSize: ".76rem", fontWeight: 750 } }}>
    <Select
      multiple
      displayEmpty
      value={value}
      onChange={(event) => onChange(typeof event.target.value === "string" ? event.target.value.split(",") : event.target.value)}
      renderValue={(selected) => !selected.length ? "Todos analistas" : selected.length === 1 ? abbreviateAnalystName(selected[0]) : `${selected.length} analistas`}
      aria-label={label}
    >
      <MenuItem onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleAll(); }}>
        <Checkbox size="small" checked={allSelected} />Todos analistas
      </MenuItem>
      {options.map((analyst) => <MenuItem key={analyst} value={analyst}><Checkbox size="small" checked={value.includes(analyst)} />{analyst}</MenuItem>)}
    </Select>
  </FormControl>;
}

function abbreviateAnalystName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts.slice(1).map((part) => `${part.charAt(0).toUpperCase()}.`).join(" ")}`;
}

function IndicatorPeriodFilter({ value, onChange }: { value: PeriodPreset; onChange: (value: PeriodPreset) => void }) {
  return <FormControl size="small" sx={{ width: 126, minWidth: 126, "& .MuiSelect-select": { py: .65, fontSize: ".76rem", fontWeight: 750 } }}>
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value as PeriodPreset)}
      onClick={(event) => event.stopPropagation()}
      aria-label="Período do indicador"
    >
      <MenuItem value="7">7 dias</MenuItem>
      <MenuItem value="30">30 dias</MenuItem>
      <MenuItem value="60">60 dias</MenuItem>
      <MenuItem value="90">90 dias</MenuItem>
      <MenuItem value="month">Este mês</MenuItem>
      <MenuItem value="semester">Este semestre</MenuItem>
      <MenuItem value="year">Este ano</MenuItem>
      <MenuItem value="custom">Personalizado</MenuItem>
    </Select>
  </FormControl>;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <Chip size="small" label="Sem base anterior" variant="outlined" />;
  const Icon = value > 0 ? TrendingUpOutlined : TrendingDownOutlined;
  return <Chip size="small" icon={<Icon />} color={value > 0 ? "warning" : "success"} label={`${value > 0 ? "+" : ""}${value}% vs. período anterior`} />;
}

function isTask(item: Ticket | Task): item is Task {
  return "workItemType" in item;
}

export function TechnicalLeadership() {
  const navigate = useNavigate();
  const { mode } = useColorMode();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("indicators");
  const [client, setClient] = useState("");
  const [user, setUser] = useState("");
  const [period, setPeriod] = useState<PeriodPreset>("30");
  const [indicatorPeriods, setIndicatorPeriods] = useState<Record<string, PeriodPreset>>({});
  const [indicatorData, setIndicatorData] = useState<Record<string, Data["analytics"]>>({});
  const indicatorPeriod = (key: string) => indicatorPeriods[key] ?? period;
  const setIndicatorPeriod = (key: string, value: PeriodPreset) => setIndicatorPeriods((current) => ({ ...current, [key]: value }));
  const analyticsFor = (key: string) => indicatorData[key] ?? data?.analytics;
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [hiddenLeadershipSeries, setHiddenLeadershipSeries] = useState<Record<string, Set<string>>>({});
  const [auditReason, setAuditReason] = useState("");
  const [recurrenceConfidence, setRecurrenceConfidence] = useState("");
  const [gapImpact, setGapImpact] = useState("");
  const [gapStatus, setGapStatus] = useState("");
  const [resolutionOwnerFilter, setResolutionOwnerFilter] = useState<string[]>([]);
  const [responseOwnerFilter, setResponseOwnerFilter] = useState<string[]>([]);

  const toggleLeadershipSeries = (chart: string, key: string, total: number) => {
    setHiddenLeadershipSeries((current) => {
      const hidden = new Set(current[chart] ?? []);
      if (hidden.has(key)) hidden.delete(key);
      else if (total - hidden.size > 1) hidden.add(key);
      return { ...current, [chart]: hidden };
    });
  };
  const isLeadershipSeriesVisible = (chart: string, key: string) => !(hiddenLeadershipSeries[chart]?.has(key));
  const SeriesSelector = ({ chart, items }: { chart: string; items: Array<{ key: string; label: string; color: string }> }) => (
    <Stack direction="row" spacing={.7} useFlexGap sx={{ flexWrap: "wrap", mt: .9, justifyContent: "center", alignItems: "center" }}>
      {items.map((item) => {
        const active = isLeadershipSeriesVisible(chart, item.key);
        return <Chip
          key={item.key}
          size="small"
          label={item.label}
          onClick={() => toggleLeadershipSeries(chart, item.key, items.length)}
          icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: active ? item.color : "text.disabled" }} />}
          variant="outlined"
          sx={{
            opacity: active ? 1 : .42,
            textDecoration: active ? "none" : "line-through",
            cursor: "pointer",
            "& .MuiChip-icon": { ml: .8 },
          }}
        />;
      })}
    </Stack>
  );

  useEffect(() => {
    const entries = Object.entries(indicatorPeriods);
    if (!entries.length) return;
    let active = true;
    const requests = entries.map(async ([key, preset]) => {
      if (preset === "custom" && (!customStart || !customEnd)) return;
      const range = resolvePeriod(preset, customStart, customEnd);
      const response = await api.get<Data>("/workspace/technical-leadership", { params: { client: client || undefined, user: user || undefined, ...range } });
      if (active) setIndicatorData((current) => ({ ...current, [key]: response.data.analytics }));
    });
    void Promise.allSettled(requests);
    return () => { active = false; };
  }, [indicatorPeriods, client, user, customStart, customEnd]);

  useEffect(() => {
    setIndicatorData({});
  }, [period]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const range = resolvePeriod(period, customStart, customEnd);
    if (period === "custom" && (!customStart || !customEnd)) { setLoading(false); return () => { active = false; }; }
    api.get<Data>("/workspace/technical-leadership", { params: { client: client || undefined, user: user || undefined, ...range } })
      .then((response) => active && setData(response.data))
      .catch(() => active && setError("Não foi possível carregar a Central de Liderança Técnica."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [client, user, period, customStart, customEnd]);

  const attention = useMemo(() => data ? [
    data.radar.slaOverdue, data.radar.newTooLong, data.radar.pausedTooLong, data.radar.blocked,
    data.radar.closedTicketActiveTask, data.radar.openTicketFinishedTask,
  ].reduce((sum, value) => sum + (value ?? 0), 0) : 0, [data]);

  const drawerExportRows = useMemo<TicketExportRow[]>(() => {
    if (!drawer) return [];
    const mapItem = (item: Ticket | Task): TicketExportRow => isTask(item)
      ? { taskNumber: item.id, subject: item.title, status: item.state, taskStatus: item.state, client: item.client, owner: item.assignedToName }
      : item;
    if (drawer.kind === "radar") return drawer.items.map(mapItem);
    if (drawer.kind === "audit") return drawer.items;
    if (drawer.kind === "recurrence") return drawer.recurrence.examples;
    if (drawer.kind === "gap") return [...(drawer.gap.examples ?? []), ...(drawer.gap.tasks ?? []).map(mapItem)];
    if (drawer.kind === "development") return drawer.development.examples ?? [];
    return [];
  }, [drawer]);

  const resolutionOwnerRows = analyticsFor("resolutionOwner")?.byOwner ?? [];
  const responseOwnerRows = analyticsFor("responseOwner")?.responseByOwner ?? [];
  const filteredResolutionOwners = resolutionOwnerRows.filter((row) => !resolutionOwnerFilter.length || resolutionOwnerFilter.includes(row.analyst));
  const filteredResponseOwners = responseOwnerRows.filter((row) => !responseOwnerFilter.length || responseOwnerFilter.includes(row.analyst));
  const resolutionSlaRows = [
    { name: "No prazo", value: analyticsFor("resolutionSla")?.resolutionSla.within ?? 0, fill: aliareColors.green },
    { name: "Fora do prazo", value: analyticsFor("resolutionSla")?.resolutionSla.outside ?? 0, fill: aliareColors.error },
    { name: "Sem medição", value: analyticsFor("resolutionSla")?.resolutionSla.unmeasured ?? 0, fill: aliareColors.info },
  ];
  const responseSlaRows = [
    { name: "No prazo", value: analyticsFor("responseSla")?.responseSla.within ?? 0, fill: aliareColors.green },
    { name: "Fora do prazo", value: analyticsFor("responseSla")?.responseSla.outside ?? 0, fill: aliareColors.error },
    { name: "Sem medição", value: analyticsFor("responseSla")?.responseSla.unmeasured ?? 0, fill: aliareColors.info },
  ];
  const slaTotal = (rows: Array<{ value: number }>) => rows.reduce((sum, row) => sum + row.value, 0);
  const slaPct = (value: number, total: number) => total ? Math.round((value / total) * 1000) / 10 : 0;
  const chartTooltipProps = {
    contentStyle: {
      backgroundColor: mode === "dark" ? "#10263A" : "#FFFFFF",
      border: mode === "dark" ? "1px solid rgba(131,175,220,.34)" : "1px solid rgba(15,23,42,.14)",
      borderRadius: 10,
      color: mode === "dark" ? "#F3F8FF" : "#172033",
      boxShadow: mode === "dark" ? "0 12px 30px rgba(0,0,0,.34)" : "0 12px 30px rgba(15,23,42,.12)",
    },
    labelStyle: { color: mode === "dark" ? "#D7E5F6" : "#172033", fontWeight: 800 },
    itemStyle: { fontWeight: 700 },
    cursor: { fill: mode === "dark" ? "rgba(47,208,255,.08)" : "rgba(15,23,42,.045)" },
  };

  const auditReasons = useMemo(() => data ? [...new Set(data.audit.sample.map((ticket) => ticket.reason))].sort() : [], [data]);
  const filteredAudit = useMemo(() => data ? data.audit.sample.filter((ticket) => !auditReason || ticket.reason === auditReason) : [], [data, auditReason]);
  const filteredRecurrences = useMemo(() => data ? data.recurrences.filter((item) => !recurrenceConfidence || item.confidence === recurrenceConfidence) : [], [data, recurrenceConfidence]);
  const filteredGaps = useMemo(() => data ? data.gaps.filter((gap) => (!gapImpact || gap.impact === gapImpact) && (!gapStatus || gap.status === gapStatus)) : [], [data, gapImpact, gapStatus]);

  const openItem = (item: Ticket | Task) => {
    if (isTask(item)) {
      const type = item.workItemType.toLocaleLowerCase("pt-BR");
      navigate(type.includes("apoio") ? `/apoios?task=${item.id}` : type.includes("evolu") ? `/evolucoes?task=${item.id}` : `/correcoes?task=${item.id}`);
    } else navigate(`/tickets?movidesk=${item.movideskId}`);
  };

  if (loading && !data) return <Box sx={{ minHeight: 420, display: "grid", placeItems: "center" }}><CircularProgress /></Box>;

  return <Box sx={{
    mx: { xs: -1, md: -2 }, mt: { xs: -1, md: -2 }, p: { xs: 1.5, md: 2.5 }, borderRadius: { xs: 0, md: 3 },
    minHeight: "100vh",
    color: "text.primary",
    background: mode === "dark"
      ? "radial-gradient(circle at 20% 0%, rgba(0,199,142,.10), transparent 28%), radial-gradient(circle at 88% 12%, rgba(84,73,255,.12), transparent 30%), linear-gradient(145deg,#071321 0%,#09192B 48%,#07111F 100%)"
      : "radial-gradient(circle at 18% 0%, rgba(24,199,122,.055), transparent 26%), linear-gradient(180deg,#F8FAFB,#F3F5F6)",
  }}>
    <PageHeader
      eyebrow="Liderança técnica"
      title="Central de Liderança Técnica"
      description="Radar executivo para transformar sinais da operação em investigação, orientação e ação acompanhada."
      meta={data ? `Atualizado em ${new Date(data.generatedAt).toLocaleString("pt-BR")} · janela de ${data.periodDays} dias` : undefined}
      action={<Stack direction="row" spacing={1}><Chip icon={<RadarOutlined />} label={`${attention} requerem atenção`} color={attention ? "warning" : "success"} sx={{ fontWeight: 850, boxShadow: attention ? "0 0 22px rgba(255,167,38,.18)" : "0 0 22px rgba(0,199,142,.18)" }} /></Stack>}
    />

    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

    <Card sx={{
      mb: 2.5,
      overflow: "hidden",
      background: mode === "dark"
        ? "linear-gradient(125deg, rgba(7,47,70,.98), rgba(16,31,67,.98) 58%, rgba(28,29,78,.96)) !important"
        : "linear-gradient(125deg, rgba(236,253,245,.98), rgba(239,246,255,.98) 58%, rgba(245,243,255,.98)) !important",
      borderColor: mode === "dark" ? "rgba(54,202,255,.24) !important" : "rgba(47,111,237,.16) !important",
      boxShadow: mode === "dark" ? "0 18px 44px rgba(0,0,0,.24), inset 0 1px rgba(255,255,255,.03) !important" : "0 14px 34px rgba(15,23,42,.07) !important",
      color: mode === "dark" ? "#fff" : "text.primary",
    }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { lg: "center" } }}>
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <BoltOutlined sx={{ color: aliareColors.green }} />
              <Typography sx={{ fontWeight: 900, fontSize: "1.05rem", textAlign: "center" }}>Briefing executivo da operação</Typography>
              <Tooltip title="Resume os sinais que merecem leitura de liderança. Recomendações são apoio à decisão e devem ser validadas antes de qualquer ação."><IconButton size="small" sx={{ color: mode === "dark" ? "rgba(255,255,255,.65)" : "text.secondary" }}><InfoOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip>
            </Stack>
            <Typography variant="body2" sx={{ color: mode === "dark" ? "rgba(255,255,255,.62)" : "text.secondary", mt: .5, textAlign: "center" }}>Indicadores → desvios → investigação → gap → ação → acompanhamento.</Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <FormControl size="small" sx={{ minWidth: 180, bgcolor: mode === "dark" ? "rgba(7,20,35,.72)" : "rgba(255,255,255,.76)", borderRadius: 1.5, "& .MuiInputLabel-root": { color: mode === "dark" ? "rgba(215,229,246,.68)" : "text.secondary" }, "& .MuiOutlinedInput-root": { color: mode === "dark" ? "#F3F8FF" : "text.primary", "& fieldset": { borderColor: mode === "dark" ? "rgba(131,175,220,.30)" : "rgba(15,23,42,.16)" }, "&:hover fieldset": { borderColor: "rgba(47,208,255,.55)" } }, "& .MuiSvgIcon-root": { color: mode === "dark" ? "rgba(215,229,246,.72)" : "text.secondary" } }}><InputLabel>Cliente</InputLabel><Select value={client} label="Cliente" onChange={(e) => setClient(e.target.value)}><MenuItem value="">Todos</MenuItem>{data?.filters.clients.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</Select></FormControl>
            <FormControl size="small" sx={{ minWidth: 180, bgcolor: mode === "dark" ? "rgba(7,20,35,.72)" : "rgba(255,255,255,.76)", borderRadius: 1.5, "& .MuiInputLabel-root": { color: mode === "dark" ? "rgba(215,229,246,.68)" : "text.secondary" }, "& .MuiOutlinedInput-root": { color: mode === "dark" ? "#F3F8FF" : "text.primary", bgcolor: mode === "dark" ? "rgba(7,20,35,.72)" : "rgba(255,255,255,.76)", "& fieldset": { borderColor: mode === "dark" ? "rgba(131,175,220,.30)" : "rgba(15,23,42,.16)" }, "&:hover fieldset": { borderColor: "rgba(47,208,255,.55)" } }, "& .MuiSvgIcon-root": { color: mode === "dark" ? "rgba(215,229,246,.72)" : "text.secondary" } }}><InputLabel>Analista</InputLabel><Select value={user} label="Analista" onChange={(e) => setUser(e.target.value)}><MenuItem value="">Todos</MenuItem>{data?.filters.users.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</Select></FormControl>
            <FormControl size="small" sx={{ minWidth: 155, bgcolor: mode === "dark" ? "rgba(7,20,35,.72)" : "rgba(255,255,255,.76)", borderRadius: 1.5, "& .MuiInputLabel-root": { color: mode === "dark" ? "rgba(215,229,246,.68)" : "text.secondary" }, "& .MuiOutlinedInput-root": { color: mode === "dark" ? "#F3F8FF" : "text.primary", bgcolor: mode === "dark" ? "rgba(7,20,35,.72)" : "rgba(255,255,255,.76)", "& fieldset": { borderColor: mode === "dark" ? "rgba(131,175,220,.30)" : "rgba(15,23,42,.16)" }, "&:hover fieldset": { borderColor: "rgba(47,208,255,.55)" } }, "& .MuiSvgIcon-root": { color: mode === "dark" ? "rgba(215,229,246,.72)" : "text.secondary" } }}><InputLabel>Período</InputLabel><Select value={period} label="Período" onChange={(e) => setPeriod(e.target.value as PeriodPreset)}><MenuItem value="7">7 dias</MenuItem><MenuItem value="30">30 dias</MenuItem><MenuItem value="60">60 dias</MenuItem><MenuItem value="90">90 dias</MenuItem><MenuItem value="month">Este mês</MenuItem><MenuItem value="semester">Este semestre</MenuItem><MenuItem value="year">Este ano</MenuItem><MenuItem value="custom">Personalizado</MenuItem></Select></FormControl>
          </Stack>
        </Stack>
        {period === "custom" && <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.5, justifyContent: "flex-end" }}>
          <Box component="label" sx={{ display: "grid", gap: .4, fontSize: ".72rem", color: mode === "dark" ? "rgba(215,229,246,.68)" : "text.secondary" }}>Data inicial
            <Box component="input" type="date" value={customStart} max={customEnd || undefined} onChange={(e) => setCustomStart(e.currentTarget.value)} sx={{ colorScheme: mode === "dark" ? "dark" : "light", height: 38, px: 1.2, borderRadius: 1.5, color: mode === "dark" ? "#F3F8FF" : "text.primary", bgcolor: mode === "dark" ? "rgba(7,20,35,.72)" : "rgba(255,255,255,.76)", border: "1px solid rgba(131,175,220,.30)", outline: "none", "&:focus": { borderColor: aliareColors.green } }} />
          </Box>
          <Box component="label" sx={{ display: "grid", gap: .4, fontSize: ".72rem", color: mode === "dark" ? "rgba(215,229,246,.68)" : "text.secondary" }}>Data final
            <Box component="input" type="date" value={customEnd} min={customStart || undefined} onChange={(e) => setCustomEnd(e.currentTarget.value)} sx={{ colorScheme: mode === "dark" ? "dark" : "light", height: 38, px: 1.2, borderRadius: 1.5, color: mode === "dark" ? "#F3F8FF" : "text.primary", bgcolor: mode === "dark" ? "rgba(7,20,35,.72)" : "rgba(255,255,255,.76)", border: "1px solid rgba(131,175,220,.30)", outline: "none", "&:focus": { borderColor: aliareColors.green } }} />
          </Box>
        </Stack>}

        {data && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", lg: "repeat(4,1fr)" }, gap: 1.25, mt: 2 }}>
          <KpiCard title="Atendimentos no período" value={data.weekly.current} subtitle="Clique para ver os atendimentos" info="Tickets criados no período selecionado." accent={aliareColors.info} onClick={() => setDrawer({ kind: "radar", key: "opened", title: "Atendimentos no período", items: (data.analytics.samples.opened as Ticket[]) ?? [] })} />
          <KpiCard title="Backlog aberto" value={data.weekly.open} subtitle="Clique para investigar" info="Atendimentos ainda abertos no recorte atual." accent={aliareColors.cyan} onClick={() => setDrawer({ kind: "radar", key: "backlog", title: "Backlog aberto", items: data.analytics.samples.backlog ?? [] })} />
          <KpiCard title="SLA vencido" value={data.weekly.overdue} subtitle="Clique para investigar" info="Atendimentos abertos com prazo ou indicador de solução vencido." accent={aliareColors.error} onClick={() => setDrawer({ kind: "radar", key: "slaOverdue", title: "SLA vencido", items: data.radarSamples.slaOverdue ?? [] })} />
          <KpiCard title="Tasks bloqueadas" value={data.weekly.blocked} subtitle="Clique para investigar" info="Work Items ativos com bloqueio de processo." accent={aliareColors.purple} onClick={() => setDrawer({ kind: "radar", key: "blocked", title: "Tasks bloqueadas", items: data.radarSamples.blocked ?? [] })} />
        </Box>}
      </CardContent>
    </Card>

    {data && <Card sx={{ mb: 2.5, borderColor: mode === "dark" ? "rgba(0,199,142,.22)" : "divider" }}><CardContent>
      <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, gap: 1 }}>
        <AreaTitle title="Leitura semanal" icon={<AutoGraphOutlined color="primary" />} info="Compara o volume do período atual com a janela anterior e destaca indicadores operacionais para a rotina semanal de gestão." />
        <Delta value={data.weekly.changePct} />
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,1fr)", md: "repeat(5,1fr)" }, gap: 1.2, mt: 1.5 }}>
        {[["Atual", data.weekly.current, "radar"], ["Anterior", data.weekly.previous, "recurrences"], ["Pausados", data.weekly.paused, "radar"], ["Sem movimento", data.weekly.stale, "audit"], ["Bloqueados", data.weekly.blocked, "radar"]].map(([label, value, target]) => <Box key={String(label)} role="button" tabIndex={0} onClick={() => setTab(target as TabKey)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setTab(target as TabKey); }} sx={{ cursor: "pointer", p: 1.25, borderRadius: 2, background: mode === "dark" ? "linear-gradient(145deg, rgba(18,47,69,.90), rgba(12,31,51,.92))" : "rgba(15,23,42,.025)", border: "1px solid", borderColor: "divider" }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ fontWeight: 850, fontSize: "1.25rem" }}>{value}</Typography></Box>)}
      </Box>
      {data.recommendations.length > 0 && <Box sx={{ mt: 1.5, p: 1.4, borderRadius: 2, background: mode === "dark" ? "linear-gradient(135deg, rgba(0,199,142,.12), rgba(20,64,75,.35))" : aliareColors.surfaceGreen, border: "1px solid rgba(0,199,142,.28)" }}>
        <AreaTitle title="Ações recomendadas" info="Sugestões geradas a partir dos sinais objetivos da operação. Não executam ações automaticamente e devem passar por julgamento técnico." />
        <Stack spacing={.65} sx={{ mt: .8 }}>{data.recommendations.map((item, index) => <Typography key={item} variant="body2"><b>{index + 1}.</b> {item}</Typography>)}</Stack>
      </Box>}
    </CardContent></Card>}

    {data && <Card sx={{ mb: 2.5, overflow: "hidden" }}><CardContent>
      <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, gap: 1, mb: 1.5 }}>
        <AreaTitle title="Pulso operacional" icon={<AutoGraphOutlined color="primary" />} info="Compara os principais sinais objetivos do período atual e oferece uma leitura visual rápida antes da investigação detalhada." />
        <Chip size="small" label={`${data.weekly.current} atendimentos no período`} variant="outlined" />
      </Stack>
      <Box sx={{ width: "100%", height: 270 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[
            { label: "Backlog", value: data.weekly.open, fill: aliareColors.info },
            { label: "SLA vencido", value: data.weekly.overdue, fill: aliareColors.error },
            { label: "Pausados", value: data.weekly.paused, fill: aliareColors.warning },
            { label: "Sem movimento", value: data.weekly.stale, fill: aliareColors.cyan },
            { label: "Bloqueados", value: data.weekly.blocked, fill: aliareColors.purple },
          ]} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
            <CartesianGrid stroke={mode === "dark" ? "rgba(148,163,184,.18)" : "rgba(15,23,42,.10)"} strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: mode === "dark" ? "#AFC0D4" : "#667085" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: mode === "dark" ? "#AFC0D4" : "#667085" }} axisLine={false} tickLine={false} />
            <ChartTooltip contentStyle={{ borderRadius: 12, border: mode === "dark" ? "1px solid rgba(148,163,184,.22)" : "1px solid rgba(15,23,42,.12)", background: mode === "dark" ? "#0E2338" : "#FFFFFF", boxShadow: "0 14px 36px rgba(0,0,0,.18)" }} cursor={{ fill: mode === "dark" ? "rgba(255,255,255,.035)" : "rgba(15,23,42,.035)" }} />
            <Bar dataKey="value" name="Quantidade" radius={[7, 7, 2, 2]}>
              {[
                aliareColors.info, aliareColors.error, aliareColors.warning, aliareColors.cyan, aliareColors.purple,
              ].map((fill, index) => <Cell key={index} fill={fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </CardContent></Card>}

    <Card sx={{ mb: 2.5 }}><Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 1, "& .MuiTab-root": { minHeight: 56 }, "& .Mui-selected": { bgcolor: mode === "dark" ? "rgba(0,199,142,.08)" : "rgba(24,199,122,.06)" }, "& .MuiTabs-indicator": { height: 3, borderRadius: 3 } }}>
      {([
        ["indicators", "Indicadores", <InsightsOutlined fontSize="small" />],
        ["radar", "Radar", <RadarOutlined fontSize="small" />],
        ["audit", "Auditoria", <AssignmentTurnedInOutlined fontSize="small" />],
        ["recurrences", "Recorrências", <TrackChangesOutlined fontSize="small" />],
        ["gaps", "Gaps técnicos", <ErrorOutlineOutlined fontSize="small" />],
        ["development", "Desenvolvimento", <GroupsOutlined fontSize="small" />],
      ] as Array<[TabKey, string, ReactElement]>).map(([key, label, icon]) => <Tab key={key} value={key} icon={icon} iconPosition="start" label={<Stack direction="row" spacing={.5} sx={{ alignItems: "center" }}><span>{label}</span><Tooltip title={tabInfo[key]}><InfoOutlined onClick={(e) => e.stopPropagation()} sx={{ fontSize: 15, color: "text.secondary" }} /></Tooltip></Stack>} />)}
    </Tabs></Card>

    {data && tab === "indicators" && <Box>
      <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, gap: 1, mb: 1.5 }}>
        <AreaTitle title="Cockpit operacional" info={tabInfo.indicators} icon={<InsightsOutlined color="primary" />} />
        <Chip size="small" variant="outlined" label="Movidesk + inteligência operacional" />
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(6,1fr)" }, gap: 1.25, mb: 2 }}>
        <KpiCard title="SLA solução" value={data.analytics.operational.resolutionSlaRate === null ? "—" : `${data.analytics.operational.resolutionSlaRate}%`} subtitle="Resolvidos no prazo" accent={aliareColors.green} onClick={() => setDrawer({ kind: "radar", key: "resolutionOutside", title: "Solução fora do SLA", items: data.analytics.samples.resolutionOutside ?? [] })} />
        <KpiCard title="SLA 1ª resposta" value={data.analytics.operational.responseSlaRate === null ? "—" : `${data.analytics.operational.responseSlaRate}%`} subtitle="Primeiras respostas no prazo" accent={aliareColors.info} onClick={() => setDrawer({ kind: "radar", key: "responseOutside", title: "Primeira resposta fora do SLA", items: data.analytics.samples.responseOutside ?? [] })} />
        <KpiCard title="Reabertura" value={data.analytics.operational.reopenRate === null ? "—" : `${data.analytics.operational.reopenRate}%`} subtitle="Resolvidos que reabriram" accent={aliareColors.warning} onClick={() => setDrawer({ kind: "radar", key: "reopened", title: "Atendimentos reabertos", items: data.analytics.samples.reopened ?? [] })} />
        <KpiCard title="1º contato" value={data.analytics.operational.firstContactResolutionRate === null ? "—" : `${data.analytics.operational.firstContactResolutionRate}%`} subtitle="Resolução no primeiro contato" accent={aliareColors.cyan} onClick={() => setDrawer({ kind: "radar", key: "firstContact", title: "Resolvidos no primeiro contato", items: (data.analytics.samples.firstContact as Ticket[]) ?? [] })} />
        <KpiCard title="Balanço de fluxo" value={data.analytics.operational.flowBalance === null ? "—" : `${data.analytics.operational.flowBalance > 0 ? "+" : ""}${data.analytics.operational.flowBalance}%`} subtitle="Resolvidos − entradas / entradas" accent={data.analytics.operational.flowBalance !== null && data.analytics.operational.flowBalance >= 0 ? aliareColors.green : aliareColors.error} onClick={() => setDrawer({ kind: "radar", key: "opened", title: "Entradas do período", items: data.analytics.samples.opened ?? [] })} />
        <KpiCard title="Aging crítico" value={data.analytics.operational.criticalAging} subtitle="Backlog aberto há +15 dias" accent={aliareColors.error} onClick={() => setDrawer({ kind: "radar", key: "criticalAging", title: "Backlog com mais de 15 dias", items: data.analytics.samples.criticalAging ?? [] })} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.55fr 1fr" }, gap: 1.5, mb: 1.5 }}>
        <Card><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1, textAlign: "center", "& > *": { justifyContent: "center" } }}><AreaTitle title="Entradas, resoluções, reaberturas e backlog" info="Evolução diária do fluxo. O backlog histórico é reconstruído pelas datas de criação, resolução, fechamento e cancelamento disponíveis na base." /></Box>
            <IndicatorPeriodFilter value={indicatorPeriod("dailyFlow")} onChange={(value) => setIndicatorPeriod("dailyFlow", value)} />
          </Stack>
          <Box sx={{ height: 330, mt: 1.2 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={analyticsFor("dailyFlow")?.daily ?? []}>
            <CartesianGrid strokeDasharray="4 5" vertical={false} stroke={mode === "dark" ? "rgba(148,163,184,.18)" : "rgba(15,23,42,.10)"} />
            <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} tick={{ fontSize: 10 }} minTickGap={20} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <ChartTooltip contentStyle={{ borderRadius: 12, background: mode === "dark" ? "#0E2338" : "#fff" }} />

            {isLeadershipSeriesVisible("dailyFlow", "opened") && <Line type="monotone" dataKey="opened" name="Abertos" stroke={aliareColors.info} strokeWidth={2.4} dot={false} />}
            {isLeadershipSeriesVisible("dailyFlow", "resolved") && <Line type="monotone" dataKey="resolved" name="Resolvidos" stroke={aliareColors.green} strokeWidth={2.4} dot={false} />}
            {isLeadershipSeriesVisible("dailyFlow", "reopened") && <Line type="monotone" dataKey="reopened" name="Reabertos" stroke={aliareColors.warning} strokeWidth={2} dot={false} />}
            {isLeadershipSeriesVisible("dailyFlow", "pending") && <Line type="monotone" dataKey="pending" name="Pendentes" stroke={aliareColors.purple} strokeWidth={2.4} dot={false} />}
          </LineChart></ResponsiveContainer></Box>
          <SeriesSelector chart="dailyFlow" items={[
            { key: "opened", label: "Abertos", color: aliareColors.info },
            { key: "resolved", label: "Resolvidos", color: aliareColors.green },
            { key: "reopened", label: "Reabertos", color: aliareColors.warning },
            { key: "pending", label: "Pendentes", color: aliareColors.purple },
          ]} />
        </CardContent></Card>

        <Card><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1, textAlign: "center", "& > *": { justifyContent: "center" } }}><AreaTitle title="Aging do backlog" info="Distribui os atendimentos abertos por idade desde a criação para antecipar envelhecimento da fila." /></Box>
            <Chip size="small" variant="outlined" label="Snapshot atual" />
          </Stack>
          <Box sx={{ height: 330, mt: 1.2 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={analyticsFor("aging")?.aging ?? []}>
            <CartesianGrid strokeDasharray="4 5" vertical={false} stroke={mode === "dark" ? "rgba(148,163,184,.18)" : "rgba(15,23,42,.10)"} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} />
            <ChartTooltip contentStyle={{ borderRadius: 12, background: mode === "dark" ? "#0E2338" : "#fff" }} />
            <Bar dataKey="total" name="Tickets" fill={aliareColors.cyan} radius={[7,7,2,2]} />
          </BarChart></ResponsiveContainer></Box>
          <SeriesSelector chart="responseOwner" items={[
            { key: "within", label: "No prazo", color: aliareColors.green },
            { key: "outside", label: "Fora do prazo", color: aliareColors.error },
            { key: "unmeasured", label: "Sem medição", color: aliareColors.info },
          ]} />
        </CardContent></Card>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2,1fr)" }, gap: 1.5, mb: 1.5 }}>
        <Card><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1, textAlign: "center", "& > *": { justifyContent: "center" } }}><AreaTitle title="SLA de solução" info="Versão moderna do indicador de tickets resolvidos por vencimento do Movidesk." /></Box>
            <IndicatorPeriodFilter value={indicatorPeriod("resolutionSla")} onChange={(value) => setIndicatorPeriod("resolutionSla", value)} />
          </Stack>
          <Box sx={{ height: 280, position: "relative" }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={resolutionSlaRows.filter((item) => isLeadershipSeriesVisible("resolutionSla", item.name))} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3}>
            {resolutionSlaRows.filter((item) => isLeadershipSeriesVisible("resolutionSla", item.name)).map((item) => <Cell key={item.name} fill={item.fill} />)}
          </Pie><ChartTooltip {...chartTooltipProps} formatter={(value, name) => [`${Number(value)} · ${slaPct(Number(value), slaTotal(resolutionSlaRows))}%`, String(name)]} /></PieChart></ResponsiveContainer>
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}><Box sx={{ textAlign: "center" }}><Typography sx={{ fontSize: "1.45rem", fontWeight: 900 }}>{slaTotal(resolutionSlaRows)}</Typography><Typography variant="caption" color="text.secondary">medidos</Typography></Box></Box>
          </Box>
          <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: "center", flexWrap: "wrap", mb: .8 }}>{resolutionSlaRows.map((row) => <Chip key={row.name} size="small" variant="outlined" label={`${row.name}: ${row.value} (${slaPct(row.value, slaTotal(resolutionSlaRows))}%)`} sx={{ fontWeight: 750 }} />)}</Stack>
          <SeriesSelector chart="resolutionSla" items={resolutionSlaRows.map((row) => ({ key: row.name, label: row.name, color: row.fill }))} />
        </CardContent></Card>
        <Card><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1, textAlign: "center", "& > *": { justifyContent: "center" } }}><AreaTitle title="SLA de primeira resposta" info="Consolida o indicador de primeira resposta, preservando também registros sem medição." /></Box>
            <IndicatorPeriodFilter value={indicatorPeriod("responseSla")} onChange={(value) => setIndicatorPeriod("responseSla", value)} />
          </Stack>
          <Box sx={{ height: 280, position: "relative" }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={responseSlaRows.filter((item) => isLeadershipSeriesVisible("responseSla", item.name))} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3}>
            {responseSlaRows.filter((item) => isLeadershipSeriesVisible("responseSla", item.name)).map((item) => <Cell key={item.name} fill={item.fill} />)}
          </Pie><ChartTooltip {...chartTooltipProps} formatter={(value, name) => [`${Number(value)} · ${slaPct(Number(value), slaTotal(responseSlaRows))}%`, String(name)]} /></PieChart></ResponsiveContainer>
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}><Box sx={{ textAlign: "center" }}><Typography sx={{ fontSize: "1.45rem", fontWeight: 900 }}>{slaTotal(responseSlaRows)}</Typography><Typography variant="caption" color="text.secondary">medidos</Typography></Box></Box>
          </Box>
          <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: "center", flexWrap: "wrap", mb: .8 }}>{responseSlaRows.map((row) => <Chip key={row.name} size="small" variant="outlined" label={`${row.name}: ${row.value} (${slaPct(row.value, slaTotal(responseSlaRows))}%)`} sx={{ fontWeight: 750 }} />)}</Stack>
          <SeriesSelector chart="responseSla" items={responseSlaRows.map((row) => ({ key: row.name, label: row.name, color: row.fill }))} />
        </CardContent></Card>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "repeat(2,1fr)" }, gap: 1.5, mb: 1.5 }}>
        <Card><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1, textAlign: "center", "& > *": { justifyContent: "center" } }}><AreaTitle title="Resolução por analista" info="Volume resolvido, reaberto e situação de SLA por analista. Use o filtro para isolar um analista sem alterar os demais indicadores da Central." /></Box>
            <Stack direction="row" spacing={.8}>
              <AnalystMultiSelect options={resolutionOwnerRows.map((row) => row.analyst)} value={resolutionOwnerFilter} onChange={setResolutionOwnerFilter} label="Filtrar analistas na resolução" />
              <IndicatorPeriodFilter value={indicatorPeriod("resolutionOwner")} onChange={(value) => setIndicatorPeriod("resolutionOwner", value)} />
            </Stack>
          </Stack>
          <Box sx={{ height: 340, mt: 1 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={filteredResolutionOwners.map((row) => ({ ...row, analystLabel: abbreviateAnalystName(row.analyst) }))}>
            <CartesianGrid strokeDasharray="4 5" vertical={false} /><XAxis dataKey="analystLabel" tick={{ fontSize: 10 }} interval={0} angle={0} textAnchor="middle" height={44} /><YAxis allowDecimals={false} /><ChartTooltip {...chartTooltipProps} labelFormatter={(_, payload) => payload?.[0]?.payload?.analyst ?? ""} />
            {isLeadershipSeriesVisible("resolutionOwner", "resolved") && <Bar dataKey="resolved" name="Resolvidos" fill={aliareColors.info} radius={[5,5,0,0]} />}
            {isLeadershipSeriesVisible("resolutionOwner", "reopened") && <Bar dataKey="reopened" name="Reabertos" fill={aliareColors.warning} radius={[5,5,0,0]} />}
            {isLeadershipSeriesVisible("resolutionOwner", "outside") && <Bar dataKey="outside" name="Fora SLA" fill={aliareColors.error} radius={[5,5,0,0]} />}
          </BarChart></ResponsiveContainer></Box>
          <SeriesSelector chart="resolutionOwner" items={[
            { key: "resolved", label: "Resolvidos", color: aliareColors.info },
            { key: "reopened", label: "Reabertos", color: aliareColors.warning },
            { key: "outside", label: "Fora SLA", color: aliareColors.error },
          ]} />
        </CardContent></Card>
        <Card><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1, textAlign: "center", "& > *": { justifyContent: "center" } }}><AreaTitle title="Primeira resposta por analista" info="Compara respostas dentro, fora e sem medição de SLA por analista. O filtro isola um analista apenas neste gráfico." /></Box>
            <Stack direction="row" spacing={.8}>
              <AnalystMultiSelect options={responseOwnerRows.map((row) => row.analyst)} value={responseOwnerFilter} onChange={setResponseOwnerFilter} label="Filtrar analistas na primeira resposta" />
              <IndicatorPeriodFilter value={indicatorPeriod("responseOwner")} onChange={(value) => setIndicatorPeriod("responseOwner", value)} />
            </Stack>
          </Stack>
          <Box sx={{ height: 340, mt: 1 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={filteredResponseOwners.map((row) => ({ ...row, analystLabel: abbreviateAnalystName(row.analyst) }))}>
            <CartesianGrid strokeDasharray="4 5" vertical={false} /><XAxis dataKey="analystLabel" tick={{ fontSize: 10 }} interval={0} angle={0} textAnchor="middle" height={44} /><YAxis allowDecimals={false} /><ChartTooltip {...chartTooltipProps} labelFormatter={(_, payload) => payload?.[0]?.payload?.analyst ?? ""} />
            {isLeadershipSeriesVisible("responseOwner", "within") && <Bar dataKey="within" name="No prazo" stackId="sla" fill={aliareColors.green} />}
            {isLeadershipSeriesVisible("responseOwner", "outside") && <Bar dataKey="outside" name="Fora do prazo" stackId="sla" fill={aliareColors.error} />}
            {isLeadershipSeriesVisible("responseOwner", "unmeasured") && <Bar dataKey="unmeasured" name="Sem medição" stackId="sla" fill={aliareColors.info} />}
          </BarChart></ResponsiveContainer></Box>
        </CardContent></Card>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 1.5 }}>
        {[
          ["Tickets por categoria", "categoryDistribution", analyticsFor("categoryDistribution")?.categoryDistribution ?? [], aliareColors.purple],
          ["Clientes no período", "clientDistribution", analyticsFor("clientDistribution")?.clientDistribution ?? [], aliareColors.cyan],
          ["Solicitantes / contatos", "contactDistribution", analyticsFor("contactDistribution")?.contactDistribution ?? [], aliareColors.green],
        ].map(([title, chartKey, rows, accent]) => {
          const rankingRows = rows as Array<{label:string;total:number}>;
          const visibleRows = rankingRows.filter((row) => isLeadershipSeriesVisible(String(chartKey), row.label));
          const visibleTotal = visibleRows.reduce((sum, row) => sum + row.total, 0);
          const maxVisible = Math.max(...visibleRows.map((row) => row.total), 1);
          return <Card key={String(title)}><CardContent>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
              <Box sx={{ flex: 1, textAlign: "center" }}><Typography sx={{ fontWeight: 850 }}>{String(title)}</Typography><Typography variant="caption" color="text.secondary">{visibleTotal} itens visíveis · clique para exibir/ocultar</Typography></Box>
              <IndicatorPeriodFilter value={indicatorPeriod(String(chartKey))} onChange={(value) => setIndicatorPeriod(String(chartKey), value)} />
            </Stack>
            <Stack spacing={.8} sx={{ mt: 1.2 }}>{rankingRows.slice(0,8).map((row) => {
              const active = isLeadershipSeriesVisible(String(chartKey), row.label);
              return <Box key={row.label} role="button" tabIndex={0} onClick={() => toggleLeadershipSeries(String(chartKey), row.label, Math.min(rankingRows.length, 8))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") toggleLeadershipSeries(String(chartKey), row.label, Math.min(rankingRows.length, 8)); }} sx={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 1, alignItems: "center", cursor: "pointer", opacity: active ? 1 : .38, textDecoration: active ? "none" : "line-through", px: .5, py: .35, borderRadius: 1, transition: "all .2s ease", "&:hover": { bgcolor: "action.hover" } }}><Box sx={{ minWidth: 0 }}><Typography variant="body2" noWrap>{row.label}</Typography><Box sx={{ height: 5, borderRadius: 9, bgcolor: "action.hover", mt: .35, overflow: "hidden" }}><Box sx={{ width: active ? `${Math.max(6, row.total / maxVisible * 100)}%` : "0%", height: "100%", bgcolor: String(accent), borderRadius: 9, transition: "width .25s ease" }} /></Box></Box><Typography variant="body2" sx={{ fontWeight: 850 }}>{active ? row.total : "—"}</Typography><Button size="small" variant="text" onClick={(event) => { event.stopPropagation(); const sampleKey = String(chartKey) === "categoryDistribution" ? "categories" : String(chartKey) === "clientDistribution" ? "clients" : "contacts"; const groups = data.analytics.samples[sampleKey] as Record<string, Ticket[]> | undefined; setDrawer({ kind: "radar", key: `${String(chartKey)}-${row.label}`, title: `${String(title)} · ${row.label}`, items: groups?.[row.label] ?? [] }); }}>Ver</Button></Box>;
            })}</Stack>
          </CardContent></Card>;
        })}
      </Box>
    </Box>}

    {data && tab === "radar" && <Box>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, gap: 1 }}>
        <AreaTitle title="Radar operacional" info={tabInfo.radar} icon={<RadarOutlined color="primary" />} />
        <Chip size="small" variant="outlined" label="Snapshot atual · cliente/analista" />
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", lg: "repeat(5,1fr)" }, gap: 1.5, mt: 1.2 }}>
        {radarMeta.map(([key, title, info, accent]) => <KpiCard key={key} title={title} value={data.radar[key] ?? 0} subtitle="Clique para investigar" info={info} accent={accent} onClick={() => setDrawer({ kind: "radar", key, title, items: data.radarSamples[key] ?? [] })} />)}
      </Box>
    </Box>}

    {data && tab === "audit" && <Box>
      <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, gap: 1 }}>
        <AreaTitle title="Auditoria inteligente" info={tabInfo.audit} icon={<AssignmentTurnedInOutlined color="primary" />} />
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <FormControl size="small" sx={{ minWidth: 220 }}><InputLabel>Sinal de auditoria</InputLabel><Select value={auditReason} label="Sinal de auditoria" onChange={(e) => setAuditReason(e.target.value)}><MenuItem value="">Todos</MenuItem>{auditReasons.map((reason) => <MenuItem key={reason} value={reason}>{reason}</MenuItem>)}</Select></FormControl>
          <Chip label={`${filteredAudit.length} de ${data.audit.sample.length} na amostra · ${data.audit.candidates} candidato(s)`} />
          <ExportTicketsButton tickets={filteredAudit} title="Auditoria inteligente" subtitle="Central de Liderança Técnica" />
        </Stack>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)" }, gap: 1.5, mt: 1.2 }}>
        {filteredAudit.map((ticket) => <Card key={ticket.id} onClick={() => setDrawer({ kind: "audit", title: "Auditoria semanal", items: [ticket] })} sx={{ cursor: "pointer", background: mode === "dark" ? "linear-gradient(145deg, rgba(17,45,67,.96), rgba(12,29,49,.96)) !important" : "linear-gradient(145deg,#FFFFFF,#F4FAF8) !important", "&:hover": { borderColor: `${aliareColors.green} !important`, transform: "translateY(-2px)", boxShadow: "0 14px 34px rgba(0,199,142,.10)" }, transition: ".15s" }}><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}><Typography sx={{ fontWeight: 850 }}>#{ticket.movideskId}</Typography><Tooltip title="Candidato selecionado por heurísticas operacionais. A confirmação depende de análise humana."><InfoOutlined sx={{ fontSize: 17, color: "text.secondary" }} /></Tooltip></Stack>
          <Typography variant="body2" sx={{ mt: .5, fontWeight: 700 }}>{ticket.subject}</Typography>
          <Chip size="small" color="warning" label={ticket.reason} sx={{ mt: 1, maxWidth: "100%" }} />
        </CardContent></Card>)}
      </Box>
    </Box>}

    {data && tab === "recurrences" && <Box>
      <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, gap: 1 }}>
        <AreaTitle title="Radar de recorrências" info={tabInfo.recurrences} icon={<TrackChangesOutlined color="primary" />} />
        <FormControl size="small" sx={{ minWidth: 170 }}><InputLabel>Confiança</InputLabel><Select value={recurrenceConfidence} label="Confiança" onChange={(e) => setRecurrenceConfidence(e.target.value)}><MenuItem value="">Todas</MenuItem><MenuItem value="ALTA">Alta</MenuItem><MenuItem value="MÉDIA">Média</MenuItem></Select></FormControl>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)", xl: "repeat(3,1fr)" }, gap: 1.5, mt: 1.2 }}>
        {filteredRecurrences.map((item) => <Card key={item.topic} onClick={() => setDrawer({ kind: "recurrence", title: item.topic, recurrence: item })} sx={{ cursor: "pointer", background: mode === "dark" ? "linear-gradient(145deg, rgba(12,48,70,.96), rgba(14,28,53,.96)) !important" : "linear-gradient(145deg,#FFFFFF,#F3FAFC) !important", "&:hover": { borderColor: `${aliareColors.cyan} !important`, boxShadow: "0 12px 30px rgba(47,208,255,.10)" } }}><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}><Typography sx={{ fontWeight: 850, textTransform: "capitalize" }}>{item.topic}</Typography><Tooltip title="Tema agrupado por classificação/serviço dos tickets do período. Clique para ver evidências e ação sugerida."><InfoOutlined sx={{ fontSize: 17, color: "text.secondary" }} /></Tooltip></Stack>
          <Typography sx={{ fontWeight: 900, fontSize: "1.7rem", color: aliareColors.cyan, mt: .7 }}>{item.count}</Typography>
          <Typography variant="caption" color="text.secondary">{item.clients.length} cliente(s) · {item.analysts.length} analista(s) · {item.linkedExamples ?? 0} evidência(s) com Azure</Typography>{item.concentration && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .35 }}>Concentração: {item.concentration.topClient ?? "sem cliente dominante"}{item.concentration.topClient ? ` (${item.concentration.clientSharePct}%)` : ""} · Módulo Azure: {item.concentration.topModule ?? "não identificado"}</Typography>}
          <Stack direction="row" spacing={.7} sx={{ mt: 1, flexWrap: "wrap" }}><Delta value={item.changePct} />{item.confidence && <Chip size="small" variant="outlined" color={item.confidence === "ALTA" ? "success" : "warning"} label={`Confiança ${item.confidence.toLowerCase()}`} />}</Stack>
        </CardContent></Card>)}
        {!filteredRecurrences.length && <Alert severity="success">Nenhuma recorrência encontrada para os filtros selecionados.</Alert>}
      </Box>
    </Box>}

    {data && tab === "gaps" && <Box>
      <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, gap: 1 }}>
        <AreaTitle title="Pontos de atenção técnicos" info={tabInfo.gaps} icon={<ErrorOutlineOutlined color="primary" />} />
        <Stack direction="row" spacing={1}>
          <FormControl size="small" sx={{ minWidth: 145 }}><InputLabel>Prioridade</InputLabel><Select value={gapImpact} label="Prioridade" onChange={(e) => setGapImpact(e.target.value)}><MenuItem value="">Todas</MenuItem><MenuItem value="Alto">Alta</MenuItem><MenuItem value="Médio">Média</MenuItem></Select></FormControl>
          <FormControl size="small" sx={{ minWidth: 175 }}><InputLabel>Status</InputLabel><Select value={gapStatus} label="Status" onChange={(e) => setGapStatus(e.target.value)}><MenuItem value="">Todos</MenuItem>{[...new Set(data.gaps.map((gap) => gap.status))].map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}</Select></FormControl>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mt: 1.2, mb: 1.5 }}>
        Esta visão transforma sinais encontrados nos tickets em pontos de investigação. Um gap não significa, por si só, um erro do sistema:
        ele indica um tema que merece validação da liderança antes de definir uma ação.
      </Alert>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" }, gap: 1.2, mb: 1.5 }}>
        {[
          ["Pontos identificados", filteredGaps.length],
          ["Prioridade alta", filteredGaps.filter((gap) => gap.impact === "Alto").length],
          ["Demais prioridades", filteredGaps.filter((gap) => gap.impact !== "Alto").length],
        ].map(([label, value]) => <Box key={String(label)} sx={{ p: 1.35, borderRadius: 2, border: "1px solid", borderColor: "divider", bgcolor: mode === "dark" ? "rgba(15,36,58,.72)" : "background.paper" }}>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography sx={{ fontWeight: 900, fontSize: "1.45rem", mt: .15 }}>{value}</Typography>
        </Box>)}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2,1fr)" }, gap: 1.5 }}>
        {filteredGaps.map((gap) => <Card key={gap.id} onClick={() => setDrawer({ kind: "gap", title: gap.title, gap })} sx={{ cursor: "pointer", background: mode === "dark" ? "linear-gradient(145deg, rgba(29,32,72,.96), rgba(13,28,49,.96)) !important" : "linear-gradient(145deg,#FFFFFF,#F7F5FF) !important", "&:hover": { borderColor: `${aliareColors.purple} !important`, boxShadow: "0 12px 30px rgba(124,92,255,.11)", transform: "translateY(-2px)" }, transition: ".15s" }}>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">PONTO {gap.id} · {gap.type}</Typography>
                <Typography sx={{ fontWeight: 900, fontSize: "1.05rem", mt: .25, textTransform: "capitalize" }}>{gap.title}</Typography>
              </Box>
              <Tooltip title="Clique para abrir o diagnóstico completo e revisar a ação sugerida."><InfoOutlined sx={{ fontSize: 17, color: "text.secondary" }} /></Tooltip>
            </Stack>

            <Stack direction="row" spacing={1} sx={{ mt: 1.1, flexWrap: "wrap", rowGap: .7 }}>
              <Chip size="small" label={`Prioridade: ${gap.impact}`} color={gap.impact === "Alto" ? "error" : "warning"} />
              <Chip size="small" label={`Status: ${gap.status}`} variant="outlined" />
              {gap.confidence && <Chip size="small" label={`Confiança: ${gap.confidence}`} color={gap.confidence === "Alta" ? "success" : gap.confidence === "Média" ? "warning" : "default"} variant="outlined" />}
            </Stack>

            <Box sx={{ mt: 1.4, p: 1.2, borderRadius: 1.5, bgcolor: mode === "dark" ? "rgba(255,255,255,.035)" : "rgba(124,92,255,.045)", border: "1px solid", borderColor: mode === "dark" ? "rgba(255,255,255,.06)" : "rgba(124,92,255,.12)" }}>
              <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800 }}>POR QUE FOI SINALIZADO</Typography>
              <Typography variant="body2" sx={{ mt: .35 }}>{gap.evidence}</Typography>
            </Box>

            <Box sx={{ mt: 1.1 }}>
              <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800 }}>PRÓXIMA AÇÃO SUGERIDA</Typography>
              <Typography variant="body2" sx={{ mt: .3 }}>{gap.action}</Typography>
            </Box>

            <Typography variant="caption" sx={{ display: "block", mt: 1.25, color: aliareColors.cyan, fontWeight: 800 }}>
              Abrir diagnóstico completo →
            </Typography>
          </CardContent>
        </Card>)}
        {!filteredGaps.length && <Alert severity="success">Nenhum ponto de atenção técnico encontrado para os filtros selecionados.</Alert>}
      </Box>
    </Box>}

    {data && tab === "development" && <Box>
      <AreaTitle title="Desenvolvimento técnico do time" info={tabInfo.development} icon={<SchoolOutlined color="primary" />} />
      <Alert severity="info" sx={{ mt: 1.2, mb: 1.5 }}>Esta visão não é ranking. Ela ajuda a identificar concentração de temas, necessidade de apoio e oportunidades de transferência de conhecimento.</Alert>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)", xl: "repeat(3,1fr)" }, gap: 1.5 }}>
        {data.development.map((item) => <Card key={item.analyst} onClick={() => setDrawer({ kind: "development", title: item.analyst, development: item })} sx={{ cursor: "pointer", background: mode === "dark" ? "linear-gradient(145deg, rgba(12,51,60,.96), rgba(12,29,49,.96)) !important" : "linear-gradient(145deg,#FFFFFF,#F2FBF7) !important", "&:hover": { borderColor: `${aliareColors.green} !important`, boxShadow: "0 12px 30px rgba(0,199,142,.10)" } }}><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}><Typography sx={{ fontWeight: 850 }}>{item.analyst}</Typography><Tooltip title="Mostra volume e temas do período para orientar apoio técnico e compartilhamento de conhecimento."><InfoOutlined sx={{ fontSize: 17, color: "text.secondary" }} /></Tooltip></Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", rowGap: .6 }}><Chip size="small" label={`${item.tickets} tickets`} /><Chip size="small" color={item.stale ? "warning" : "success"} label={`${item.stale} sem movimento`} /><Chip size="small" variant="outlined" label={`${item.linkedTasks ?? 0} Tasks vinculadas`} />{Boolean(item.blockedTasks) && <Chip size="small" color="warning" label={`${item.blockedTasks} bloqueadas`} />}</Stack>
          <Stack spacing={.4} sx={{ mt: 1.2 }}>{item.themes.map((theme) => <Typography key={theme.topic} variant="caption" color="text.secondary">• {theme.topic}: <b>{theme.count}</b></Typography>)}</Stack>
        </CardContent></Card>)}
      </Box>
    </Box>}

    <Drawer anchor="right" open={Boolean(drawer)} onClose={() => setDrawer(null)} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
      {drawer && <DetailPanelHeader eyebrow="Liderança técnica" title={drawer.title} onClose={() => setDrawer(null)} />}
      {drawer && <Box sx={{ px: 2, pt: 1.5 }}>
        <ExportTicketsButton tickets={drawerExportRows} title={drawer.title} subtitle="Central de Liderança Técnica" />
      </Box>}
      {drawer?.kind === "radar" && <DetailSection title="Itens para investigação">
        <Stack spacing={1}>{drawer.items.map((item) => <Button key={isTask(item) ? `task-${item.id}` : `ticket-${item.id}`} variant="outlined" endIcon={<OpenInNewOutlined />} onClick={() => openItem(item)} sx={{ justifyContent: "space-between", textAlign: "left", textTransform: "none" }}>
          <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 800 }}>{isTask(item) ? `#${item.id} · ${item.title}` : `#${item.movideskId} · ${item.subject}`}</Typography><Typography variant="caption" color="text.secondary">{[isTask(item) ? item.state : item.status, item.client, isTask(item) ? item.assignedToName : item.owner].filter(Boolean).join(" · ")}</Typography></Box>
        </Button>)}</Stack>
        {!drawer.items.length && <Alert severity="success">Nenhum item neste recorte.</Alert>}
      </DetailSection>}
      {drawer?.kind === "audit" && <DetailSection title="Revisão humana recomendada"><Stack spacing={1}>{drawer.items.map((ticket) => <Card key={ticket.id} variant="outlined"><CardContent><Typography sx={{ fontWeight: 850 }}>#{ticket.movideskId} · {ticket.subject}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{ticket.reason}</Typography><DetailFieldGrid fields={[["Categoria", ticket.category ?? "Não informado"], ["Causa", ticket.cause ?? "Não informado"], ["Responsável", ticket.owner ?? "Não informado"], ["Cliente", ticket.client ?? "Não informado"]]} /><Button sx={{ mt: 1 }} endIcon={<OpenInNewOutlined />} onClick={() => openItem(ticket)}>Abrir atendimento</Button></CardContent></Card>)}</Stack></DetailSection>}
      {drawer?.kind === "recurrence" && <><DetailSection title="Diagnóstico"><DetailFieldGrid fields={[["Ocorrências", drawer.recurrence.count], ["Período anterior", drawer.recurrence.previous], ["Clientes", drawer.recurrence.clients.join(", ") || "—"], ["Analistas", drawer.recurrence.analysts.join(", ") || "—"]]} /></DetailSection><DetailSection title="Ação sugerida"><Alert severity="info">{drawer.recurrence.action}</Alert></DetailSection><DetailSection title="Evidências"><Stack spacing={1}>{drawer.recurrence.examples.map((ticket) => <Button key={ticket.id} variant="outlined" onClick={() => openItem(ticket)} endIcon={<OpenInNewOutlined />} sx={{ justifyContent: "space-between" }}>#{ticket.movideskId} · {ticket.subject}</Button>)}</Stack></DetailSection></>}
      {drawer?.kind === "gap" && <><DetailSection title="Diagnóstico do ponto de atenção"><Alert severity={drawer.gap.confidence === "Alta" ? "success" : "info"} sx={{ mb: 1.5 }}>O nível de confiança representa a quantidade de evidências independentes encontradas. A decisão final continua dependendo de validação da liderança.</Alert><DetailFieldGrid fields={[["Identificador", drawer.gap.id], ["Origem do sinal", drawer.gap.type], ["Prioridade", drawer.gap.impact], ["Status da análise", drawer.gap.status], ["Confiança", drawer.gap.confidence ?? "—"], ["Tickets relacionados", drawer.gap.ticketCount ?? 0], ["Vínculos Azure", drawer.gap.azureLinked ?? 0], ["Tasks bloqueadas", drawer.gap.blockedLinked ?? 0]]} /></DetailSection><DetailSection title="Evidências cruzadas"><Typography variant="body2">{drawer.gap.evidence}</Typography>{Boolean(drawer.gap.examples?.length) && <Stack spacing={.8} sx={{ mt: 1.2 }}>{drawer.gap.examples!.map((ticket) => <Button key={ticket.id} variant="outlined" endIcon={<OpenInNewOutlined />} onClick={() => openItem(ticket)} sx={{ justifyContent: "space-between", textAlign: "left", textTransform: "none" }}>#{ticket.movideskId} · {ticket.subject}</Button>)}</Stack>}</DetailSection>{Boolean(drawer.gap.tasks?.length) && <DetailSection title="Tasks Azure relacionadas"><Stack spacing={.8}>{drawer.gap.tasks!.map((task) => <Button key={task.id} variant="outlined" onClick={() => openItem(task)} sx={{ justifyContent: "space-between", textTransform: "none" }}>Task #{task.id} · {task.title}<Chip size="small" label={task.state} /></Button>)}</Stack></DetailSection>}<DetailSection title="Próxima ação sugerida"><Alert severity="info">{drawer.gap.action}</Alert></DetailSection></>}
      {drawer?.kind === "development" && <><DetailSection title="Visão técnica"><DetailFieldGrid fields={[["Analista", drawer.development.analyst], ["Tickets no período", drawer.development.tickets], ["Sem movimento", drawer.development.stale], ["Tasks vinculadas", drawer.development.linkedTasks ?? 0], ["Tasks concluídas", drawer.development.finishedTasks ?? 0], ["Tasks bloqueadas", drawer.development.blockedTasks ?? 0]]} /></DetailSection><DetailSection title="Temas mais frequentes"><Stack spacing={.8}>{drawer.development.themes.map((theme) => <Box key={theme.topic} sx={{ p: 1, borderRadius: 1.5, bgcolor: "background.default" }}><Typography variant="body2"><b>{theme.topic}</b> · {theme.count}</Typography></Box>)}</Stack></DetailSection>{Boolean(drawer.development.examples?.length) && <DetailSection title="Atendimentos do período"><Stack spacing={.8}>{drawer.development.examples!.map((ticket) => <Button key={ticket.id} variant="outlined" endIcon={<OpenInNewOutlined />} onClick={() => openItem(ticket)} sx={{ justifyContent: "space-between", textTransform: "none" }}>#{ticket.movideskId} · {ticket.subject}</Button>)}</Stack></DetailSection>}</>}
    </Drawer>
  </Box>;
}
