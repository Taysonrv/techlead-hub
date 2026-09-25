import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  MenuItem,
  Select,
  Divider,
  Drawer,
  IconButton,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Area,
  AreaChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useColorMode } from "../context/ColorModeContext";

import { useNavigate } from "react-router-dom";

import { api } from "../services/api";
import { PeriodFilter } from "../components/PeriodFilter";
import { PageHeader } from "../components/PageHeader";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { KpiCard as ExecutiveKpiCard } from "../components/KpiCard";
import { ExportTicketsButton } from "../components/ExportTicketsButton";
import { useFilters } from "../context/FiltersContext";
import { aliareColors } from "../theme/theme";
import { calculateOfficialSla } from "../utils/officialSla";
import {
  chartPalette,
  semanticChartColors,
} from "../theme/chartPalette";

/* =========================================================
   TIPOS
========================================================= */

type AzureTaskSummary = {
  id: number;
  workItemType: string;
  title: string;
  state: string;
  assignedToName: string | null;
  client: string | null;
  criticality: string | null;
  module: string | null;
  process: string | null;
  movideskTicket: number | null;
  deliveredVersion: string | null;
  prioritized: boolean | null;
  blockedProcess: boolean | null;
  azureChangedAt: string | null;
  stateChangedAt?: string | null;
  syncedAt?: string | null;
};

type Ticket = {
  id: number;
  movideskId: number;

  protocol: string | null;
  subject: string;

  client: string | null;
  contact: string | null;

  owner: string | null;
  team: string | null;

  category: string | null;
  cause: string | null;
  urgency: string | null;

  status: string;
  baseStatus: string | null;

  justification: string | null;

  service: string | null;
  department: string | null;

  createdDate: string;
  dueDate: string | null;

  firstResponseDueDate: string | null;
  firstResponseDate: string | null;

  resolvedDate: string | null;
  closedDate: string | null;

  lifetimeMinutes: number | null;
  stoppedMinutes: number | null;

  taskNumber: number | null;
  taskStatus: string | null;
  deliveredVersion: string | null;

  azureWorkItem?: AzureTaskSummary | null;

  responseSlaIndicator?: string | null;
  solutionSlaIndicator?: string | null;

  importSource?: string | null;
  importedAt?: string | null;
  importBatch?: string | null;
};

type RankingItem = {
  label: string;
  total: number;
};


type AttentionLevel =
  | "critico"
  | "alto"
  | "medio";


type CardPeriod = "7d" | "30d" | "60d" | "90d" | "month" | "semester" | "year";

type Severity =
  | "default"
  | "error"
  | "warning"
  | "success";

type DrilldownState = {
  title: string;
  subtitle?: string;
  tickets: Ticket[];
} | null;

type MetricInfoDefinition = {
  title: string;
  summary: string;
  calculation: string;
  source: string;
  reference: string;
  periodRule: string;
  notes?: string;
};

/* =========================================================
   DASHBOARD
========================================================= */

