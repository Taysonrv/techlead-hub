import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress,
  Drawer, FormControl, InputLabel, MenuItem, Select, Stack,
  TextField, Typography, useTheme,
} from "@mui/material";
import { DownloadOutlined, SearchOutlined } from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { DetailFieldGrid, DetailPanelHeader, DetailSection } from "../components/DetailPanel";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

type Sample = {
  id: number; workItemType: string; title: string; state: string; client: string | null;
  module: string | null; category?: string | null; cause?: string | null; service?: string | null;
  serviceFirstLevel?: string | null; serviceSecondLevel?: string | null; serviceThirdLevel?: string | null; servicePath?: string | null;
  serviceSuggestion?: { path: string; service: string; module: string | null; confidence: "HIGH" | "MEDIUM" | "LOW"; score: number; evidence: string[]; reasons: string[]; alternatives: Array<{ path: string; service: string; score: number }> } | null;
  assignedToName: string | null; movideskTicket: number | null;
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
};
const metrics = [
  ["awaitingReturnWithoutCause", "Aguardando retorno sem causa", "Atendimento aberto de cliente SIMER aguardando retorno, mas sem causa informada ou com valor genérico. A causa deve registrar por que o atendimento depende do cliente.", "Classificação"],
  ["awaitingReturnOverdue", "Retorno do cliente acima de 3 dias", "Atendimento aberto aguardando retorno do cliente, sem movimentação há mais de três dias. Permite cobrar, reavaliar ou encerrar conforme o processo.", "Prazo"],
  ["reopenedTickets", "Atendimentos reabertos", "Atendimentos ativos que já foram reabertos. Devem ser acompanhados para identificar falha na solução, recorrência ou validação incompleta.", "Recorrência"],
  ["excessiveOwnerHandoffs", "Muitas trocas de responsável", "Atendimentos ativos com três ou mais trocas de responsável. Pode indicar roteamento incorreto, falta de domínio ou quebra de continuidade.", "Coordenação"],
  ["lowSatisfaction", "Baixa satisfação", "Atendimentos dos clientes SIMER com avaliação igual ou inferior a 2. Exige análise do histórico e plano de recuperação.", "Experiência"],
  ["suspectedClassification", "Categoria ou causa a revisar", "Atendimento aberto de cliente SIMER sem categoria ou causa, com valor genérico ou combinação contraditória entre dúvida/orientação e problema/erro.", "Classificação"],
  ["withoutService", "Atendimentos sem serviço", "Atendimentos abertos sem Serviço ou sem qualquer nível da hierarquia de serviço do Movidesk. Devem ser classificados para permitir análise correta por módulo e rotina.", "Serviço"],
  ["genericSimerService", "Serviço SIMER genérico", "Atendimentos abertos classificados somente em níveis genéricos como SIAGRI SIMER/SIMER, sem uma rotina específica. São candidatos à revisão do serviço informado.", "Serviço"],
  ["suspectedServiceMismatch", "Possível serviço incorreto", "Atendimentos cujo assunto, categoria e causa apontam para um Serviço SIMER diferente do atualmente classificado. A indicação é assistiva e deve ser validada pelo analista antes de qualquer ajuste.", "Serviço"],
  ["ticketOpenTaskFinished", "Pronto para encerrar", "Ticket ainda pendente, mas a Tarefa foi cancelada ou concluída e possui versão efetivamente entregue. Aguardando validar versão não entra neste recorte.", "Fluxo"],
  ["ticketOpenTaskWithoutDelivery", "Tarefa finalizada sem entrega", "Tarefa concluída vinculada a ticket aberto, porém sem versão entregue registrada no Azure. Exige validar publicação antes de encerrar.", "Fluxo"],
  ["ticketClosedTaskOpen", "Ticket encerrado com Tarefa ativa", "Ticket concluído, fechado ou resolvido enquanto a Tarefa relacionada ainda está em andamento.", "Fluxo"],
  ["activeTaskWithVersion", "Tarefa ativa com versão entregue", "Tarefa não finalizada vinculada a atendimento que já possui versão entregue. Pode indicar estado desatualizado.", "Versão"],
  ["completedWithoutVersion", "Tarefa finalizada sem versão entregue", "Correção ou evolução concluída e vinculada a atendimento sem versão entregue no Azure.", "Versão"],
  ["versionMismatch", "Versão cadastrada ≠ entregue", "Correção ou evolução possui versão cadastrada diferente da versão efetivamente registrada na entrega. O indicador ajuda a identificar classificação desatualizada ou entrega divergente.", "Versão"],
  ["clientMismatch", "Cliente divergente", "O cliente do atendimento não consta como cliente principal nem como cliente participante da Correção ou Evolução relacionada. APOIO não exige cliente.", "Vínculo"],
  ["supportLinkDivergence", "APOIO com vínculo divergente", "APOIO referencia ticket inexistente no recorte ou ticket que aponta para outra Tarefa. Cliente e versão não são obrigatórios para APOIO.", "APOIO"],
  ["danglingTaskTickets", "Referência de Tarefa inexistente", "Ticket aponta para um ID de Tarefa ausente no snapshot atual do Azure.", "Vínculo"],
  ["duplicatedMovideskLinks", "Ticket ligado a várias Tarefas", "O mesmo atendimento Movidesk está como vínculo principal em mais de uma Tarefa; revisar se todas as relações são válidas.", "Vínculo"],
  ["withoutTicket", "Tarefa sem ticket", "Work Item sem atendimento principal, participante ou vínculo reverso no Movidesk.", "Cadastro"],
  ["withoutClient", "Tarefa sem cliente", "Work Item sem cliente principal e sem clientes participantes identificados.", "Cadastro"],
] as const;

