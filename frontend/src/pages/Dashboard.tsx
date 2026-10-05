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

import { getTicketSnapshot } from "../services/ticketSnapshot";
import { PeriodFilter } from "../components/PeriodFilter";
import { PageHeader } from "../components/PageHeader";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { KpiCard as ExecutiveKpiCard } from "../components/KpiCard";
import { ExportTicketsButton } from "../components/ExportTicketsButton";
import { useFilters } from "../context/FiltersContext";
import { aliareColors } from "../theme/theme";
import { calculateTimestampSla } from "../utils/timestampSla";
import { calculateServiceLevel } from "../utils/serviceLevel";
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
  createdBy?: string | null;

  owner: string | null;
  ownerTeam?: string | null;
  team?: string | null;
  isWithSimer?: boolean;

  category: string | null;
  cause: string | null;
  reason: string | null;
  causeDetail?: string | null;
  urgency: string | null;
  origin?: number | null;

  status: string;
  baseStatus: string | null;

  justification: string | null;

  service: string | null;
  department: string | null;
  serviceFirstLevel?: string | null;
  serviceSecondLevel?: string | null;
  serviceThirdLevel?: string | null;
  businessArea?: string | null;

  createdDate: string;
  dueDate: string | null;

  firstResponseDueDate: string | null;
  firstResponseDate: string | null;

  resolvedDate: string | null;
  closedDate: string | null;

  lifetimeMinutes: number | null;
  stoppedMinutes: number | null;
  stoppedWorkingMinutes?: number | null;
  satisfactionScore?: number | null;
  satisfactionComment?: string | null;
  satisfactionDate?: string | null;

  taskNumber: number | null;
  taskStatus: string | null;
  deliveredVersion: string | null;

  azureWorkItem?: AzureTaskSummary | null;

  importSource?: string | null;
  importedAt?: string | null;
  importBatch?: string | null;
};

type RankingItem = {
  label: string;
  total: number;
};