export function Dashboard() {
  const navigate = useNavigate();
  const { mode } = useColorMode();
  const isDark = mode === "dark";
  const chartGrid = isDark ? "rgba(148,163,184,.16)" : "#E4E7EC";
  const chartTick = isDark ? "#8EA4BC" : "#667085";
  const chartTooltipStyle = {
    background: isDark ? "rgba(7,23,39,.96)" : "#FFFFFF",
    border: `1px solid ${isDark ? "rgba(56,189,248,.24)" : "#E4E7EC"}`,
    borderRadius: 12,
    boxShadow: isDark ? "0 14px 34px rgba(0,0,0,.38)" : "0 12px 28px rgba(16,24,40,.12)",
    color: isDark ? "#EAF4FF" : "#101828",
  };

  const [tickets, setTickets] =
    useState<Ticket[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);
  const loadRequestRef = useRef<AbortController | null>(null);

  const [drilldown, setDrilldown] =
    useState<DrilldownState>(null);

  const [selectedTicket, setSelectedTicket] =
    useState<Ticket | null>(null);

  const [copyMessage, setCopyMessage] =
    useState("");
  const [categoryPeriod, setCategoryPeriod] = useState<CardPeriod>("30d");
  const [statusPeriod, setStatusPeriod] = useState<CardPeriod>("30d");

  const {
    period,
    effectiveStartDate,
    effectiveEndDate,
  } = useFilters();

  /* =======================================================
     CARREGAMENTO
  ======================================================= */

  useEffect(() => {
    const controller = new AbortController();
    loadRequestRef.current?.abort();
    loadRequestRef.current = controller;

    async function loadTickets() {
      try {
        setLoading(true);
        setError(null);
        const response = await api.get<any>("/dashboard/tickets", { signal: controller.signal });
        if (!controller.signal.aborted) setTickets(response.data);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Erro ao carregar dashboard:", err);
        setError("Não foi possível carregar os dados do Dashboard. Verifique se o backend está rodando.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadTickets();
    return () => controller.abort();
  }, []);

  /* =======================================================
     PERÍODO + CONJUNTOS EXECUTIVOS
  ======================================================= */

  const periodBounds = useMemo(() => ({
    start: startOfDay(effectiveStartDate),
    end: endOfDay(effectiveEndDate),
  }), [effectiveStartDate, effectiveEndDate]);

  const openedInPeriod = useMemo(() => tickets.filter((ticket) =>
    isDateInPeriod(ticket.createdDate, periodBounds.start, periodBounds.end)
  ), [tickets, periodBounds]);

  // Backlog atual não é limitado pela data de abertura.
  const pendingTickets = useMemo(() => tickets.filter(isOpen), [tickets]);

  const resolvedInPeriod = useMemo(() => tickets.filter((ticket) =>
    isDateInPeriod(ticket.resolvedDate, periodBounds.start, periodBounds.end)
  ), [tickets, periodBounds]);

  const closedInPeriod = useMemo(() => tickets.filter((ticket) =>
    isDateInPeriod(ticket.closedDate, periodBounds.start, periodBounds.end)
  ), [tickets, periodBounds]);

  // Rankings e gráficos de entrada continuam baseados na abertura do período.
  const filteredTickets = openedInPeriod;

  const newTickets = useMemo(() => pendingTickets.filter((ticket) => ticket.baseStatus === "New"), [pendingTickets]);
  const attendanceTickets = useMemo(() => pendingTickets.filter((ticket) => ticket.baseStatus === "InAttendance"), [pendingTickets]);
  const stoppedTickets = useMemo(() => pendingTickets.filter((ticket) => ticket.baseStatus === "Stopped"), [pendingTickets]);
  const criticalTickets = useMemo(() => pendingTickets.filter((ticket) => normalize(ticket.urgency) === "critica"), [pendingTickets]);

  const responseSla = useMemo(() => calculateOfficialSla(openedInPeriod, "response"), [openedInPeriod]);
  const solutionSla = useMemo(() => calculateOfficialSla(openedInPeriod, "solution"), [openedInPeriod]);

  const summary = useMemo(() => ({
    abertosNoPeriodo: openedInPeriod.length,
    pendentes: pendingTickets.length,
    resolvidosNoPeriodo: resolvedInPeriod.length,
    fechadosNoPeriodo: closedInPeriod.length,
    novos: newTickets.length,
    emAtendimento: attendanceTickets.length,
    parados: stoppedTickets.length,
    criticos: criticalTickets.length,
  }), [openedInPeriod, pendingTickets, resolvedInPeriod, closedInPeriod, newTickets, attendanceTickets, stoppedTickets, criticalTickets]);

  /* =======================================================
     DESENVOLVIMENTO / AZURE DEVOPS

     A mesma Task pode estar vinculada a mais de um atendimento.
     Por isso os indicadores abaixo contam Work Items únicos,
     e não linhas de Ticket.
  ======================================================= */

  const azureWorkItems = useMemo(() => {
    const byId = new Map<number, AzureTaskSummary>();

    tickets.forEach((ticket) => {
      if (ticket.azureWorkItem) {
        byId.set(
          ticket.azureWorkItem.id,
          ticket.azureWorkItem
        );
      }
    });

    return Array.from(byId.values());
  }, [tickets]);

  const azureDevelopment = useMemo(() => {
    const corrections = azureWorkItems.filter(
      (item) => item.workItemType === "Correção Clientes"
    );

    const evolutions = azureWorkItems.filter(
      (item) => item.workItemType === "Evolução"
    );

    const prioritized = azureWorkItems.filter(
      (item) => item.prioritized === true
    );

    const blocked = azureWorkItems.filter(
      (item) => item.blockedProcess === true
    );

    const unassigned = azureWorkItems.filter(
      (item) => !item.assignedToName?.trim()
    );

    const highOrCritical = azureWorkItems.filter((item) => {
      const criticality = normalize(item.criticality);
      return criticality === "alta" || criticality === "critica";
    });

    const quality = azureWorkItems.filter((item) => {
      const state = normalize(item.state);
      return state === "fila qualidade" || state === "qualidade";
    });

    const development = azureWorkItems.filter((item) => {
      const state = normalize(item.state);
      return [
        "fila desenvolvimento",
        "desenvolvimento",
        "bloqueado correcao",
        "bloqueado retrabalho",
      ].includes(state);
    });

    const latestSync = azureWorkItems.reduce<Date | null>(
      (latest, item) => {
        if (!item.syncedAt) return latest;
        const date = new Date(item.syncedAt);
        if (Number.isNaN(date.getTime())) return latest;
        return !latest || date > latest ? date : latest;
      },
      null
    );

    return {
      corrections,
      evolutions,
      prioritized,
      blocked,
      unassigned,
      highOrCritical,
      quality,
      development,
      latestSync,
    };
  }, [azureWorkItems]);

  const cardPeriodBounds = (value: CardPeriod) => {
    const now = new Date();
    const end = endOfDay(now);
    let start = startOfDay(now);
    if (value === "7d") start.setDate(start.getDate() - 7);
    if (value === "30d") start.setDate(start.getDate() - 30);
    if (value === "60d") start.setDate(start.getDate() - 60);
    if (value === "90d") start.setDate(start.getDate() - 90);
    if (value === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
    if (value === "semester") start = new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1);
    if (value === "year") start = new Date(now.getFullYear(), 0, 1);
    return { start: startOfDay(start), end };
  };
  const categoryBounds = cardPeriodBounds(categoryPeriod);
  const categoryTickets = useMemo(() => tickets.filter((ticket) => isDateInPeriod(ticket.createdDate, categoryBounds.start, categoryBounds.end)), [tickets, categoryPeriod]);
  const statusBounds = cardPeriodBounds(statusPeriod);
  const statusTickets = useMemo(() => tickets.filter((ticket) => isOpen(ticket) && isDateInPeriod(ticket.createdDate, statusBounds.start, statusBounds.end)), [tickets, statusPeriod]);

  /* =======================================================
     CATEGORIAS
  ======================================================= */

  const categories =
    useMemo(
      () =>
        groupByField(
          categoryTickets,
          "category",
          "Sem categoria"
        ),
      [categoryTickets]
    );

  /* =======================================================
     ANÁLISES GERENCIAIS
  ======================================================= */

  const dailyFlow = useMemo(() => {
    const opened = new Map<string, number>();
    const resolved = new Map<string, number>();

    openedInPeriod.forEach((ticket) => {
      const date = new Date(ticket.createdDate);
      if (Number.isNaN(date.getTime())) return;
      const key = formatIsoDate(date);
      opened.set(key, (opened.get(key) ?? 0) + 1);
    });

    resolvedInPeriod.forEach((ticket) => {
      if (!ticket.resolvedDate) return;
      const date = new Date(ticket.resolvedDate);
      if (Number.isNaN(date.getTime())) return;
      const key = formatIsoDate(date);
      resolved.set(key, (resolved.get(key) ?? 0) + 1);
    });

    const result: Array<{ sortDate: string; date: string; opened: number; resolved: number }> = [];
    const cursor = startOfDay(effectiveStartDate);
    const lastDay = endOfDay(effectiveEndDate);

    while (cursor <= lastDay) {
      const key = formatIsoDate(cursor);
      result.push({
        sortDate: key,
        date: formatShortDate(key),
        opened: opened.get(key) ?? 0,
        resolved: resolved.get(key) ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }, [openedInPeriod, resolvedInPeriod, effectiveStartDate, effectiveEndDate]);

  const ticketsEligibleForCause = useMemo(
    () => filteredTickets.filter((ticket) => normalizeComparableText(ticket.category) !== "bug"),
    [filteredTickets]
  );

  const causes = useMemo(
    () => groupByField(ticketsEligibleForCause, "cause", "Sem causa").slice(0, 8),
    [ticketsEligibleForCause]
  );

  const statusNewTickets = useMemo(() => statusTickets.filter((ticket) => ticket.baseStatus === "New"), [statusTickets]);
  const statusAttendanceTickets = useMemo(() => statusTickets.filter((ticket) => ticket.baseStatus === "InAttendance"), [statusTickets]);
  const statusStoppedTickets = useMemo(() => statusTickets.filter((ticket) => ticket.baseStatus === "Stopped"), [statusTickets]);
  const backlogStatus = useMemo(() => [
    { label: "Novos", total: statusNewTickets.length },
    { label: "Em atendimento", total: statusAttendanceTickets.length },
    { label: "Parados", total: statusStoppedTickets.length },
  ], [statusNewTickets, statusAttendanceTickets, statusStoppedTickets]);

  /* =======================================================
     PONTOS DE ATENÇÃO
  ======================================================= */

  const attentionTickets =
    useMemo(() => {
      const now =
        new Date();

      return filteredTickets
        .filter(isOpen)
        .map((ticket) => {
          const created =
            new Date(
              ticket.createdDate
            );

          const ageHours =
            Math.max(
              0,
              Math.floor(
                (now.getTime() -
                  created.getTime()) /
                  (1000 *
                    60 *
                    60)
              )
            );

          const reasons:
            string[] = [];

          const critical =
            normalize(
              ticket.urgency
            ) === "critica";

          if (critical) {
            reasons.push(
              "Urgência crítica"
            );
          }

          if (
            ticket.baseStatus ===
            "Stopped"
          ) {
            reasons.push(
              "Ticket parado"
            );
          }

          if (
            ageHours >= 48
          ) {
            reasons.push(
              "Aberto há mais de 48 horas"
            );
          }

          if (
            ticket.stoppedMinutes !==
              null &&
            ticket.stoppedMinutes >=
              1440
          ) {
            reasons.push(
              "Mais de 24 horas parado"
            );
          }

          if (!ticket.owner) {
            reasons.push(
              "Sem responsável"
            );
          }

          if (
            ticket.dueDate &&
            new Date(ticket.dueDate) < now
          ) {
            reasons.push(
              "Prazo vencido"
            );
          }

          if (
            ticket.firstResponseDueDate &&
            !ticket.firstResponseDate &&
            new Date(
              ticket.firstResponseDueDate
            ) < now
          ) {
            reasons.push(
              "Primeira resposta vencida"
            );
          }

          let level:
            AttentionLevel =
            "medio";

          if (
            critical ||
            reasons.includes(
              "Primeira resposta vencida"
            )
          ) {
            level =
              "critico";
          } else if (
            ticket.baseStatus ===
              "Stopped" ||
            !ticket.owner ||
            ageHours >= 72 ||
            reasons.includes(
              "Prazo vencido"
            )
          ) {
            level = "alto";
          }

          return {
            ...ticket,
            ageHours,
            level,
            reasons,
          };
        })
        .filter(
          (ticket) =>
            ticket.reasons.length >
            0
        )
        .sort((a, b) => {
          const levelDiff =
            priorityWeight(
              b.level
            ) -
            priorityWeight(
              a.level
            );

          if (
            levelDiff !== 0
          ) {
            return levelDiff;
          }

          return (
            b.ageHours -
            a.ageHours
          );
        });
    }, [filteredTickets]);

  const attentionSummary =
    useMemo(
      () => ({
        total:
          attentionTickets.length,

        criticos:
          attentionTickets.filter(
            (ticket) =>
              ticket.level ===
              "critico"
          ).length,

        altos:
          attentionTickets.filter(
            (ticket) =>
              ticket.level ===
              "alto"
          ).length,

        medios:
          attentionTickets.filter(
            (ticket) =>
              ticket.level ===
              "medio"
          ).length,
      }),
      [attentionTickets]
    );

  /* =======================================================
     DRILL-DOWN
  ======================================================= */

  function showTickets(
    title: string,
    list: Ticket[],
    subtitle?: string
  ) {
    setSelectedTicket(null);

    setDrilldown({
      title,
      subtitle,
      tickets: list,
    });
  }

  async function copyTicketNumber(
    ticket: Ticket
  ) {
    try {
      await navigator.clipboard.writeText(
        String(ticket.movideskId)
      );

      setCopyMessage(
        `Ticket #${ticket.movideskId} copiado.`
      );
    } catch {
      setCopyMessage(
        "Não foi possível copiar o número do ticket."
      );
    }
  }

  async function copyTicketSummary(
    ticket: Ticket
  ) {
    const summaryText = [
      `Ticket #${ticket.movideskId}`,
      ticket.subject,
      `Cliente: ${ticket.client ?? "—"}`,
      `Solicitante: ${ticket.contact ?? "—"}`,
      `Responsável: ${ticket.owner ?? "—"}`,
      `Squad: ${ticket.team ?? "—"}`,
      `Categoria: ${ticket.category ?? "—"}`,
      `Causa: ${ticket.cause ?? "—"}`,
      `Serviço: ${ticket.service ?? "—"}`,
      `Urgência: ${ticket.urgency ?? "—"}`,
      `Status: ${ticket.status}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(
        summaryText
      );

      setCopyMessage(
        "Resumo do atendimento copiado."
      );
    } catch {
      setCopyMessage(
        "Não foi possível copiar o resumo."
      );
    }
  }

  function openMovideskTicket(
    ticket: Ticket
  ) {
    const url =
      `https://suporte.aliare.co/Ticket/Edit/${ticket.movideskId}`;

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  }

  /* =======================================================
     CARDS
  ======================================================= */

  const cards = [
    {
      title: "Abertos",
      value: summary.abertosNoPeriodo,
      description: "Abertos no período selecionado",
      severity: "default" as Severity,
      info: {
        title: "Abertos",
        summary: "Tickets cuja data de abertura está dentro do período selecionado.",
        calculation: "Contagem dos tickets com createdDate entre o início e o fim do período.",
        source: "Movidesk",
        reference: "Ticket.createdDate",
        periodRule: "Respeita integralmente o período global selecionado.",
        notes: "Clique no card para abrir exatamente os tickets que compõem o indicador.",
      },
      onClick: () => showTickets("Tickets abertos no período", openedInPeriod, "Data de abertura dentro do período selecionado"),
    },
    {
      title: "Pendentes",
      value: summary.pendentes,
      description: "Backlog atual em andamento",
      severity: "warning" as Severity,
      info: {
        title: "Pendentes",
        summary: "Backlog atual de tickets ainda ativos, independentemente da data de abertura.",
        calculation: "Contagem de tickets com baseStatus New, InAttendance ou Stopped.",
        source: "Movidesk",
        reference: "Ticket.baseStatus",
        periodRule: "Não é limitado pela data de abertura, pois representa o backlog atual.",
        notes: "Clique para visualizar todos os tickets que permanecem ativos.",
      },
      onClick: () => showTickets("Backlog atual", pendingTickets, "Tickets que permanecem ativos neste momento"),
    },
    {
      title: "Resolvidos",
      value: summary.resolvidosNoPeriodo,
      description: "Resolvidos no período selecionado",
      severity: "success" as Severity,
      info: {
        title: "Resolvidos",
        summary: "Tickets cuja resolução ocorreu dentro do período selecionado.",
        calculation: "Contagem dos tickets com resolvedDate dentro do período.",
        source: "Movidesk",
        reference: "Ticket.resolvedDate",
        periodRule: "Usa a data de resolução, e não a data de abertura.",
        notes: "Clique para abrir os tickets resolvidos no período.",
      },
      onClick: () => showTickets("Tickets resolvidos no período", resolvedInPeriod, "Data de resolução dentro do período selecionado"),
    },
    {
      title: "Fechados",
      value: summary.fechadosNoPeriodo,
      description: "Fechados no período selecionado",
      severity: "success" as Severity,
      info: {
        title: "Fechados",
        summary: "Tickets cuja data de fechamento está dentro do período selecionado.",
        calculation: "Contagem dos tickets com closedDate dentro do período.",
        source: "Movidesk",
        reference: "Ticket.closedDate",
        periodRule: "Usa a data de fechamento, e não a data de abertura.",
      },
      onClick: () => showTickets("Tickets fechados no período", closedInPeriod, "Data de fechamento dentro do período selecionado"),
    },
    {
      title: "SLA 1ª Resposta",
      value: formatSlaPercentage(responseSla),
      description: formatSlaDescription(responseSla),
      severity: slaSeverity(responseSla),
      info: {
        title: "SLA 1ª Resposta",
        summary: "Percentual de tickets medidos que receberam a primeira resposta dentro do prazo.",
        calculation: "Tickets dentro do prazo ÷ tickets com medição válida × 100.",
        source: "Indicador oficial do Movidesk",
        reference: "responseSlaIndicator",
        periodRule: "Considera tickets abertos no período selecionado.",
        notes: "Registros sem medição ficam fora do denominador.",
      },
      onClick: () => showTickets("SLA de primeira resposta", responseSla.measuredTickets, `${responseSla.within} dentro • ${responseSla.outside} fora • ${responseSla.unmeasured} sem medição`),
    },
    {
      title: "SLA Solução",
      value: formatSlaPercentage(solutionSla),
      description: formatSlaDescription(solutionSla),
      severity: slaSeverity(solutionSla),
      info: {
        title: "SLA Solução",
        summary: "Percentual oficial de solução dentro do prazo no recorte de atendimentos.",
        calculation: "Tickets com indicador dentro do prazo ÷ tickets com indicador oficial válido × 100.",
        source: "Indicador oficial do Movidesk",
        reference: "solutionSlaIndicator",
        periodRule: "Considera tickets abertos no período selecionado, igual às telas Clientes e Desempenho.",
        notes: "Registros sem medição ficam fora do denominador.",
      },
      onClick: () => showTickets("SLA de solução", solutionSla.measuredTickets, `${solutionSla.within} dentro • ${solutionSla.outside} fora • ${solutionSla.unmeasured} sem medição`),
    },
    {
      title: "Críticos",
      value: summary.criticos,
      description: "Pendentes com urgência crítica",
      severity: "error" as Severity,
      info: {
        title: "Críticos",
        summary: "Tickets atualmente pendentes classificados com urgência crítica.",
        calculation: "Ticket aberto e urgência normalizada igual a Crítica.",
        source: "Movidesk",
        reference: "Ticket.urgency + Ticket.baseStatus",
        periodRule: "Representa o backlog atual, independentemente da abertura.",
      },
      onClick: () => showTickets("Tickets críticos", criticalTickets, "Prioridade imediata no backlog atual"),
    },
    {
      title: "Parados",
      value: summary.parados,
      description: "Pendentes em situação de parada",
      severity: "warning" as Severity,
      info: {
        title: "Parados",
        summary: "Tickets atualmente em status de espera ou parada.",
        calculation: "Contagem de tickets com baseStatus = Stopped.",
        source: "Movidesk",
        reference: "Ticket.baseStatus",
        periodRule: "Representa o backlog atual.",
      },
      onClick: () => showTickets("Tickets parados", stoppedTickets, "Chamados atualmente parados"),
    },
  ];

  /* =======================================================
     LOADING / ERROR
  ======================================================= */

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent:
            "center",
          mt: 8,
        }}
      >
        <CircularProgress
          sx={{
            color:
              aliareColors.green,
          }}
        />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        {error}
      </Alert>
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <Box sx={{
      mx: { xs: -1, md: -2 },
      mt: { xs: -1, md: -2 },
      p: { xs: 1.5, md: 2.5 },
      minHeight: "100vh",
      borderRadius: { xs: 0, md: 3 },
      background: isDark
        ? "radial-gradient(circle at 18% 0%, rgba(0,199,142,.08), transparent 26%), radial-gradient(circle at 88% 8%, rgba(47,111,237,.10), transparent 28%), linear-gradient(145deg,#061421 0%,#081A2C 52%,#06111D 100%)"
        : "linear-gradient(180deg,#F8FAFC,#F4F6F8)",
      "& .recharts-cartesian-grid line": { stroke: chartGrid },
      "& .recharts-cartesian-axis-tick text": { fill: chartTick },
      "& .recharts-default-tooltip": chartTooltipStyle,
    }}>
      {/* =================================================
          CABEÇALHO
      ================================================= */}

      <PageHeader
        eyebrow="Operação"
        title="Dashboard Executivo"
        description="Visão consolidada da operação de suporte"
        meta={<>{periodLabel(period)}{" • "}{filteredTickets.length} ticket(s) analisado(s)</>}
        action={<PeriodFilter />}
      />

      {/* =================================================
          KPIs
      ================================================= */}

      <Box
        sx={{
          display: "grid",

          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            lg: "repeat(4, minmax(0, 1fr))",
          },

          gap: {
            xs: 1.25,
            md: 1.5,
            xl: 2,
          },

          mb: 2.5,
        }}
      >
        {cards.map(
          (card) => (
            <KpiCard
              key={card.title}
              title={
                card.title
              }
              value={
                card.value
              }
              description={
                card.description
              }
              severity={
                card.severity
              }
              info={
                card.info
              }
              onClick={
                card.onClick
              }
            />
          )
        )}
      </Box>

      {/* =================================================
          DESENVOLVIMENTO / AZURE DEVOPS
      ================================================= */}

      <Card
        elevation={0}
        sx={{
          mb: 2.5,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
        }}
      >
        <CardContent>
          <Stack
            direction={{
              xs: "column",
              md: "row",
            }}
            spacing={1.5}
            sx={{
              justifyContent: "space-between",
              alignItems: {
                xs: "stretch",
                md: "center",
              },
              mb: 2,
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: "1.05rem",
                }}
              >
                Desenvolvimento
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                Work Items do Azure vinculados aos atendimentos do snapshot atual
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: "block",
                  mt: 0.35,
                }}
              >
                {azureWorkItems.length} Task(s) única(s)
                {" • "}
                última sincronização:{" "}
                {azureDevelopment.latestSync
                  ? formatDateTime(
                      azureDevelopment.latestSync.toISOString()
                    )
                  : "indisponível"}
              </Typography>
            </Box>

            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{
                flexWrap: "wrap",
              }}
            >
              <Button
                size="small"
                variant="outlined"
                onClick={() => navigate("/correcoes")}
              >
                Ver Correções
              </Button>

              <Button
                size="small"
                variant="outlined"
                onClick={() => navigate("/evolucoes")}
              >
                Ver Evoluções
              </Button>
            </Stack>
          </Stack>

          {azureWorkItems.length === 0 ? (
            <Alert severity="info">
              Nenhum Work Item do Azure foi localizado nos atendimentos do snapshot atual.
            </Alert>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  lg: "repeat(3, minmax(0, 1fr))",
                  xl: "repeat(3, minmax(0, 1fr))",
                },
                gap: 1.25,
              }}
            >
              <DevelopmentMetric
                title="Correções"
                value={azureDevelopment.corrections.length}
                description="Tasks de correção vinculadas"
                info={{
                  title: "Correções",
                  summary: "Correções do Azure vinculadas aos tickets presentes no snapshot atual.",
                  calculation: "Contagem distinta de Work Items do tipo Correção Clientes.",
                  source: "Azure DevOps",
                  reference: "System.WorkItemType",
                  periodRule: "Usa os Work Items vinculados ao snapshot atual de tickets.",
                }}
                onClick={() => navigate("/correcoes")}
              />

              <DevelopmentMetric
                title="Evoluções"
                value={azureDevelopment.evolutions.length}
                description="Tasks de evolução vinculadas"
                info={{
                  title: "Evoluções",
                  summary: "Evoluções do Azure vinculadas aos tickets presentes no snapshot atual.",
                  calculation: "Contagem distinta de Work Items do tipo Evolução.",
                  source: "Azure DevOps",
                  reference: "System.WorkItemType",
                  periodRule: "Usa os Work Items vinculados ao snapshot atual de tickets.",
                }}
                onClick={() => navigate("/evolucoes")}
              />

              <DevelopmentMetric
                title="Priorizadas"
                value={azureDevelopment.prioritized.length}
                description="Work Items priorizados"
                severity="warning"
                info={{
                  title: "Priorizadas", summary: "Work Items sinalizados como priorizados no Azure DevOps.",
                  calculation: "Contagem distinta de Work Items com prioritized = true.", source: "Azure DevOps",
                  reference: "Campo de priorização", periodRule: "Snapshot atual de Work Items vinculados.",
                }}
                onClick={() => showTickets("Tasks priorizadas", tickets.filter((ticket) => ticket.azureWorkItem?.prioritized === true), "Tickets vinculados a Work Items priorizados")}
              />

              <DevelopmentMetric
                title="Bloqueadas"
                value={azureDevelopment.blocked.length}
                description="Processo sinalizado como bloqueado"
                severity="error"
                info={{
                  title: "Bloqueadas", summary: "Work Items com processo sinalizado como bloqueado no Azure DevOps.",
                  calculation: "Contagem distinta de Work Items com blockedProcess = true.", source: "Azure DevOps",
                  reference: "Campo de processo bloqueado", periodRule: "Snapshot atual de Work Items vinculados.",
                }}
                onClick={() => showTickets("Tasks bloqueadas", tickets.filter((ticket) => ticket.azureWorkItem?.blockedProcess === true), "Tickets vinculados a Work Items bloqueados")}
              />

              <DevelopmentMetric
                title="Sem responsável"
                value={azureDevelopment.unassigned.length}
                description="Sem responsável no Azure"
                severity="warning"
                info={{
                  title: "Sem responsável", summary: "Work Items vinculados sem responsável definido no Azure DevOps.",
                  calculation: "assignedToName vazio.", source: "Azure DevOps", reference: "System.AssignedTo",
                  periodRule: "Snapshot atual de Work Items vinculados.",
                }}
                onClick={() => showTickets("Tasks sem responsável", tickets.filter((ticket) => ticket.azureWorkItem && !ticket.azureWorkItem.assignedToName?.trim()), "Tickets vinculados a Work Items sem responsável")}
              />

              <DevelopmentMetric
                title="Alta / Crítica"
                value={azureDevelopment.highOrCritical.length}
                description={`${azureDevelopment.development.length} em desenvolvimento • ${azureDevelopment.quality.length} em qualidade`}
                severity={
                  azureDevelopment.highOrCritical.length > 0
                    ? "error"
                    : "default"
                }
                info={{
                  title: "Alta / Crítica", summary: "Work Items com criticidade Alta ou Crítica.",
                  calculation: "Contagem distinta por criticality normalizada em Alta ou Crítica.", source: "Azure DevOps",
                  reference: "Campo de criticidade", periodRule: "Snapshot atual de Work Items vinculados.",
                  notes: "O subtítulo mostra quantos itens estão em desenvolvimento e qualidade.",
                }}
                onClick={() => showTickets("Tasks de alta criticidade", tickets.filter((ticket) => { const value = normalize(ticket.azureWorkItem?.criticality); return value === "alta" || value === "critica"; }), "Tickets vinculados a Work Items de criticidade Alta ou Crítica")}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* =================================================
          SEM DADOS
      ================================================= */}

      {filteredTickets.length ===
        0 && (
        <Alert
          severity="info"
          sx={{
            mb: 2,
            borderRadius: 2,
          }}
        >
          Nenhum ticket foi encontrado no período selecionado.
        </Alert>
      )}

      {filteredTickets.length >
        0 && (
        <>
          {/* =============================================
              VISÃO ANALÍTICA PRINCIPAL
          ============================================== */}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
              gap: 2,
              mb: 2,
            }}
          >
            <DonutAnalysisCard
              title="Tickets por Categoria"
              subtitle="Distribuição no período"
              data={categories.slice(0, 6)}
              colors={chartPalette}
              onItemClick={(label) => showTickets(`Categoria: ${label}`, categoryTickets.filter((ticket) => (ticket.category || "Sem categoria") === label), periodLabel(categoryPeriod))}
              period={categoryPeriod}
              onPeriodChange={setCategoryPeriod}
            />

            <DonutAnalysisCard
              title="Status dos Tickets"
              subtitle="Composição dos tickets abertos no período"
              data={backlogStatus}
              colors={[semanticChartColors.normal, semanticChartColors.positive, semanticChartColors.stopped]}
              onItemClick={(label) => {
                const map: Record<string, Ticket[]> = {
                  "Novos": statusNewTickets,
                  "Em atendimento": statusAttendanceTickets,
                  "Parados": statusStoppedTickets,
                };
                showTickets(`Status: ${label}`, map[label] ?? [], periodLabel(statusPeriod));
              }}
              period={statusPeriod}
              onPeriodChange={setStatusPeriod}
            />
          </Box>

          {/* =============================================
              EVOLUÇÃO MENSAL POR CATEGORIA
          ============================================== */}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", xl: "1.25fr .75fr" },
              gap: 2,
              my: 2,
            }}
          >
            <CardBase>
              <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "center", alignItems: "center", gap: 1 }}>
                <Box sx={{ textAlign: "center" }}>
                  <Typography sx={{ fontWeight: 850, fontSize: "1.05rem" }}>
                    Abertos x Resolvidos
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Fluxo diário no período • identifica entrada acima da capacidade de resolução
                  </Typography>
                </Box>
              </Stack>
              <Box sx={{ height: 255, mt: 1.5 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyFlow} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id="openedFlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={semanticChartColors.normal} stopOpacity={0.24} />
                        <stop offset="95%" stopColor={semanticChartColors.normal} stopOpacity={0.01} />
                      </linearGradient>
                      <linearGradient id="resolvedFlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={semanticChartColors.positive} stopOpacity={0.20} />
                        <stop offset="95%" stopColor={semanticChartColors.positive} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGrid} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={24} interval="preserveStartEnd" tickMargin={8} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={42} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Area type="monotone" dataKey="opened" name="Abertos" stroke={semanticChartColors.normal} strokeWidth={2.4} fill="url(#openedFlow)" activeDot={{ r: 6, cursor: "pointer", onClick: (_event, payload: any) => { const day = payload?.payload?.sortDate; if (day) showTickets(`Abertos em ${formatShortDate(day)}`, openedInPeriod.filter((ticket) => formatIsoDate(new Date(ticket.createdDate)) === day), "Tickets abertos no dia selecionado"); } }} />
                    <Area type="monotone" dataKey="resolved" name="Resolvidos" stroke={semanticChartColors.positive} strokeWidth={2.4} fill="url(#resolvedFlow)" activeDot={{ r: 6, cursor: "pointer", onClick: (_event, payload: any) => { const day = payload?.payload?.sortDate; if (day) showTickets(`Resolvidos em ${formatShortDate(day)}`, resolvedInPeriod.filter((ticket) => Boolean(ticket.resolvedDate) && formatIsoDate(new Date(ticket.resolvedDate!)) === day), "Tickets resolvidos no dia selecionado"); } }} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
              <Stack direction="row" spacing={2} sx={{ mt: .5, justifyContent: "center", alignItems: "center" }}>
                <Typography variant="caption" sx={{ color: semanticChartColors.normal, fontWeight: 800 }}>● Abertos</Typography>
                <Typography variant="caption" sx={{ color: semanticChartColors.positive, fontWeight: 800 }}>● Resolvidos</Typography>
              </Stack>
            </CardBase>

            <CardBase>
              <Box sx={{ textAlign: "center" }}><Typography sx={{ fontWeight: 850, fontSize: "1.05rem" }}>
                Principais causas
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Causas mais frequentes • clique na leitura para direcionar ação preventiva
              </Typography></Box>
              {causes.length ? <Box sx={{ height: Math.max(250, Math.min(330, causes.slice(0, 6).length * 44 + 64)), mt: 1.25 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={causes.slice(0, 6)} layout="vertical" margin={{ left: 10, right: 34, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartGrid} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: isDark ? "rgba(226,232,240,.72)" : "rgba(51,65,85,.72)" }} axisLine={{ stroke: chartGrid }} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={142} tick={{ fontSize: 10, fill: isDark ? "rgba(226,232,240,.76)" : "rgba(51,65,85,.76)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: isDark ? "rgba(255,183,3,.05)" : "rgba(15,23,42,.035)" }} formatter={(value: number) => [`${value} ticket${value === 1 ? "" : "s"}`, "Volume"]} />
                    <Bar dataKey="total" name="Tickets" fill={semanticChartColors.attention} radius={[0, 7, 7, 0]} barSize={18} cursor="pointer" minPointSize={3}
                      label={{ position: "right", fontSize: 10, fontWeight: 800, fill: isDark ? "rgba(226,232,240,.86)" : "rgba(30,41,59,.86)" }}
                      onClick={(_, index) => {
                        const cause = causes.slice(0, 6)[index]?.label;
                        if (cause) showTickets(`Causa: ${cause}`, ticketsEligibleForCause.filter((ticket) => (ticket.cause ?? "Sem causa") === cause), "Tickets classificados com a causa selecionada");
                      }} />
                  </BarChart>
                </ResponsiveContainer>
              </Box> : <Box sx={{ minHeight: 250, display: "grid", placeItems: "center", px: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>Nenhuma causa registrada para os filtros selecionados.</Typography>
              </Box>}
            </CardBase>
          </Box>

          <CardBase>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
              <Box>
                <Typography sx={{ fontWeight: 850, fontSize: "1.05rem" }}>Análises especializadas</Typography>
                <Typography variant="caption" color="text.secondary">O Dashboard mantém somente a leitura executiva. Rankings e análises detalhadas ficam nas visões próprias.</Typography>
              </Box>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Button size="small" variant="outlined" onClick={() => navigate("/clientes")}>Analisar clientes</Button>
                <Button size="small" variant="outlined" onClick={() => navigate("/analistas")}>Analisar analistas</Button>
                <Button size="small" variant="outlined" onClick={() => navigate("/desempenho")}>Abrir desempenho</Button>
              </Stack>
            </Stack>
          </CardBase>

          {/* =============================================
              PONTOS DE ATENÇÃO
          ============================================== */}

          <Card
            elevation={0}
            sx={{
              border:
                "1px solid",

              borderColor:
                attentionSummary.criticos >
                0
                  ? "error.light"
                  : "divider",

              borderRadius:
                2.5,
            }}
          >
            <CardContent
              sx={{
                p: 2,

                "&:last-child":
                  {
                    pb: 2,
                  },
              }}
            >
              <Stack
                direction={{
                  xs: "column",
                  md: "row",
                }}
                spacing={1.5}
                sx={{
                  mb: 1.5,

                  justifyContent:
                    "space-between",

                  alignItems: {
                    xs: "stretch",
                    md: "center",
                  },
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 800,
                      fontSize:
                        "1.05rem",
                    }}
                  >
                    Pontos de Atenção
                  </Typography>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                  >
                    Clique no atendimento para visualizar os detalhes
                  </Typography>
                </Box>

                <Stack
                  direction="row"
                  spacing={0.75}
                  sx={{
                    flexWrap:
                      "wrap",
                    gap: 0.75,
                  }}
                >
                  <Chip
                    size="small"
                    label={`${attentionSummary.total} total`}
                    variant="outlined"
                    onClick={() =>
                      showTickets(
                        "Pontos de Atenção",
                        attentionTickets,
                        "Tickets que exigem acompanhamento"
                      )
                    }
                  />

                  <Chip
                    size="small"
                    label={`${attentionSummary.criticos} críticos`}
                    color="error"
                    onClick={() =>
                      showTickets(
                        "Pontos críticos",
                        attentionTickets.filter(
                          (
                            ticket
                          ) =>
                            ticket.level ===
                            "critico"
                        )
                      )
                    }
                  />

                  <Chip
                    size="small"
                    label={`${attentionSummary.altos} altos`}
                    color="warning"
                    onClick={() =>
                      showTickets(
                        "Alta atenção",
                        attentionTickets.filter(
                          (
                            ticket
                          ) =>
                            ticket.level ===
                            "alto"
                        )
                      )
                    }
                  />
                </Stack>
              </Stack>

              {attentionTickets.length ===
                0 && (
                <Alert
                  severity="success"
                >
                  Nenhum ponto de atenção identificado no período.
                </Alert>
              )}

              {attentionTickets
                .slice(0, 5)
                .map(
                  (
                    ticket
                  ) => (
                    <Box
                      key={
                        ticket.id
                      }
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setSelectedTicket(
                          ticket
                        )
                      }
                      onKeyDown={(
                        event
                      ) => {
                        if (
                          event.key ===
                            "Enter" ||
                          event.key ===
                            " "
                        ) {
                          setSelectedTicket(
                            ticket
                          );
                        }
                      }}
                      sx={{
                        py: 1.25,

                        px: 0.5,

                        borderTop:
                          "1px solid",

                        borderColor:
                          "divider",

                        cursor:
                          "pointer",

                        borderRadius:
                          1,

                        transition:
                          "background-color 0.15s",

                        "&:hover":
                          {
                            backgroundColor:
                              "action.hover",
                          },
                      }}
                    >
                      <Box
                        sx={{
                          display:
                            "flex",

                          justifyContent:
                            "space-between",

                          alignItems: {
                            xs: "flex-start",
                            md: "center",
                          },

                          flexDirection:
                            {
                              xs: "column",
                              md: "row",
                            },

                          gap: 1,
                        }}
                      >
                        <Box
                          sx={{
                            minWidth:
                              0,
                          }}
                        >
                          <Stack
                            direction="row"
                            spacing={0.5}
                            sx={{
                              alignItems:
                                "center",
                              flexWrap:
                                "wrap",
                            }}
                          >
                            <Typography
                              variant="body2"
                            sx={{ fontWeight: 700 }}
                            >
                              #
                              {
                                ticket.movideskId
                              }{" "}
                              —{" "}
                              {
                                ticket.subject
                              }
                            </Typography>

                            <IconButton
                              size="small"
                              title="Copiar número do ticket"
                              onClick={(
                                event
                              ) => {
                                event.stopPropagation();

                                void copyTicketNumber(
                                  ticket
                                );
                              }}
                              sx={{
                                width: 24,
                                height: 24,
                                fontSize:
                                  "0.75rem",
                              }}
                            >
                              ⧉
                            </IconButton>

                            <IconButton
                              size="small"
                              title="Abrir no Movidesk"
                              aria-label={`Abrir ticket ${ticket.movideskId} no Movidesk`}
                              onClick={(
                                event
                              ) => {
                                event.stopPropagation();

                                openMovideskTicket(
                                  ticket
                                );
                              }}
                              sx={{
                                width: 24,
                                height: 24,
                                fontSize:
                                  "0.8rem",
                              }}
                            >
                              ↗
                            </IconButton>
                          </Stack>

                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            {ticket.client ??
                              "Sem cliente"}
                            {" • "}
                            {ticket.owner ??
                              "Sem responsável"}
                            {" • "}
                            {ticket.category ??
                              "Sem categoria"}
                          </Typography>
                        </Box>

                        <Stack
                          direction="row"
                          spacing={
                            0.75
                          }
                        >
                          <Chip
                            size="small"
                            label={formatAge(
                              ticket.ageHours
                            )}
                          />

                          <AttentionChip
                            level={
                              ticket.level
                            }
                          />
                        </Stack>
                      </Box>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display:
                            "block",
                          mt: 0.5,
                        }}
                      >
                        {ticket.reasons.join(
                          " • "
                        )}
                      </Typography>
                    </Box>
                  )
                )}

              {attentionTickets.length >
                5 && (
                <Button
                  size="small"
                  sx={{
                    mt: 1,
                  }}
                  onClick={() =>
                    showTickets(
                      "Todos os Pontos de Atenção",
                      attentionTickets
                    )
                  }
                >
                  Ver todos os{" "}
                  {
                    attentionTickets.length
                  }{" "}
                  tickets
                </Button>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* =================================================
          DRAWER - LISTAGEM
      ================================================= */}

      <Drawer
        anchor="right"
        open={
          Boolean(
            drilldown
          ) &&
          !selectedTicket
        }
        onClose={() =>
          setDrilldown(null)
        }
      slotProps={{ paper: { sx: detailDrawerPaperSx } }}
      >
        <Box
          sx={{
            width: {
              xs: 320,
              sm: 500,
            },

            p: 2.5,
          }}
        >
          {drilldown && (
            <>
              <Stack
                direction="row"
                sx={{
                  justifyContent:
                    "space-between",

                  alignItems:
                    "flex-start",

                  gap: 2,
                }}
              >
                <Box>
                  <Typography
                    variant="h6"
                  sx={{ fontWeight: 800 }}
                  >
                    {
                      drilldown.title
                    }
                  </Typography>

                  {drilldown.subtitle && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                    >
                      {
                        drilldown.subtitle
                      }
                    </Typography>
                  )}
                </Box>

                <IconButton
                  size="small"
                  onClick={() =>
                    setDrilldown(
                      null
                    )
                  }
                >
                  ✕
                </IconButton>
              </Stack>

              <Stack
                direction="row"
                spacing={1}
                sx={{
                  mt: 2,
                  mb: 2,
                  alignItems:
                    "center",
                }}
              >
                <Chip
                  size="small"
                  label={`${drilldown.tickets.length} ticket(s)`}
                  variant="outlined"
                />

                <ExportTicketsButton
                  tickets={drilldown.tickets}
                  title={drilldown.title}
                  subtitle={drilldown.subtitle}
                />

                <Button
                  size="small"
                  onClick={() =>
                    navigate(
                      "/tickets"
                    )
                  }
                >
                  Ir para Tickets
                </Button>
              </Stack>

              <Divider />

              {drilldown.tickets.length ===
                0 && (
                <Alert
                  severity="info"
                  sx={{
                    mt: 2,
                  }}
                >
                  Nenhum ticket encontrado.
                </Alert>
              )}

              {drilldown.tickets.map(
                (ticket) => (
                  <Box
                    key={
                      ticket.id
                    }
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setSelectedTicket(
                        ticket
                      )
                    }
                    onKeyDown={(
                      event
                    ) => {
                      if (
                        event.key ===
                          "Enter" ||
                        event.key ===
                          " "
                      ) {
                        setSelectedTicket(
                          ticket
                        );
                      }
                    }}
                    sx={{
                      py: 1.5,

                      borderBottom:
                        "1px solid",

                      borderColor:
                        "divider",

                      cursor:
                        "pointer",

                      "&:hover": {
                        backgroundColor:
                          "action.hover",
                      },
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        justifyContent:
                          "space-between",
                        alignItems:
                          "flex-start",
                      }}
                    >
                      <Box
                        sx={{
                          minWidth:
                            0,
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{
                            alignItems:
                              "center",
                          }}
                        >
                          <Typography
                            variant="body2"
                          sx={{ fontWeight: 800 }}
                          >
                            #
                            {
                              ticket.movideskId
                            }
                          </Typography>

                          <IconButton
                            size="small"
                            title="Copiar número do ticket"
                            onClick={(
                              event
                            ) => {
                              event.stopPropagation();

                              void copyTicketNumber(
                                ticket
                              );
                            }}
                            sx={{
                              width: 24,
                              height: 24,
                              fontSize:
                                "0.75rem",
                            }}
                          >
                            ⧉
                          </IconButton>

                          <IconButton
                            size="small"
                            title="Abrir no Movidesk"
                            aria-label={`Abrir ticket ${ticket.movideskId} no Movidesk`}
                            onClick={(
                              event
                            ) => {
                              event.stopPropagation();

                              openMovideskTicket(
                                ticket
                              );
                            }}
                            sx={{
                              width: 24,
                              height: 24,
                              fontSize:
                                "0.8rem",
                            }}
                          >
                            ↗
                          </IconButton>
                        </Stack>

                        <Typography
                          variant="body2"
                        sx={{ fontWeight: 600 }}
                        >
                          {
                            ticket.subject
                          }
                        </Typography>

                        <Typography
                          variant="caption"
                          color="text.secondary"
                        >
                          {ticket.client ??
                            "Sem cliente"}
                          {" • "}
                          {ticket.owner ??
                            "Sem responsável"}
                        </Typography>
                      </Box>

                      <StatusChip
                        ticket={
                          ticket
                        }
                      />
                    </Stack>
                  </Box>
                )
              )}
            </>
          )}
        </Box>
      </Drawer>

      {/* =================================================
          DRAWER - DETALHE DO TICKET
      ================================================= */}

      <Drawer
        anchor="right"
        open={Boolean(
          selectedTicket
        )}
        onClose={() =>
          setSelectedTicket(
            null
          )
        }
      slotProps={{ paper: { sx: detailDrawerPaperSx } }}
      >
        <Box
          sx={{
            width: {
              xs: 320,
              sm: 500,
            },

            p: 2.5,
          }}
        >
          {selectedTicket && (
            <>
              <Stack
                direction="row"
                sx={{
                  justifyContent:
                    "space-between",
                  alignItems:
                    "flex-start",
                  gap: 2,
                }}
              >
                <Box>
                  <Typography
                    variant="h6"
                  sx={{ fontWeight: 800 }}
                  >
                    Ticket #
                    {
                      selectedTicket.movideskId
                    }
                  </Typography>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                  >
                    {selectedTicket.protocol ??
                      "Sem protocolo"}
                  </Typography>
                </Box>

                <IconButton
                  size="small"
                  onClick={() =>
                    setSelectedTicket(
                      null
                    )
                  }
                >
                  ✕
                </IconButton>
              </Stack>

              <Stack
                direction="row"
                spacing={1}
                sx={{
                  mt: 2,
                  flexWrap: "wrap",
                  gap: 0.75,
                }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    void copyTicketNumber(
                      selectedTicket
                    )
                  }
                >
                  Copiar número
                </Button>

                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    void copyTicketSummary(
                      selectedTicket
                    )
                  }
                >
                  Copiar resumo
                </Button>

                <Button
                  size="small"
                  variant="contained"
                  onClick={() =>
                    openMovideskTicket(
                      selectedTicket
                    )
                  }
                >
                  Abrir no Movidesk ↗
                </Button>
              </Stack>

              <Divider
                sx={{
                  my: 2,
                }}
              />

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Assunto
              </Typography>

              <Typography
                sx={{
                  fontWeight: 700,
                  mb: 2,
                }}
              >
                {
                  selectedTicket.subject
                }
              </Typography>

              <Stack
                direction="row"
                spacing={1}
                sx={{
                  mb: 2,
                  flexWrap:
                    "wrap",
                  gap: 0.75,
                }}
              >
                <StatusChip
                  ticket={
                    selectedTicket
                  }
                />

                <UrgencyChip
                  urgency={
                    selectedTicket.urgency
                  }
                />
              </Stack>

              <Divider
                sx={{
                  mb: 2,
                }}
              />

              <Box
                sx={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    {
                      xs: "1fr",
                      sm: "1fr 1fr",
                    },

                  gap: 1.5,
                }}
              >
                <TicketField
                  label="Cliente"
                  value={
                    selectedTicket.client
                  }
                />

                <TicketField
                  label="Solicitante"
                  value={
                    selectedTicket.contact
                  }
                />

                <TicketField
                  label="Responsável"
                  value={
                    selectedTicket.owner
                  }
                />

                <TicketField
                  label="Squad"
                  value={
                    selectedTicket.team
                  }
                />

                <TicketField
                  label="Categoria"
                  value={
                    selectedTicket.category
                  }
                />

                <TicketField
                  label="Causa"
                  value={
                    selectedTicket.cause
                  }
                />

                <TicketField
                  label="Serviço"
                  value={
                    selectedTicket.service
                  }
                />

                <TicketField
                  label="Departamento"
                  value={
                    selectedTicket.department
                  }
                />

                <TicketField
                  label="Abertura"
                  value={formatDateTime(
                    selectedTicket.createdDate
                  )}
                />

                <TicketField
                  label="Vencimento"
                  value={formatDateTime(
                    selectedTicket.dueDate
                  )}
                />

                <TicketField
                  label="Primeira resposta"
                  value={formatDateTime(
                    selectedTicket.firstResponseDate
                  )}
                />

                <TicketField
                  label="Venc. primeira resposta"
                  value={formatDateTime(
                    selectedTicket.firstResponseDueDate
                  )}
                />

                <TicketField
                  label="Tempo de vida"
                  value={formatMinutes(
                    selectedTicket.lifetimeMinutes
                  )}
                />

                <TicketField
                  label="Tempo parado"
                  value={formatMinutes(
                    selectedTicket.stoppedMinutes
                  )}
                />
              </Box>

              {selectedTicket.justification && (
                <>
                  <Divider
                    sx={{
                      my: 2,
                    }}
                  />

                  <Typography
                    variant="subtitle2"
        sx={{
          fontWeight: 800,
                      mb: 1,
                    }}
                  >
                    Justificativa
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      whiteSpace:
                        "pre-wrap",
                    }}
                  >
                    {selectedTicket.justification}
                  </Typography>
                </>
              )}

              {(selectedTicket.taskNumber ||
                selectedTicket.taskStatus ||
                selectedTicket.deliveredVersion) && (
                <>
                  <Divider
                    sx={{
                      my: 2,
                    }}
                  />

                  <Typography
                    variant="subtitle2"
        sx={{
          fontWeight: 800,
                      mb: 1.5,
                    }}
                  >
                    Desenvolvimento
                  </Typography>

                  <Box
                    sx={{
                      display:
                        "grid",

                      gridTemplateColumns:
                        {
                          xs: "1fr",
                          sm: "1fr 1fr",
                        },

                      gap: 1.5,
                    }}
                  >
                    <TicketField
                      label="Task"
                      value={
                        selectedTicket.taskNumber
                          ? `#${selectedTicket.taskNumber}`
                          : null
                      }
                    />

                    <TicketField
                      label="Status da Task"
                      value={
                        selectedTicket.taskStatus
                      }
                    />

                    <TicketField
                      label="Versão entregue"
                      value={
                        selectedTicket.deliveredVersion
                      }
                    />
                  </Box>
                </>
              )}

              <Button
                fullWidth
                variant="outlined"
                sx={{
                  mt: 3,
                }}
                onClick={() =>
                  navigate(
                    "/tickets"
                  )
                }
              >
                Abrir tela de Tickets
              </Button>
            </>
          )}
        </Box>
      </Drawer>

      <Snackbar
        open={Boolean(copyMessage)}
        autoHideDuration={2200}
        onClose={() =>
          setCopyMessage("")
        }
        message={copyMessage}
      />
    </Box>
  );
}

