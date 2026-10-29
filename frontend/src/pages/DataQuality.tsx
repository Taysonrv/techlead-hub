import { KpiGrid } from "../components/KpiGrid";
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Checkbox, Chip,
  Drawer, FormControl, InputLabel, MenuItem, Select, Stack,
  TextField, Typography, useTheme,
} from "@mui/material";
import { DownloadOutlined, FilterAltOutlined, SearchOutlined } from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";
import { PageHeader } from "../components/PageHeader";
import { AsyncState } from "../components/AsyncState";
import { ContentState } from "../components/ContentState";
import { useFilters } from "../context/FiltersContext";
import { KpiCard } from "../components/KpiCard";
import { DetailFieldGrid, DetailPanelHeader, DetailSection } from "../components/DetailPanel";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

type Sample = {
  id: number; workItemType: string; title: string; state: string; client: string | null;
  module: string | null; category?: string | null; cause?: string | null; reason?: string | null; service?: string | null;
  serviceFirstLevel?: string | null; serviceSecondLevel?: string | null; serviceThirdLevel?: string | null; servicePath?: string | null;
  serviceSuggestion?: { path: string; service: string; module: string | null; confidence: "HIGH" | "MEDIUM" | "LOW"; score: number; evidence: string[]; reasons: string[]; alternatives: Array<{ path: string; service: string; score: number }> } | null;
  classificationReview?: { suggestedCategory: "Problema" | "Dúvida" | null; suggestedCause: string | null; confidence: "ALTA" | "MÉDIA"; evidence: string[]; reason: string } | null;
  assignedToName: string | null; createdByName?: string | null; taskAssignedToName?: string | null; movideskTicket: number | null;
  participantClients?: string | string[] | null;
  participantMovideskTickets?: string | number[] | null;
  registeredVersion?: string | null; deliveredVersion: string | null; taskNumber: number | null; taskState?: string | null;
  taskTitle?: string | null; taskClient?: string | null; source: "AZURE" | "MOVIDESK";
  lastMovement?: string | null; ownerHandoffs?: number; reopenCount?: number;
  resolvedInFirstCall?: boolean | null; satisfactionScore?: number | null;
  satisfactionComment?: string | null;
};
type Data = {
  summary: Record<string, number>;
  samples: Sample[];
  filters: { clients: string[]; users: string[]; types: string[] };
  trend?: Array<{ date: string; total: number; critical: number }>;
};
const metrics = [
  ["problemWithoutCause", "Problema sem causa", "Atendimento aberto com categoria Problema e sem Causa informada. A causa é obrigatória para qualificar a origem do problema e alimentar a análise operacional.", "Classificação"],
  ["doubtWithoutReason", "Dúvida sem motivo", "Atendimento aberto com categoria Dúvida e sem Motivo informado. O motivo deve identificar a natureza da orientação solicitada.", "Classificação"],
  ["withoutCategory", "Ticket sem categoria", "Atendimento aberto sem Categoria informada ou com classificação genérica equivalente a não informado.", "Classificação"],
  ["awaitingReturnOverdue", "Retorno do cliente acima de 3 dias", "Atendimento aberto aguardando retorno do cliente, sem movimentação há mais de três dias. Permite cobrar, reavaliar ou encerrar conforme o processo.", "Prazo"],
  ["reopenedTickets", "Atendimentos reabertos", "Atendimentos ativos que já foram reabertos. Devem ser acompanhados para identificar falha na solução, recorrência ou validação incompleta.", "Recorrência"],
  ["excessiveOwnerHandoffs", "Muitas trocas de responsável", "Atendimentos ativos com três ou mais trocas de responsável. Pode indicar roteamento incorreto, falta de domínio ou quebra de continuidade.", "Coordenação"],
  ["lowSatisfaction", "Baixa satisfação", "Atendimentos dos clientes SIMER com avaliação igual ou inferior a 2. Exige análise do histórico e plano de recuperação.", "Experiência"],
  ["suspectedClassification", "Classificação possivelmente divergente", "Compara título e contexto recente do atendimento com Categoria e Causa informadas. Só sinaliza quando encontra evidência textual de classificação diferente; a sugestão exige validação humana.", "Classificação"],
  ["genericSimerService", "Serviço SIMER genérico", "Atendimentos abertos classificados somente em níveis genéricos como SIAGRI SIMER/SIMER, sem uma rotina específica. São candidatos à revisão do serviço informado.", "Serviço"],
  ["suspectedServiceMismatch", "Possível serviço incorreto", "Atendimentos cujo assunto, categoria e causa apontam para um Serviço SIMER diferente do atualmente classificado. A indicação é assistiva e deve ser validada pelo analista antes de qualquer ajuste.", "Serviço"],
  ["ticketOpenTaskFinished", "Pronto para encerrar", "Ticket ainda pendente, mas a Tarefa foi cancelada ou concluída e possui versão efetivamente entregue. Aguardando validar versão não entra neste recorte.", "Fluxo"],
  ["ticketOpenTaskWithoutDelivery", "Tarefa finalizada sem entrega", "Tarefa concluída vinculada a ticket aberto, porém sem versão entregue registrada no Azure. Exige validar publicação antes de encerrar.", "Fluxo"],
  ["ticketClosedTaskOpen", "Ticket encerrado com Tarefa ativa", "Ticket concluído, fechado ou resolvido enquanto a Tarefa relacionada ainda está em andamento.", "Fluxo"],
  ["activeTaskWithVersion", "Tarefa ativa com versão entregue", "Tarefa não finalizada vinculada a atendimento que já possui versão entregue. Pode indicar estado desatualizado.", "Versão"],
  ["completedWithoutVersion", "Tarefas concluídas sem versão registrada", "Revisão de registros históricos: a tarefa já foi concluída; esta sinalização não representa uma tarefa operacional em aberto.", "Histórico"],
  ["clientMismatch", "Cliente divergente", "O cliente do atendimento não consta como cliente principal nem como cliente participante da Correção ou Evolução relacionada. APOIO não exige cliente.", "Vínculo"],
  ["supportLinkDivergence", "APOIO com vínculo divergente", "APOIO referencia ticket inexistente no recorte ou ticket que aponta para outra Tarefa. Cliente e versão não são obrigatórios para APOIO.", "APOIO"],
  ["danglingTaskTickets", "Referência de Tarefa inexistente", "Ticket aponta para um ID de Tarefa ausente no snapshot atual do Azure.", "Vínculo"],
  ["duplicatedMovideskLinks", "Ticket ligado a várias Tarefas", "O mesmo atendimento Movidesk está como vínculo principal em mais de uma Tarefa; revisar se todas as relações são válidas.", "Vínculo"],
  ["withoutTicket", "Tarefa sem ticket", "Work Item sem atendimento principal, participante ou vínculo reverso no Movidesk.", "Cadastro"],
  ["withoutClient", "Tarefa sem cliente", "Work Item sem cliente principal e sem clientes participantes identificados.", "Cadastro"],
] as const;