type ClassificationItem = RankingItem & { ticketIds: number[] };
type ClassificationResponse = {
  causes: ClassificationItem[];
  reasons: ClassificationItem[];
  diagnostics: {
    problemTotal: number;
    problemClassified: number;
    doubtTotal: number;
    doubtClassified: number;
    recoveredFromRaw?: number;
  };
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

type DevelopmentDrilldownState = {
  title: string;
  subtitle: string;
  items: AzureTaskSummary[];
  destinationPath: string;
  destinationLabel: string;
} | null;

type DrilldownState = {
  title: string;
  subtitle?: string;
  tickets: Ticket[];
  destinationPath?: string;
  destinationLabel?: string;
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
  const [developmentDrilldown, setDevelopmentDrilldown] = useState<DevelopmentDrilldownState>(null);

  const [selectedTicket, setSelectedTicket] =
    useState<Ticket | null>(null);

  const [copyMessage, setCopyMessage] =
    useState("");
  const [flowHidden, setFlowHidden] = useState<Set<"opened" | "resolved" | "closed">>(() => new Set());

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
        const snapshot = await getTicketSnapshot<Ticket>();
        if (!controller.signal.aborted) setTickets(snapshot);
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

  // Fluxo de entrada da operação: abriu no período e a responsabilidade
  // atual pertence à operação SIMER. Não exige que o ticket continue aberto.
  const openedBySimerOperationInPeriod = useMemo(
    () => openedInPeriod.filter((ticket) => ticket.isWithSimer === true),
    [openedInPeriod],
  );

  // Estoque do cohort ainda sob responsabilidade da operação.
  const openedWithSimerInPeriod = useMemo(
    () => openedBySimerOperationInPeriod.filter(isOpen),
    [openedBySimerOperationInPeriod],
  );

  // Estoque operacional atual: responsabilidade SIMER + estado ativo.
  // Não é limitado pela data de abertura.
  const pendingTickets = useMemo(
    () => tickets.filter((ticket) => ticket.isWithSimer === true && isOpen(ticket)),
    [tickets],
  );

  // Fluxo executivo usa o mesmo universo operacional das entradas.
  const resolvedInPeriod = useMemo(() => openedBySimerOperationInPeriod.filter((ticket) =>
    isDateInPeriod(ticket.resolvedDate, periodBounds.start, periodBounds.end)
  ), [openedBySimerOperationInPeriod, periodBounds]);

  const closedInPeriod = useMemo(() => openedBySimerOperationInPeriod.filter((ticket) =>
    isDateInPeriod(ticket.closedDate, periodBounds.start, periodBounds.end)
  ), [openedBySimerOperationInPeriod, periodBounds]);

  // Áreas/serviços/SLA/CSAT mantêm a leitura da responsabilidade operacional atual.
  const filteredTickets = openedBySimerOperationInPeriod;


  const newTickets = useMemo(() => pendingTickets.filter((ticket) => ticket.baseStatus === "New"), [pendingTickets]);
  const attendanceTickets = useMemo(() => pendingTickets.filter((ticket) => ticket.baseStatus === "InAttendance"), [pendingTickets]);
  const stoppedTickets = useMemo(() => pendingTickets.filter((ticket) => ticket.baseStatus === "Stopped"), [pendingTickets]);
  const criticalTickets = useMemo(() => pendingTickets.filter((ticket) => normalize(ticket.urgency) === "critica"), [pendingTickets]);

  const responseSla = useMemo(() => calculateTimestampSla(openedBySimerOperationInPeriod, "response"), [openedBySimerOperationInPeriod]);
  const solutionSla = useMemo(() => calculateTimestampSla(openedBySimerOperationInPeriod, "solution"), [openedBySimerOperationInPeriod]);

  const summary = useMemo(() => ({
    abertosNoPeriodo: openedInPeriod.length,
    abertosOperacaoNoPeriodo: openedBySimerOperationInPeriod.length,
    abertosComSimerNoPeriodo: openedWithSimerInPeriod.length,
    pendentes: pendingTickets.length,
    resolvidosNoPeriodo: resolvedInPeriod.length,
    fechadosNoPeriodo: closedInPeriod.length,
    novos: newTickets.length,
    emAtendimento: attendanceTickets.length,
    parados: stoppedTickets.length,
    criticos: criticalTickets.length,
  }), [openedInPeriod, openedBySimerOperationInPeriod, openedWithSimerInPeriod, pendingTickets, resolvedInPeriod, closedInPeriod, newTickets, attendanceTickets, stoppedTickets, criticalTickets]);

  /* =======================================================
     DESENVOLVIMENTO / AZURE DEVOPS

     A mesma Task pode estar vinculada a mais de um atendimento.
     Por isso os indicadores abaixo contam Work Items únicos,
     e não linhas de Ticket.
  ======================================================= */

  const azureWorkItems = useMemo(() => {
    const byId = new Map<number, AzureTaskSummary>();

    openedBySimerOperationInPeriod.forEach((ticket) => {
      if (ticket.azureWorkItem) {
        byId.set(
          ticket.azureWorkItem.id,
          ticket.azureWorkItem
        );
      }
    });

    return Array.from(byId.values());
  }, [openedBySimerOperationInPeriod]);

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

  // Status do backlog usa o mesmo recorte global dos demais indicadores do Dashboard.
  // Assim, Categoria e Status partem do mesmo cohort operacional e diferem
  // apenas pela dimensão analisada.
  const statusTickets = useMemo(
    () => openedBySimerOperationInPeriod.filter(isOpen),
    [openedBySimerOperationInPeriod],
  );

  /* =======================================================
     CATEGORIAS
  ======================================================= */

  /* =======================================================
     ANÁLISES GERENCIAIS
  ======================================================= */

  const dailyFlow = useMemo(() => {
    const opened = new Map<string, number>();
    const resolved = new Map<string, number>();
    const closed = new Map<string, number>();

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

    closedInPeriod.forEach((ticket) => {
      if (!ticket.closedDate) return;
      const date = new Date(ticket.closedDate);
      if (Number.isNaN(date.getTime())) return;
      const key = formatIsoDate(date);
      closed.set(key, (closed.get(key) ?? 0) + 1);
    });

    const result: Array<{ sortDate: string; date: string; opened: number; resolved: number; closed: number }> = [];
    const cursor = startOfDay(effectiveStartDate);
    const lastDay = endOfDay(effectiveEndDate);

    while (cursor <= lastDay) {
      const key = formatIsoDate(cursor);
      result.push({
        sortDate: key,
        date: formatShortDate(key),
        opened: opened.get(key) ?? 0,
        resolved: resolved.get(key) ?? 0,
        closed: closed.get(key) ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return result;
  }, [openedInPeriod, resolvedInPeriod, closedInPeriod, effectiveStartDate, effectiveEndDate]);

  const canonicalCategory = (value?: string | null) => {
    const normalized = normalize(value ?? "");
    if (normalized === "adequacao") return "Adequação";
    if (normalized === "bug") return "Bug";
    if (normalized === "duvida") return "Dúvida";
    if (normalized === "problema") return "Problema";
    if (normalized === "solicitacao de servico") return "Solicitação de Serviço";
    if (normalized === "solucao contorno" || normalized === "solucao de contorno") return "Solução contorno";
    return value?.trim() || "Sem categoria";
  };

  const categories = useMemo(() => {
    const grouped = new Map<string, number>();
    openedBySimerOperationInPeriod.forEach((ticket) => {
      const label = canonicalCategory(ticket.category);
      grouped.set(label, (grouped.get(label) ?? 0) + 1);
    });
    return [...grouped.entries()].map(([label,total])=>({label,total})).sort((a,b)=>b.total-a.total);
  }, [openedBySimerOperationInPeriod]);


  const classificationData = useMemo<ClassificationResponse>(() => {
    const canonicalCause = (value?: string | null) => {
      const v = normalize(value);
      if (!v || v.includes("bug no produto / erp")) return null;
      if (v.includes("erro operacional")) return "Erro operacional";
      if (v.includes("configuracao")) return "Configuração";
      if (v.includes("nao identificada")) return "Não identificada";
      if (v.includes("resolvido pelo usuario")) return "Resolvido pelo usuário";
      if (v.includes("sefaz") || v.includes("aplicativo")) return "SEFAZ ou aplicativo de terceiros";
      return null;
    };
    const canonicalReason = (value?: string | null) => {
      const v = normalize(value);
      if (v.includes("apoio processos operacionais")) return "Apoio processos operacionais";
      if (v.includes("configuracao")) return "Configuração";
      if (v.includes("duvida interna")) return "Dúvida interna";
      if (v.includes("inexperiencia do usuario")) return "Inexperiência do usuário";
      if (v.includes("informacao")) return "Informação";
      if (v.includes("integracao com terceiros")) return "Integração com terceiros";
      if (v.includes("priorizacao")) return "Priorização";
      return null;
    };
    const aggregate = (items: Array<{ id: number; label: string }>): ClassificationItem[] => {
      const grouped = new Map<string, ClassificationItem>();
      items.forEach(({ id, label }) => {
        const current = grouped.get(label) ?? { label, total: 0, ticketIds: [] };
        current.total += 1;
        current.ticketIds.push(id);
        grouped.set(label, current);
      });
      return [...grouped.values()].sort((a, b) => b.total - a.total);
    };

    const problemRows = openedBySimerOperationInPeriod.filter((ticket) => normalize(ticket.category) === "problema");
    const doubtRows = openedBySimerOperationInPeriod.filter((ticket) => normalize(ticket.category) === "duvida");
    const causes = aggregate(problemRows.flatMap((ticket) => {
      const label = canonicalCause(ticket.cause);
      return label ? [{ id: ticket.id, label }] : [];
    }));
    const reasons = aggregate(doubtRows.flatMap((ticket) => {
      const label = canonicalReason(ticket.reason);
      return label ? [{ id: ticket.id, label }] : [];
    }));

    return {
      causes,
      reasons,
      diagnostics: {
        problemTotal: problemRows.length,
        problemClassified: causes.reduce((sum, item) => sum + item.total, 0),
        doubtTotal: doubtRows.length,
        doubtClassified: reasons.reduce((sum, item) => sum + item.total, 0),
        recoveredFromRaw: 0,
      },
    };
  }, [openedBySimerOperationInPeriod]);

  const causes = useMemo(
    () => classificationData.causes.map(({ label, total }) => ({ label, total })),
    [classificationData],
  );

  const reasons = useMemo(
    () => classificationData.reasons.map(({ label, total }) => ({ label, total })),
    [classificationData],
  );

  const classificationCoverage = useMemo(() => ({
    problemTotal: classificationData.diagnostics.problemTotal,
    problemClassified: classificationData.diagnostics.problemClassified,
    doubtTotal: classificationData.diagnostics.doubtTotal,
    doubtClassified: classificationData.diagnostics.doubtClassified,
    recoveredFromRaw: 0,
  }), [classificationData]);

  const businessAreaCoverage = useMemo(() => {
    const total = filteredTickets.length;
    const filled = filteredTickets.filter((ticket) => Boolean(ticket.businessArea?.trim())).length;
    return { total, filled };
  }, [filteredTickets]);

  const businessAreas = useMemo(() => {
    // Área de negócio e Serviço são dimensões diferentes no Movidesk.
    // Nunca usar serviceSecondLevel/serviceFirstLevel como fallback aqui,
    // pois isso duplica visualmente o ranking de Serviços.
    const grouped = new Map<string, number>();
    filteredTickets.forEach((ticket) => {
      const label = ticket.businessArea?.trim();
      if (!label) return;
      grouped.set(label, (grouped.get(label) ?? 0) + 1);
    });
    return [...grouped.entries()]
      .map(([label,total]) => ({ label,total }))
      .sort((a,b) => b.total-a.total)
      .slice(0,6);
  }, [filteredTickets]);

  const serviceDistribution = useMemo(
    () => groupByField(filteredTickets, "serviceSecondLevel", "Sem serviço").slice(0, 6),
    [filteredTickets],
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

          const deadline = calculateServiceLevel({
            urgency: ticket.urgency,
            category: ticket.category,
            cause: ticket.cause,
            subject: ticket.subject,
            createdDate: ticket.createdDate,
            dueDate: ticket.dueDate,
            baseStatus: ticket.baseStatus,
            firstResponseDate: ticket.firstResponseDate,
            firstResponseDueDate: ticket.firstResponseDueDate,
            resolvedDate: ticket.resolvedDate,
            closedDate: ticket.closedDate,
            stoppedMinutes: ticket.stoppedMinutes,
            stoppedWorkingMinutes: ticket.stoppedWorkingMinutes,
            profile: "STANDARD",
          }, now);

          if (deadline.applicable) {
            if (!deadline.firstResponse.completed && deadline.firstResponse.level === "OVERDUE") {
              reasons.push("Primeira resposta vencida");
            }
            if (deadline.resolution.level === "OVERDUE") {
              reasons.push("Prazo vencido");
            } else if (deadline.resolution.level === "CRITICAL") {
              reasons.push("Prazo de solução crítico");
            } else if (deadline.resolution.level === "ATTENTION") {
              reasons.push("Prazo de solução em atenção");
            }
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
    subtitle?: string,
    options?: { destinationPath?: string; destinationLabel?: string }
  ) {
    setSelectedTicket(null);

    setDrilldown({
      title,
      subtitle,
      tickets: list,
      destinationPath: options?.destinationPath,
      destinationLabel: options?.destinationLabel,
    });
  }


  function showDevelopmentItems(kind: "Correção Clientes" | "Evolução") {
    const isCorrection = kind === "Correção Clientes";
    const items = isCorrection ? azureDevelopment.corrections : azureDevelopment.evolutions;
    setSelectedTicket(null);
    setDrilldown(null);
    setDevelopmentDrilldown({
      title: isCorrection ? "Correções em Desenvolvimento" : "Evoluções em Desenvolvimento",
      subtitle: String(items.length) + " Work Item(s) único(s) do Azure no período selecionado",
      items,
      destinationPath: isCorrection ? "/correcoes" : "/evolucoes",
      destinationLabel: isCorrection ? "Ir para Correções" : "Ir para Evoluções",
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
      title: "Abertos no Período",
      value: summary.abertosOperacaoNoPeriodo,
      description: "Entradas do período atribuídas à operação SIMER",
      severity: "default" as Severity,
      info: {
        title: "Abertos no Período",
        summary: "Tickets abertos no período sob responsabilidade da operação SIMER.",
        calculation: "createdDate no período + responsabilidade operacional SIMER.",
        source: "Movidesk",
        reference: "Ticket.createdDate + Ticket.owner/ownerTeam",
        periodRule: "Respeita integralmente o período global selecionado.",
      },
      onClick: () => showTickets("Abertos no Período", openedBySimerOperationInPeriod, "Tickets abertos no período atribuídos à operação SIMER"),
    },
    {
      title: "Backlog atual",
      value: summary.pendentes,
      description: "Estoque atual de tickets ativos",
      severity: "warning" as Severity,
      info: {
        title: "Backlog atual",
        summary: "Estoque atual de tickets ainda ativos, independentemente da data de abertura. Não equivale ao indicador histórico Pendentes no fim do período do Movidesk.",
        calculation: "Contagem de tickets com baseStatus New, InAttendance ou Stopped.",
        source: "Movidesk",
        reference: "Ticket.baseStatus",
        periodRule: "Não é limitado pela data de abertura, pois representa o backlog atual.",
        notes: "Clique para visualizar todos os tickets que permanecem ativos. Para períodos passados, o Hub não reconstrói artificialmente o estado histórico sem snapshot daquele dia.",
      },
      onClick: () => showTickets("Backlog atual", pendingTickets, "Tickets que permanecem ativos neste momento"),
    },
    {
      title: "Resolvidos",
      value: summary.resolvidosNoPeriodo,
      description: "Abertos no período e resolvidos no mesmo recorte",
      severity: "success" as Severity,
      info: {
        title: "Resolvidos",
        summary: "Tickets abertos no período selecionado que também foram resolvidos dentro desse mesmo recorte.",
        calculation: "Cohort de createdDate no período, filtrado por resolvedDate dentro do período.",
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
      description: "Abertos no período e fechados no mesmo recorte",
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
        source: "Movidesk · timestamps e prazos sincronizados",
        reference: "firstResponseDate ≤ firstResponseDueDate",
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
        summary: "Percentual de tickets concluídos até o prazo de solução informado.",
        calculation: "Tickets concluídos no prazo ÷ tickets com timestamps válidos × 100.",
        source: "Movidesk · timestamps e prazos sincronizados",
        reference: "resolvedDate/closedDate ≤ dueDate",
        periodRule: "Considera tickets abertos no período selecionado, igual às telas Clientes e Desempenho.",
        notes: "Registros sem medição ficam fora do denominador.",
      },
      onClick: () => showTickets("SLA de solução", solutionSla.measuredTickets, `${solutionSla.within} dentro • ${solutionSla.outside} fora • ${solutionSla.unmeasured} sem medição`),
    },
    {
      title: "CSAT",
      value: (() => {
        const values=filteredTickets.map((ticket)=>ticket.satisfactionScore).filter((value): value is number => typeof value === "number");
        return values.length ? `${(values.filter((value)=>value >= 4).length / values.length * 100).toLocaleString("pt-BR",{maximumFractionDigits:1})}%` : "—";
      })(),
      description: `${filteredTickets.filter((ticket)=>ticket.satisfactionScore != null).length} avaliação(ões) · notas 4–5`,
      severity: "success" as Severity,
      info: {
        title: "CSAT",
        summary: "Percentual de avaliações positivas vinculadas aos tickets SIMER do recorte atual.",
        calculation: "Respostas com nota 4 ou 5 ÷ total de respostas válidas × 100.",
        source: "Pesquisa de Satisfação Movidesk",
        reference: "MovideskSurveyResponse → Ticket.movideskId",
        periodRule: "Respeita o período e os filtros aplicados ao Dashboard.",
      },
      onClick: () => showTickets("Tickets com avaliação CSAT", filteredTickets.filter((ticket)=>ticket.satisfactionScore != null), "Pesquisa de Satisfação Movidesk"),
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
                onClick={() => showDevelopmentItems("Correção Clientes")}
              >
                Detalhar Correções
              </Button>

              <Button
                size="small"
                variant="outlined"
                onClick={() => showDevelopmentItems("Evolução")}
              >
                Detalhar Evoluções
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
                  periodRule: "Usa somente Work Items vinculados aos tickets abertos no período global selecionado.",
                }}
                onClick={() => showDevelopmentItems("Correção Clientes")}
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
                  periodRule: "Usa somente Work Items vinculados aos tickets abertos no período global selecionado.",
                }}
                onClick={() => showDevelopmentItems("Evolução")}
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
              onItemClick={(label) => showTickets(`Categoria: ${label}`, openedBySimerOperationInPeriod.filter((ticket) => canonicalCategory(ticket.category) === label), "Tickets abertos no período atribuídos à operação SIMER")}
            />

            <DonutAnalysisCard
              title="Status do Backlog do Período"
              subtitle="Tickets do período que permanecem ativos • mesmo recorte dos cards"
              data={backlogStatus}
              colors={[semanticChartColors.normal, semanticChartColors.positive, semanticChartColors.stopped]}
              onItemClick={(label) => {
                const map: Record<string, Ticket[]> = {
                  "Novos": statusNewTickets,
                  "Em atendimento": statusAttendanceTickets,
                  "Parados": statusStoppedTickets,
                };
                showTickets(`Status: ${label}`, map[label] ?? [], "Tickets abertos no período atribuídos à operação SIMER que permanecem ativos");
              }}
            />
          </Box>

          {/* =============================================
              EVOLUÇÃO MENSAL POR CATEGORIA
          ============================================== */}

          <Box sx={{ my: 2 }}>
            <CardBase>
              <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "center", alignItems: "center", gap: 1 }}>
                <Box sx={{ textAlign: "center" }}>
                  <Typography sx={{ fontWeight: 850, fontSize: "1.05rem" }}>
                    Abertos × Resolvidos × Fechados
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Fluxo diário da Operação SIMER • entrada, resolução e fechamento no período
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
                    {!flowHidden.has("opened") && (
                      <Area type="monotone" dataKey="opened" name="Abertos" stroke={semanticChartColors.normal} strokeWidth={2.4} fill="url(#openedFlow)" activeDot={{ r: 6, cursor: "pointer", onClick: (_event, payload: any) => { const day = payload?.payload?.sortDate; if (day) showTickets(`Abertos em ${formatShortDate(day)}`, openedInPeriod.filter((ticket) => formatIsoDate(new Date(ticket.createdDate)) === day), "Tickets abertos no dia selecionado"); } }} />
                    )}
                    {!flowHidden.has("resolved") && (
                      <Area type="monotone" dataKey="resolved" name="Resolvidos" stroke={semanticChartColors.positive} strokeWidth={2.4} fill="url(#resolvedFlow)" activeDot={{ r: 6, cursor: "pointer", onClick: (_event, payload: any) => { const day = payload?.payload?.sortDate; if (day) showTickets(`Resolvidos em ${formatShortDate(day)}`, resolvedInPeriod.filter((ticket) => Boolean(ticket.resolvedDate) && formatIsoDate(new Date(ticket.resolvedDate!)) === day), "Tickets resolvidos no dia selecionado"); } }} />
                    )}
                    {!flowHidden.has("closed") && (
                      <Area type="monotone" dataKey="closed" name="Fechados" stroke={semanticChartColors.neutral} strokeWidth={2.2} fillOpacity={0} activeDot={{ r: 6, cursor: "pointer", onClick: (_event, payload: any) => { const day = payload?.payload?.sortDate; if (day) showTickets(`Fechados em ${formatShortDate(day)}`, closedInPeriod.filter((ticket) => Boolean(ticket.closedDate) && formatIsoDate(new Date(ticket.closedDate!)) === day), "Tickets fechados no dia selecionado"); } }} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
              <Stack direction="row" spacing={1} useFlexGap sx={{ mt: .5, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                {([
                  ["opened","Abertos",semanticChartColors.normal],
                  ["resolved","Resolvidos",semanticChartColors.positive],
                  ["closed","Fechados",semanticChartColors.neutral],
                ] as const).map(([key,label,color]) => {
                  const active = !flowHidden.has(key);
                  return <Chip key={key} size="small" clickable variant={active ? "filled" : "outlined"} label={`● ${label}`}
                    onClick={() => setFlowHidden((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else if (current.size < 2) next.add(key); return next; })}
                    sx={{ color: active ? color : "text.disabled", fontWeight: 800, opacity: active ? 1 : .55 }} />;
                })}
              </Stack>
            </CardBase>
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2, mb: 2 }}>
            <CardBase>
              <Box sx={{ textAlign: "center" }}><Typography sx={{ fontWeight: 850, fontSize: "1.05rem" }}>
                Principais causas
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Somente categoria Problema • causas mais frequentes no período
              </Typography>
              {<Typography variant="caption" color="text.secondary" sx={{ display:"block", mt:.35 }}>Cobertura: {classificationCoverage.problemClassified}/{classificationCoverage.problemTotal} tickets classificados{classificationCoverage.recoveredFromRaw > 0 ? ` • ${classificationCoverage.recoveredFromRaw} recuperados do payload` : ""}</Typography>}</Box>
              {causes.length ? <Box sx={{ height: Math.max(250, Math.min(330, causes.slice(0, 6).length * 44 + 64)), mt: 1.25 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={causes.slice(0, 6)} layout="vertical" margin={{ left: 10, right: 34, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartGrid} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: isDark ? "rgba(226,232,240,.72)" : "rgba(51,65,85,.72)" }} axisLine={{ stroke: chartGrid }} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={142} tick={{ fontSize: 10, fill: isDark ? "rgba(226,232,240,.76)" : "rgba(51,65,85,.76)" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      cursor={{ fill: isDark ? "rgba(255,183,3,.05)" : "rgba(15,23,42,.035)" }}
                      formatter={(value) => {
                        const total = typeof value === "number" ? value : Number(value ?? 0);
                        return [`${total} ticket${total === 1 ? "" : "s"}`, "Volume"];
                      }}
                    />
                    <Bar dataKey="total" name="Tickets" fill={semanticChartColors.attention} radius={[0, 7, 7, 0]} barSize={18} cursor="pointer" minPointSize={3}
                      label={{ position: "right", fontSize: 10, fontWeight: 800, fill: isDark ? "rgba(226,232,240,.86)" : "rgba(30,41,59,.86)" }}
                      onClick={(_, index) => {
                        const cause = causes.slice(0, 6)[index]?.label;
                        if (cause) {
                           const ids = new Set(classificationData.causes.find((item) => item.label === cause)?.ticketIds ?? []);
                           showTickets(`Causa: ${cause}`, openedInPeriod.filter((ticket) => ids.has(ticket.id)), "Tickets classificados com a causa selecionada");
                         }
                      }} />
                  </BarChart>
                </ResponsiveContainer>
              </Box> : <Box sx={{ minHeight: 250, display: "grid", placeItems: "center", px: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>{classificationCoverage.problemTotal > 0 ? `Existem ${classificationCoverage.problemTotal} tickets de categoria Problema no período, mas a causa ainda não está disponível nos dados sincronizados.` : "Nenhum ticket de categoria Problema no período selecionado."}</Typography>
              </Box>}
            </CardBase>

            <OperationalRankingCard
              title="Motivos das dúvidas"
              subtitle={`Somente categoria Dúvida • motivo informado no Movidesk • cobertura ${classificationCoverage.doubtClassified}/${classificationCoverage.doubtTotal}`}
              data={reasons}
              emptyMessage={classificationCoverage.doubtTotal > 0 ? `Existem ${classificationCoverage.doubtTotal} tickets de Dúvida no período, mas o motivo ainda não está disponível nos dados sincronizados.` : "Nenhum ticket de Dúvida no período selecionado."}
              onItemClick={(label) => {
                const ids = new Set(classificationData.reasons.find((item) => item.label === label)?.ticketIds ?? []);
                showTickets(`Motivo: ${label}`, openedInPeriod.filter((ticket) => ids.has(ticket.id)), "Tickets de Dúvida classificados com o motivo selecionado");
              }}
            />
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 1.5 }}>
            <OperationalRankingCard
              title="Áreas de negócio"
              subtitle={`Área de negócio informada no Movidesk • cobertura ${businessAreaCoverage.filled}/${businessAreaCoverage.total} • sem fallback para Serviço`}
              data={businessAreas}
              emptyMessage={businessAreaCoverage.total > 0 ? `Existem ${businessAreaCoverage.total} tickets SIMER no período, mas o Movidesk não retornou o campo oficial de Área de negócio para esses tickets.` : "Nenhum ticket SIMER no período selecionado."}
              onItemClick={(label) => showTickets(
                `Área de negócio: ${label}`,
                filteredTickets.filter((ticket) => (ticket.businessArea ?? "Sem área de negócio") === label),
                "Tickets da área de negócio selecionada",
              )}
            />
            <OperationalRankingCard
              title="Serviços mais acionados"
              subtitle="Serviço N2 do Movidesk • clique para abrir os tickets relacionados"
              data={serviceDistribution}
              emptyMessage="Nenhum serviço informado no período."
              onItemClick={(label) => showTickets(
                `Serviço: ${label}`,
                filteredTickets.filter((ticket) => (ticket.serviceSecondLevel ?? "Sem serviço") === label),
                "Tickets do serviço selecionado",
              )}
            />
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
          DRAWER - TASKS DE DESENVOLVIMENTO
      ================================================= */}
      <Drawer anchor="right" open={Boolean(developmentDrilldown)} onClose={() => setDevelopmentDrilldown(null)} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
        <Box sx={{ width: { xs: 340, sm: 560 }, p: 2.5 }}>
          {developmentDrilldown && <>
            <Stack direction="row" sx={{justifyContent:"space-between",alignItems:"flex-start",gap:2}}>
              <Box><Typography variant="h6" sx={{fontWeight:800}}>{developmentDrilldown.title}</Typography><Typography variant="body2" color="text.secondary">{developmentDrilldown.subtitle}</Typography></Box>
              <IconButton size="small" onClick={()=>setDevelopmentDrilldown(null)}>✕</IconButton>
            </Stack>
            <Stack direction="row" spacing={1} useFlexGap sx={{mt:2,mb:2,alignItems:"center",flexWrap:"wrap"}}>
              <Chip size="small" label={developmentDrilldown.items.length + " task(s)"} variant="outlined"/>
              <Box sx={{minWidth:150}}><ExportTicketsButton tickets={developmentDrilldown.items} title={developmentDrilldown.title} subtitle={developmentDrilldown.subtitle}/></Box>
              <Button size="small" onClick={()=>navigate(developmentDrilldown.destinationPath)}>{developmentDrilldown.destinationLabel}</Button>
            </Stack>
            <Divider/>
            {developmentDrilldown.items.length===0 && <Alert severity="info" sx={{mt:2}}>Nenhuma Task encontrada.</Alert>}
            {developmentDrilldown.items.map(item=><Box key={item.id} sx={{py:1.6,borderBottom:"1px solid",borderColor:"divider"}}>
              <Stack direction="row" spacing={1} sx={{justifyContent:"space-between",alignItems:"flex-start"}}>
                <Box sx={{minWidth:0,pr:1}}>
                  <Typography variant="caption" sx={{fontWeight:900}}>#{item.id} · {item.workItemType}</Typography>
                  <Typography variant="body2" sx={{fontWeight:800,mt:.35}}>{item.title}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{display:"block",mt:.5}}>{item.client ?? "Cliente não informado"}{item.assignedToName ? " • " + item.assignedToName : " • Sem responsável"}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{display:"block"}}>{item.module ?? "Módulo não informado"}{item.process ? " • " + item.process : ""}{item.movideskTicket ? " • Ticket #" + item.movideskTicket : ""}</Typography>
                  {item.deliveredVersion && <Chip size="small" label={"Versão " + item.deliveredVersion} variant="outlined" sx={{mt:.75}}/>}
                </Box>
                <Stack spacing={0.5} sx={{ alignItems: "flex-end" }}><Chip size="small" label={item.state || "Sem status"} variant="outlined"/>{item.criticality && <Chip size="small" label={item.criticality} color={normalize(item.criticality) === "critica" ? "error" : normalize(item.criticality) === "alta" ? "warning" : "default"} variant="outlined"/>}</Stack>
              </Stack>
            </Box>)}
          </>}
        </Box>
      </Drawer>

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
                  onClick={() => navigate(drilldown.destinationPath ?? "/tickets")}
                >
                  {drilldown.destinationLabel ?? "Ir para Tickets"}
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
                onClick={() => {
                  if (!selectedTicket) return;
                  navigate(`/tickets?movidesk=${selectedTicket.movideskId}`);
                }}
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

function OperationalRankingCard({
  title,
  subtitle,
  data,
  emptyMessage,
  onItemClick,
}: {
  title: string;
  subtitle: string;
  data: RankingItem[];
  emptyMessage: string;
  onItemClick: (label: string) => void;
}) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  return (
    <CardBase>
      <Box sx={{ textAlign: "center" }}>
        <Typography sx={{ fontWeight: 850, fontSize: "1.05rem" }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
      </Box>
      {data.length ? (
        <Box sx={{ height: Math.max(250, Math.min(330, data.length * 44 + 64)), mt: 1.25 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 10, right: 34, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={dark ? "rgba(148,163,184,.16)" : "#E4E7EC"} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={false} />
              <Bar dataKey="total" name="Tickets" fill={aliareColors.green} radius={[0, 7, 7, 0]} barSize={18} cursor="pointer" minPointSize={3}
                onClick={(_, index) => {
                  const item = data[index];
                  if (item) onItemClick(item.label);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      ) : (
        <Box sx={{ minHeight: 250, display: "grid", placeItems: "center", px: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>{emptyMessage}</Typography>
        </Box>
      )}
    </CardBase>
  );
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
      <Box sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "minmax(220px, .88fr) minmax(240px, 1.12fr)" },
        gap: { xs: 1, sm: 2 },
        alignItems: "center",
        mt: 1.25,
        minHeight: { xs: 0, sm: 220 },
      }}>
        <Box sx={{ height: { xs: 210, sm: 220 }, minWidth: 0, position: "relative" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="total"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={92}
                paddingAngle={2}
                cornerRadius={5}
                stroke={theme.palette.background.paper}
                strokeWidth={1.5}
                onClick={(_entry, index) => {
                  const item = chartData[index];
                  if (item) onItemClick?.(item.label);
                }}
                style={{ cursor: onItemClick ? "pointer" : "default" }}
              >
                {chartData.map((item) => {
                  const index = data.findIndex((row) => row.label === item.label);
                  return <Cell key={item.label} fill={colors[index % colors.length]} />;
                })}
              </Pie>
              <Tooltip cursor={false} />
            </PieChart>
          </ResponsiveContainer>
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", pointerEvents: "none", textAlign: "center" }}>
            <Typography sx={{ fontSize: "1.55rem", fontWeight: 900, lineHeight: 1 }}>{total}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>tickets</Typography>
          </Box>
        </Box>

        <Box sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: data.length > 4 ? "repeat(2, minmax(0, 1fr))" : "1fr" },
          columnGap: 1.25,
          rowGap: .45,
          alignContent: "center",
          minWidth: 0,
        }}>
          {data.map((item, index) => {
            const active = !hiddenItems.has(item.label);
            const percentage = total > 0 && active ? Math.round((item.total / total) * 100) : 0;
            return (
              <Box
                key={item.label}
                onClick={() => toggleItem(item.label)}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "10px minmax(0,1fr) auto",
                  alignItems: "center",
                  gap: .8,
                  cursor: "pointer",
                  px: .8,
                  py: .65,
                  borderRadius: 1.5,
                  opacity: active ? 1 : .38,
                  transition: "background-color .16s ease, opacity .16s ease",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: colors[index % colors.length], boxShadow: `0 0 8px ${colors[index % colors.length]}` }} />
                <Typography variant="caption" noWrap title={item.label} sx={{ fontWeight: 650 }}>{item.label}</Typography>
                <Stack direction="row" spacing={.7} sx={{ alignItems: "baseline" }}>
                  <Typography variant="caption" sx={{ fontWeight: 900 }}>{item.total}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 28, textAlign: "right" }}>{percentage}%</Typography>
                </Stack>
              </Box>
            );
          })}
        </Box>
      </Box>
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


function groupByField(
  tickets: Ticket[],

  field:
    | "category"
    | "owner"
    | "client"
    | "cause"
    | "businessArea"
    | "serviceSecondLevel",

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

    case "lastMonth":
      return "Mês passado";

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
