import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Drawer,
  FormControl, IconButton, InputLabel, MenuItem, Select, Stack, Tab, Tabs, Tooltip, Typography,
} from "@mui/material";
import {
  AnalyticsOutlined, AssignmentTurnedInOutlined, AutoGraphOutlined, BoltOutlined,
  ErrorOutlineOutlined, GroupsOutlined, InfoOutlined, OpenInNewOutlined, RadarOutlined,
  SchoolOutlined, TrackChangesOutlined, TrendingDownOutlined, TrendingUpOutlined,
} from "@mui/icons-material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { DetailFieldGrid, DetailPanelHeader, DetailSection } from "../components/DetailPanel";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { aliareColors } from "../theme/theme";

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
  action: string; examples: Ticket[];
};
type Gap = { id: string; type: string; title: string; evidence: string; impact: string; action: string; status: string };
type Development = { analyst: string; tickets: number; stale: number; themes: Array<{ topic: string; count: number }> };
type Data = {
  generatedAt: string; periodDays: number;
  radar: Record<string, number>;
  radarSamples: Record<string, Array<Ticket | Task>>;
  audit: { candidates: number; sample: Array<Ticket & { reason: string }> };
  recurrences: Recurrence[]; gaps: Gap[]; development: Development[];
  weekly: { current: number; previous: number; changePct: number | null; open: number; previousOpen: number; overdue: number; paused: number; stale: number; blocked: number };
  recommendations: string[];
  filters: { clients: string[]; users: string[] };
};

type TabKey = "radar" | "audit" | "recurrences" | "gaps" | "development";
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
  radar: "Prioriza situações operacionais que merecem intervenção antes de virarem recorrência ou estouro.",
  audit: "Seleciona candidatos para revisão humana. O sistema sinaliza indícios; não altera classificações automaticamente.",
  recurrences: "Agrupa temas repetidos e compara o período atual com o anterior para sugerir investigação, treinamento ou causa raiz.",
  gaps: "Consolida sinais técnicos relevantes em gaps com evidência, impacto e ação sugerida.",
  development: "Mostra concentração de temas e pontos de apoio por analista para orientar desenvolvimento técnico, sem ranking.",
};