const coordinationMetricKeys = new Set([
  "ticketOpenTaskFinished",
  "ticketOpenTaskWithoutDelivery",
  "ticketClosedTaskOpen",
  "danglingTaskTickets",
  "reopenedTickets",
  "excessiveOwnerHandoffs",
  "withoutTicket",
  "withoutClient",
  "problemWithoutCause",
  "doubtWithoutReason",
  "withoutCategory",
  "suspectedClassification",
  "genericSimerService",
]);
const coordinationMetrics = metrics.filter(([key]) => coordinationMetricKeys.has(key));
const supportAnalysts = [
  "ALAN KARDEK DA SILVA BARROS NETO",
  "DÉBORA DAL CORREIA",
  "DIEGO OLIVEIRA ARANTES",
  "LUIZ ANTÔNIO COSTA CUNHA",
  "RENAN BRENO CARVALHO",
  "TAYSON ALVES DE ARAUJO",
  "THIAGO DE LIMA MACHADO",
];
const analystDisplayNames: Record<string, string> = {
  "ALAN KARDEK DA SILVA BARROS NETO": "Alan Kardek da Silva Barros Neto",
  "DÉBORA DAL CORREIA": "Débora Dal Correia",
  "DIEGO OLIVEIRA ARANTES": "Diego Oliveira Arantes",
  "LUIZ ANTÔNIO COSTA CUNHA": "Luiz Antônio Costa Cunha",
  "RENAN BRENO CARVALHO": "Renan Breno Carvalho",
  "TAYSON ALVES DE ARAUJO": "Tayson Alves de Araujo",
  "THIAGO DE LIMA MACHADO": "Thiago de Lima Machado",
};

const priorityWeight: Record<string, number> = {
  ticketClosedTaskOpen: 100,
  ticketOpenTaskFinished: 92,
  ticketOpenTaskWithoutDelivery: 90,
  danglingTaskTickets: 88,
  reopenedTickets: 72,
  excessiveOwnerHandoffs: 68,
  withoutTicket: 64,
  withoutClient: 58,
  problemWithoutCause: 58,
  doubtWithoutReason: 58,
  withoutCategory: 62,
  suspectedClassification: 46,
  genericSimerService: 48,
};

function priorityLevel(score: number) {
  if (score >= 80) return { label: "Crítica", color: "error" as const };
  if (score >= 55) return { label: "Alta", color: "warning" as const };
  if (score >= 30) return { label: "Média", color: "info" as const };
  return { label: "Baixa", color: "default" as const };
}