/* =========================================================
   KPI
========================================================= */

function DevelopmentMetric({
  title,
  value,
  description,
  info,
  severity = "default",
  onClick,
}: {
  title: string;
  value: number;
  description: string;
  info: MetricInfoDefinition;
  severity?: Severity;
  onClick?: () => void;
}) {

  const accentColor =
    severity === "error"
      ? semanticChartColors.overdue
      : severity === "warning"
      ? semanticChartColors.attention
      : severity === "success"
      ? semanticChartColors.positive
      : aliareColors.green;

  return (
    <StandardMetricCard
      title={title}
      value={value}
      description={description}
      info={info}
      accentColor={accentColor}
      onClick={onClick}
    />
  );
}
function KpiCard({
  title,
  value,
  description,
  info,
  severity,
  onClick,
}: {
  title: string;
  value: ReactNode;
  description: string;
  info: MetricInfoDefinition;
  severity: Severity;
  onClick: () => void;
}) {
  const accentColor =
    severity === "error"
      ? semanticChartColors.overdue
      : severity === "warning"
      ? semanticChartColors.attention
      : severity === "success"
      ? semanticChartColors.positive
      : aliareColors.green;

  return (
    <StandardMetricCard
      title={title}
      value={value}
      description={description}
      info={info}
      accentColor={accentColor}
      onClick={onClick}
    />
  );
}

