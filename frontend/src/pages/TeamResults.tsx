import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Card, CardContent, Chip, FormControl, MenuItem, Select, Stack, TextField, Typography, Alert, CircularProgress } from "@mui/material";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getTicketSnapshot, getTicketSnapshotState, subscribeTicketSnapshotRefresh } from "../services/ticketSnapshot";
import { isOperationallyOpen } from "../utils/operationalMetrics";
import { FavoriteAction } from "../components/FavoriteAction";
import { TeamMeetingManagement } from "../components/TeamMeetingManagement";

type Ticket = {
  movideskId: number;
  ticketType?: number | null;
  owner?: string | null;
  createdDate: string;
  resolvedDate?: string | null;
  closedDate?: string | null;
  baseStatus?: string | null;
  satisfactionScore?: number | null;
};
type Period = "day" | "week" | "month" | "semester" | "year" | "custom";
const palette = ["#24BF90", "#39B8D5", "#F2B532", "#7A8FE8", "#E66B80", "#9E8ED7"];
const dateValue = (value?: string | null) => value ? new Date(value) : null;
const validDate = (date: Date | null) => date != null && Number.isFinite(date.getTime());
const inRange = (value: string | null | undefined, start: Date, end: Date) => {
  const date = dateValue(value);
  return validDate(date) && date! >= start && date! <= end;
};
function rangeFor(period: Period, startInput: string, endInput: string) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  if (period === "week") {
    const weekday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - weekday);
  } else if (period === "month") start.setDate(1);
  else if (period === "semester") start.setMonth(start.getMonth() < 6 ? 0 : 6, 1);
  else if (period === "year") start.setMonth(0, 1);
  else if (period === "custom") {
    const parse = (v: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
      const [y, m, d] = v.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
    };
    const a = parse(startInput);
    const b = parse(endInput);
    if (!a || !b || a > b) return null;
    b.setHours(23, 59, 59, 999);
    return { start: a, end: b };
  }
  return { start, end };
}
const formatDay = (date: Date) => date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const formatNumber = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const sectionSx = { borderRadius: 3, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", minWidth: 0 };
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <Card id={id} sx={{ ...sectionSx, scrollMarginTop: 100 }}><CardContent>
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
      <FavoriteAction title={title} targetId={id} />
    </Stack>{children}
  </CardContent></Card>;
}
function Metric({ title, value, subtitle }: { title: string; value: string | number; subtitle: string }) {
  return <Card sx={{ ...sectionSx, borderTop: "3px solid #24BF90" }}><CardContent>
    <Typography variant="body2" sx={{ fontWeight: 700 }}>{title}</Typography>
    <Typography variant="h4" sx={{ fontWeight: 850, my: 1, color: "primary.main" }}>{typeof value === "number" ? formatNumber(value) : value}</Typography>
    <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
  </CardContent></Card>;
}
export default function TeamResults() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("week");
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [owner, setOwner] = useState("all");
  const [presentation, setPresentation] = useState(false);
  const presentationRef = useRef<HTMLDivElement>(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const sections = ["team-results-comparison", "team-results-trend", "team-results-status", "team-results-owners", "team-results-backlog", "meeting-goals", "meeting-highlights", "meeting-actions", "team-results-actions"];
  const jump = (index: number) => { const next = Math.max(0, Math.min(sections.length - 1, index)); setSectionIndex(next); document.getElementById(sections[next])?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  useEffect(() => { const update = () => setPresentation(document.fullscreenElement === presentationRef.current); document.addEventListener("fullscreenchange", update); return () => document.removeEventListener("fullscreenchange", update); }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await getTicketSnapshot<Ticket>();
        if (!active) return;
        setTickets(data);
        setError(getTicketSnapshotState().lastErrorAt ? "Exibindo dados em cache: a última atualização falhou." : null);
      } catch {
        if (active) setError("Não foi possível carregar os dados da equipe.");
      } finally { if (active) setLoading(false); }
    };
    void load();
    const unsubscribe = subscribeTicketSnapshotRefresh(() => { void load(); });
    return () => { active = false; unsubscribe(); };
  }, []);

  const range = useMemo(() => rangeFor(period, startInput, endInput), [period, startInput, endInput]);
  const owners = useMemo(() => [...new Set(tickets.map(t => t.owner?.trim()).filter((v): v is string => Boolean(v)))].sort((a,b) => a.localeCompare(b,"pt-BR")), [tickets]);
  const scope = useMemo(() => tickets.filter(t => owner === "all" || t.owner === owner), [tickets, owner]);
  const results = useMemo(() => {
    if (!range) return null;
    const publicTickets = scope.filter(t => t.ticketType === 2);
    const opened = publicTickets.filter(t => inRange(t.createdDate, range.start, range.end));
    const resolved = publicTickets.filter(t => inRange(t.resolvedDate, range.start, range.end));
    const closed = publicTickets.filter(t => inRange(t.closedDate, range.start, range.end));
    const backlog = publicTickets.filter(isOperationallyOpen);
    const pendingOpened = opened.filter(isOperationallyOpen);
    const stopped = backlog.filter(t => (t.baseStatus || "").toLowerCase() === "stopped");
    const missingType = scope.filter(t => t.ticketType == null && isOperationallyOpen(t)).length;
    const agents = new Map<string, { name: string; opened: number; resolved: number; backlog: number }>();
    for (const t of publicTickets) {
      const name = t.owner?.trim() || "Sem responsável";
      const item = agents.get(name) || { name, opened: 0, resolved: 0, backlog: 0 };
      if (inRange(t.createdDate, range.start, range.end)) item.opened++;
      if (inRange(t.resolvedDate, range.start, range.end)) item.resolved++;
      if (isOperationallyOpen(t)) item.backlog++;
      agents.set(name, item);
    }
    const team = [...agents.values()].sort((a,b) => b.resolved - a.resolved).slice(0, 15);
    const timeline: { label: string; date: string; abertos: number; resolvidos: number }[] = [];
    const cursor = new Date(range.start);
    for (let i = 0; cursor <= range.end && i < 370; i++) {
      const dayStart = new Date(cursor);
      const dayEnd = new Date(cursor);
      dayEnd.setHours(23, 59, 59, 999);
      timeline.push({ label: formatDay(cursor), date: cursor.toISOString().slice(0,10),
        abertos: opened.filter(t => inRange(t.createdDate, dayStart, dayEnd)).length,
        resolvidos: resolved.filter(t => inRange(t.resolvedDate, dayStart, dayEnd)).length });
      cursor.setDate(cursor.getDate() + 1);
    }
    const chart = timeline.length > 70 ? timeline.reduce<typeof timeline>((acc, row, index) => {
      const bucket = Math.floor(index / 7);
      if (!acc[bucket]) acc[bucket] = { ...row };
      else { acc[bucket].abertos += row.abertos; acc[bucket].resolvidos += row.resolvidos; }
      return acc;
    }, []) : timeline;
    const satisfaction = scope.filter(t => inRange(t.closedDate || t.resolvedDate, range.start, range.end) && t.satisfactionScore != null);
    const good = satisfaction.filter(t => Number(t.satisfactionScore) >= 4).length;
    return { opened, resolved, closed, backlog, pendingOpened, stopped, missingType, team, chart, satisfaction, good };
  }, [scope, range]);

  const comparison = useMemo(() => {
    if (!range) return null;
    const duration = range.end.getTime() - range.start.getTime() + 1;
    const previousEnd = new Date(range.start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - duration + 1);
    const publicTickets = scope.filter(ticket => ticket.ticketType === 2);
    const count = (field: "createdDate" | "resolvedDate" | "closedDate", start: Date, end: Date) =>
      publicTickets.filter(ticket => inRange(ticket[field], start, end)).length;
    const opened = count("createdDate", previousStart, previousEnd);
    const resolved = count("resolvedDate", previousStart, previousEnd);
    const closed = count("closedDate", previousStart, previousEnd);
    return { opened, resolved, closed, previousStart, previousEnd };
  }, [scope, range]);
  const togglePresentation = async () => {
    if (!document.fullscreenElement) {
      try { await presentationRef.current?.requestFullscreen(); setPresentation(true); setSectionIndex(0); } catch { setPresentation(false); }
    } else { try { await document.exitFullscreen(); } finally { setPresentation(false); } }
  };
  const printReport = () => window.print();
  const changeLabel = (current: number, previous: number) =>
    previous === 0 ? current === 0 ? "0%" : "Novo (base anterior zero)" :
    `${current >= previous ? "+" : ""}${((current - previous) / previous * 100).toFixed(1).replace(".", ",")}%`;
  const donut = results ? [
    { name: "Em atendimento", value: results.backlog.filter(t => (t.baseStatus || "").toLowerCase() === "inattendance").length },
    { name: "Parados", value: results.stopped.length },
    { name: "Novos", value: results.backlog.filter(t => (t.baseStatus || "").toLowerCase() === "new").length },
  ] : [];
  return <Box ref={presentationRef} sx={{ px: { xs: 2, md: 3 }, py: 3, maxWidth: 1800, mx: "auto", bgcolor: "background.default", color: "text.primary", overflowY: presentation ? "auto" : "visible", height: presentation ? "100vh" : "auto", "& .recharts-wrapper": { maxWidth: "100%" }, "@media print": { maxWidth: "none", p: 1, overflow: "visible", height: "auto", "& .MuiCard-root": { breakInside: "avoid" } } }}>
    <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, mb: 3 }}>
      <Box><Typography variant="overline" color="primary.main" sx={{ fontWeight: 800 }}>REUNIÃO DE RESULTADOS</Typography>
        <Typography variant="h4" sx={{ fontWeight: 850 }}>Resultados da Equipe</Typography>
        <Typography color="text.secondary">Acompanhamento de volume, produtividade, carteira e prioridades da operação</Typography></Box>
      <Stack direction="row" spacing={1} sx={{ "@media print": { display: "none" } }}><Button variant="outlined" onClick={printReport}>Exportar / Salvar PDF</Button><Button variant="contained" onClick={() => void togglePresentation()}>{presentation ? "Sair da apresentação" : "Modo apresentação"}</Button></Stack>
    </Stack>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3, alignItems: { sm: "center" }, flexWrap: "wrap" }}>
      <FormControl size="small" sx={{ minWidth: 180 }}><Select aria-label="Período dos resultados" value={period} onChange={e => setPeriod(e.target.value as Period)}>
        <MenuItem value="day">Hoje</MenuItem><MenuItem value="week">Esta semana</MenuItem><MenuItem value="month">Este mês</MenuItem><MenuItem value="semester">Este semestre</MenuItem><MenuItem value="year">Este ano</MenuItem><MenuItem value="custom">Personalizado</MenuItem>
      </Select></FormControl>
      {period === "custom" && <><TextField size="small" label="De" type="date" value={startInput} onChange={e => setStartInput(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><TextField size="small" label="Até" type="date" value={endInput} onChange={e => setEndInput(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></>}
      <FormControl size="small" sx={{ minWidth: 210 }}><Select aria-label="Responsável" value={owner} onChange={e => setOwner(e.target.value)}>
        <MenuItem value="all">Toda a equipe</MenuItem>{owners.map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}
      </Select></FormControl>
      {range && <Chip label={`${range.start.toLocaleDateString("pt-BR")} a ${range.end.toLocaleDateString("pt-BR")}`} />}
    </Stack>
    {presentation && <Stack direction="row" spacing={1} sx={{ position: "sticky", top: 0, zIndex: 5, bgcolor: "background.paper", p: 1, borderRadius: 2, mb: 2, justifyContent: "space-between", "@media print": { display: "none" } }}><Button size="small" disabled={sectionIndex === 0} onClick={() => jump(sectionIndex - 1)}>Anterior</Button><Typography variant="body2" sx={{ alignSelf: "center" }}>Seção {sectionIndex + 1} de {sections.length}</Typography><Button size="small" disabled={sectionIndex === sections.length - 1} onClick={() => jump(sectionIndex + 1)}>Próxima</Button></Stack>}
    {loading && <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}><CircularProgress size={18} /><Typography>Carregando resultados...</Typography></Stack>}
    {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
    {!range && <Alert severity="info">Selecione um intervalo personalizado válido para apresentar os resultados.</Alert>}
    {results && <>
      {results.missingType > 0 && <Alert severity="info" sx={{ mb: 2 }}>{results.missingType} tickets pendentes sem classificação público/interno foram excluídos das métricas públicas. Confira a importação antes da reunião.</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 2, mb: 2 }}>
        <Metric title="Abertos no período" value={results.opened.length} subtitle="Tickets públicos criados" />
        <Metric title="Resolvidos" value={results.resolved.length} subtitle="Resoluções registradas no período" />
        <Metric title="Fechados" value={results.closed.length} subtitle="Encerramentos no período" />
        <Metric title="Backlog atual" value={results.backlog.length} subtitle="Estoque público ativo hoje" />
        <Metric title="Pendentes do período" value={results.pendingOpened.length} subtitle="Abertos no intervalo e ainda pendentes" />
        <Metric title="Parados" value={results.stopped.length} subtitle="Parte do backlog atual" />
        <Metric title="CSAT" value={results.satisfaction.length ? `${(100 * results.good / results.satisfaction.length).toFixed(1).replace(".",",")}%` : "—"} subtitle={`${results.satisfaction.length} avaliações disponíveis`} />
      </Box>
      {comparison && <Box sx={{ mb: 2 }}><Section id="team-results-comparison" title="Comparativo com período anterior">
        <Typography variant="caption" color="text.secondary">Período anterior equivalente: {comparison.previousStart.toLocaleDateString("pt-BR")} a {comparison.previousEnd.toLocaleDateString("pt-BR")}. Produtividade é representada por resoluções; não mede esforço ou horas trabalhadas.</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 1.5, mt: 2 }}>
          {[
            { label: "Entradas", current: results.opened.length, previous: comparison.opened },
            { label: "Resoluções / produtividade", current: results.resolved.length, previous: comparison.resolved },
            { label: "Fechamentos", current: results.closed.length, previous: comparison.closed },
          ].map(item => <Box key={item.label} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}><Typography variant="body2" fontWeight={700}>{item.label}</Typography><Typography variant="h5" fontWeight={800}>{item.current} <Typography component="span" variant="body2" color="text.secondary">vs. {item.previous}</Typography></Typography><Chip size="small" label={changeLabel(item.current, item.previous)} /></Box>)}
        </Box>
        <Typography variant="caption" color="text.secondary">Backlog histórico não comparado: a base atual não contém snapshots históricos confiáveis de estoque.</Typography>
      </Section></Box>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.5fr) minmax(0,1fr)" }, gap: 2, mb: 2 }}>
        <Section id="team-results-trend" title="Evolução de entradas e resoluções">
          <Box sx={{ height: 310 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={results.chart}><CartesianGrid strokeDasharray="3 3" opacity={.25}/><XAxis dataKey="label" tick={{ fontSize: 11 }}/><YAxis allowDecimals={false}/><Tooltip/><Legend/><Line dataKey="abertos" name="Abertos" stroke={palette[1]} strokeWidth={3} dot={false}/><Line dataKey="resolvidos" name="Resolvidos" stroke={palette[0]} strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer></Box>
        </Section>
        <Section id="team-results-status" title="Composição da carteira pendente">
          <Box sx={{ height: 310 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius={65} outerRadius={102} label={({ value }) => value > 0 ? value : ""}>{donut.map((item, index) => <Cell key={item.name} fill={palette[index]} />)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer></Box>
        </Section>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.5fr) minmax(0,1fr)" }, gap: 2, mb: 2 }}>
        <Section id="team-results-owners" title="Resultados por responsável">
          <Box sx={{ height: Math.max(290, results.team.length * 37 + 60) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={results.team} layout="vertical" margin={{ left: 18, right: 20 }}><CartesianGrid strokeDasharray="3 3" opacity={.25}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 11 }}/><Tooltip/><Legend/><Bar dataKey="opened" name="Abertos" fill={palette[1]} radius={[0,4,4,0]}/><Bar dataKey="resolved" name="Resolvidos" fill={palette[0]} radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></Box>
        </Section>
        <Section id="team-results-backlog" title="Carteira por responsável">
          <Box sx={{ height: Math.max(290, results.team.length * 37 + 60) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={[...results.team].sort((a,b)=>b.backlog-a.backlog)} layout="vertical" margin={{ left: 18, right: 20 }}><CartesianGrid strokeDasharray="3 3" opacity={.25}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 11 }}/><Tooltip/><Bar dataKey="backlog" name="Pendentes" fill={palette[2]} radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></Box>
        </Section>
      </Box>
      <TeamMeetingManagement actual={results.resolved.length} team={results.team} weekLabel={range ? range.start.toLocaleDateString("pt-BR") + " a " + range.end.toLocaleDateString("pt-BR") : ""} />
      <Section id="team-results-actions" title="Pontos para discussão e encaminhamentos">
        <Stack spacing={1}>
          <Typography variant="body2">• Avaliar a diferença entre entradas ({results.opened.length}) e resoluções ({results.resolved.length}) no período.</Typography>
          <Typography variant="body2">• Revisar os {results.stopped.length} tickets públicos parados na carteira atual.</Typography>
          <Typography variant="body2">• Distribuir os próximos encaminhamentos considerando a carteira ativa de cada responsável.</Typography>
          <Typography variant="caption" color="text.secondary">Os indicadores refletem a base importada e os filtros selecionados. O backlog é a posição atual; não representa um snapshot histórico. As contagens por responsável consideram o responsável atual do ticket, não o histórico de atribuições.</Typography>
        </Stack>
      </Section>
    </>}
  </Box>;
}