export function DataQuality() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [type, setType] = useState<string[]>([]);
  const { clients: client, setClients: setClient, analysts: user, setAnalysts: setUser } = useFilters();
  const [search, setSearch] = useState("");
  const [issue, setIssue] = useState(() => searchParams.get("issue") ?? "");
  const [selected, setSelected] = useState<Sample | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true); setError(false);
      const response = await api.get<Data>("/workspace/data-quality", { params: {
        type: type.length ? type.join("|||") : undefined, client: client.length ? client.join("|||") : undefined, user: user.length ? user.join("|||") : undefined,
        issue: issue || undefined, search: search || undefined,
      }, signal, timeout: 45_000 });
      if (signal?.aborted) return;
      setData(response.data);
    } catch (requestError) {
      if (signal?.aborted) return;
      console.error("Erro ao carregar pendências:", requestError);
      setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [type, client, user, issue, search]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), search ? 650 : 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, search]);

  async function open(item: Sample) {
    setSelected(item); setDetail(null);
    if (item.source === "AZURE") {
      const response = await api.get<Record<string, unknown>>(`/azure-work-items/${item.id}`);
      setDetail(response.data);
    }
  }

  function issueGuidance() {
    const metric = metrics.find(([key]) => key === issue);
    const actions: Record<string, string> = {
      problemWithoutCause: "Informar a Causa no Movidesk para o atendimento classificado como Problema.",
      doubtWithoutReason: "Informar o Motivo no Movidesk para o atendimento classificado como Dúvida.",
      withoutCategory: "Informar a Categoria correta do atendimento no Movidesk.",
      suspectedClassification: "Validar a sugestão contextual contra o atendimento e ajustar Categoria/Causa somente quando a evidência fizer sentido.",
      genericSimerService: "Revisar o atendimento e substituir o Serviço SIMER genérico pela rotina específica quando aplicável.",
      suspectedServiceMismatch: "Validar a sugestão contra o contexto do atendimento e corrigir o Serviço no Movidesk somente quando fizer sentido.",
      awaitingReturnOverdue: "Cobrar retorno, registrar a ação e reavaliar manutenção do ticket aberto.",
      reopenedTickets: "Revisar causa da reabertura e confirmar se a solução anterior foi efetiva.",
      excessiveOwnerHandoffs: "Definir responsável principal e revisar o roteamento do atendimento.",
      lowSatisfaction: "Analisar o histórico e registrar uma ação de recuperação com o cliente.",
      ticketOpenTaskFinished: "Validar a entrega e concluir o atendimento.",
      ticketOpenTaskWithoutDelivery: "Confirmar publicação ou preencher a versão entregue.",
      ticketClosedTaskOpen: "Atualizar o estado da Tarefa ou reabrir o atendimento.",
      activeTaskWithVersion: "Validar se a Tarefa já pode ser concluída.",
      completedWithoutVersion: "Revisar e registrar, se disponível, a versão que foi entregue. A tarefa permanece concluída; esta é uma correção de histórico, não uma pendência operacional ativa.",
      clientMismatch: "Revisar cliente principal e clientes participantes.",
      supportLinkDivergence: "Corrigir o vínculo do APOIO com o atendimento.",
      danglingTaskTickets: "Corrigir ou remover a referência de Tarefa no atendimento.",
      duplicatedMovideskLinks: "Validar quais Tarefas devem permanecer vinculadas.",
      withoutTicket: "Vincular a Tarefa a um atendimento da equipe.",
      withoutClient: "Informar cliente principal ou participante quando aplicável.",
    };
    return { reason: metric?.[2] ?? "Inconsistência identificada no cruzamento de dados.", action: actions[issue] ?? "Revisar o registro e seus vínculos." };
  }

  async function exportPendingList() {
    let rows = data?.samples ?? [];
    setExportError("");
    if (issue && user.length === 1) {
      try {
        setExporting(true);
        const response = await api.get<Data>("/workspace/data-quality", { params: {
          type: type.length ? type.join("|||") : undefined,
          client: client.length ? client.join("|||") : undefined,
          user: user[0],
          issue,
          search: search || undefined,
          exportAll: true,
        }, timeout: 60_000 });
        rows = response.data.samples;
      } catch {
        setExportError("Não foi possível gerar o relatório completo. Tente novamente.");
        return;
      } finally {
        setExporting(false);
      }
    }
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const guidance = issueGuidance();
    const header = ["Origem", "Tipo", "Atendimento", "Assunto / Título", "Cliente do ticket", "Cliente da Tarefa", "Categoria", "Causa", "Motivo", "Sugestão Categoria", "Sugestão Causa", "Confiança revisão", "Evidências revisão", "Serviço", "Responsável atual", "Responsável da Tarefa", "Criador da Tarefa (Azure)", "Status do atendimento", "Última movimentação", "Reaberturas", "Trocas de responsável", "Satisfação", "Tarefa", "Estado da Tarefa", "Versão de cadastro", "Versão entregue", "Motivo da pendência", "Ação recomendada"];
    const csv = [header, ...rows.map((item) => [
      item.source,
      item.workItemType,
      item.movideskTicket ?? item.id,
      item.title,
      item.client,
      item.taskClient,
      item.category,
      item.cause,
      item.reason,
      item.classificationReview?.suggestedCategory,
      item.classificationReview?.suggestedCause,
      item.classificationReview?.confidence,
      item.classificationReview?.evidence?.join(", "),
      item.servicePath ?? item.service,
      item.assignedToName,
      item.taskAssignedToName ?? (item.source === "AZURE" ? item.assignedToName : null),
      item.createdByName,
      item.state,
      item.lastMovement,
      item.reopenCount,
      item.ownerHandoffs,
      item.satisfactionScore,
      item.taskNumber,
      item.taskState,
      item.registeredVersion,
      item.deliveredVersion,
      guidance.reason,
      guidance.action,
    ])].map((row) => row.map(escape).join(";")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const analyst = user.length ? user.join("-").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() : "equipe";
    anchor.href = url;
    const recorte = (issue || "todas-pendencias").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    anchor.download = `pendencias-${recorte}-${analyst}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  const hasFilters = Boolean(type.length || client.length || user.length || search || issue);
  const filterCount = type.length + client.length + user.length + (search ? 1 : 0);
  const title = useMemo(() => metrics.find(([key]) => key === issue)?.[1] ?? "Pendências encontradas", [issue]);
  const historicalReview = issue === "completedWithoutVersion";
  const selectedTotal = issue ? Number(data?.summary[issue] ?? 0) : data?.samples.length ?? 0;
  const analystOptions = useMemo(() => [...new Set([...supportAnalysts, ...(data?.filters.users ?? [])])], [data?.filters.users]);
  const rankedPriorities = useMemo(() => coordinationMetrics
    .map(([key, label, info, group]) => {
      const total = Number(data?.summary[key] ?? 0);
      const weight = priorityWeight[key] ?? 40;
      const score = total > 0 ? Math.min(100, Math.round(weight * 0.72 + Math.min(total, 20) / 20 * 28)) : 0;
      return { key, label, info, group, total, score, level: priorityLevel(score) };
    })
    .filter((item) => item.total > 0)
    .sort((left, right) => right.score - left.score || right.total - left.total), [data]);

  return <Box sx={{ pb: 4 }}>
    <PageHeader eyebrow="Pendências e governança" title="Qualidade operacional" description="Inconsistências de tickets e tarefas, classificação, continuidade e vínculos entre Movidesk e Azure na operação SIMER." meta={issue ? `${selectedTotal} ocorrência(s) no recorte selecionado` : `${coordinationMetrics.reduce((total, [key]) => total + (data?.summary[key] ?? 0), 0)} sinal(is) prioritário(s)`} />

    <Card variant="outlined" sx={{ mt: 1.5, overflow: "visible" }}><CardContent sx={{ p: { xs: 1.5, md: 1.75 }, "&:last-child": { pb: { xs: 1.5, md: 1.75 } } }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ mb: 1.75, justifyContent: "space-between", alignItems: { md: "center" } }}>
        <Box>
          <Stack direction="row" spacing={.75} sx={{ alignItems: "center" }}>
            <FilterAltOutlined fontSize="small" color="primary" />
            <Typography sx={{ fontWeight: 850 }}>Recorte das pendências</Typography>
            {filterCount > 0 && <Chip size="small" color="primary" variant="outlined" label={`${filterCount} filtro(s)`} />}
          </Stack>
          <Typography variant="caption" color="text.secondary">Todos os indicadores respeitam o escopo SIMER. Tickets são atribuídos pelo responsável atual; tarefas, pelo criador ou responsável atual.</Typography>
        </Box>
        <Stack direction="row" spacing={.75} useFlexGap sx={{ flexWrap: "wrap" }}>
          {issue && <Chip size="small" color="warning" variant="outlined" label={`Drill-down · ${title}`} />}
          <Button size="small" disabled={!hasFilters} onClick={() => { setType([]); setClient([]); setUser([]); setSearch(""); setIssue(""); }}>Limpar filtros</Button>
        </Stack>
      </Stack>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" },
          gap: 1.2,
          alignItems: "start",
          "& .MuiInputBase-root": { minHeight: 42, height: 42 },
          "& .MuiAutocomplete-inputRoot": {
            minHeight: "42px !important",
            height: "42px !important",
            flexWrap: "nowrap",
            py: "0 !important",
          },
          "& .MuiAutocomplete-input": { minWidth: "0 !important" },
          "& .MuiAutocomplete-tag": { maxWidth: 150 },
        }}
      >
        <TextField fullWidth size="small" label="Pesquisar" placeholder="ID, título, assunto ou vínculo..." value={search} onChange={(e) => setSearch(e.target.value)} slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <SearchOutlined sx={{ mr: 1, color: "text.disabled" }} /> } }} />
        <FormControl fullWidth size="small"><InputLabel shrink id="dataquality-select-1-label">Tipo</InputLabel><Select notched labelId="dataquality-select-1-label" inputProps={{ id: "dataquality-select-1", "aria-labelledby": "dataquality-select-1-label" }} multiple displayEmpty label="Tipo" value={type} onChange={(e) => { const next = typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value; const options = data?.filters.types ?? []; setType(next.includes("__all__") ? [...options] : next.filter((item) => item !== "__all__")); }} renderValue={(selected) => !selected.length ? "Todos os tipos" : selected.length === 1 ? selected[0] : `${selected.length} tipos`}><MenuItem value="__all__"><Checkbox size="small" checked={Boolean(data?.filters.types.length) && type.length === data?.filters.types.length} indeterminate={type.length > 0 && type.length < (data?.filters.types.length ?? 0)} />Todos os tipos</MenuItem>{data?.filters.types.map((value) => <MenuItem key={value} value={value}><Checkbox size="small" checked={type.includes(value)} />{value}</MenuItem>)}</Select></FormControl>
        <Autocomplete multiple fullWidth size="small" options={data?.filters.clients ?? []} value={client} onChange={(_, value) => setClient(value)} renderInput={(params) => <TextField {...params} label="Cliente" placeholder={!client.length ? "Todos os clientes" : undefined} slotProps={{ inputLabel: { shrink: true } }} />} limitTags={1} />
        <FormControl fullWidth size="small">
          <InputLabel id="dataquality-analyst-label" shrink>Analista</InputLabel>
          <Select
            multiple
            displayEmpty
            labelId="dataquality-analyst-label"
            label="Analista"
            value={user}
            onChange={(event) => {
              const next = typeof event.target.value === "string" ? event.target.value.split(",") : event.target.value;
              setUser(next);
            }}
            renderValue={(selected) => selected.length === 1
              ? analystDisplayNames[selected[0]] ?? selected[0]
              : selected.length > 1 ? `${selected.length} analistas selecionados` : "Todos os analistas"}
          >
            {analystOptions.map((analyst) => (
              <MenuItem key={analyst} value={analyst}>
                <Checkbox size="small" checked={user.includes(analyst)} />
                {analystDisplayNames[analyst] ?? analyst}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    </CardContent></Card>
    {error && <Alert severity="error" sx={{ mt: 2 }}>Não foi possível analisar a qualidade dos dados.</Alert>}
    <Box sx={{ mt: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { sm: "end" }, mb: 1.25, gap: 1 }}>
        <Box><Typography variant="h6" sx={{ fontWeight: 900 }}>Fila prioritária</Typography><Typography variant="body2" color="text.secondary">Sinais com ação operacional direta. Clique em um card para abrir as evidências.</Typography></Box>
        <Chip size="small" variant="outlined" label="Movidesk + Azure · SIMER" />
      </Stack>
      <KpiGrid>
        {coordinationMetrics.map(([key, label, info, group]) => <KpiCard key={key} title={label} value={data?.summary[key] ?? 0} subtitle={group} info={info} accent={issue === key ? aliareColors.green : group === "Fluxo" ? "#ef4444" : group === "Versão" ? "#8b5cf6" : group === "Vínculo" ? "#f59e0b" : group === "Serviço" ? "#0891b2" : "#2676b9"} active={issue === key} onClick={() => setIssue(issue === key ? "" : key)} />)}
      </KpiGrid>
    </Box>

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, mb: 1.5 }}>
        <Box><Typography variant="h6" sx={{ fontWeight: 900 }}>O que atacar primeiro</Typography><Typography variant="body2" color="text.secondary">Ranking explicável por criticidade operacional e volume. O score prioriza fluxo quebrado e vínculos antes de qualidade cadastral.</Typography></Box>
        <Chip variant="outlined" label={rankedPriorities.length ? `${rankedPriorities.length} frentes ativas` : "Sem frentes críticas"} />
      </Stack>
      <Stack spacing={.8}>
        {rankedPriorities.slice(0, 6).map((item, index) => (
          <Button key={item.key} onClick={() => setIssue(item.key)} sx={{ display: "grid", gridTemplateColumns: { xs: "32px minmax(0,1fr) auto", md: "40px minmax(0,1fr) 90px 80px" }, gap: 1, alignItems: "center", textTransform: "none", textAlign: "left", border: "1px solid", borderColor: issue === item.key ? "primary.main" : "divider", borderRadius: 2, p: 1.1 }}>
            <Typography sx={{ fontWeight: 900, color: "text.secondary" }}>#{index + 1}</Typography>
            <Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ fontWeight: 850 }}>{item.label}</Typography><Typography variant="caption" color="text.secondary">{item.group} · peso operacional {priorityWeight[item.key] ?? 40}</Typography></Box>
            <Chip size="small" color={item.level.color} label={item.level.label} />
            <Typography sx={{ display: { xs: "none", md: "block" }, fontWeight: 900, textAlign: "right" }}>{item.score}/100</Typography>
          </Button>
        ))}
        {!rankedPriorities.length && <Alert severity="success">Nenhuma pendência prioritária foi identificada no recorte atual.</Alert>}
      </Stack>
    </CardContent></Card>

    <Card variant="outlined" sx={{ mt: 2, overflow: "hidden" }}><CardContent>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, mb: 1.5 }}>
        <Box sx={{ flex: 1, textAlign: "center" }}><Typography variant="h6" sx={{ fontWeight: 850 }}>Prioridades por grupo</Typography><Typography variant="body2" color="text.secondary">Somente pendências com ação direta da coordenação.</Typography></Box>
        <Chip label={`${coordinationMetrics.length} indicadores essenciais`} variant="outlined" />
      </Stack>
      <Box sx={{ width: "100%", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={Array.from(new Set(coordinationMetrics.map(([, , , group]) => group))).map((group) => ({ group, total: coordinationMetrics.filter(([, , , itemGroup]) => itemGroup === group).reduce((sum, [key]) => sum + Number(data?.summary[key] ?? 0), 0) }))} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
            <CartesianGrid stroke={theme.palette.divider} strokeDasharray="4 4" vertical={false} opacity={0.55} />
            <XAxis dataKey="group" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
            <ChartTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, color: theme.palette.text.primary, boxShadow: "0 14px 36px rgba(0,0,0,.18)" }} labelStyle={{ color: theme.palette.text.primary, fontWeight: 800 }} itemStyle={{ color: theme.palette.text.primary }} cursor={false} />
            <Bar dataKey="total" name="Pendências" fill={aliareColors.info} radius={[7, 7, 2, 2]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </CardContent></Card>

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Box><Typography variant="h6" sx={{ fontWeight: 850 }}>Tendência das pendências operacionais</Typography><Typography variant="body2" color="text.secondary">Histórico diário do recorte atual, separado por analista, cliente e tipo.</Typography></Box>
        <Chip variant="outlined" label={data?.trend?.length ? `${data.trend.length} dia(s) neste recorte` : "Aguardando primeiro snapshot"} />
      </Stack>
      <Box sx={{ height: 260, mt: 1.5 }}>
        {data?.trend?.length ? <><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trend.map((item) => ({ ...item, day: new Date(item.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) }))}><CartesianGrid stroke={theme.palette.divider} strokeDasharray="4 4" vertical={false} opacity={.5}/><XAxis dataKey="day" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false}/><ChartTooltip cursor={false} contentStyle={{ borderRadius: 12, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, color: theme.palette.text.primary }}/><Line type="linear" dataKey="total" name="Pendências prioritárias" stroke={theme.palette.primary.main} strokeWidth={2.5} dot={{ r: 4 }}/><Line type="linear" dataKey="critical" name="Fluxo crítico" stroke={theme.palette.error.main} strokeWidth={2.2} dot={{ r: 3 }}/></LineChart></ResponsiveContainer>{data.trend.length === 1 && <Typography variant="caption" color="text.secondary">Primeiro snapshot deste recorte. A comparação ficará disponível após os próximos registros diários.</Typography>}</> : <Alert severity="info">Ainda não há snapshots diários para este recorte. A tendência começará a ser comparável após o primeiro registro.</Alert>}
      </Box>
    </CardContent></Card>

    <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2 }}>
      <Card variant="outlined"><CardContent>
        <Typography variant="h6" sx={{ fontWeight: 850 }}>Mapa das pendências</Typography>
        <Typography variant="body2" color="text.secondary">Distribuição de todos os detectores por domínio. Ajuda a identificar onde a operação está acumulando dívida.</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(210px,.82fr) minmax(0,1.18fr)" }, gap: 1.25, alignItems: "center", mt: 1 }}>
          <Box sx={{ height: { xs: 220, sm: 235 }, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={Array.from(new Set(metrics.map(([, , , group]) => group))).map((group) => ({ name: group, value: metrics.filter(([, , , itemGroup]) => itemGroup === group).reduce((sum, [key]) => sum + Number(data?.summary[key] ?? 0), 0) })).filter((item) => item.value > 0)} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={2}>
                  {Array.from(new Set(metrics.map(([, , , group]) => group))).map((group) => ({ name: group, value: metrics.filter(([, , , itemGroup]) => itemGroup === group).reduce((sum, [key]) => sum + Number(data?.summary[key] ?? 0), 0) })).filter((item) => item.value > 0).map((item, index) => <Cell key={item.name} fill={[aliareColors.green, aliareColors.info, "#8b5cf6", "#f59e0b", "#0891b2", "#ef4444", "#64748b"][index % 7]} />)}
                </Pie>
                <ChartTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, color: theme.palette.text.primary }} />
              </PieChart>
            </ResponsiveContainer>
          </Box>
          <Stack spacing={.45} sx={{ maxHeight: { md: 215 }, overflowY: "auto" }}>
            {Array.from(new Set(metrics.map(([, , , group]) => group))).map((group) => ({ name: group, value: metrics.filter(([, , , itemGroup]) => itemGroup === group).reduce((sum, [key]) => sum + Number(data?.summary[key] ?? 0), 0) })).filter((item) => item.value > 0).map((item, index) => (
              <Box key={item.name} sx={{ display: "grid", gridTemplateColumns: "9px minmax(0,1fr) auto", gap: .75, alignItems: "center", px: .65, py: .4, borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: [aliareColors.green, aliareColors.info, "#8b5cf6", "#f59e0b", "#0891b2", "#ef4444", "#64748b"][index % 7] }} />
                <Typography variant="caption" noWrap sx={{ fontWeight: 700 }}>{item.name}</Typography>
                <Typography variant="caption" sx={{ fontWeight: 900 }}>{item.value}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </CardContent></Card>
      <Card variant="outlined"><CardContent>
        <Typography variant="h6" sx={{ fontWeight: 850 }}>Cobertura de governança</Typography>
        <Typography variant="body2" color="text.secondary">Indicadores complementares que não precisam ocupar a primeira linha, mas devem permanecer monitorados.</Typography>
        <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
          {metrics.filter(([key]) => !coordinationMetricKeys.has(key)).map(([key, label, , group]) => (
            <Button key={key} variant={issue === key ? "contained" : "outlined"} onClick={() => setIssue(issue === key ? "" : key)} sx={{ minHeight: 54, justifyContent: "space-between", textTransform: "none", px: 1.25 }}>
              <Box sx={{ textAlign: "left", minWidth: 0 }}><Typography sx={{ fontSize: ".78rem", fontWeight: 800 }}>{label}</Typography><Typography variant="caption" sx={{ opacity: .72 }}>{group}</Typography></Box>
              <Chip size="small" label={data?.summary[key] ?? 0} />
            </Button>
          ))}
        </Box>
      </CardContent></Card>
    </Box>

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{historicalReview ? "Revisão do histórico" : issue ? title : "Pendências encontradas"}</Typography>
          <Typography variant="caption" color="text.secondary">{issue ? `${selectedTotal} ocorrência(s) no filtro · ${data?.samples.length ?? 0} exibida(s)` : `${data?.samples.length ?? 0} registro(s) no recorte atual`}</Typography>
        </Box>
        <Button variant="outlined" startIcon={<DownloadOutlined />} disabled={!data?.samples.length || exporting} onClick={() => void exportPendingList()}>
          {exporting ? "Preparando relatório…" : issue && user.length === 1 ? "Exportar relatório completo do analista" : `Exportar lista${user.length ? " visível do analista" : " visível"}`}
        </Button>
      </Stack>
      {historicalReview && <Alert severity="info" sx={{ mt: 1 }}>Os registros abaixo são de tarefas concluídas. O Hub os separa das pendências operacionais ativas; revise apenas o dado histórico de versão.</Alert>}
      {issue === "ticketOpenTaskFinished" && <Alert severity="info" sx={{ mt: 1 }}>A tarefa já foi concluída. A pendência operacional é o atendimento Movidesk que continua aberto e precisa ser encerrado após validar a entrega.</Alert>}
      {issue === "ticketOpenTaskWithoutDelivery" && <Alert severity="warning" sx={{ mt: 1 }}>A tarefa já foi concluída, mas não há versão entregue registrada. A ação pendente é confirmar a publicação e atualizar esse dado antes de encerrar o atendimento.</Alert>}
      {issue === "ticketClosedTaskOpen" && <Alert severity="warning" sx={{ mt: 1 }}>O atendimento foi encerrado enquanto a tarefa permanece ativa. Revise o estado da tarefa com o analista responsável.</Alert>}
      {exportError && <Alert severity="error" sx={{ mt: 1 }}>{exportError}</Alert>}
      {issue && user.length === 1 && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .75 }}>O arquivo buscará todas as ocorrências desta pendência para {user[0]}, sem o limite de linhas da lista exibida.</Typography>}
      {loading ? <AsyncState status="loading" data={data} loading={<ContentState kind="loading" title="Carregando pendências" minHeight={320} />}>{() => null}</AsyncState> : error && !data ? <AsyncState status="error" data={data} error="Não foi possível analisar a qualidade dos dados.">{() => null}</AsyncState> : !data?.samples.length ? <ContentState kind="empty" title="Nenhuma pendência encontrada" description="Ajuste os filtros para consultar outros registros." /> : <Stack spacing={1} sx={{ mt: 2 }}>{data?.samples.map((item) => <Button key={`${item.source}-${item.id}`} onClick={() => void open(item)} sx={{ justifyContent: "flex-start", textTransform: "none", border: "1px solid", borderColor: "divider", p: 1.3, borderRadius: 1.5 }}><Box sx={{ textAlign: "left", minWidth: 0 }}><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Chip size="small" label={item.workItemType} /><Typography sx={{ fontWeight: 750 }}>#{item.source === "MOVIDESK" ? item.movideskTicket ?? item.id : item.id} · {item.title}</Typography></Stack><Typography variant="caption" color="text.secondary">{[item.state, item.client ?? "Sem cliente", item.category ? `Categoria ${item.category}` : "Sem categoria", item.cause ? `Causa ${item.cause}` : "Sem causa", item.reason ? `Motivo ${item.reason}` : "Sem motivo", item.classificationReview?.suggestedCategory ? `Sugestão Categoria ${item.classificationReview.suggestedCategory}` : null, item.classificationReview?.suggestedCause ? `Sugestão Causa ${item.classificationReview.suggestedCause}` : null, item.servicePath ? `Serviço ${item.servicePath}` : "Sem serviço", item.serviceSuggestion ? `Sugestão ${item.serviceSuggestion.service} · ${item.serviceSuggestion.confidence}` : null, item.module ?? "Sem módulo", item.assignedToName ?? "Sem responsável", item.movideskTicket ? `Ticket ${item.movideskTicket}` : "Sem ticket", item.taskNumber ? `Tarefa #${item.taskNumber}` : "Sem Tarefa", item.taskState ?? null, item.registeredVersion ? `Cadastro ${item.registeredVersion}` : null, item.deliveredVersion ? `Entrega ${item.deliveredVersion}` : "Sem versão entregue"].filter(Boolean).join(" · ")}</Typography></Box></Button>)}</Stack>}
    </CardContent></Card>

    <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
      <DetailPanelHeader eyebrow={selected?.workItemType} title={selected?.title ?? "Detalhes do registro"} identifier={`#${selected?.source === "MOVIDESK" ? selected.movideskTicket : selected?.id}`} onClose={() => setSelected(null)} />
      <DetailSection title="Visão operacional"><DetailFieldGrid fields={selected ? Object.entries({ Estado: selected.state, "Cliente principal": selected.client, "Clientes participantes": formatList(selected.participantClients), Categoria: selected.category, Causa: selected.cause, Motivo: selected.reason, "Sugestão de Categoria": selected.classificationReview?.suggestedCategory, "Sugestão de Causa": selected.classificationReview?.suggestedCause, "Confiança da revisão": selected.classificationReview?.confidence, "Evidências da revisão": selected.classificationReview?.evidence?.join(", "), "Análise contextual": selected.classificationReview?.reason, Serviço: selected.servicePath ?? selected.service, "Serviço · 1º nível": selected.serviceFirstLevel, "Serviço · 2º nível": selected.serviceSecondLevel, "Serviço · 3º nível": selected.serviceThirdLevel, Módulo: selected.module, Responsável: selected.assignedToName, "Ticket principal": selected.movideskTicket, "Tickets participantes": formatList(selected.participantMovideskTickets), "Tarefa relacionada": selected.taskNumber ? `#${selected.taskNumber}` : null, "Estado da Tarefa": selected.taskState, "Título da Tarefa": selected.taskTitle, "Cliente da Tarefa": selected.taskClient, "Versão de cadastro": selected.registeredVersion, "Versão entregue": selected.deliveredVersion, "Serviço sugerido": selected.serviceSuggestion?.path, "Confiança da sugestão": selected.serviceSuggestion?.confidence, "Pontuação": selected.serviceSuggestion?.score, "Evidências": selected.serviceSuggestion?.evidence?.join(", "), "Justificativa da sugestão": selected.serviceSuggestion?.reasons?.join(" "), "Alternativas consideradas": selected.serviceSuggestion?.alternatives?.map((item) => `${item.service} (${item.score})`).join(" · "), "Motivo da pendência": issueGuidance().reason, "Última movimentação": selected.lastMovement, Reaberturas: selected.reopenCount, "Trocas de responsável": selected.ownerHandoffs, "Resolvido no primeiro contato": selected.resolvedInFirstCall === null || selected.resolvedInFirstCall === undefined ? "Não informado" : selected.resolvedInFirstCall ? "Sim" : "Não", Satisfação: selected.satisfactionScore, "Comentário da satisfação": selected.satisfactionComment, "Ação recomendada": issueGuidance().action }).map(([label, value]) => [label, String(value ?? "Não informado")]) : []} /></DetailSection>
      {detail && <Alert severity="info" sx={{ mt: 2 }}>Detalhes completos e histórico carregados do Azure.</Alert>}
      <Button variant="contained" sx={{ mt: 3 }} onClick={() => selected && navigate(selected.source === "MOVIDESK" ? `/tickets?movidesk=${selected.movideskTicket}` : `${route(selected.workItemType)}?task=${selected.id}`)}>Abrir registro completo</Button>
    </Drawer>
  </Box>;
}

function route(type: string) { const value = type.toLocaleLowerCase("pt-BR"); return value.includes("apoio") ? "/apoios" : value.includes("evolu") ? "/evolucoes" : "/correcoes"; }
function formatList(value: string | string[] | number[] | null | undefined) { if (Array.isArray(value)) return value.join(", ") || "Não informado"; return value?.replace(/^,|,$/g, "").replace(/\r?\n/g, ", ") || "Não informado"; }