function StandardMetricCard({
  title,
  value,
  description,
  info,
  accentColor,
  onClick,
}: {
  title: string;
  value: ReactNode;
  description: string;
  info: MetricInfoDefinition;
  accentColor: string;
  onClick?: () => void;
}) {
  return (
    <ExecutiveKpiCard
      title={title}
      value={value}
      subtitle={description}
      info={`${info.summary} • ${info.periodRule}`}
      accent={accentColor}
      onClick={onClick}
    />
  );
}



/* =========================================================
   CARD BASE
========================================================= */

function CardBase({
  children,
}: {
  children:
    ReactNode;
}) {
  const { mode } = useColorMode();
  const isDark = mode === "dark";
  return (
    <Card
      elevation={0}
      sx={{
        border:
          "1px solid",

        borderColor: isDark ? "rgba(77,153,210,.24)" : "divider",

        borderRadius: 3,

        background: isDark
          ? "linear-gradient(145deg, rgba(11,35,56,.98), rgba(7,25,43,.98))"
          : "background.paper",

        boxShadow: isDark
          ? "0 16px 38px rgba(0,0,0,.20), inset 0 1px rgba(255,255,255,.025)"
          : "0 4px 18px rgba(16,24,40,.055)",

        overflow: "hidden",
        height: "100%",
        transition: "border-color .18s ease, box-shadow .18s ease, transform .18s ease",
        "&:hover": {
          borderColor: isDark ? "rgba(47,208,255,.34)" : "rgba(24,199,122,.32)",
          boxShadow: isDark ? "0 18px 44px rgba(0,0,0,.26)" : "0 8px 24px rgba(16,24,40,.08)",
        },
      }}
    >
      <CardContent
        sx={{
          p: 2,

          "&:last-child": {
            pb: 2,
          },
        }}
      >
        {children}
      </CardContent>
    </Card>
  );
}

