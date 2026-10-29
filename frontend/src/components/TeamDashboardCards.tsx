import { useMemo, useState } from "react";
import { Box, Card, CardContent, Chip, FormControl, MenuItem, Select, Stack, Typography } from "@mui/material";
import { InsightsOutlined, PendingActionsOutlined, TrendingDownOutlined, TrendingUpOutlined } from "@mui/icons-material";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { isOperationallyOpen } from "../utils/operationalMetrics";
import { analyticalPanelSx } from "../theme/layoutTokens";

export type DashboardTicket = {
  movideskId: number;
  owner?: string | null;
  status?: string | null;
  baseStatus?: string | null;
  createdDate: string;
  reopenedDate?: string | null;
  resolvedDate?: string | null;
  closedDate?: string | null;
  canceledDate?: string | null;
  satisfactionScore?: number | null;
  satisfactionComment?: string | null;
  satisfactionDate?: string | null;
};

type Period = { start: Date; end: Date };
type Override = "global" | "month" | "7d" | "30d";
type AgentMetric = "resolved" | "closed" | "evaluated";
type OpenTickets = (title: string, ticketIds: number[], subtitle: string) => void;
const validDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};
const between = (value: string | null | undefined, period: Period) => {
  const date = validDate(value);
  return Boolean(date && date >= period.start && date <= period.end);
};
const bounds = (selection: Override, global: Period): Period => {
  if (selection === "global") return global;
  const end = new Date(global.end);
  const start = new Date(end);
  if (selection === "month") start.setDate(1);
  else start.setDate(start.getDate() - (selection === "7d" ? 6 : 29));
  start.setHours(0, 0, 0, 0);
  return { start, end };
};
const pending = isOperationallyOpen;
function estimatedBacklogAt(ticket: DashboardTicket, at: Date, today: Date) {
  const created = validDate(ticket.createdDate);
  if (!created || created > at) return false;

  const dayStart = new Date(at);
  dayStart.setHours(0, 0, 0, 0);
  if (dayStart >= today) return pending(ticket);

  const reopened = validDate(ticket.reopenedDate);
  const cycleStart = reopened && reopened > created ? reopened : created;
  if (cycleStart > at) return false;
  if (pending(ticket)) return true;

  const terminalDates = [validDate(ticket.resolvedDate), validDate(ticket.closedDate), validDate(ticket.canceledDate)]
    .filter((date): date is Date => Boolean(date && date >= cycleStart))
    .sort((a, b) => a.getTime() - b.getTime());
  return Boolean(terminalDates[0] && terminalDates[0] > at);
}
function buildBacklogSeries(tickets: DashboardTicket[], period: Period) {
  const starts: Date[] = [];
  const ends: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(period.start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(period.end);
  last.setHours(0, 0, 0, 0);
  for (let i = 0; i < 366 && cursor <= last; i++, cursor.setDate(cursor.getDate() + 1)) {
    starts.push(new Date(cursor));
    const end = new Date(cursor);
    end.setHours(23, 59, 59, 999);
    ends.push(end);
  }

  const firstDayAtOrAfter = (date: Date) => {
    let low = 0;
    let high = ends.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ends[middle].getTime() < date.getTime()) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  let currentStart = 0;
  while (currentStart < starts.length && starts[currentStart] < today) currentStart += 1;
  const changes = new Int32Array(starts.length + 1);
  const addRange = (from: number, to: number) => {
    const first = Math.max(0, Math.min(starts.length, from));
    const afterLast = Math.max(first, Math.min(starts.length, to));
    if (first >= afterLast) return;
    changes[first] += 1;
    changes[afterLast] -= 1;
  };

  for (const ticket of tickets) {
    const created = validDate(ticket.createdDate);
    if (!created) continue;
    if (pending(ticket)) {
      const reopened = validDate(ticket.reopenedDate);
      const historicalStart = reopened && reopened > created ? reopened : created;
      addRange(firstDayAtOrAfter(historicalStart), currentStart);
      addRange(Math.max(firstDayAtOrAfter(created), currentStart), starts.length);
      continue;
    }

    const reopened = validDate(ticket.reopenedDate);
    const cycleStart = reopened && reopened > created ? reopened : created;
    const terminal = [validDate(ticket.resolvedDate), validDate(ticket.closedDate), validDate(ticket.canceledDate)]
      .filter((date): date is Date => Boolean(date && date >= cycleStart))
      .reduce<Date | null>((first, date) => !first || date < first ? date : first, null);
    if (terminal) addRange(firstDayAtOrAfter(cycleStart), Math.min(firstDayAtOrAfter(terminal), currentStart));
  }

  let total = 0;
  return starts.map((date, index) => {
    total += changes[index];
    const dayNumber = date.getDate();
    const dayLabel = dayNumber === 1 || index === 0
      ? `${dayNumber}/${String(date.getMonth() + 1).padStart(2, "0")}`
      : String(dayNumber);
    return { day: dayLabel, date, total };
  });
}
function PeriodChoice({ value, onChange }: { value: Override; onChange: (next: Override) => void }) {
  return <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 148 }, maxWidth: "100%" }}><Select aria-label="Período do indicador" value={value} onChange={(event) => onChange(event.target.value as Override)} sx={{ fontSize: 12, minWidth: 0, height: 38 }}>
    <MenuItem value="global">Filtro geral</MenuItem><MenuItem value="month">Este mês*</MenuItem><MenuItem value="7d">Últimos 7 dias*</MenuItem><MenuItem value="30d">Últimos 30 dias*</MenuItem>
  </Select></FormControl>;
}
export function TeamDashboardCards({ tickets, period, onOpenTickets, isDark }: { tickets: DashboardTicket[]; period: Period; onOpenTickets: OpenTickets; isDark: boolean }) {
  const [backlogPeriod, setBacklogPeriod] = useState<Override>("global");
  const [agentPeriod, setAgentPeriod] = useState<Override>("global");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [hiddenAgentMetrics, setHiddenAgentMetrics] = useState<Set<AgentMetric>>(() => new Set());
  const backlogBounds = useMemo(() => bounds(backlogPeriod, period), [backlogPeriod, period]);
  const agentBounds = useMemo(() => bounds(agentPeriod, period), [agentPeriod, period]);

  // Current statuses are not historical snapshots. For past dates, display a reconstructed estimate.
  const backlog = useMemo(() => {
    return buildBacklogSeries(tickets, backlogBounds);
  }, [tickets, backlogBounds]);
  const chartGrid = isDark ? "rgba(148,163,184,.18)" : "#E4E7EC";
  const chartText = isDark ? "#C8D5E3" : "#526477";
  const tooltipStyle = { backgroundColor: isDark ? "#0B1E30" : "#FFFFFF", color: isDark ? "#EAF4FF" : "#15263A", border: `1px solid ${isDark ? "rgba(56,189,248,.32)" : "#D8E3EC"}`, borderRadius: 12, boxShadow: isDark ? "0 18px 38px rgba(0,0,0,.38)" : "0 14px 34px rgba(15,23,42,.14)" };
  const hasEvaluation = (ticket: DashboardTicket) => ticket.satisfactionScore != null || Boolean(ticket.satisfactionDate || ticket.satisfactionComment?.trim());
  const agents = useMemo(() => {
    const byOwner = new Map<string, { owner: string; resolved: number; closed: number; pending: number; evaluated: number }>();
    for (const ticket of tickets) {
      const owner = ticket.owner?.trim() || "Sem responsável";
      const item = byOwner.get(owner) ?? { owner, resolved: 0, closed: 0, pending: 0, evaluated: 0 };
      if (between(ticket.resolvedDate, agentBounds)) item.resolved++;
      if (between(ticket.closedDate, agentBounds)) item.closed++;
      if (pending(ticket)) item.pending++;
      if (hasEvaluation(ticket) && between(ticket.satisfactionDate || ticket.closedDate || ticket.resolvedDate, agentBounds)) item.evaluated++;
      byOwner.set(owner, item);
    }
    return [...byOwner.values()].filter((item) => item.resolved || item.closed || item.evaluated).sort((a, b) => b.resolved - a.resolved);
  }, [tickets, agentBounds]);
  const visibleAgents = selectedAgent === "all" ? agents : agents.filter((item) => item.owner === selectedAgent);
  const currentBacklog = tickets.filter(pending).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const latestBacklogPoint = backlog.at(-1);
  const isCurrentDayVisible = Boolean(latestBacklogPoint && latestBacklogPoint.date.toDateString() === today.toDateString());
  const previousBacklogPoint = isCurrentDayVisible ? backlog.at(-2) : undefined;
  const backlogDelta = previousBacklogPoint ? currentBacklog - previousBacklogPoint.total : null;
  const agentTotals = visibleAgents.reduce((totals, agent) => ({ resolved: totals.resolved + agent.resolved, closed: totals.closed + agent.closed, evaluated: totals.evaluated + agent.evaluated }), { resolved: 0, closed: 0, evaluated: 0 });
  const leadingAgent = hiddenAgentMetrics.has("resolved") ? undefined : [...visibleAgents].sort((a, b) => b.resolved - a.resolved)[0];
  const agentMetricOptions: Array<{ key: AgentMetric; label: string; color: string }> = [
    { key: "resolved", label: "Resolvidos", color: isDark ? "#67D8EF" : "#087E9E" },
    { key: "closed", label: "Fechados", color: isDark ? "#46D6A0" : "#07875D" },
    { key: "evaluated", label: "Avaliados", color: isDark ? "#C6ED53" : "#789900" },
  ];
  const toggleAgentMetric = (key: AgentMetric) => setHiddenAgentMetrics((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const cardSx = {
    ...analyticalPanelSx,
    borderRadius: { xs: 2.5, md: 3.25 },
    borderColor: isDark ? "rgba(56,189,248,.20)" : "rgba(30,96,130,.14)",
    background: isDark
      ? "radial-gradient(ellipse at 100% 0%, rgba(37,180,205,.13), transparent 35%), linear-gradient(145deg, #0C2134 0%, #0A1829 58%, #0D2032 100%)"
      : "radial-gradient(ellipse at 100% 0%, rgba(35,173,191,.10), transparent 36%), linear-gradient(145deg, #FFFFFF 0%, #F7FBFD 58%, #F2F8FA 100%)",
    boxShadow: isDark ? "0 18px 48px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.035)" : "0 18px 42px rgba(21,54,76,.07), inset 0 1px 0 rgba(255,255,255,.8)",
    "&:before": { content: '""', position: "absolute", inset: "0 0 auto", height: 2, background: "linear-gradient(90deg, transparent, rgba(42,205,201,.9), rgba(56,189,248,.75), transparent)", opacity: isDark ? .8 : .58 },
    "&:hover": { borderColor: isDark ? "rgba(56,189,248,.38)" : "rgba(30,140,166,.32)", boxShadow: isDark ? "0 24px 58px rgba(0,0,0,.28), 0 0 32px rgba(28,178,198,.07)" : "0 22px 48px rgba(21,54,76,.10)" },
  } as const;
  const metricSx = {
    flex: "1 1 145px", minWidth: 0, px: 1.5, py: 1.15, borderRadius: 2,
    border: `1px solid ${isDark ? "rgba(139,186,211,.13)" : "rgba(30,96,130,.10)"}`,
    background: isDark ? "linear-gradient(140deg, rgba(18,47,68,.78), rgba(11,29,48,.72))" : "linear-gradient(140deg, rgba(255,255,255,.9), rgba(240,248,250,.82))",
  } as const;
  const openBacklog = (date?: Date) => {
    const at = date ? new Date(date) : new Date();
    at.setHours(23, 59, 59, 999);
    const selected = tickets.filter((ticket) => {
      if (!date) return pending(ticket);
      return estimatedBacklogAt(ticket, at, today);
    });
    onOpenTickets(date ? `Backlog estimado em ${date.toLocaleDateString("pt-BR")}` : "Backlog atual", selected.map((ticket) => ticket.movideskId), date ? "Estimativa pelas datas de abertura e conclusão; reaberturas podem alterar o total." : "Tickets atualmente pendentes na base importada.");
  };
  const openAgent = (owner: string, metric: "resolved" | "closed" | "evaluated") => {
    const field = metric === "resolved" ? "resolvedDate" : "closedDate";
    const selected = tickets.filter((ticket) => (ticket.owner?.trim() || "Sem responsável") === owner && (metric === "evaluated" ? hasEvaluation(ticket) && between(ticket.satisfactionDate || ticket.closedDate || ticket.resolvedDate, agentBounds) : between(ticket[field], agentBounds)));
    onOpenTickets(`${metric === "resolved" ? "Resolvidos" : metric === "closed" ? "Fechados" : "Avaliados"} · ${owner}`, selected.map((ticket) => ticket.movideskId), "Responsável atual do ticket; o agente que executou a ação pode ser diferente.");
  };

  return <Box component="section" aria-label="Indicadores de backlog e resolução por agente" sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: { xs: 1.5, md: 2 }, mb: 2 }}>
    <Card sx={cardSx}><CardContent sx={{ height: "100%", display: "flex", flexDirection: "column", p: { xs: 1.5, sm: 2.5, lg: 3 }, "&:last-child": { pb: { xs: 1.5, sm: 2.5, lg: 3 } } }}>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" }, gap: 1.5, mb: 2 }}>
        <Stack direction="row" spacing={1.4} sx={{ minWidth: 0, alignItems: "center" }}>
          <Box sx={{ width: 44, height: 44, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 2, color: isDark ? "#69D8F3" : "#087E9E", bgcolor: isDark ? "rgba(56,189,248,.11)" : "rgba(8,126,158,.09)", border: `1px solid ${isDark ? "rgba(56,189,248,.18)" : "rgba(8,126,158,.14)"}` }}><PendingActionsOutlined /></Box>
          <Box sx={{ minWidth: 0 }}><Typography variant="overline" sx={{ color: isDark ? "#66D5E8" : "#087E9E", fontWeight: 850, letterSpacing: ".12em", lineHeight: 1.25 }}>Carteira · posição diária</Typography><Typography variant="h6" sx={{ fontWeight: 850, letterSpacing: "-.025em", lineHeight: 1.25 }}>Tickets pendentes · Backlog</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .25 }}>Evolução do estoque ativo de atendimentos</Typography></Box>
        </Stack>
        <Box sx={{ width: { xs: "100%", sm: 178 }, flexShrink: 0 }}><PeriodChoice value={backlogPeriod} onChange={setBacklogPeriod} /></Box>
      </Stack>
      <Stack direction="row" useFlexGap spacing={1} sx={{ mb: 1.5, flexWrap: "wrap" }}>
        <Box component="button" onClick={() => openBacklog()} sx={{ ...metricSx, textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit", "&:hover": { borderColor: isDark ? "rgba(56,189,248,.38)" : "rgba(8,126,158,.32)", transform: "translateY(-1px)" }, "&:focus-visible": { outline: `3px solid ${isDark ? "#38BDF8" : "#087E9E"}`, outlineOffset: 2 }, transition: "all .18s ease" }}><Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 750 }}>BACKLOG ATUAL</Typography><Stack direction="row" spacing={.75} sx={{ alignItems: "baseline", mt: .25 }}><Typography sx={{ fontSize: { xs: "1.55rem", md: "1.85rem" }, lineHeight: 1.1, fontWeight: 900, letterSpacing: "-.04em", color: isDark ? "#7DD3FC" : "#087E9E" }}>{currentBacklog}</Typography><Typography variant="caption" color="text.secondary">tickets</Typography></Stack></Box>
        <Box sx={metricSx}><Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 750 }}>VARIAÇÃO DIÁRIA</Typography><Stack direction="row" spacing={.75} sx={{ alignItems: "center", mt: .55 }}>{backlogDelta === null ? <Typography variant="body2" sx={{ fontWeight: 800 }}>Sem comparação</Typography> : <><Box sx={{ color: backlogDelta > 0 ? "warning.main" : backlogDelta < 0 ? "success.main" : "text.secondary", display: "flex" }}>{backlogDelta > 0 ? <TrendingUpOutlined fontSize="small" /> : backlogDelta < 0 ? <TrendingDownOutlined fontSize="small" /> : null}</Box><Typography variant="h6" sx={{ fontWeight: 900, color: backlogDelta > 0 ? "warning.main" : backlogDelta < 0 ? "success.main" : "text.secondary" }}>{backlogDelta > 0 ? "+" : ""}{backlogDelta}</Typography><Typography variant="caption" color="text.secondary">vs. dia anterior</Typography></>}</Stack></Box>
        <Box sx={{ ...metricSx, display: "flex", flexDirection: "column", justifyContent: "center" }}><Chip size="small" icon={<InsightsOutlined />} label="Histórico estimado" variant="outlined" sx={{ alignSelf: "flex-start", fontWeight: 750, borderColor: isDark ? "rgba(56,189,248,.25)" : "rgba(8,126,158,.20)" }} /><Typography variant="caption" color="text.secondary" sx={{ mt: .65 }}>Hoje: snapshot dos status abertos</Typography></Box>
      </Stack>
      <Box sx={{ height: { xs: 270, md: 330 }, minWidth: 0, flex: "0 0 auto", mt: .25, px: { xs: 0, sm: .5 } }}><ResponsiveContainer width="100%" height="100%"><BarChart data={backlog} margin={{ top: 12, right: 12, left: -12, bottom: 4 }}><defs><linearGradient id="backlogBarGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={isDark ? "#73E4F5" : "#18A9C4"} /><stop offset="100%" stopColor={isDark ? "#1684B4" : "#087E9E"} /></linearGradient></defs><CartesianGrid stroke={chartGrid} strokeDasharray="2 6" vertical={false} /><XAxis dataKey="day" fontSize={11} tick={{ fill: chartText }} tickLine={false} axisLine={{ stroke: chartGrid }} tickMargin={9} interval={backlog.length > 90 ? Math.ceil(backlog.length / 18) : backlog.length > 45 ? 2 : 0} /><YAxis allowDecimals={false} fontSize={11} tick={{ fill: chartText }} tickLine={false} axisLine={false} width={48} /><Tooltip cursor={{ fill: isDark ? "rgba(56,189,248,.10)" : "rgba(22,140,189,.08)" }} contentStyle={tooltipStyle} labelStyle={{ color: chartText, fontWeight: 800 }} labelFormatter={(_label, payload) => payload?.[0]?.payload?.date?.toLocaleDateString("pt-BR", { dateStyle: "full" }) ?? ""} formatter={(value) => [`${value} tickets`, "Backlog"]} /><Bar dataKey="total" name="Backlog" fill="url(#backlogBarGradient)" radius={[5, 5, 1, 1]} maxBarSize={38} cursor="pointer" onClick={(data) => { const date = data?.payload?.date; if (date) openBacklog(new Date(date)); }} /></BarChart></ResponsiveContainer></Box>
      <Box sx={{ mt: 1.1, px: 1.35, py: 1, borderRadius: 1.75, border: `1px solid ${isDark ? "rgba(139,186,211,.11)" : "rgba(30,96,130,.09)"}`, bgcolor: isDark ? "rgba(5,17,30,.34)" : "rgba(238,246,249,.68)" }}><Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55 }}>Os dias anteriores são estimativas reconstruídas por abertura, reabertura e conclusão; o Movidesk não fornece snapshots históricos diários. O dia atual usa os status operacionais abertos. Selecione uma barra para abrir os atendimentos considerados no cálculo.</Typography></Box>
    </CardContent></Card>
    <Card sx={cardSx}><CardContent sx={{ height: "100%", display: "flex", flexDirection: "column", p: { xs: 1.5, sm: 2.5, lg: 3 }, "&:last-child": { pb: { xs: 1.5, sm: 2.5, lg: 3 } } }}>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" }, gap: 1.5, mb: 2 }}>
        <Stack direction="row" spacing={1.4} sx={{ minWidth: 0, alignItems: "center" }}>
          <Box sx={{ width: 44, height: 44, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 2, color: isDark ? "#6EE7B7" : "#07875D", bgcolor: isDark ? "rgba(35,197,142,.11)" : "rgba(8,135,93,.08)", border: `1px solid ${isDark ? "rgba(35,197,142,.18)" : "rgba(8,135,93,.14)"}` }}><InsightsOutlined /></Box>
          <Box sx={{ minWidth: 0 }}><Typography variant="overline" sx={{ color: isDark ? "#6EE7B7" : "#07875D", fontWeight: 850, letterSpacing: ".12em", lineHeight: 1.25 }}>Entrega · período selecionado</Typography><Typography variant="h6" sx={{ fontWeight: 850, letterSpacing: "-.025em", lineHeight: 1.25 }}>Indicador de resolução por agente</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .25 }}>Volume de resoluções, fechamentos e avaliações registradas</Typography></Box>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={.8} sx={{ width: { xs: "100%", sm: "auto" }, minWidth: { sm: 340 }, maxWidth: { sm: 470 } }}>
          <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}><Select aria-label="Filtrar agente" sx={{ fontSize: 12, height: 40, borderRadius: 1.5, bgcolor: isDark ? "rgba(6,20,34,.48)" : "rgba(255,255,255,.78)" }} value={selectedAgent} onChange={(event) => setSelectedAgent(event.target.value)}><MenuItem value="all">Todos os agentes</MenuItem>{agents.map((item) => <MenuItem key={item.owner} value={item.owner}>{item.owner}</MenuItem>)}</Select></FormControl>
          <Box sx={{ width: { xs: "100%", sm: 174 }, flexShrink: 0 }}><PeriodChoice value={agentPeriod} onChange={setAgentPeriod} /></Box>
        </Stack>
      </Stack>
      <Stack direction="row" useFlexGap spacing={1} sx={{ mb: 1.25, flexWrap: "wrap" }}>
        {agentMetricOptions.filter((option) => !hiddenAgentMetrics.has(option.key)).map((option) => <Box key={option.key} sx={{ ...metricSx, flex: "1 1 130px", py: .95 }}><Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 750 }}>{option.label.toLocaleUpperCase("pt-BR")}</Typography><Typography sx={{ mt: .15, color: option.color, fontSize: "1.35rem", lineHeight: 1.15, fontWeight: 900 }}>{agentTotals[option.key]}</Typography></Box>)}
        {leadingAgent && <Box sx={{ ...metricSx, flex: "1 1 190px", py: .95 }}><Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 750 }}>MAIOR VOLUME DE RESOLUÇÕES</Typography><Typography variant="body2" noWrap sx={{ mt: .35, fontWeight: 850 }}>{leadingAgent.owner} · {leadingAgent.resolved}</Typography></Box>}
      </Stack>
      <Stack direction="row" useFlexGap spacing={.75} sx={{ alignItems: "center", flexWrap: "wrap", mb: .5 }} aria-label="Séries exibidas no gráfico">
        <Typography variant="caption" color="text.secondary" sx={{ mr: .25 }}>Exibir:</Typography>
        {agentMetricOptions.map((option) => {
          const active = !hiddenAgentMetrics.has(option.key);
          return <Chip key={option.key} clickable role="checkbox" aria-checked={active} label={option.label} size="small" variant={active ? "filled" : "outlined"} onClick={() => toggleAgentMetric(option.key)} icon={<Box component="span" sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: active ? option.color : "text.disabled", display: "inline-block" }} />} sx={{ fontWeight: 800, color: active ? (isDark ? "#EAF4FF" : "#173246") : "text.secondary", opacity: active ? 1 : .66, textDecoration: active ? "none" : "line-through", borderColor: active ? `${option.color}66` : "divider", bgcolor: active ? (isDark ? `${option.color}20` : `${option.color}14`) : "transparent", "&:hover": { bgcolor: active ? `${option.color}28` : "action.hover" }, "& .MuiChip-icon": { ml: 1 } }} />;
        })}
      </Stack>
      <Box sx={{ height: { xs: Math.max(300, visibleAgents.length * 54 + 68), md: Math.max(340, visibleAgents.length * 56 + 72) }, minWidth: 0, flex: "0 0 auto", mt: .25 }}>{visibleAgents.length && hiddenAgentMetrics.size < agentMetricOptions.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={visibleAgents} layout="vertical" barCategoryGap="22%" margin={{ top: 8, right: 24, left: 4, bottom: 8 }}><defs><linearGradient id="agentResolvedGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={isDark ? "#1684B4" : "#087E9E"} /><stop offset="100%" stopColor={isDark ? "#67D8EF" : "#25B8CE"} /></linearGradient><linearGradient id="agentClosedGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#07966C" /><stop offset="100%" stopColor="#46D6A0" /></linearGradient><linearGradient id="agentEvaluatedGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={isDark ? "#7EA51A" : "#789900"} /><stop offset="100%" stopColor={isDark ? "#C6ED53" : "#B1D94A"} /></linearGradient></defs><CartesianGrid stroke={chartGrid} strokeDasharray="2 6" horizontal={false} /><XAxis type="number" allowDecimals={false} fontSize={11} tick={{ fill: chartText }} tickLine={false} axisLine={{ stroke: chartGrid }} /><YAxis type="category" dataKey="owner" width={132} tick={{ fill: chartText, fontSize: 11, fontWeight: 700 }} tickLine={false} axisLine={false} tickFormatter={(name: string) => name.split(" ").slice(0, 2).join(" ")} /><Tooltip cursor={{ fill: isDark ? "rgba(56,189,248,.08)" : "rgba(22,140,189,.06)" }} contentStyle={tooltipStyle} labelStyle={{ color: chartText, fontWeight: 800 }} formatter={(value, name) => [`${value} tickets`, name]} />{!hiddenAgentMetrics.has("resolved") && <Bar dataKey="resolved" name="Resolvidos" fill="url(#agentResolvedGradient)" radius={[0, 6, 6, 0]} maxBarSize={17} cursor="pointer" onClick={(data) => { const owner = data?.payload?.owner; if (owner) openAgent(String(owner), "resolved"); }} />}{!hiddenAgentMetrics.has("closed") && <Bar dataKey="closed" name="Fechados" fill="url(#agentClosedGradient)" radius={[0, 6, 6, 0]} maxBarSize={17} cursor="pointer" onClick={(data) => { const owner = data?.payload?.owner; if (owner) openAgent(String(owner), "closed"); }} />}{!hiddenAgentMetrics.has("evaluated") && <Bar dataKey="evaluated" name="Avaliados" fill="url(#agentEvaluatedGradient)" radius={[0, 6, 6, 0]} maxBarSize={17} cursor="pointer" onClick={(data) => { const owner = data?.payload?.owner; if (owner) openAgent(String(owner), "evaluated"); }} />}</BarChart></ResponsiveContainer> : <Box sx={{ height: "100%", display: "grid", placeItems: "center", color: "text.secondary", textAlign: "center", px: 2 }}><Typography variant="body2">{visibleAgents.length ? "Todas as séries estão ocultas. Marque uma opção acima para voltar a exibir os dados." : "Sem resoluções, fechamentos ou avaliações neste período e filtro."}</Typography></Box>}</Box>
      <Box sx={{ mt: 1.1, px: 1.35, py: 1, borderRadius: 1.75, border: `1px solid ${isDark ? "rgba(139,186,211,.11)" : "rgba(30,96,130,.09)"}`, bgcolor: isDark ? "rgba(5,17,30,.34)" : "rgba(238,246,249,.68)" }}><Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55 }}>Use as opções acima para incluir ou retirar cada série; elas podem ser combinadas livremente. Clique em uma barra para consultar os tickets correspondentes. Avaliações incluem registros com ou sem comentário; a atribuição usa o responsável atual do ticket.</Typography></Box>
    </CardContent></Card>
  </Box>;
}