function AreaTitle({ title, info, icon }: { title: string; info: string; icon?: React.ReactNode }) {
  return <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
    {icon}<Typography sx={{ fontWeight: 850 }}>{title}</Typography>
    <Tooltip title={info}><IconButton size="small" aria-label={`Informações sobre ${title}`}><InfoOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip>
  </Stack>;
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
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("radar");
  const [client, setClient] = useState("");
  const [user, setUser] = useState("");
  const [days, setDays] = useState(30);
  const [drawer, setDrawer] = useState<DrawerState>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.get<Data>("/workspace/technical-leadership", { params: { client: client || undefined, user: user || undefined, days } })
      .then((response) => active && setData(response.data))
      .catch(() => active && setError("Não foi possível carregar a Central de Liderança Técnica."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [client, user, days]);

  const attention = useMemo(() => data ? [
    data.radar.slaOverdue, data.radar.newTooLong, data.radar.pausedTooLong, data.radar.blocked,
    data.radar.closedTicketActiveTask, data.radar.openTicketFinishedTask,
  ].reduce((sum, value) => sum + (value ?? 0), 0) : 0, [data]);

  const openItem = (item: Ticket | Task) => {
    if (isTask(item)) {
      const type = item.workItemType.toLocaleLowerCase("pt-BR");
      navigate(type.includes("apoio") ? `/apoios?task=${item.id}` : type.includes("evolu") ? `/evolucoes?task=${item.id}` : `/correcoes?task=${item.id}`);
    } else navigate(`/tickets?movidesk=${item.movideskId}`);
  };

  if (loading && !data) return <Box sx={{ minHeight: 420, display: "grid", placeItems: "center" }}><CircularProgress /></Box>;

  return <Box>
    <PageHeader
      eyebrow="Liderança técnica"
      title="Central de Liderança Técnica"
      description="Radar executivo para transformar sinais da operação em investigação, orientação e ação acompanhada."
      meta={data ? `Atualizado em ${new Date(data.generatedAt).toLocaleString("pt-BR")} · janela de ${data.periodDays} dias` : undefined}
      action={<Stack direction="row" spacing={1}><Chip icon={<RadarOutlined />} label={`${attention} requerem atenção`} color={attention ? "warning" : "success"} /></Stack>}
    />

    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

    <Card sx={{ mb: 2.5, overflow: "hidden", background: `linear-gradient(125deg, ${aliareColors.black}, ${aliareColors.graphite} 58%, #12382A)`, color: "#fff" }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { lg: "center" } }}>
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <BoltOutlined sx={{ color: aliareColors.green }} />
              <Typography sx={{ fontWeight: 900, fontSize: "1.05rem" }}>Briefing executivo da operação</Typography>
              <Tooltip title="Resume os sinais que merecem leitura de liderança. Recomendações são apoio à decisão e devem ser validadas antes de qualquer ação."><IconButton size="small" sx={{ color: "rgba(255,255,255,.65)" }}><InfoOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip>
            </Stack>
            <Typography variant="body2" sx={{ color: "rgba(255,255,255,.62)", mt: .5 }}>Indicadores → desvios → investigação → gap → ação → acompanhamento.</Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <FormControl size="small" sx={{ minWidth: 180, bgcolor: "#fff", borderRadius: 1 }}><InputLabel>Cliente</InputLabel><Select value={client} label="Cliente" onChange={(e) => setClient(e.target.value)}><MenuItem value="">Todos</MenuItem>{data?.filters.clients.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</Select></FormControl>
            <FormControl size="small" sx={{ minWidth: 180, bgcolor: "#fff", borderRadius: 1 }}><InputLabel>Analista</InputLabel><Select value={user} label="Analista" onChange={(e) => setUser(e.target.value)}><MenuItem value="">Todos</MenuItem>{data?.filters.users.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}</Select></FormControl>
            <FormControl size="small" sx={{ minWidth: 120, bgcolor: "#fff", borderRadius: 1 }}><InputLabel>Período</InputLabel><Select value={days} label="Período" onChange={(e) => setDays(Number(e.target.value))}><MenuItem value={7}>7 dias</MenuItem><MenuItem value={30}>30 dias</MenuItem><MenuItem value={60}>60 dias</MenuItem><MenuItem value={90}>90 dias</MenuItem></Select></FormControl>
          </Stack>
        </Stack>

        {data && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" }, gap: 1.2, mt: 2 }}>
          {[
            ["Atendimentos no período", data.weekly.current],
            ["Backlog aberto", data.weekly.open],
            ["SLA vencido", data.weekly.overdue],
            ["Tasks bloqueadas", data.weekly.blocked],
          ].map(([label, value]) => <Box key={String(label)} sx={{ p: 1.4, borderRadius: 2, border: "1px solid rgba(255,255,255,.09)", bgcolor: "rgba(255,255,255,.04)" }}><Typography variant="caption" sx={{ color: "rgba(255,255,255,.55)" }}>{label}</Typography><Typography sx={{ fontWeight: 900, fontSize: "1.45rem", mt: .25 }}>{value}</Typography></Box>)}
        </Box>}
      </CardContent>
    </Card>

    {data && <Card sx={{ mb: 2.5 }}><CardContent>
      <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, gap: 1 }}>
        <AreaTitle title="Leitura semanal" icon={<AutoGraphOutlined color="primary" />} info="Compara o volume do período atual com a janela anterior e destaca indicadores operacionais para a rotina semanal de gestão." />
        <Delta value={data.weekly.changePct} />
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,1fr)", md: "repeat(5,1fr)" }, gap: 1.2, mt: 1.5 }}>
        {[["Atual", data.weekly.current], ["Anterior", data.weekly.previous], ["Pausados", data.weekly.paused], ["Sem movimento", data.weekly.stale], ["Bloqueados", data.weekly.blocked]].map(([label, value]) => <Box key={String(label)} sx={{ p: 1.25, borderRadius: 2, bgcolor: "background.default", border: "1px solid", borderColor: "divider" }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ fontWeight: 850, fontSize: "1.25rem" }}>{value}</Typography></Box>)}
      </Box>
      {data.recommendations.length > 0 && <Box sx={{ mt: 1.5, p: 1.4, borderRadius: 2, bgcolor: aliareColors.surfaceGreen, border: `1px solid ${aliareColors.greenLight}` }}>
        <AreaTitle title="Ações recomendadas" info="Sugestões geradas a partir dos sinais objetivos da operação. Não executam ações automaticamente e devem passar por julgamento técnico." />
        <Stack spacing={.65} sx={{ mt: .8 }}>{data.recommendations.map((item, index) => <Typography key={item} variant="body2"><b>{index + 1}.</b> {item}</Typography>)}</Stack>
      </Box>}
    </CardContent></Card>}

    <Card sx={{ mb: 2.5 }}><Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 1 }}>
      {([
        ["radar", "Radar", <RadarOutlined fontSize="small" />],
        ["audit", "Auditoria", <AssignmentTurnedInOutlined fontSize="small" />],
        ["recurrences", "Recorrências", <TrackChangesOutlined fontSize="small" />],
        ["gaps", "Gaps", <ErrorOutlineOutlined fontSize="small" />],
        ["development", "Desenvolvimento", <GroupsOutlined fontSize="small" />],
      ] as Array<[TabKey, string, React.ReactElement]>).map(([key, label, icon]) => <Tab key={key} value={key} icon={icon} iconPosition="start" label={<Stack direction="row" spacing={.5} sx={{ alignItems: "center" }}><span>{label}</span><Tooltip title={tabInfo[key]}><InfoOutlined onClick={(e) => e.stopPropagation()} sx={{ fontSize: 15, color: "text.secondary" }} /></Tooltip></Stack>} />)}
    </Tabs></Card>

    {data && tab === "radar" && <Box>
      <AreaTitle title="Radar operacional" info={tabInfo.radar} icon={<RadarOutlined color="primary" />} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", lg: "repeat(5,1fr)" }, gap: 1.5, mt: 1.2 }}>
        {radarMeta.map(([key, title, info, accent]) => <KpiCard key={key} title={title} value={data.radar[key] ?? 0} subtitle="Clique para investigar" info={info} accent={accent} onClick={() => setDrawer({ kind: "radar", key, title, items: data.radarSamples[key] ?? [] })} />)}
      </Box>
    </Box>}

    {data && tab === "audit" && <Box>
      <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, gap: 1 }}>
        <AreaTitle title="Auditoria inteligente" info={tabInfo.audit} icon={<AssignmentTurnedInOutlined color="primary" />} />
        <Chip label={`${data.audit.candidates} candidato(s) · amostra de ${data.audit.sample.length}`} />
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)" }, gap: 1.5, mt: 1.2 }}>
        {data.audit.sample.map((ticket) => <Card key={ticket.id} onClick={() => setDrawer({ kind: "audit", title: "Auditoria semanal", items: [ticket] })} sx={{ cursor: "pointer", "&:hover": { borderColor: aliareColors.green, transform: "translateY(-1px)" }, transition: ".15s" }}><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}><Typography sx={{ fontWeight: 850 }}>#{ticket.movideskId}</Typography><Tooltip title="Candidato selecionado por heurísticas operacionais. A confirmação depende de análise humana."><InfoOutlined sx={{ fontSize: 17, color: "text.secondary" }} /></Tooltip></Stack>
          <Typography variant="body2" sx={{ mt: .5, fontWeight: 700 }}>{ticket.subject}</Typography>
          <Chip size="small" color="warning" label={ticket.reason} sx={{ mt: 1, maxWidth: "100%" }} />
        </CardContent></Card>)}
      </Box>
    </Box>}

    {data && tab === "recurrences" && <Box>
      <AreaTitle title="Radar de recorrências" info={tabInfo.recurrences} icon={<TrackChangesOutlined color="primary" />} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)", xl: "repeat(3,1fr)" }, gap: 1.5, mt: 1.2 }}>
        {data.recurrences.map((item) => <Card key={item.topic} onClick={() => setDrawer({ kind: "recurrence", title: item.topic, recurrence: item })} sx={{ cursor: "pointer", "&:hover": { borderColor: aliareColors.cyan, boxShadow: "0 8px 24px rgba(16,24,40,.07)" } }}><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}><Typography sx={{ fontWeight: 850, textTransform: "capitalize" }}>{item.topic}</Typography><Tooltip title="Tema agrupado por classificação/serviço dos tickets do período. Clique para ver evidências e ação sugerida."><InfoOutlined sx={{ fontSize: 17, color: "text.secondary" }} /></Tooltip></Stack>
          <Typography sx={{ fontWeight: 900, fontSize: "1.7rem", color: aliareColors.cyan, mt: .7 }}>{item.count}</Typography>
          <Typography variant="caption" color="text.secondary">{item.clients.length} cliente(s) · {item.analysts.length} analista(s)</Typography>
          <Box sx={{ mt: 1 }}><Delta value={item.changePct} /></Box>
        </CardContent></Card>)}
        {!data.recurrences.length && <Alert severity="success">Nenhuma recorrência relevante detectada neste período.</Alert>}
      </Box>
    </Box>}

    {data && tab === "gaps" && <Box>
      <AreaTitle title="Gestão de gaps técnicos" info={tabInfo.gaps} icon={<ErrorOutlineOutlined color="primary" />} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2,1fr)" }, gap: 1.5, mt: 1.2 }}>
        {data.gaps.map((gap) => <Card key={gap.id} onClick={() => setDrawer({ kind: "gap", title: gap.title, gap })} sx={{ cursor: "pointer", "&:hover": { borderColor: aliareColors.purple } }}><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}><Box><Typography variant="caption" color="text.secondary">{gap.id} · {gap.type}</Typography><Typography sx={{ fontWeight: 850 }}>{gap.title}</Typography></Box><Tooltip title="Gap derivado de evidências operacionais. Clique para revisar impacto, evidência e ação sugerida."><InfoOutlined sx={{ fontSize: 17, color: "text.secondary" }} /></Tooltip></Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}><Chip size="small" label={gap.impact} color={gap.impact === "Alto" ? "error" : "warning"} /><Chip size="small" label={gap.status} variant="outlined" /></Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{gap.evidence}</Typography>
        </CardContent></Card>)}
      </Box>
    </Box>}

    {data && tab === "development" && <Box>
      <AreaTitle title="Desenvolvimento técnico do time" info={tabInfo.development} icon={<SchoolOutlined color="primary" />} />
      <Alert severity="info" sx={{ mt: 1.2, mb: 1.5 }}>Esta visão não é ranking. Ela ajuda a identificar concentração de temas, necessidade de apoio e oportunidades de transferência de conhecimento.</Alert>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)", xl: "repeat(3,1fr)" }, gap: 1.5 }}>
        {data.development.map((item) => <Card key={item.analyst} onClick={() => setDrawer({ kind: "development", title: item.analyst, development: item })} sx={{ cursor: "pointer", "&:hover": { borderColor: aliareColors.green } }}><CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}><Typography sx={{ fontWeight: 850 }}>{item.analyst}</Typography><Tooltip title="Mostra volume e temas do período para orientar apoio técnico e compartilhamento de conhecimento."><InfoOutlined sx={{ fontSize: 17, color: "text.secondary" }} /></Tooltip></Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}><Chip size="small" label={`${item.tickets} tickets`} /><Chip size="small" color={item.stale ? "warning" : "success"} label={`${item.stale} sem movimento`} /></Stack>
          <Stack spacing={.4} sx={{ mt: 1.2 }}>{item.themes.map((theme) => <Typography key={theme.topic} variant="caption" color="text.secondary">• {theme.topic}: <b>{theme.count}</b></Typography>)}</Stack>
        </CardContent></Card>)}
      </Box>
    </Box>}

    <Drawer anchor="right" open={Boolean(drawer)} onClose={() => setDrawer(null)} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
      {drawer && <DetailPanelHeader eyebrow="Liderança técnica" title={drawer.title} onClose={() => setDrawer(null)} />}
      {drawer?.kind === "radar" && <DetailSection title="Itens para investigação">
        <Stack spacing={1}>{drawer.items.map((item) => <Button key={isTask(item) ? `task-${item.id}` : `ticket-${item.id}`} variant="outlined" endIcon={<OpenInNewOutlined />} onClick={() => openItem(item)} sx={{ justifyContent: "space-between", textAlign: "left", textTransform: "none" }}>
          <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 800 }}>{isTask(item) ? `#${item.id} · ${item.title}` : `#${item.movideskId} · ${item.subject}`}</Typography><Typography variant="caption" color="text.secondary">{[item.status ?? (isTask(item) ? item.state : ""), item.client, isTask(item) ? item.assignedToName : item.owner].filter(Boolean).join(" · ")}</Typography></Box>
        </Button>)}</Stack>
        {!drawer.items.length && <Alert severity="success">Nenhum item neste recorte.</Alert>}
      </DetailSection>}
      {drawer?.kind === "audit" && <DetailSection title="Revisão humana recomendada"><Stack spacing={1}>{drawer.items.map((ticket) => <Card key={ticket.id} variant="outlined"><CardContent><Typography sx={{ fontWeight: 850 }}>#{ticket.movideskId} · {ticket.subject}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{ticket.reason}</Typography><DetailFieldGrid fields={[["Categoria", ticket.category ?? "Não informado"], ["Causa", ticket.cause ?? "Não informado"], ["Responsável", ticket.owner ?? "Não informado"], ["Cliente", ticket.client ?? "Não informado"]]} /><Button sx={{ mt: 1 }} endIcon={<OpenInNewOutlined />} onClick={() => openItem(ticket)}>Abrir atendimento</Button></CardContent></Card>)}</Stack></DetailSection>}
      {drawer?.kind === "recurrence" && <><DetailSection title="Diagnóstico"><DetailFieldGrid fields={[["Ocorrências", drawer.recurrence.count], ["Período anterior", drawer.recurrence.previous], ["Clientes", drawer.recurrence.clients.join(", ") || "—"], ["Analistas", drawer.recurrence.analysts.join(", ") || "—"]]} /></DetailSection><DetailSection title="Ação sugerida"><Alert severity="info">{drawer.recurrence.action}</Alert></DetailSection><DetailSection title="Evidências"><Stack spacing={1}>{drawer.recurrence.examples.map((ticket) => <Button key={ticket.id} variant="outlined" onClick={() => openItem(ticket)} endIcon={<OpenInNewOutlined />} sx={{ justifyContent: "space-between" }}>#{ticket.movideskId} · {ticket.subject}</Button>)}</Stack></DetailSection></>}
      {drawer?.kind === "gap" && <><DetailSection title="Gap técnico"><DetailFieldGrid fields={[["ID", drawer.gap.id], ["Tipo", drawer.gap.type], ["Impacto", drawer.gap.impact], ["Status", drawer.gap.status], ["Evidência", drawer.gap.evidence]]} /></DetailSection><DetailSection title="Próxima ação sugerida"><Alert severity="info">{drawer.gap.action}</Alert></DetailSection></>}
      {drawer?.kind === "development" && <><DetailSection title="Visão técnica"><DetailFieldGrid fields={[["Analista", drawer.development.analyst], ["Tickets no período", drawer.development.tickets], ["Sem movimento", drawer.development.stale]]} /></DetailSection><DetailSection title="Temas mais frequentes"><Stack spacing={.8}>{drawer.development.themes.map((theme) => <Box key={theme.topic} sx={{ p: 1, borderRadius: 1.5, bgcolor: "background.default" }}><Typography variant="body2"><b>{theme.topic}</b> · {theme.count}</Typography></Box>)}</Stack></DetailSection></>}
    </Drawer>
  </Box>;
}