function CardPeriodHeader({ title, subtitle, value, onChange }: { title: string; subtitle: string; value?: CardPeriod; onChange?: (value: CardPeriod) => void }) {
  return <Box sx={{ display: "grid", gridTemplateRows: "auto auto", justifyItems: "center", gap: .75, minHeight: value ? 76 : "auto" }}>
    <Box sx={{ textAlign: "center", minWidth: 0 }}>
      <Typography sx={{ fontWeight: 850, fontSize: "1.05rem", lineHeight: 1.25 }}>{title}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .35 }}>{subtitle}</Typography>
    </Box>
    {value && onChange && <FormControl size="small" sx={{ width: 126 }}>
      <Select value={value} onChange={(event) => onChange(event.target.value as CardPeriod)} sx={{ height: 32, fontSize: ".75rem", fontWeight: 750, textAlign: "center" }}>
        <MenuItem value="7d">7 dias</MenuItem><MenuItem value="30d">30 dias</MenuItem><MenuItem value="60d">60 dias</MenuItem><MenuItem value="90d">90 dias</MenuItem><MenuItem value="month">Este mês</MenuItem><MenuItem value="semester">Semestre</MenuItem><MenuItem value="year">Este ano</MenuItem>
      </Select>
    </FormControl>}
  </Box>;
}

