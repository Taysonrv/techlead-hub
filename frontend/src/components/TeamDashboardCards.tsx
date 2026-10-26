import { useMemo, useState } from "react";
import { Box, Card, CardContent, Chip, FormControl, MenuItem, Select, Stack, Typography } from "@mui/material";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type DashboardTicket = {
  movideskId: number;
  owner?: string | null;
  status?: string | null;
  baseStatus?: string | null;
  createdDate: string;
  resolvedDate?: string | null;
  closedDate?: string | null;
  satisfactionScore?: number | null;
  satisfactionComment?: string | null;
  satisfactionDate?: string | null;
};

type Period = { start: Date; end: Date };
type Override = "global" | "month" | "7d" | "30d";
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
const pending = (ticket: DashboardTicket) => {
  const state = (ticket.baseStatus || ticket.status || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return !["resolved", "closed", "canceled", "cancelled", "resolvido", "fechado", "cancelado"].includes(state);
};
const cardSx = { border: "1px solid", borderColor: "divider", borderRadius: 3, boxShadow: "0 12px 32px rgba(0,0,0,.045)", backgroundImage: "none" };
function PeriodChoice({ value, onChange }: { value: Override; onChange: (next: Override) => void }) {
  return <FormControl size="small"><Select aria-label="Período do indicador" value={value} onChange={(event) => onChange(event.target.value as Override)} sx={{ fontSize: 12, minWidth: 125 }}>
    <MenuItem value="global">Filtro geral</MenuItem><MenuItem value="month">Este mês*</MenuItem><MenuItem value="7d">Últimos 7 dias*</MenuItem><MenuItem value="30d">Últimos 30 dias*</MenuItem>
  </Select></FormControl>;
}
export function TeamDashboardCards({ tickets, period, onOpenTickets, isDark }: { tickets: DashboardTicket[]; period: Period; onOpenTickets: OpenTickets; isDark: boolean }) {
  const [backlogPeriod, setBacklogPeriod] = useState<Override>("global");
  const [agentPeriod, setAgentPeriod] = useState<Override>("global");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [agentMetric, setAgentMetric] = useState<"resolved" | "closed" | "evaluated">("resolved");
  const backlogBounds = useMemo(() => bounds(backlogPeriod, period), [backlogPeriod, period]);
  const agentBounds = useMemo(() => bounds(agentPeriod, period), [agentPeriod, period]);

  // Current statuses are not historical snapshots. For past dates, display a reconstructed estimate.
  const backlog = useMemo(() => {
    const points: { day: string; total: number; date: Date }[] = [];
    const cursor = new Date(backlogBounds.start);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(backlogBounds.end);
    last.setHours(0, 0, 0, 0);
    for (let i = 0; i < 366 && cursor <= last; i++, cursor.setDate(cursor.getDate() + 1)) {
      const at = new Date(cursor);
      at.setHours(23, 59, 59, 999);
      const total = tickets.filter((ticket) => {
        const opened = validDate(ticket.createdDate);
        if (!opened || opened > at) return false;
        const closed = validDate(ticket.closedDate);
        const resolved = validDate(ticket.resolvedDate);
        return (!closed || closed > at) && (!resolved || resolved > at) && (at < new Date() || pending(ticket));
      }).length;
      points.push({ day: String(cursor.getDate()), date: new Date(cursor), total });
    }
    return points;
  }, [tickets, backlogBounds]);
  const chartGrid = isDark ? "rgba(148,163,184,.18)" : "#E4E7EC";
  const chartText = isDark ? "#C8D5E3" : "#526477";
  const tooltipStyle = { backgroundColor: isDark ? "#102b3b" : "#FFFFFF", color: isDark ? "#EAF4FF" : "#15263A", border: `1px solid ${isDark ? "#2b5362" : "#E4E7EC"}`, borderRadius: 10 };
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
  const openBacklog = (date?: Date) => {
    const at = date ? new Date(date) : new Date();
    at.setHours(23, 59, 59, 999);
    const selected = tickets.filter((ticket) => {
      if (!date) return pending(ticket);
      const created = validDate(ticket.createdDate);
      const resolved = validDate(ticket.resolvedDate);
      const closed = validDate(ticket.closedDate);
      return Boolean(created && created <= at && (!resolved || resolved > at) && (!closed || closed > at) && (at < new Date() || pending(ticket)));
    });
    onOpenTickets(date ? `Backlog estimado em ${date.toLocaleDateString("pt-BR")}` : "Backlog atual", selected.map((ticket) => ticket.movideskId), date ? "Estimativa pelas datas de abertura e conclusão; reaberturas podem alterar o total." : "Tickets atualmente pendentes na base importada.");
  };
  const openAgent = (owner: string, metric: "resolved" | "closed" | "evaluated") => {
    const field = metric === "resolved" ? "resolvedDate" : "closedDate";
    const selected = tickets.filter((ticket) => (ticket.owner?.trim() || "Sem responsável") === owner && (metric === "evaluated" ? hasEvaluation(ticket) && between(ticket.satisfactionDate || ticket.closedDate || ticket.resolvedDate, agentBounds) : between(ticket[field], agentBounds)));
    onOpenTickets(`${metric === "resolved" ? "Resolvidos" : metric === "closed" ? "Fechados" : "Avaliados"} · ${owner}`, selected.map((ticket) => ticket.movideskId), "Responsável atual do ticket; o agente que executou a ação pode ser diferente.");
  };

  return <Box component="section" aria-label="Indicadores de backlog e resolução por agente" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2, mb: 2 }}>
    <Card sx={{ ...cardSx, minWidth: 0, bgcolor: "background.paper", color: "text.primary" }}><CardContent sx={{ p: { xs: 1.5, sm: 2 }, "&:last-child": { pb: 1.5 } }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Box><Typography variant="h6" sx={{ fontWeight: 800 }}>Tickets pendentes · Backlog</Typography><Typography variant="caption" color="text.secondary">Evolução diária estimada a partir das datas de abertura e conclusão</Typography></Box>
        <PeriodChoice value={backlogPeriod} onChange={setBacklogPeriod} />
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5, flexWrap: "wrap" }}><Chip clickable onClick={() => openBacklog()} color="warning" label={`Backlog atual: ${currentBacklog}`} /><Chip size="small" variant="outlined" label="Histórico estimado" /></Stack>
      <Box sx={{ height: 310, minWidth: 0 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={backlog} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}><CartesianGrid stroke={chartGrid} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" fontSize={11} tick={{ fill: chartText }} /><YAxis allowDecimals={false} fontSize={11} tick={{ fill: chartText }} /><Tooltip contentStyle={tooltipStyle} labelStyle={{ color: chartText }} labelFormatter={(_label, payload) => payload?.[0]?.payload?.date?.toLocaleDateString("pt-BR") ?? ""} /><Bar dataKey="total" name="Pendentes" fill="#168cbd" radius={[4, 4, 0, 0]} maxBarSize={32} cursor="pointer" onClick={(data) => { const date = data?.payload?.date; if (date) openBacklog(new Date(date)); }} /></BarChart></ResponsiveContainer></Box>
      <Typography variant="caption" color="text.secondary">Clique em uma barra para consultar os tickets daquele dia. * Períodos locais terminam na data final do filtro geral. O histórico exato do Movidesk exige snapshots diários de status.</Typography>
    </CardContent></Card>
    <Card sx={{ ...cardSx, minWidth: 0 }}><CardContent sx={{ p: { xs: 1.5, sm: 2 }, "&:last-child": { pb: 1.5 } }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Box><Typography variant="h6" sx={{ fontWeight: 800 }}>Indicador de resolução por agente</Typography><Typography variant="caption" color="text.secondary">Eventos de resolução e fechamento no período selecionado</Typography></Box>
        <PeriodChoice value={agentPeriod} onChange={setAgentPeriod} />
      </Stack>
      <Stack direction="row" sx={{ gap: 1, alignItems: "center", mb: 0.5, flexWrap: "wrap" }}><FormControl size="small" sx={{ width: { xs: "100%", sm: 205 }, maxWidth: "100%", minWidth: 0 }}><Select aria-label="Filtrar agente" sx={{ fontSize: 12 }} value={selectedAgent} onChange={(event) => setSelectedAgent(event.target.value)}><MenuItem value="all">Todos os agentes</MenuItem>{agents.map((item) => <MenuItem key={item.owner} value={item.owner}>{item.owner}</MenuItem>)}</Select></FormControl><Chip size="small" clickable color={agentMetric === "resolved" ? "primary" : "default"} onClick={() => setAgentMetric("resolved")} label="Resolvidos" /><Chip size="small" clickable color={agentMetric === "closed" ? "success" : "default"} onClick={() => setAgentMetric("closed")} label="Fechados" /><Chip size="small" clickable color={agentMetric === "evaluated" ? "success" : "default"} onClick={() => setAgentMetric("evaluated")} label="Avaliados" /></Stack>
      <Box sx={{ height: 310, minWidth: 0 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={visibleAgents} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="owner" tick={{ fill: chartText }} fontSize={10} tickFormatter={(name: string) => name.split(" ").slice(0, 2).join(" ")} angle={-25} textAnchor="end" interval={0} height={72} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip contentStyle={tooltipStyle} labelStyle={{ color: chartText }} /><Bar dataKey={agentMetric} name={agentMetric === "resolved" ? "Resolvidos" : agentMetric === "closed" ? "Fechados" : "Avaliados"} fill={agentMetric === "resolved" ? "#0c5366" : agentMetric === "closed" ? "#23c58e" : "#b5e62c"} radius={[4, 4, 0, 0]} maxBarSize={44} cursor="pointer" onClick={(data) => { const owner = data?.payload?.owner; if (owner) openAgent(String(owner), agentMetric); }} /></BarChart></ResponsiveContainer></Box>
      <Typography variant="caption" color="text.secondary">Avaliados = tickets com avaliação registrada, com ou sem comentário. Os valores usam o responsável atual; o histórico do Movidesk é necessário para atribuir cada ação ao agente correto.</Typography>
    </CardContent></Card>
  </Box>;
}
