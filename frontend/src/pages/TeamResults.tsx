import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Card, CardContent, Chip, FormControl, MenuItem, Select, Stack, TextField, Typography, Alert, CircularProgress, Drawer, IconButton, Divider } from "@mui/material";
import { getTicketSnapshot, getTicketSnapshotState, subscribeTicketSnapshotRefresh } from "../services/ticketSnapshot";
import { isOperationallyOpen } from "../utils/operationalMetrics";
import { FavoriteAction } from "../components/FavoriteAction";
import { SectionInfo } from "../components/SectionInfo";
import { calculateTimestampSla } from "../utils/timestampSla";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { TeamMeetingManagement } from "../components/TeamMeetingManagement";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { ExecutiveSection } from "../components/ExecutiveSection";
import { AssessmentOutlined, AutoGraphOutlined, CalendarMonthOutlined, FileDownloadOutlined, GroupsOutlined, PresentToAllOutlined, QueryStatsOutlined, SpeedOutlined, TaskAltOutlined, TrendingUpOutlined, WarningAmberOutlined } from "@mui/icons-material";

type Ticket = {
  movideskId: number;
  subject?: string | null;
  client?: string | null;
  status?: string | null;
  firstResponseDate?: string | null;
  firstResponseDueDate?: string | null;
  dueDate?: string | null;
  category?: string | null;
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
const cardExplanations: Record<string, string> = {
  "Abertos no período": "Quantidade de tickets públicos criados dentro do intervalo selecionado, independentemente da situação atual.",
  "Resolvidos": "Quantidade de tickets públicos com data de resolução no período selecionado. Um ticket resolvido pode ainda não estar fechado.",
  "Fechados": "Quantidade de tickets públicos com data de encerramento no período selecionado. Fechamento e resolução são eventos diferentes.",
  "Backlog atual": "Total de tickets públicos que permanecem em situação operacionalmente aberta na base atual. É uma fotografia da carteira de hoje, não do encerramento do período filtrado.",
  "Pendentes do período": "Tickets públicos criados no intervalo selecionado que ainda estão operacionalmente abertos na base atual.",
  "Parados": "Tickets públicos do backlog atual classificados com status-base 'stopped'. Fazem parte do backlog, não são um volume adicional.",
  "CSAT": "Percentual de avaliações de satisfação consideradas positivas entre as avaliações disponíveis para o recorte selecionado. O número de avaliações aparece abaixo do percentual.",
  "SLA primeira resposta": "Percentual de tickets com primeira resposta dentro do prazo entre aqueles com medição válida, conforme os dados de SLA disponíveis na base. Tickets sem medição não entram no denominador.",
  "SLA atendimento": "Percentual de tickets resolvidos dentro do prazo de atendimento entre aqueles com medição válida. Tickets sem medição não entram no denominador.",
  "Comparativo com período anterior": "Compara entradas, resoluções e fechamentos do intervalo selecionado com um intervalo imediatamente anterior de mesma duração. Variação percentual = (atual − anterior) ÷ anterior × 100; se a base anterior for zero, não há percentual comparável.",
  "Resumo de movimentações": "Compara o total de tickets públicos criados e resolvidos no período filtrado. As barras são proporcionais ao maior dos dois totais.",
  "Distribuição de pendências": "Divide o backlog público atual entre tickets parados e os demais tickets ainda abertos. As duas categorias somam o backlog atual.",
  "Evolução de entradas e resoluções": "Apresenta, por dia do intervalo selecionado, quantos tickets públicos foram criados e quantos tiveram resolução registrada. As barras representam eventos distintos.",
  "Composição da carteira pendente": "Mostra a participação dos tickets parados e dos demais tickets no backlog público atual. O total central corresponde aos tickets ainda abertos.",
  "Resultados por responsável": "Quantidade de tickets públicos resolvidos no período filtrado por responsável atualmente registrado no ticket. As barras são proporcionais ao maior volume exibido; não representam horas trabalhadas.",
  "Carteira por responsável": "Quantidade de tickets públicos ainda abertos, agrupados pelo responsável atualmente registrado. É uma visão do estoque atual, mesmo quando o filtro de datas aponta para outro período.",
  "Abertos × fechados · Semana": "Compara tickets públicos criados e fechados desde o início da semana atual até hoje, respeitando o filtro de responsável.",
  "Abertos × fechados · Mês": "Compara tickets públicos criados e fechados desde o início do mês atual até hoje, respeitando o filtro de responsável.",
  "Abertos × fechados · Semestre": "Compara tickets públicos criados e fechados desde o início do semestre atual até hoje, respeitando o filtro de responsável.",
  "Resolvidos por analista · Semana": "Distribui as resoluções de tickets públicos ocorridas na semana atual pelo responsável atualmente registrado. Clique em um analista para consultar os tickets.",
  "Resolvidos por analista · Mês": "Distribui as resoluções de tickets públicos ocorridas no mês atual pelo responsável atualmente registrado. Clique em um analista para consultar os tickets.",
  "CSAT · Satisfação": "Exibe a proporção de avaliações positivas sobre o total de avaliações de satisfação disponíveis no recorte selecionado.",
  "SLA · Primeira resposta": "Exibe a taxa de cumprimento do prazo de primeira resposta, com quantidades no prazo, fora do prazo e sem medição.",
  "SLA · Atendimento": "Exibe a taxa de cumprimento do prazo de resolução/atendimento, com quantidades no prazo, fora do prazo e sem medição.",
  "Pontos para discussão e encaminhamentos": "Reúne alertas operacionais e questões para a reunião, com base nos indicadores apresentados. Não substitui a ata e os compromissos registrados.",
};
const metricAccents: Record<string, string> = {
  "Abertos no período": "#22B8CF", "Resolvidos": "#18C77A", "Fechados": "#32C7A2",
  "Backlog atual": "#8C9EFF", "Pendentes do período": "#E9B949", "Parados": "#F59E67",
  "CSAT": "#22C7BA", "SLA primeira resposta": "#4BAFE8", "SLA atendimento": "#A28CF4",
};
const metricIcons: Record<string, React.ReactNode> = {
  "Abertos no período": <AutoGraphOutlined />, "Resolvidos": <TaskAltOutlined />,
  "Fechados": <TaskAltOutlined />, "Backlog atual": <GroupsOutlined />,
  "Pendentes do período": <WarningAmberOutlined />, "Parados": <WarningAmberOutlined />,
  "CSAT": <AssessmentOutlined />, "SLA primeira resposta": <SpeedOutlined />,
  "SLA atendimento": <QueryStatsOutlined />,
};
function Section({ id, title, children, info }: { id: string; title: string; children: React.ReactNode; info?: string }) {
  return <Box id={id} sx={{ minWidth: 0, scrollMarginTop: 100, height: "100%" }}>
    <ExecutiveSection title={title} accent={title.includes("SLA") ? "#4BAFE8" : title.includes("pendente") || title.includes("Carteira") ? "#E9B949" : "#18C77A"}
      action={<Stack direction="row" spacing={.5} sx={{ alignItems: "center" }}>
        <SectionInfo title={info || cardExplanations[title] || "Indicador de resultados da equipe."} />
        <FavoriteAction title={title} targetId={id} />
      </Stack>}>
      {children}
    </ExecutiveSection>
  </Box>;
}
function Metric({ title, value, subtitle, onClick }: { title: string; value: string | number; subtitle: string; onClick?: () => void }) {
  return <KpiCard title={title} value={typeof value === "number" ? formatNumber(value) : value} subtitle={subtitle}
    info={cardExplanations[title] || subtitle} icon={metricIcons[title]} accent={metricAccents[title] || "#18C77A"} onClick={onClick} />;
}
export default function TeamResults() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [detail, setDetail] = useState<{ title: string; tickets: Ticket[] } | null>(null);
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
    const responseSla = calculateTimestampSla(opened, "response");
    const solutionSla = calculateTimestampSla(resolved, "solution");
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
    return { opened, resolved, closed, backlog, pendingOpened, stopped, missingType, team, chart, satisfaction, good, responseSla, solutionSla };
  }, [scope, range]);

  const periodBreakdown = useMemo(() => {
    const windows = (["week", "month", "semester"] as const).map(kind => {
      const interval = rangeFor(kind, "", "")!;
      const publicTickets = scope.filter(t => t.ticketType === 2);
      const opened = publicTickets.filter(t => inRange(t.createdDate, interval.start, interval.end));
      const closed = publicTickets.filter(t => inRange(t.closedDate, interval.start, interval.end));
      const resolved = publicTickets.filter(t => inRange(t.resolvedDate, interval.start, interval.end));
      return { name: kind === "week" ? "Semana" : kind === "month" ? "Mês" : "Semestre", opened, closed, resolved };
    });
    const ownerRows = (windowIndex: number) => {
      const counts = new Map<string, { name: string; total: number; tickets: Ticket[] }>();
      for (const ticket of windows[windowIndex].resolved) {
        const name = ticket.owner?.trim() || "Sem responsável";
        const item = counts.get(name) || { name, total: 0, tickets: [] };
        item.total++; item.tickets.push(ticket); counts.set(name, item);
      }
      return [...counts.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
    };
    return { windows, weeklyOwners: ownerRows(0), monthlyOwners: ownerRows(1) };
  }, [scope]);
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
  return <Box ref={presentationRef} sx={{ px: { xs: 2, md: 3 }, py: 3, maxWidth: 1800, mx: "auto", bgcolor: "background.default", color: "text.primary", overflowY: presentation ? "auto" : "visible", height: presentation ? "100vh" : "auto", "& .recharts-wrapper": { maxWidth: "100%" }, "@media print": { maxWidth: "none", p: 1, overflow: "visible", height: "auto", "& .MuiCard-root": { breakInside: "avoid" } } }}>
    <PageHeader eyebrow="INTELIGÊNCIA OPERACIONAL • REUNIÃO SEMANAL" title="Resultados da Equipe"
      description="Painel executivo de produtividade, carteira, qualidade e compromissos da operação"
      meta={<Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Chip size="small" icon={<GroupsOutlined />} label={owner === "all" ? "Equipe completa" : owner} variant="outlined" />
        {range && <Chip size="small" icon={<CalendarMonthOutlined />} label={range.start.toLocaleDateString("pt-BR") + " — " + range.end.toLocaleDateString("pt-BR")} variant="outlined" />}
      </Stack>}
      action={<Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ "@media print": { display: "none" } }}>
        <Button variant="outlined" startIcon={<FileDownloadOutlined />} onClick={printReport}>Exportar PDF</Button>
        <Button variant="contained" startIcon={presentation ? <TrendingUpOutlined /> : <PresentToAllOutlined />} onClick={() => void togglePresentation()}>{presentation ? "Sair da apresentação" : "Apresentar"}</Button>
      </Stack>} />
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
        <Metric title="Abertos no período" value={results.opened.length} onClick={() => setDetail({ title: "Abertos no período", tickets: results.opened })} subtitle="Tickets públicos criados" />
        <Metric title="Resolvidos" value={results.resolved.length} onClick={() => setDetail({ title: "Resolvidos", tickets: results.resolved })} subtitle="Resoluções registradas no período" />
        <Metric title="Fechados" value={results.closed.length} onClick={() => setDetail({ title: "Fechados", tickets: results.closed })} subtitle="Encerramentos no período" />
        <Metric title="Backlog atual" value={results.backlog.length} onClick={() => setDetail({ title: "Backlog atual", tickets: results.backlog })} subtitle="Estoque público ativo hoje" />
        <Metric title="Pendentes do período" value={results.pendingOpened.length} onClick={() => setDetail({ title: "Pendentes do período", tickets: results.pendingOpened })} subtitle="Abertos no intervalo e ainda pendentes" />
        <Metric title="Parados" value={results.stopped.length} onClick={() => setDetail({ title: "Parados", tickets: results.stopped })} subtitle="Parte do backlog atual" />
        <Metric title="CSAT" onClick={() => setDetail({ title: "Avaliações de satisfação", tickets: results.satisfaction })} value={results.satisfaction.length ? `${(100 * results.good / results.satisfaction.length).toFixed(1).replace(".",",")}%` : "—"} subtitle={`${results.satisfaction.length} avaliações disponíveis`} />
        <Metric title="SLA primeira resposta" value={results.responseSla.percentage == null ? "—" : results.responseSla.percentage.toLocaleString("pt-BR") + "%"} subtitle={results.responseSla.measured + " tickets medidos"} onClick={() => setDetail({ title: "SLA de primeira resposta", tickets: results.responseSla.measuredTickets })} />
        <Metric title="SLA atendimento" value={results.solutionSla.percentage == null ? "—" : results.solutionSla.percentage.toLocaleString("pt-BR") + "%"} subtitle={results.solutionSla.measured + " tickets medidos"} onClick={() => setDetail({ title: "SLA de atendimento", tickets: results.solutionSla.measuredTickets })} />
      </Box>
      {comparison && <Box sx={{ mb: 2 }}><Section id="team-results-comparison" title="Comparativo com período anterior">
        <Typography variant="caption" color="text.secondary">Período anterior equivalente: {comparison.previousStart.toLocaleDateString("pt-BR")} a {comparison.previousEnd.toLocaleDateString("pt-BR")}. Produtividade é representada por resoluções; não mede esforço ou horas trabalhadas.</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 1.5, mt: 2 }}>
          {[
            { label: "Entradas", current: results.opened.length, previous: comparison.opened },
            { label: "Resoluções / produtividade", current: results.resolved.length, previous: comparison.resolved },
            { label: "Fechamentos", current: results.closed.length, previous: comparison.closed },
          ].map(item => <Box key={item.label} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{item.label}</Typography><Typography variant="h5" sx={{ fontWeight: 800 }}>{item.current} <Typography component="span" variant="body2" color="text.secondary">vs. {item.previous}</Typography></Typography><Chip size="small" label={changeLabel(item.current, item.previous)} /></Box>)}
        </Box>
        <Typography variant="caption" color="text.secondary">Backlog histórico não comparado: a base atual não contém snapshots históricos confiáveis de estoque.</Typography>
      </Section></Box>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2, mb: 2 }}>
        <Section id="team-results-trend-summary" title="Resumo de movimentações">
          <Stack spacing={1.5}>
            {([{ label: "Abertos no período", count: results.opened.length, tickets: results.opened, color: palette[1] }, { label: "Resolvidos no período", count: results.resolved.length, tickets: results.resolved, color: palette[0] }]).map(item => <Box key={item.label} role="button" tabIndex={0} onClick={() => setDetail({ title: item.label, tickets: item.tickets })} onKeyDown={e => { if (e.key === "Enter") setDetail({ title: item.label, tickets: item.tickets }); }} sx={{ cursor: "pointer" }}>
              <Stack direction="row" sx={{ justifyContent: "space-between" }}><Typography variant="body2">{item.label}</Typography><Typography variant="body2" sx={{ fontWeight: 800 }}>{item.count}</Typography></Stack>
              <Box sx={{ height: 12, bgcolor: "action.hover", borderRadius: 2, overflow: "hidden" }}><Box sx={{ height: "100%", width: 100 * item.count / Math.max(1, results.opened.length, results.resolved.length) + "%", bgcolor: item.color, borderRadius: 2 }}/></Box>
            </Box>)}
          </Stack>
        </Section>
        <Section id="team-results-backlog-summary" title="Distribuição de pendências">
          <Stack spacing={1.5}>
            {([{ label: "Parados", tickets: results.stopped, color: palette[2] }, { label: "Demais pendentes", tickets: results.backlog.filter(t => !results.stopped.includes(t)), color: palette[0] }]).map(item => <Box key={item.label} role="button" tabIndex={0} onClick={() => setDetail({ title: item.label, tickets: item.tickets })} onKeyDown={e => { if (e.key === "Enter") setDetail({ title: item.label, tickets: item.tickets }); }} sx={{ cursor: "pointer" }}>
              <Stack direction="row" sx={{ justifyContent: "space-between" }}><Typography variant="body2">{item.label}</Typography><Typography variant="body2" sx={{ fontWeight: 800 }}>{item.tickets.length}</Typography></Stack>
              <Box sx={{ height: 12, bgcolor: "action.hover", borderRadius: 2, overflow: "hidden" }}><Box sx={{ height: "100%", width: 100 * item.tickets.length / Math.max(1, results.backlog.length) + "%", bgcolor: item.color, borderRadius: 2 }}/></Box>
            </Box>)}
          </Stack>
        </Section>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.5fr 1fr" }, gap: 2, mb: 2 }}>
        <Section id="team-results-trend" title="Evolução de entradas e resoluções">
          <Stack spacing={1} sx={{ minHeight: 200, overflow: "visible" }}>
            {results.chart.filter(row => row.abertos + row.resolvidos > 0).map(row => <Box key={row.date}>
              <Typography variant="caption">{row.label}</Typography>
              {([{ label: "Abertos", count: row.abertos, color: palette[1] }, { label: "Resolvidos", count: row.resolvidos, color: palette[0] }]).map(item => <Stack key={item.label} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Box sx={{ width: 75 }}><Typography variant="caption">{item.label}</Typography></Box>
                <Box sx={{ flex: 1, bgcolor: "action.hover", borderRadius: 1, height: 12, overflow: "hidden" }}><Box sx={{ bgcolor: item.color, height: "100%", width: 100 * item.count / Math.max(1, ...results.chart.map(r => Math.max(r.abertos, r.resolvidos))) + "%" }} /></Box>
                <Typography variant="caption" sx={{ width: 30, textAlign: "right" }}>{item.count}</Typography>
              </Stack>)}
            </Box>)}
            {!results.chart.some(row => row.abertos + row.resolvidos > 0) && <Alert severity="info">Sem movimentações no período.</Alert>}
          </Stack>
        </Section>
        <Section id="team-results-status" title="Composição da carteira pendente">
          <Box sx={{ minHeight: 240, display: "grid", placeItems: "center" }}>
            <Box sx={{ width: 180, height: 180, borderRadius: "50%", background: results.backlog.length ? "conic-gradient(" + palette[2] + " 0% " + 100 * results.stopped.length / results.backlog.length + "%, " + palette[0] + " 0% 100%)" : "linear-gradient(#445,#445)", display: "grid", placeItems: "center" }}>
              <Box sx={{ width: 118, height: 118, borderRadius: "50%", bgcolor: "background.paper", display: "grid", placeContent: "center", textAlign: "center" }}><Typography variant="h4" sx={{ fontWeight: 800 }}>{results.backlog.length}</Typography><Typography variant="caption">Pendentes</Typography></Box>
            </Box>
          </Box>
          <Stack direction="row" spacing={1} sx={{ justifyContent: "center", flexWrap: "wrap" }}><Chip label={"Parados: " + results.stopped.length} onClick={() => setDetail({ title: "Parados", tickets: results.stopped })}/><Chip label={"Demais: " + (results.backlog.length - results.stopped.length)} onClick={() => setDetail({ title: "Demais pendentes", tickets: results.backlog.filter(t => !results.stopped.includes(t)) })}/></Stack>
        </Section>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2, mb: 2 }}>
        {([{ id: "team-results-owners", title: "Resultados por responsável", field: "resolved" as const }, { id: "team-results-backlog", title: "Carteira por responsável", field: "backlog" as const }]).map(panel => <Section key={panel.id} id={panel.id} title={panel.title}>
          <Stack spacing={1.5} sx={{ minHeight: 180, maxHeight: 430, overflowY: "auto" }}>
            {[...results.team].sort((a, b) => b[panel.field] - a[panel.field]).map(row => <Box key={row.name} role="button" tabIndex={0} onClick={() => setDetail({ title: panel.title + " · " + row.name, tickets: (panel.field === "resolved" ? results.resolved : results.backlog).filter(t => (t.owner?.trim() || "Sem responsável") === row.name) })} onKeyDown={event => { if (event.key === "Enter") setDetail({ title: panel.title + " · " + row.name, tickets: (panel.field === "resolved" ? results.resolved : results.backlog).filter(t => (t.owner?.trim() || "Sem responsável") === row.name) }); }} sx={{ cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, p: .5, borderRadius: 1 }}>
              <Stack direction="row" sx={{ justifyContent: "space-between" }}><Typography variant="body2">{row.name}</Typography><Typography variant="body2" sx={{ fontWeight: 800 }}>{row[panel.field]}</Typography></Stack>
              <Box sx={{ height: 12, bgcolor: "action.hover", borderRadius: 1, overflow: "hidden" }}><Box sx={{ height: "100%", width: 100 * row[panel.field] / Math.max(1, ...results.team.map(t => t[panel.field])) + "%", bgcolor: panel.field === "resolved" ? palette[0] : palette[2] }} /></Box>
            </Box>)}
            {results.team.length === 0 && <Alert severity="info">Sem responsáveis para o período.</Alert>}
          </Stack>
        </Section>)}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3, minmax(0, 1fr))" }, gap: 2, mb: 2 }}>
        {periodBreakdown.windows.map((item, index) => <Section key={item.name} id={"team-results-period-" + index} title={"Abertos × fechados · " + item.name}>
          <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
            <Chip label={"Abertos: " + item.opened.length} color="info" onClick={() => setDetail({ title: "Abertos · " + item.name, tickets: item.opened })} />
            <Chip label={"Fechados: " + item.closed.length} color="success" onClick={() => setDetail({ title: "Fechados · " + item.name, tickets: item.closed })} />
          </Stack>
          <Stack spacing={1.5} sx={{ py: 2 }}>
            {([{ label: "Abertos", value: item.opened.length, color: palette[1], tickets: item.opened }, { label: "Fechados", value: item.closed.length, color: palette[0], tickets: item.closed }]).map(row => <Box key={row.label} onClick={() => setDetail({ title: row.label + " · " + item.name, tickets: row.tickets })} role="button" tabIndex={0} onKeyDown={event => { if (event.key === "Enter") setDetail({ title: row.label + " · " + item.name, tickets: row.tickets }); }} sx={{ cursor: "pointer" }}>
              <Stack direction="row" sx={{ justifyContent: "space-between" }}><Typography variant="body2">{row.label}</Typography><Typography sx={{ fontWeight: 800 }}>{row.value}</Typography></Stack>
              <Box sx={{ height: 20, borderRadius: 1, bgcolor: "action.hover", overflow: "hidden" }}><Box sx={{ width: 100 * row.value / Math.max(1, item.opened.length, item.closed.length) + "%", height: "100%", bgcolor: row.color, borderRadius: 1 }} /></Box>
            </Box>)}
          </Stack>
        </Section>)}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2, mb: 2 }}>
        {([{ title: "Resolvidos por analista · Semana", rows: periodBreakdown.weeklyOwners, id: "team-results-weekly-resolved" }, { title: "Resolvidos por analista · Mês", rows: periodBreakdown.monthlyOwners, id: "team-results-monthly-resolved" }]).map(panel => <Section key={panel.id} id={panel.id} title={panel.title}>
          {panel.rows.length === 0 ? <Alert severity="info">Não há resoluções públicas registradas neste intervalo.</Alert> : <Stack spacing={1}>
            {panel.rows.map(row => <Box key={row.name} onClick={() => setDetail({ title: panel.title + " · " + row.name, tickets: row.tickets })} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") setDetail({ title: panel.title + " · " + row.name, tickets: row.tickets }); }} sx={{ cursor: "pointer", p: 1, borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}>
              <Stack direction="row" sx={{ justifyContent: "space-between" }}><Typography variant="body2">{row.name}</Typography><Typography variant="body2" sx={{ fontWeight: 800 }}>{row.total}</Typography></Stack>
              <Box sx={{ bgcolor: "action.hover", height: 8, borderRadius: 2, mt: .5, overflow: "hidden" }}><Box sx={{ width: (100 * row.total / Math.max(1, panel.rows[0].total)) + "%", bgcolor: "primary.main", height: "100%", borderRadius: 2 }}/></Box>
            </Box>)}
          </Stack>}
        </Section>)}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3, minmax(0, 1fr))" }, gap: 2, mb: 2 }}>
        <Section id="team-results-csat-detail" title="CSAT · Satisfação">
          <Typography variant="h4" sx={{ fontWeight: 800 }}>{results.satisfaction.length ? (100 * results.good / results.satisfaction.length).toFixed(1).replace(".", ",") + "%" : "—"}</Typography>
          <Typography variant="body2" color="text.secondary">{results.good} positivas de {results.satisfaction.length} avaliações disponíveis</Typography>
          <Button onClick={() => setDetail({ title: "Avaliações de satisfação", tickets: results.satisfaction })}>Ver avaliações</Button>
        </Section>
        {([{ id: "team-results-response-sla", label: "SLA · Primeira resposta", sla: results.responseSla }, { id: "team-results-solution-sla", label: "SLA · Atendimento", sla: results.solutionSla }]).map(item => <Section key={item.id} id={item.id} title={item.label}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>{item.sla.percentage == null ? "—" : item.sla.percentage.toLocaleString("pt-BR") + "%"}</Typography>
          <Typography variant="body2" color="text.secondary">{item.sla.within} no prazo · {item.sla.outside} fora · {item.sla.unmeasured} sem medição</Typography>
          <Stack direction="row" spacing={1}><Button size="small" onClick={() => setDetail({ title: item.label + " · No prazo", tickets: item.sla.withinTickets })}>No prazo</Button><Button size="small" onClick={() => setDetail({ title: item.label + " · Fora do prazo", tickets: item.sla.outsideTickets })}>Fora</Button></Stack>
        </Section>)}
      </Box>
      <TeamMeetingManagement actual={results.resolved.length} team={results.team} weekLabel={range ? range.start.toLocaleDateString("pt-BR") + " a " + range.end.toLocaleDateString("pt-BR") : ""} snapshot={{ periodStart: range?.start.toISOString().slice(0, 10) ?? "", periodEnd: range?.end.toISOString().slice(0, 10) ?? "", opened: results.opened.length, resolved: results.resolved.length, closed: results.closed.length, backlog: results.backlog.length, stopped: results.stopped.length, capturedAt: new Date().toISOString() }} />
      <Section id="team-results-actions" title="Pontos para discussão e encaminhamentos">
        <Stack spacing={1}>
          <Typography variant="body2">• Avaliar a diferença entre entradas ({results.opened.length}) e resoluções ({results.resolved.length}) no período.</Typography>
          <Typography variant="body2">• Revisar os {results.stopped.length} tickets públicos parados na carteira atual.</Typography>
          <Typography variant="body2">• Distribuir os próximos encaminhamentos considerando a carteira ativa de cada responsável.</Typography>
          <Typography variant="caption" color="text.secondary">Os indicadores refletem a base importada e os filtros selecionados. O backlog é a posição atual; não representa um snapshot histórico. As contagens por responsável consideram o responsável atual do ticket, não o histórico de atribuições.</Typography>
        </Stack>
      </Section>
    </>}
    <Drawer anchor="right" open={Boolean(detail)} onClose={() => setDetail(null)} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
      <Box sx={{ width: { xs: "100vw", sm: 560 }, maxWidth: "100vw", p: 2.5 }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Box><Typography variant="h6" sx={{ fontWeight: 800 }}>{detail?.title}</Typography><Typography variant="body2" color="text.secondary">{detail?.tickets.length ?? 0} tickets encontrados</Typography></Box>
          <IconButton aria-label="Fechar detalhes" onClick={() => setDetail(null)}>×</IconButton>
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Stack spacing={1.5}>{detail?.tickets.map((ticket, index) => <Box key={ticket.movideskId || index} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 800 }}>#{ticket.movideskId} · {ticket.subject || "Sem assunto"}</Typography>
          <Typography variant="caption" color="text.secondary">{ticket.client || "Cliente não informado"} · {ticket.owner || "Sem responsável"}</Typography>
          <Typography variant="body2">{ticket.status || ticket.baseStatus || "Sem status"}</Typography>
        </Box>)}</Stack>
      </Box>
    </Drawer>
  </Box>;
}