function DonutAnalysisCard({
  title,
  subtitle,
  data,
  colors,
  onItemClick,
  period,
  onPeriodChange,
}: {
  title: string;
  subtitle: string;
  data: RankingItem[];
  colors: readonly string[];
  onItemClick?: (label: string) => void;
  period?: CardPeriod;
  onPeriodChange?: (period: CardPeriod) => void;
}) {
  const theme = useTheme();
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(() => new Set());
  const visibleData = data.filter((item) => !hiddenItems.has(item.label));
  const total = visibleData.reduce((sum, item) => sum + item.total, 0);
  const chartData = visibleData.length > 0 ? visibleData : data;
  const toggleItem = (label: string) => setHiddenItems((current) => {
    const next = new Set(current);
    if (next.has(label)) next.delete(label);
    else if (data.length - next.size > 1) next.add(label);
    return next;
  });

  return (
    <CardBase>
      <CardPeriodHeader title={title} subtitle={subtitle} value={period} onChange={onPeriodChange} />
      <Box sx={{ height: 180, mt: .8, position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="total"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={54}
              outerRadius={76}
              paddingAngle={2}
              stroke="none"
              onClick={(_entry, index) => {
                const item = chartData[index];
                if (item) onItemClick?.(item.label);
              }}
              style={{ cursor: onItemClick ? "pointer" : "default" }}
            >
              {chartData.map((item) => {
                const index = data.findIndex((row) => row.label === item.label);
                return (
                <Cell key={item.label} fill={colors[index % colors.length]} />
              )})}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: `1px solid ${theme.palette.divider}`,
                background: theme.palette.background.paper,
                boxShadow: "0 14px 36px rgba(0,0,0,.18)",
              }}
              cursor={false}
            />
          </PieChart>
        </ResponsiveContainer>
        <Box sx={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", pointerEvents: "none", textAlign: "center" }}>
          <Typography sx={{ fontSize: "1.45rem", fontWeight: 900, lineHeight: 1 }}>{total}</Typography>
          <Typography variant="caption" color="text.secondary">tickets</Typography>
        </Box>
      </Box>
      <Stack spacing={.55}>
        {data.map((item, index) => {
          const active = !hiddenItems.has(item.label);
          return (
          <Box key={item.label} onClick={() => toggleItem(item.label)} sx={{ display: "grid", gridTemplateColumns: "10px 1fr auto", alignItems: "center", gap: .8, cursor: "pointer", px: .6, py: .35, borderRadius: 1, opacity: active ? 1 : .4, textDecoration: active ? "none" : "line-through", transition: "all .2s ease", "&:hover": { bgcolor: "action.hover" } }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: colors[index % colors.length], boxShadow: `0 0 10px ${colors[index % colors.length]}` }} />
            <Typography variant="caption" noWrap>{item.label}</Typography>
            <Typography variant="caption" sx={{ fontWeight: 850 }}>{item.total}</Typography>
          </Box>
        )})}
      </Stack>
    </CardBase>
  );
}