const coordinationMetricKeys = new Set([
  "awaitingReturnOverdue",
  "reopenedTickets",
  "excessiveOwnerHandoffs",
  "lowSatisfaction",
  "ticketOpenTaskFinished",
  "ticketClosedTaskOpen",
  "danglingTaskTickets",
  "versionMismatch",
]);
const coordinationMetrics = metrics.filter(([key]) => coordinationMetricKeys.has(key));

export function DataQuality() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [type, setType] = useState<string[]>([]);
  const [client, setClient] = useState<string[]>([]);
  const [user, setUser] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [issue, setIssue] = useState(() => searchParams.get("issue") ?? "");
  const [selected, setSelected] = useState<Sample | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

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
  }, [load]);

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
      awaitingReturnWithoutCause: "Informar a causa antes de manter o atendimento aguardando retorno.",
      suspectedClassification: "Revisar categoria e causa conforme o assunto e a causa raiz.",
      withoutService: "Informar o Serviço correto do atendimento no Movidesk.",
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
      completedWithoutVersion: "Informar a versão efetivamente entregue.",
      versionMismatch: "Validar a versão planejada no cadastro e a versão efetivamente entregue antes de ajustar o registro.",
      clientMismatch: "Revisar cliente principal e clientes participantes.",
      supportLinkDivergence: "Corrigir o vínculo do APOIO com o atendimento.",
      danglingTaskTickets: "Corrigir ou remover a referência de Tarefa no atendimento.",
      duplicatedMovideskLinks: "Validar quais Tarefas devem permanecer vinculadas.",
      withoutTicket: "Vincular a Tarefa a um atendimento da equipe.",
      withoutClient: "Informar cliente principal ou participante quando aplicável.",
    };
    return { reason: metric?.[2] ?? "Inconsistência identificada no cruzamento de dados.", action: actions[issue] ?? "Revisar o registro e seus vínculos." };
  }

  function exportPendingList() {
    const rows = data?.samples ?? [];
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const guidance = issueGuidance();
    const header = ["Origem", "Tipo", "Atendimento", "Assunto / Título", "Cliente do ticket", "Cliente da Tarefa", "Categoria", "Causa", "Serviço", "Analista", "Status do atendimento", "Última movimentação", "Reaberturas", "Trocas de responsável", "Satisfação", "Tarefa", "Estado da Tarefa", "Versão de cadastro", "Versão entregue", "Motivo da pendência", "Ação recomendada"];
    const csv = [header, ...rows.map((item) => [
      item.source,
      item.workItemType,
      item.movideskTicket ?? item.id,
      item.title,
      item.client,
      item.taskClient,
      item.category,
      item.cause,
      item.servicePath ?? item.service,
      item.assignedToName,
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
    ])].map((row) => row.map(escape).join(";")).join("\\r\\n");
    const blob = new Blob(["\\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const analyst = user.length ? user.join("-").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() : "equipe";
    anchor.href = url;
    const recorte = (issue || "todas-pendencias").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    anchor.download = `pendencias-${recorte}-${analyst}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const hasFilters = Boolean(type.length || client.length || user.length || search || issue);
  const title = useMemo(() => metrics.find(([key]) => key === issue)?.[1] ?? "Pendências encontradas", [issue]);

  return <Box sx={{ pb: 4 }}>
    <PageHeader eyebrow="Governança" title="Pendências" description="Central de inconsistências cadastrais, vínculos e etapas divergentes entre atendimentos, Tarefas e versões." meta={`${data?.samples.length ?? 0} registro(s) no recorte atual`} />

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr repeat(3, minmax(170px, 1fr)) auto" }, gap: 1.2 }}>
        <TextField size="small" label="Pesquisar ID ou título" value={search} onChange={(e) => setSearch(e.target.value)} slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: 1, color: "text.disabled" }} /> } }} />
        <FormControl size="small"><InputLabel>Tipo</InputLabel><Select multiple displayEmpty label="Tipo" value={type} onChange={(e) => setType(typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value)} renderValue={(selected) => !selected.length ? "Todos" : selected.length === 1 ? selected[0] : `${selected.length} tipos`}><MenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); setType([]); }}><Checkbox size="small" checked={!type.length} />Todos</MenuItem>{data?.filters.types.map((value) => <MenuItem key={value} value={value}><Checkbox size="small" checked={type.includes(value)} />{value}</MenuItem>)}</Select></FormControl>
        <Autocomplete multiple size="small" options={data?.filters.clients ?? []} value={client} onChange={(_, value) => setClient(value)} renderInput={(params) => <TextField {...params} label="Cliente" />} limitTags={1} />
        <Autocomplete multiple size="small" options={data?.filters.users ?? []} value={user} onChange={(_, value) => setUser(value)} renderInput={(params) => <TextField {...params} label="Usuário do suporte" />} limitTags={1} />
        <Button disabled={!hasFilters} onClick={() => { setType([]); setClient([]); setUser([]); setSearch(""); setIssue(""); }}>Limpar</Button>
      </Box>
    </CardContent></Card>

    {error && <Alert severity="error" sx={{ mt: 2 }}>Não foi possível analisar a qualidade dos dados.</Alert>}
    <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(4,1fr)" }, gap: 2 }}>
      {coordinationMetrics.map(([key, label, info, group]) => <KpiCard key={key} title={label} value={data?.summary[key] ?? 0} subtitle={group} info={info} accent={issue === key ? aliareColors.green : group === "Fluxo" ? "#ef4444" : group === "Versão" ? "#8b5cf6" : group === "Vínculo" ? "#f59e0b" : group === "APOIO" ? "#0891b2" : "#2676b9"} active={issue === key} onClick={() => setIssue(issue === key ? "" : key)} />)}
    </Box>

    <Card variant="outlined" sx={{ mt: 2, overflow: "hidden" }}><CardContent>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, mb: 1.5 }}>
        <Box><Typography variant="h6" sx={{ fontWeight: 850 }}>Mapa de pendências por grupo</Typography><Typography variant="body2" color="text.secondary">Concentração das inconsistências para orientar a atuação da equipe.</Typography></Box>
        <Chip label="Clique nos cards acima para investigar" variant="outlined" />
      </Stack>
      <Box sx={{ width: "100%", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={Array.from(new Set(coordinationMetrics.map(([, , , group]) => group))).map((group) => ({ group, total: coordinationMetrics.filter(([, , , itemGroup]) => itemGroup === group).reduce((sum, [key]) => sum + Number(data?.summary[key] ?? 0), 0) }))} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
            <CartesianGrid stroke={theme.palette.divider} strokeDasharray="4 4" vertical={false} opacity={0.55} />
            <XAxis dataKey="group" tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
            <ChartTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, boxShadow: "0 14px 36px rgba(0,0,0,.18)" }} cursor={{ fill: theme.palette.action.hover }} />
            <Bar dataKey="total" name="Pendências" fill={aliareColors.info} radius={[7, 7, 2, 2]} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </CardContent></Card>

    <Card variant="outlined" sx={{ mt: 2 }}><CardContent>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">{data?.samples.length ?? 0} registro(s) no recorte atual</Typography>
        </Box>
        <Button variant="outlined" startIcon={<DownloadOutlined />} disabled={!data?.samples.length} onClick={exportPendingList}>
          Exportar lista{user ? " do analista" : ""}
        </Button>
      </Stack>
      {loading ? <Box sx={{ py: 8, textAlign: "center" }}><CircularProgress /></Box> : <Stack spacing={1} sx={{ mt: 2 }}>{data?.samples.map((item) => <Button key={`${item.source}-${item.id}`} onClick={() => void open(item)} sx={{ justifyContent: "flex-start", textTransform: "none", border: "1px solid", borderColor: "divider", p: 1.3, borderRadius: 1.5 }}><Box sx={{ textAlign: "left", minWidth: 0 }}><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Chip size="small" label={item.workItemType} /><Typography sx={{ fontWeight: 750 }}>#{item.source === "MOVIDESK" ? item.movideskTicket ?? item.id : item.id} · {item.title}</Typography></Stack><Typography variant="caption" color="text.secondary">{[item.state, item.client ?? "Sem cliente", item.category ? `Categoria ${item.category}` : "Sem categoria", item.cause ? `Causa ${item.cause}` : "Sem causa", item.servicePath ? `Serviço ${item.servicePath}` : "Sem serviço", item.serviceSuggestion ? `Sugestão ${item.serviceSuggestion.service} · ${item.serviceSuggestion.confidence}` : null, item.module ?? "Sem módulo", item.assignedToName ?? "Sem responsável", item.movideskTicket ? `Ticket ${item.movideskTicket}` : "Sem ticket", item.taskNumber ? `Tarefa #${item.taskNumber}` : "Sem Tarefa", item.taskState ?? null, item.registeredVersion ? `Cadastro ${item.registeredVersion}` : null, item.deliveredVersion ? `Entrega ${item.deliveredVersion}` : "Sem versão entregue"].filter(Boolean).join(" · ")}</Typography></Box></Button>)}</Stack>}
    </CardContent></Card>

    <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
      <DetailPanelHeader eyebrow={selected?.workItemType} title={selected?.title ?? "Detalhes do registro"} identifier={`#${selected?.source === "MOVIDESK" ? selected.movideskTicket : selected?.id}`} onClose={() => setSelected(null)} />
      <DetailSection title="Visão operacional"><DetailFieldGrid fields={selected ? Object.entries({ Estado: selected.state, "Cliente principal": selected.client, "Clientes participantes": formatList(selected.participantClients), Categoria: selected.category, Causa: selected.cause, Serviço: selected.servicePath ?? selected.service, "Serviço · 1º nível": selected.serviceFirstLevel, "Serviço · 2º nível": selected.serviceSecondLevel, "Serviço · 3º nível": selected.serviceThirdLevel, Módulo: selected.module, Responsável: selected.assignedToName, "Ticket principal": selected.movideskTicket, "Tickets participantes": formatList(selected.participantMovideskTickets), "Tarefa relacionada": selected.taskNumber ? `#${selected.taskNumber}` : null, "Estado da Tarefa": selected.taskState, "Título da Tarefa": selected.taskTitle, "Cliente da Tarefa": selected.taskClient, "Versão de cadastro": selected.registeredVersion, "Versão entregue": selected.deliveredVersion, "Serviço sugerido": selected.serviceSuggestion?.path, "Confiança da sugestão": selected.serviceSuggestion?.confidence, "Pontuação": selected.serviceSuggestion?.score, "Evidências": selected.serviceSuggestion?.evidence?.join(", "), "Justificativa da sugestão": selected.serviceSuggestion?.reasons?.join(" "), "Alternativas consideradas": selected.serviceSuggestion?.alternatives?.map((item) => `${item.service} (${item.score})`).join(" · "), "Motivo da pendência": issueGuidance().reason, "Última movimentação": selected.lastMovement, Reaberturas: selected.reopenCount, "Trocas de responsável": selected.ownerHandoffs, "Resolvido no primeiro contato": selected.resolvedInFirstCall === null || selected.resolvedInFirstCall === undefined ? "Não informado" : selected.resolvedInFirstCall ? "Sim" : "Não", Satisfação: selected.satisfactionScore, "Comentário da satisfação": selected.satisfactionComment, "Ação recomendada": issueGuidance().action }).map(([label, value]) => [label, String(value ?? "Não informado")]) : []} /></DetailSection>
      {detail && <Alert severity="info" sx={{ mt: 2 }}>Detalhes completos e histórico carregados do Azure.</Alert>}
      <Button variant="contained" sx={{ mt: 3 }} onClick={() => selected && navigate(selected.source === "MOVIDESK" ? `/tickets?movidesk=${selected.movideskTicket}` : `${route(selected.workItemType)}?task=${selected.id}`)}>Abrir registro completo</Button>
    </Drawer>
  </Box>;
}

function route(type: string) { const value = type.toLocaleLowerCase("pt-BR"); return value.includes("apoio") ? "/apoios" : value.includes("evolu") ? "/evolucoes" : "/correcoes"; }
function formatList(value: string | string[] | number[] | null | undefined) { if (Array.isArray(value)) return value.join(", ") || "Não informado"; return value?.replace(/^,|,$/g, "").replace(/\r?\n/g, ", ") || "Não informado"; }