/* =========================================================
   STATUS
========================================================= */

function StatusChip({
  ticket,
}: {
  ticket: Ticket;
}) {
  let color:
    | "default"
    | "primary"
    | "warning"
    | "success"
    | "error" =
    "default";

  if (
    ticket.baseStatus ===
      "New" ||
    ticket.baseStatus ===
      "InAttendance"
  ) {
    color = "primary";
  }

  if (
    ticket.baseStatus ===
    "Stopped"
  ) {
    color = "warning";
  }

  if (
    ticket.baseStatus ===
      "Resolved" ||
    ticket.baseStatus ===
      "Closed"
  ) {
    color = "success";
  }

  if (
    ticket.baseStatus ===
    "Canceled"
  ) {
    color = "error";
  }

  return (
    <Chip
      size="small"
      label={
        ticket.status
      }
      color={color}
      variant="outlined"
    />
  );
}

/* =========================================================
   URGÊNCIA
========================================================= */

function UrgencyChip({
  urgency,
}: {
  urgency:
    | string
    | null;
}) {
  if (!urgency) {
    return null;
  }

  const value =
    normalize(urgency);

  if (
    value ===
    "critica"
  ) {
    return (
      <Chip
        size="small"
        color="error"
        label={urgency}
      />
    );
  }

  if (
    value === "alta"
  ) {
    return (
      <Chip
        size="small"
        color="warning"
        label={urgency}
      />
    );
  }

  return (
    <Chip
      size="small"
      label={urgency}
      variant="outlined"
    />
  );
}

/* =========================================================
   ATTENTION CHIP
========================================================= */

function AttentionChip({
  level,
}: {
  level:
    AttentionLevel;
}) {
  if (
    level ===
    "critico"
  ) {
    return (
      <Chip
        size="small"
        color="error"
        label="Crítico"
      />
    );
  }

  if (
    level === "alto"
  ) {
    return (
      <Chip
        size="small"
        color="warning"
        label="Alto"
      />
    );
  }

  return (
    <Chip
      size="small"
      color="info"
      label="Médio"
    />
  );
}

/* =========================================================
   DETALHE
========================================================= */

function TicketField({
  label,
  value,
}: {
  label: string;

  value:
    | string
    | number
    | null
    | undefined;
}) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
      >
        {label}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          wordBreak:
            "break-word",
        }}
      >
        {value ?? "—"}
      </Typography>
    </Box>
  );
}

/* =========================================================
   AGRUPAMENTO
========================================================= */

function normalizeComparableText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function groupByField(
  tickets: Ticket[],

  field:
    | "category"
    | "owner"
    | "client"
    | "cause",

  fallback: string
): RankingItem[] {
  const grouped =
    new Map<
      string,
      number
    >();

  tickets.forEach(
    (ticket) => {
      const value =
        ticket[field] ??
        fallback;

      grouped.set(
        value,

        (grouped.get(
          value
        ) ?? 0) + 1
      );
    }
  );

  return Array.from(
    grouped.entries()
  )
    .map(
      ([
        label,
        total,
      ]) => ({
        label,
        total,
      })
    )
    .sort(
      (a, b) =>
        b.total -
        a.total
    );
}

function isDateInPeriod(value: string | null | undefined, start: Date, end: Date) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= start && date <= end;
}

function formatSlaPercentage(summary: { percentage: number | null }) {
  return summary.percentage === null ? "—" : `${summary.percentage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatSlaDescription(summary: { within: number; outside: number; unmeasured: number }) {
  return `${summary.within + summary.outside} medidos • ${summary.unmeasured} sem medição`;
}

function slaSeverity(summary: { percentage: number | null }): Severity {
  if (summary.percentage === null) return "default";
  if (summary.percentage >= 90) return "success";
  if (summary.percentage >= 80) return "warning";
  return "error";
}

/* =========================================================
   STATUS ABERTO
========================================================= */

function isOpen(
  ticket: Ticket
) {
  return (
    ticket.baseStatus ===
      "New" ||
    ticket.baseStatus ===
      "InAttendance" ||
    ticket.baseStatus ===
      "Stopped"
  );
}

/* =========================================================
   NORMALIZAÇÃO
========================================================= */

function normalize(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase();
}

/* =========================================================
   PRIORIDADE
========================================================= */

function priorityWeight(
  level:
    AttentionLevel
) {
  if (
    level ===
    "critico"
  ) {
    return 3;
  }

  if (
    level === "alto"
  ) {
    return 2;
  }

  return 1;
}

/* =========================================================
   PERÍODO
========================================================= */

function startOfDay(
  date: Date
) {
  const result =
    new Date(date);

  result.setHours(
    0,
    0,
    0,
    0
  );

  return result;
}

function endOfDay(
  date: Date
) {
  const result =
    new Date(date);

  result.setHours(
    23,
    59,
    59,
    999
  );

  return result;
}

/* =========================================================
   DATAS
========================================================= */

function formatIsoDate(
  date: Date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() +
        1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}

function formatShortDate(
  isoDate: string
) {
  const [
    ,
    month,
    day,
  ] =
    isoDate
      .split("-")
      .map(Number);

  return `${String(
    day
  ).padStart(
    2,
    "0"
  )}/${String(
    month
  ).padStart(
    2,
    "0"
  )}`;
}

function formatDateTime(
  date:
    | string
    | null
) {
  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      dateStyle:
        "short",

      timeStyle:
        "short",
    }
  ).format(
    new Date(date)
  );
}

/* =========================================================
   TEMPO
========================================================= */

function formatMinutes(
  minutes:
    | number
    | null
) {
  if (
    minutes === null ||
    minutes ===
      undefined
  ) {
    return "—";
  }

  if (
    minutes < 60
  ) {
    return `${minutes} min`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  const remainingMinutes =
    minutes % 60;

  if (
    hours < 24
  ) {
    return `${hours}h ${remainingMinutes}min`;
  }

  const days =
    Math.floor(
      hours / 24
    );

  const remainingHours =
    hours % 24;

  return `${days}d ${remainingHours}h`;
}

function formatAge(
  hours: number
) {
  if (
    hours < 24
  ) {
    return `${hours}h`;
  }

  const days =
    Math.floor(
      hours / 24
    );

  const remainingHours =
    hours % 24;

  return `${days}d ${remainingHours}h`;
}

/* =========================================================
   LABEL DO PERÍODO
========================================================= */

function periodLabel(
  period: string
) {
  switch (period) {
    case "7d":
      return "Últimos 7 dias";

    case "30d":
      return "Últimos 30 dias";

    case "60d":
      return "Últimos 60 dias";

    case "90d":
      return "Últimos 90 dias";

    case "month":
      return "Este mês";

    case "semester":
      return "Este semestre";

    case "year":
      return "Este ano";

    case "custom":
      return "Período personalizado";

    default:
      return "Período selecionado";
  }
}
