import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import {
  ArrowBackOutlined,
  ArrowForwardOutlined,
  FullscreenExitOutlined,
  PictureAsPdfOutlined,
} from "@mui/icons-material";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useNavigate } from "react-router-dom";

import { api } from "../services/api";
import { calculateOfficialSla } from "../utils/officialSla";
import { useFilters } from "../context/FiltersContext";
import { PeriodFilter } from "../components/PeriodFilter";
import { PageHeader } from "../components/PageHeader";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { KpiCard as ExecutiveKpiCard } from "../components/KpiCard";
import { ExecutiveSection } from "../components/ExecutiveSection";
import { aliareColors } from "../theme/theme";
import {
  chartPalette,
  semanticChartColors,
} from "../theme/chartPalette";

/* =========================================================
   TIPOS
========================================================= */

type AzureTaskSummary = {
  id: number; workItemType: string; title: string; state: string;
  assignedToName: string | null; criticality: string | null;
  deliveredVersion: string | null; prioritized: boolean | null; blockedProcess: boolean | null;
  stateChangedAt?: string | null; azureChangedAt: string | null;
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
  resolvedInFirstCall?: boolean | null;
  ownerHandoffs?: number;
  reopenCount?: number;
  satisfactionScore?: number | null;

  taskNumber: number | null;
  taskStatus: string | null;
  deliveredVersion: string | null;
  responseSlaIndicator?: string | null;
  solutionSlaIndicator?: string | null;
  azureWorkItem?: AzureTaskSummary | null;

  importSource?: string | null;
  importedAt?: string | null;
  importBatch?: string | null;
};

type AttentionLevel =
  | "normal"
  | "atencao"
  | "alto";

type ClientMetric = {
  client: string;

  total: number;
  open: number;
  critical: number;
  stopped: number;
  resolved: number;

  analysts: number;
  categories: number;

  topCategory: string;

  averageResolutionMinutes: number | null;
  measuredResolutionTimes: number;

  attentionLevel: AttentionLevel;
};

type PieDataItem = {
  name: string;
  value: number;
};

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
   CORES DOS GRÁFICOS
========================================================= */

const PIE_COLORS = [
  ...chartPalette,
];

const STATUS_COLORS: Record<
  string,
  string
> = {
  Novos:
    semanticChartColors.normal,

  "Em Atendimento":
    aliareColors.green,

  Parados:
    semanticChartColors.attention,

  Resolvidos:
    semanticChartColors.positive,
};

/* =========================================================
   COMPONENTE PRINCIPAL
========================================================= */

export function Clients() {
  const theme = useTheme();
  const [hiddenClientSlices, setHiddenClientSlices] = useState<Set<string>>(() => new Set());
  const [hiddenCategorySlices, setHiddenCategorySlices] = useState<Set<string>>(() => new Set());
  const [hiddenStatusSlices, setHiddenStatusSlices] = useState<Set<string>>(() => new Set());
  const [clientsPage, setClientsPage] = useState(0);
  const navigate = useNavigate();
  const presentationRef = useRef<HTMLDivElement>(null);
  const [presentationPage, setPresentationPage] = useState(0);
  const [isPresenting, setIsPresenting] = useState(false);
  const [exportingPresentation, setExportingPresentation] = useState(false);

  const [tickets, setTickets] =
    useState<Ticket[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);
  const loadRequestRef = useRef<AbortController | null>(null);

  /* Filtros locais */

  const [
    selectedClient,
    setSelectedClient,
  ] = useState("");

  const [
    category,
    setCategory,
  ] = useState("");

  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [executiveArea, setExecutiveArea] = useState("");

  /* Drill-down */

  const [
    drilldown,
    setDrilldown,
  ] = useState<DrilldownState>(null);

  const [
    selectedTicket,
    setSelectedTicket,
  ] = useState<Ticket | null>(null);

  const [
    copyMessage,
    setCopyMessage,
  ] = useState("");

  const {
    effectiveStartDate,
    effectiveEndDate,
  } = useFilters();

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
        console.error("Erro ao carregar indicadores dos clientes:", err);
        setError("Não foi possível carregar os indicadores dos clientes.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadTickets();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === presentationRef.current;
      setIsPresenting(active);
      if (!active) setPresentationPage(0);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function startPresentation() {
    setPresentationPage(0);
    await presentationRef.current?.requestFullscreen?.();
  }

  async function exportClientPresentation() {
    if (exportingPresentation) return;
    setExportingPresentation(true);
    setError(null);

    const cleanup = () => {
      document.body.classList.remove("client-pdf-export");
      setExportingPresentation(false);
      window.removeEventListener("afterprint", cleanup);
    };

    document.body.classList.add("client-pdf-export");
    window.addEventListener("afterprint", cleanup);
    // Os gráficos responsivos precisam recalcular as dimensões depois que
    // a grade muda do dashboard para a página A4.
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 120);
    window.setTimeout(() => {
      try {
        window.print();
      } catch {
        cleanup();
        setError("Não foi possível abrir a impressão desta tela.");
      }
    }, 650);
  }


  /* =======================================================
     CARREGAMENTO
  ======================================================= */

  useEffect(() => {
    async function loadTickets() {
      try {
        setLoading(true);
        setError(null);

        const response = await api.get(
          "/dashboard/tickets"
        );

        setTickets(response.data);
      } catch (err) {
        console.error(
          "Erro ao carregar indicadores dos clientes:",
          err
        );

        setError(
          "Não foi possível carregar os indicadores dos clientes."
        );
      } finally {
        setLoading(false);
      }
    }

    loadTickets();
  }, []);

  /* =======================================================
     PERÍODO GLOBAL
  ======================================================= */

  const periodTickets = useMemo(() => {
    const start = startOfDay(
      effectiveStartDate
    );

    const end = endOfDay(
      effectiveEndDate
    );

    return tickets.filter(
      (ticket) => {
        const created =
          new Date(
            ticket.createdDate
          );

        return (
          created >= start &&
          created <= end
        );
      }
    );
  }, [
    tickets,
    effectiveStartDate,
    effectiveEndDate,
  ]);

  /* =======================================================
     CLIENTES DISPONÍVEIS
  ======================================================= */

  const clientOptions = useMemo(() => {
    return Array.from(
      new Set(
        periodTickets
          .map(
            (ticket) =>
              ticket.client
          )
          .filter(
            (
              value
            ): value is string =>
              Boolean(
                value?.trim()
              )
          )
      )
    ).sort((a, b) =>
      a.localeCompare(
        b,
        "pt-BR"
      )
    );
  }, [periodTickets]);

  /* =======================================================
     FILTRO CLIENTE
  ======================================================= */

  const clientScopedTickets =
    useMemo(() => {
      if (!selectedClient) {
        return periodTickets;
      }

      return periodTickets.filter(
        (ticket) =>
          ticket.client ===
          selectedClient
      );
    }, [
      periodTickets,
      selectedClient,
    ]);

  /* =======================================================
     CATEGORIAS DO CLIENTE / PERÍODO
  ======================================================= */

  const categories = useMemo(() => {
    return Array.from(
      new Set(
        clientScopedTickets
          .map(
            (ticket) =>
              ticket.category
          )
          .filter(
            (
              value
            ): value is string =>
              Boolean(
                value?.trim()
              )
          )
      )
    ).sort((a, b) =>
      a.localeCompare(
        b,
        "pt-BR"
      )
    );
  }, [clientScopedTickets]);

  const owners = useMemo(() => Array.from(new Set(
    clientScopedTickets.map((ticket) => ticket.owner?.trim()).filter((value): value is string => Boolean(value))
  )).sort((a, b) => a.localeCompare(b, "pt-BR")), [clientScopedTickets]);

  const statuses = useMemo(() => Array.from(new Set(
    clientScopedTickets.map((ticket) => ticket.status?.trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, "pt-BR")), [clientScopedTickets]);

  const executiveAreas = useMemo(() => Array.from(new Set(
    clientScopedTickets.map(classifyExecutiveArea)
  )).sort((a, b) => a.localeCompare(b, "pt-BR")), [clientScopedTickets]);

  /*
   * Caso mude de cliente e a categoria atual
   * não exista para ele, limpamos automaticamente.
   */

  useEffect(() => {
    if (
      category &&
      !categories.includes(
        category
      )
    ) {
      setCategory("");
    }
  }, [
    category,
    categories,
  ]);

  useEffect(() => {
    if (owner && !owners.includes(owner)) setOwner("");
    if (status && !statuses.includes(status)) setStatus("");
  }, [owner, owners, status, statuses]);

  /* =======================================================
     ESCOPO FINAL
  ======================================================= */

  const scopedTickets =
    useMemo(() => {
      return clientScopedTickets.filter(
        (ticket) => (!category || ticket.category === category) &&
          (!status || ticket.status === status) &&
          (!owner || ticket.owner === owner) &&
          (!executiveArea || classifyExecutiveArea(ticket) === executiveArea)
      );
    }, [
      clientScopedTickets,
      category,
      status,
      owner,
      executiveArea,
    ]);

  /* =======================================================
     MÉTRICAS POR CLIENTE
  ======================================================= */

  const clients = useMemo(() => {
    const grouped =
      new Map<
        string,
        Ticket[]
      >();

    scopedTickets.forEach(
      (ticket) => {
        const client =
          ticket.client ??
          "Sem cliente";

        if (
          !grouped.has(client)
        ) {
          grouped.set(
            client,
            []
          );
        }

        grouped
          .get(client)!
          .push(ticket);
      }
    );

    const result:
      ClientMetric[] =
      Array.from(
        grouped.entries()
      ).map(
        ([
          client,
          clientTickets,
        ]) => {
          const openTickets =
            clientTickets.filter(
              isOpen
            );

          const criticalTickets =
            openTickets.filter(
              (ticket) =>
                normalize(
                  ticket.urgency
                ) ===
                "critica"
            );

          const stoppedTickets =
            clientTickets.filter(
              (ticket) =>
                ticket.baseStatus ===
                "Stopped"
            );

          const resolvedTickets =
            clientTickets.filter(
              (ticket) =>
                ticket.baseStatus ===
                  "Resolved" ||
                ticket.baseStatus ===
                  "Closed"
            );

          const analysts =
            new Set(
              clientTickets
                .map(
                  (ticket) =>
                    ticket.owner
                )
                .filter(Boolean)
            ).size;

          const categoryValues =
            clientTickets
              .map(
                (ticket) =>
                  ticket.category
              )
              .filter(
                (
                  value
                ): value is string =>
                  Boolean(value)
              );

          const uniqueCategories =
            new Set(
              categoryValues
            ).size;

          const categoryCount =
            new Map<
              string,
              number
            >();

          categoryValues.forEach(
            (item) => {
              categoryCount.set(
                item,
                (categoryCount.get(
                  item
                ) ?? 0) + 1
              );
            }
          );

          const topCategory =
            Array.from(
              categoryCount.entries()
            ).sort(
              (a, b) =>
                b[1] - a[1]
            )[0]?.[0] ?? "—";

          const resolutionTimes = clientTickets
            .map(ticketResolutionMinutes)
            .filter((value): value is number => value !== null);

          const averageResolutionMinutes =
            resolutionTimes.length > 0
              ? Math.round(
                  resolutionTimes.reduce(
                    (
                      total,
                      value
                    ) =>
                      total +
                      value,
                    0
                  ) /
                    resolutionTimes.length
                )
              : null;

          let attentionLevel:
            AttentionLevel =
            "normal";

          if (
            criticalTickets.length >=
              2 ||
            openTickets.length >= 5
          ) {
            attentionLevel =
              "alto";
          } else if (
            criticalTickets.length >=
              1 ||
            stoppedTickets.length >=
              1 ||
            openTickets.length >= 3
          ) {
            attentionLevel =
              "atencao";
          }

          return {
            client,

            total:
              clientTickets.length,

            open:
              openTickets.length,

            critical:
              criticalTickets.length,

            stopped:
              stoppedTickets.length,

            resolved:
              resolvedTickets.length,

            analysts,

            categories:
              uniqueCategories,

            topCategory,

            averageResolutionMinutes,
            measuredResolutionTimes: resolutionTimes.length,

            attentionLevel,
          };
        }
      );

    return result.sort(
      (a, b) => {
        if (
          b.critical !==
          a.critical
        ) {
          return (
            b.critical -
            a.critical
          );
        }

        if (
          b.open !==
          a.open
        ) {
          return (
            b.open -
            a.open
          );
        }

        return (
          b.total -
          a.total
        );
      }
    );
  }, [scopedTickets]);

  /* =======================================================
     RESUMO
  ======================================================= */

  const summary = useMemo(() => {
    return {
      totalClients:
        clients.filter(
          (item) =>
            item.client !==
            "Sem cliente"
        ).length,
    };
  }, [clients]);

  /*
   * IMPORTANTE:
   *
   * Os cards executivos abaixo trabalham com tickets,
   * não com quantidade de clientes.
   *
   * Assim, quando o card informa "3", o drill-down abre
   * exatamente os mesmos 3 atendimentos.
   */

  const executiveTicketGroups =
    useMemo(() => {
      const highAttentionClients =
        new Set(
          clients
            .filter(
              (item) =>
                item.attentionLevel ===
                "alto"
            )
            .map(
              (item) =>
                item.client
            )
        );

      const attentionClients =
        new Set(
          clients
            .filter(
              (item) =>
                item.attentionLevel ===
                "atencao"
            )
            .map(
              (item) =>
                item.client
            )
        );

      const highAttention =
        scopedTickets.filter(
          (ticket) =>
            highAttentionClients.has(
              ticket.client ??
                "Sem cliente"
            )
        );

      const attention =
        scopedTickets.filter(
          (ticket) =>
            attentionClients.has(
              ticket.client ??
                "Sem cliente"
            )
        );

      const critical =
        scopedTickets.filter(
          (ticket) =>
            isOpen(ticket) &&
            normalize(
              ticket.urgency
            ) ===
              "critica"
        );

      return {
        all:
          scopedTickets,

        highAttention,

        attention,

        critical,
      };
    }, [
      clients,
      scopedTickets,
    ]);

  /* =======================================================
     INDICADORES DA CARTEIRA
  ======================================================= */

  const portfolioSummary =
    useMemo(() => {
      const open =
        scopedTickets.filter(
          isOpen
        ).length;

      const critical =
        scopedTickets.filter(
          (ticket) =>
            isOpen(ticket) &&
            normalize(
              ticket.urgency
            ) ===
              "critica"
        ).length;

      const stopped =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "Stopped"
        ).length;

      const resolved =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
              "Resolved" ||
            ticket.baseStatus ===
              "Closed"
        ).length;

      const responseResult = calculateOfficialSla(scopedTickets, "response");
      const solutionResult = calculateOfficialSla(scopedTickets, "solution");
      const responseSla = { measured: responseResult.measured, onTime: responseResult.within, percent: responseResult.percentage };
      const solutionSla = { measured: solutionResult.measured, onTime: solutionResult.within, percent: solutionResult.percentage };
      const azureItems = Array.from(new Map(
        scopedTickets.map((ticket) => ticket.azureWorkItem)
          .filter((item): item is AzureTaskSummary => Boolean(item))
          .map((item) => [item.id, item])
      ).values());

      return {
        total: scopedTickets.length, open, critical, stopped, resolved,
        resolutionRate: scopedTickets.length > 0
          ? Math.round((resolved / scopedTickets.length) * 1000) / 10 : 0,
        responseSla, solutionSla,
        azureTasks: azureItems.length,
        azureCorrections: azureItems.filter((item) => item.workItemType === "Correção Clientes").length,
        azureEvolutions: azureItems.filter((item) => item.workItemType === "Evolução").length,
        azurePrioritized: azureItems.filter((item) => item.prioritized === true).length,
        azureBlocked: azureItems.filter((item) => item.blockedProcess === true).length,
        azureWithVersion: azureItems.filter((item) => Boolean(item.deliveredVersion?.trim())).length,
      };
    }, [scopedTickets]);

  /* =======================================================
     PIZZA 1 - DISTRIBUIÇÃO POR CLIENTE
  ======================================================= */

  const clientPieData =
    useMemo<PieDataItem[]>(() => {
      const grouped =
        new Map<
          string,
          number
        >();

      scopedTickets.forEach(
        (ticket) => {
          const client =
            ticket.client ??
            "Sem cliente";

          grouped.set(
            client,
            (grouped.get(
              client
            ) ?? 0) + 1
          );
        }
      );

      const ordered =
        Array.from(
          grouped.entries()
        )
          .map(
            ([
              name,
              value,
            ]) => ({
              name,
              value,
            })
          )
          .sort(
            (a, b) =>
              b.value -
              a.value
          );

      /*
       * Para preservar a leitura executiva do gráfico,
       * exibimos os seis principais clientes e agrupamos
       * o restante em "Outros".
       */
      const top =
        ordered.slice(
          0,
          6
        );

      const otherValue =
        ordered
          .slice(6)
          .reduce(
            (
              total,
              item
            ) =>
              total +
              item.value,
            0
          );

      if (
        otherValue >
        0
      ) {
        top.push({
          name:
            "Outros",

          value:
            otherValue,
        });
      }

      return top;
    }, [
      scopedTickets,
    ]);

  const categoryPieData = useMemo<PieDataItem[]>(() => groupChartData(
    scopedTickets,
    (ticket) => ticket.category?.trim() || "Sem categoria",
    7,
  ), [scopedTickets]);

  const ownerChartData = useMemo<PieDataItem[]>(() => groupChartData(
    scopedTickets,
    (ticket) => ticket.owner?.trim() || "Sem responsável",
    8,
  ), [scopedTickets]);

  const visibleClientPieData = useMemo(() => clientPieData.filter((item) => !hiddenClientSlices.has(item.name)), [clientPieData, hiddenClientSlices]);
  const visibleCategoryPieData = useMemo(() => categoryPieData.filter((item) => !hiddenCategorySlices.has(item.name)), [categoryPieData, hiddenCategorySlices]);
  const clientChartData = visibleClientPieData.length > 0 ? visibleClientPieData : clientPieData;
  const categoryChartData = visibleCategoryPieData.length > 0 ? visibleCategoryPieData : categoryPieData;

  const togglePieSlice = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, data: PieDataItem[], name: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else if (data.length - next.size > 1) next.add(name);
      return next;
    });
  };

  const executiveInsights = useMemo(() => {
    const topCategory = categoryPieData[0];
    const openRate = portfolioSummary.total
      ? Math.round((portfolioSummary.open / portfolioSummary.total) * 1000) / 10
      : 0;
    const unassigned = scopedTickets.filter((ticket) => !ticket.owner?.trim()).length;
    const firstCallMeasured = scopedTickets.filter((ticket) => ticket.resolvedInFirstCall != null);
    const firstCallRate = firstCallMeasured.length
      ? Math.round((firstCallMeasured.filter((ticket) => ticket.resolvedInFirstCall).length / firstCallMeasured.length) * 1000) / 10
      : null;
    const reopened = scopedTickets.filter((ticket) => (ticket.reopenCount ?? 0) > 0).length;
    const excessiveHandoffs = scopedTickets.filter((ticket) => (ticket.ownerHandoffs ?? 0) >= 3).length;
    const satisfaction = scopedTickets
      .map((ticket) => ticket.satisfactionScore)
      .filter((value): value is number => value != null);
    const averageSatisfaction = satisfaction.length
      ? Math.round((satisfaction.reduce((sum, value) => sum + value, 0) / satisfaction.length) * 10) / 10
      : null;
    return [
      topCategory
        ? `${topCategory.name} concentra ${Math.round((topCategory.value / Math.max(scopedTickets.length, 1)) * 100)}% dos atendimentos do recorte.`
        : "Ainda não há categorias disponíveis para o recorte.",
      `${portfolioSummary.open} atendimento(s) permanecem abertos (${openRate}% do volume analisado).`,
      portfolioSummary.critical
        ? `${portfolioSummary.critical} atendimento(s) crítico(s) aberto(s) exigem acompanhamento.`
        : "Não há atendimentos críticos abertos neste recorte.",
      unassigned
        ? `${unassigned} atendimento(s) estão sem responsável informado.`
        : "Todos os atendimentos do recorte possuem responsável informado.",
      firstCallRate === null
        ? "A resolução no primeiro contato ainda não possui medição suficiente."
        : `${firstCallRate}% dos atendimentos medidos foram resolvidos no primeiro contato.`,
      reopened
        ? `${reopened} atendimento(s) tiveram reabertura e devem ter a efetividade da solução revisada.`
        : "Não foram identificadas reaberturas no recorte.",
      excessiveHandoffs
        ? `${excessiveHandoffs} atendimento(s) tiveram três ou mais trocas de responsável.`
        : "Não há concentração relevante de trocas de responsável.",
      averageSatisfaction === null
        ? "Ainda não há avaliações de satisfação no recorte."
        : `A satisfação média é ${averageSatisfaction}/5 em ${satisfaction.length} avaliação(ões).`,
    ];
  }, [categoryPieData, portfolioSummary, scopedTickets]);

  const presentationSummary = useMemo(() => {
    const bugs = scopedTickets.filter(isBug);
    const withTask = scopedTickets.filter((ticket) => Boolean(ticket.azureWorkItem || ticket.taskNumber));
    const pending = scopedTickets.filter(isOpen);
    const taskItems = Array.from(new Map(
      withTask.map((ticket) => [ticket.azureWorkItem?.id ?? ticket.taskNumber, ticket])
    ).values());

    return {
      bugs,
      withTask,
      pending,
      taskItems,
      taskStatuses: groupChartData(taskItems, (ticket) => taskStatusGroup(ticket), 6),
      pendingStatuses: groupChartData(pending, (ticket) => ticket.justification?.trim() || ticket.status || "Sem motivo informado", 6),
      areas: groupChartData(scopedTickets, classifyExecutiveProcess, 8),
      bugAreas: groupChartData(bugs, classifyExecutiveProcess, 8),
    };
  }, [scopedTickets]);

  /* =======================================================
     PIZZA 2 - SITUAÇÃO DOS TICKETS
  ======================================================= */

  const statusPieData =
    useMemo<PieDataItem[]>(() => {
      const newTickets =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "New"
        ).length;

      const attendance =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "InAttendance"
        ).length;

      const stopped =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "Stopped"
        ).length;

      const resolved =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
              "Resolved" ||
            ticket.baseStatus ===
              "Closed"
        ).length;

      return [
        {
          name: "Novos",
          value:
            newTickets,
        },
        {
          name:
            "Em Atendimento",
          value:
            attendance,
        },
        {
          name: "Parados",
          value:
            stopped,
        },
        {
          name:
            "Resolvidos",
          value:
            resolved,
        },
      ].filter(
        (item) =>
          item.value > 0
      );
    }, [scopedTickets]);

  const visibleStatusPieData = useMemo(() => statusPieData.filter((item) => !hiddenStatusSlices.has(item.name)), [statusPieData, hiddenStatusSlices]);
  const statusChartData = visibleStatusPieData.length > 0 ? visibleStatusPieData : statusPieData;

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

  function showClientTickets(
    client: string
  ) {
    const list =
      scopedTickets.filter(
        (ticket) =>
          (ticket.client ??
            "Sem cliente") ===
          client
      );

    showTickets(
      `Cliente: ${client}`,
      list,
      "Tickets relacionados ao cliente"
    );
  }

  function showStatusTickets(
    type:
      | "open"
      | "critical"
      | "stopped"
      | "resolved"
      | "new"
      | "attendance"
  ) {
    if (
      type === "open"
    ) {
      showTickets(
        "Tickets abertos",
        scopedTickets.filter(
          isOpen
        )
      );

      return;
    }

    if (
      type ===
      "critical"
    ) {
      showTickets(
        "Tickets críticos",
        scopedTickets.filter(
          (ticket) =>
            isOpen(ticket) &&
            normalize(
              ticket.urgency
            ) ===
              "critica"
        )
      );

      return;
    }

    if (
      type ===
      "stopped"
    ) {
      showTickets(
        "Tickets parados",
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "Stopped"
        )
      );

      return;
    }

    if (
      type ===
      "resolved"
    ) {
      showTickets(
        "Tickets resolvidos",
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
              "Resolved" ||
            ticket.baseStatus ===
              "Closed"
        )
      );

      return;
    }

    if (
      type === "new"
    ) {
      showTickets(
        "Tickets novos",
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "New"
        )
      );

      return;
    }

    showTickets(
      "Tickets em atendimento",
      scopedTickets.filter(
        (ticket) =>
          ticket.baseStatus ===
          "InAttendance"
      )
    );
  }

  /* =======================================================
     LIMPAR FILTROS
  ======================================================= */

  function clearFilters() {
    setSelectedClient("");
    setCategory("");
    setStatus("");
    setOwner("");
    setExecutiveArea("");
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
    const text = [
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
        text
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
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 9mm; }
          html, body.client-pdf-export {
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body.client-pdf-export .MuiDrawer-root,
          body.client-pdf-export #global-user-controls,
          body.client-pdf-export main > div:first-of-type,
          body.client-pdf-export .presentation-actions,
          body.client-pdf-export .client-print-hidden {
            display: none !important;
          }
          body.client-pdf-export main > div:last-child > :not(#client-export-content) {
            display: none !important;
          }
          body.client-pdf-export #client-export-content {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
          }
          body.client-pdf-export main {
            padding: 0 !important;
            margin: 0 !important;
            min-height: auto !important;
            overflow: visible !important;
            background: #fff !important;
          }
          body.client-pdf-export main > div:last-child {
            width: 100% !important;
            max-width: none !important;
          }
          body.client-pdf-export .MuiCard-root,
          body.client-pdf-export .MuiPaper-root {
            break-inside: avoid;
            box-shadow: none !important;
          }
          body.client-pdf-export #client-export-content {
            border: 0 !important;
            border-radius: 0 !important;
            color: #111827 !important;
          }
          body.client-pdf-export #client-export-content > .MuiBox-root:first-of-type {
            min-height: 108px !important;
            display: flex !important;
            justify-content: center !important;
            text-align: center !important;
            background: #d1fae5 !important;
            color: #064e3b !important;
            border-radius: 12px !important;
            margin-bottom: 12px !important;
          }
          body.client-pdf-export #client-export-content > .MuiBox-root:first-of-type .MuiStack-root {
            width: 100% !important;
            justify-content: center !important;
          }
          body.client-pdf-export #client-export-content > .MuiBox-root:first-of-type .MuiBox-root {
            width: 100% !important;
          }
          body.client-pdf-export .client-print-kpi-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }
          body.client-pdf-export .client-print-section-grid {
            grid-template-columns: 1fr !important;
            align-content: start !important;
            gap: 10px !important;
          }
          body.client-pdf-export .client-print-page {
            break-before: page;
            break-inside: avoid;
            width: 100% !important;
            min-height: 0 !important;
            padding-top: 3mm !important;
          }
          body.client-pdf-export .client-print-page .recharts-responsive-container {
            width: 100% !important;
            min-width: 0 !important;
          }
          body.client-pdf-export .client-print-page svg {
            max-width: 100% !important;
            overflow: visible !important;
          }
          body.client-pdf-export .client-print-page-title {
            grid-column: 1 / -1 !important;
            text-align: center !important;
            margin: 0 0 8px !important;
          }
          body.client-pdf-export .client-print-conclusion {
            grid-column: 1 / -1 !important;
          }
          body.client-pdf-export .client-print-continuation {
            break-before: auto !important;
            padding-top: 0 !important;
          }
        }
      `}</style>
      {/* =================================================
          CABEÇALHO
      ================================================= */}

      <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 2.5 }}>
        {selectedClient && (
          <Avatar variant="rounded" sx={{ width: 64, height: 64, bgcolor: aliareColors.greenDark, color: "white", fontSize: "1.1rem", fontWeight: 900, boxShadow: "0 10px 28px rgba(0,91,73,.22)" }}>
            {clientInitials(selectedClient)}
          </Avatar>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <PageHeader
            eyebrow="Carteira"
            title={selectedClient || "Clientes"}
            description={selectedClient ? "Painel executivo do cliente: atendimento, SLA, demanda e desenvolvimento" : "Resultados da carteira, qualidade do atendimento e acompanhamento do desenvolvimento"}
            meta={<>{scopedTickets.length} ticket(s) analisado(s) no filtro atual</>}
            action={<PeriodFilter />}
          />
        </Box>
      </Stack>

      {/* =================================================
          FILTROS
      ================================================= */}

      <Card
        elevation={0}
        sx={{
          border:
            "1px solid",

          borderColor:
            "divider",

          borderRadius:
            2.25,

          mb:
            2,

          backgroundColor:
            "background.paper",

          boxShadow:
            "0 1px 2px rgba(16,24,40,0.035)",
        }}
      >
        <CardContent
          sx={{
            py: 1.5,
            px: 2,

            "&:last-child": {
              pb: 1.5,
            },
          }}
        >
          <Stack
            spacing={0}
            sx={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: {
                xs: "minmax(0, 1fr)",
                md: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(3, minmax(0, 1fr))",
                xl: "190px minmax(245px, 1.35fr) repeat(4, minmax(175px, 1fr))",
              },
              gap: 1.5,
              alignItems: {
                xs: "stretch",
                md: "center",
              },
            }}
          >
            <Box
              sx={{
                minWidth: {
                  md: 190,
                },
              }}
            >
              <Typography
        sx={{
          fontWeight: 800,
                  fontSize:
                    "1rem",
                }}
              >
                Visão dos clientes
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Cliente, categoria, status e responsável
              </Typography>
            </Box>

            {/* CLIENTE */}

            <FormControl
              size="small"
              sx={{
                minWidth: 0,
              }}
            >
              <InputLabel>
                Cliente
              </InputLabel>

              <Select
                value={
                  selectedClient
                }
                label="Cliente"
                onChange={(
                  event
                ) =>
                  setSelectedClient(
                    event.target
                      .value
                  )
                }
              >
                <MenuItem value="">
                  Todos os clientes
                </MenuItem>

                {clientOptions.map(
                  (client) => (
                    <MenuItem
                      key={
                        client
                      }
                      value={
                        client
                      }
                    >
                      {
                        client
                      }
                    </MenuItem>
                  )
                )}
              </Select>
            </FormControl>

            {/* CATEGORIA */}

            <FormControl
              size="small"
              sx={{
                minWidth: 0,
              }}
            >
              <InputLabel>
                Categoria
              </InputLabel>

              <Select
                value={
                  category
                }
                label="Categoria"
                onChange={(
                  event
                ) =>
                  setCategory(
                    event.target
                      .value
                  )
                }
              >
                <MenuItem value="">
                  Todas as categorias
                </MenuItem>

                {categories.map(
                  (item) => (
                    <MenuItem
                      key={item}
                      value={item}
                    >
                      {item}
                    </MenuItem>
                  )
                )}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 0 }}>
              <InputLabel>Status</InputLabel>
              <Select value={status} label="Status" onChange={(event) => setStatus(event.target.value)}>
                <MenuItem value="">Todos os status</MenuItem>
                {statuses.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 0 }}>
              <InputLabel>Responsável</InputLabel>
              <Select value={owner} label="Responsável" onChange={(event) => setOwner(event.target.value)}>
                <MenuItem value="">Todos os responsáveis</MenuItem>
                {owners.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 0 }}>
              <InputLabel>Frente de atendimento</InputLabel>
              <Select value={executiveArea} label="Frente de atendimento" onChange={(event) => setExecutiveArea(event.target.value)}>
                <MenuItem value="">Todas as frentes</MenuItem>
                {executiveAreas.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </Select>
            </FormControl>

            {(selectedClient ||
              category || status || owner || executiveArea) && (
              <Button
                size="small"
                variant="outlined"
                onClick={
                  clearFilters
                }
                sx={{
                  minHeight: 40,
                  whiteSpace: "nowrap",
                }}
              >
                Limpar filtros
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* =================================================
          KPIs DE CLIENTES
      ================================================= */}

      <Box
        sx={{
          display: "grid",

          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            lg: "repeat(4, 1fr)",
          },

          gap: {
            xs: 1.25,
            md: 1.5,
            xl: 2,
          },

          mb: 2,
        }}
      >
        <MetricCard
          title="Tickets no período"
          value={
            executiveTicketGroups
              .all.length
          }
          description={`${summary.totalClients} cliente(s) com tickets`}
          info={{
            title: "Tickets no período",
            summary: "Total de atendimentos que permanecem após aplicar período, cliente e categoria.",
            calculation: "Contagem dos tickets do recorte atual.",
            source: "Movidesk",
            reference: "Ticket.createdDate + filtros da tela",
            periodRule: "Respeita o período global e os filtros locais.",
            notes: "Clique para abrir exatamente os tickets que formam o indicador.",
          }}
          onClick={() =>
            showTickets(
              "Tickets no período",

              executiveTicketGroups
                .all,

              "Atendimentos que compõem este indicador"
            )
          }
        />

        <MetricCard
          title="Alta atenção"
          value={
            executiveTicketGroups
              .highAttention.length
          }
          description="Atendimentos de clientes em situação crítica"
          info={{
            title: "Alta atenção",
            summary: "Atendimentos pertencentes a clientes classificados no nível mais alto de atenção.",
            calculation: "Clientes com pelo menos 2 tickets críticos abertos ou 5 tickets abertos; o card conta os atendimentos desses clientes.",
            source: "Movidesk / regra local do TechLead Hub",
            reference: "Urgência, baseStatus e concentração por cliente",
            periodRule: "Respeita o recorte atual da tela.",
          }}
          severity="error"
          onClick={() =>
            showTickets(
              "Atendimentos em alta atenção",

              executiveTicketGroups
                .highAttention,

              "A quantidade exibida no card corresponde exatamente aos atendimentos desta lista"
            )
          }
        />

        <MetricCard
          title="Em atenção"
          value={
            executiveTicketGroups
              .attention.length
          }
          description="Atendimentos que exigem acompanhamento"
          info={{
            title: "Em atenção",
            summary: "Atendimentos de clientes com sinais moderados de risco operacional.",
            calculation: "Cliente com crítico, ticket parado ou ao menos 3 tickets abertos, sem atingir Alta atenção.",
            source: "Movidesk / regra local do TechLead Hub",
            reference: "Urgência + baseStatus + concentração por cliente",
            periodRule: "Respeita o recorte atual da tela.",
          }}
          severity="warning"
          onClick={() =>
            showTickets(
              "Atendimentos em atenção",

              executiveTicketGroups
                .attention,

              "A quantidade exibida no card corresponde exatamente aos atendimentos desta lista"
            )
          }
        />

        <MetricCard
          title="Críticos abertos"
          value={
            executiveTicketGroups
              .critical.length
          }
          description="Atendimentos críticos ainda em aberto"
          info={{
            title: "Críticos abertos",
            summary: "Tickets ainda ativos cuja urgência está classificada como Crítica.",
            calculation: "Ticket aberto e urgência normalizada igual a Crítica.",
            source: "Movidesk",
            reference: "Ticket.urgency + Ticket.baseStatus",
            periodRule: "Respeita o período e os filtros locais.",
          }}
          severity={
            executiveTicketGroups
              .critical.length >
            0
              ? "error"
              : "default"
          }
          onClick={() =>
            showTickets(
              "Atendimentos críticos abertos",

              executiveTicketGroups
                .critical,

              "A quantidade exibida no card corresponde exatamente aos atendimentos desta lista"
            )
          }
        />
      </Box>

      {/* =================================================
          RESUMO EXECUTIVO / CLIENTE
      ================================================= */}

      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.25, mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5}
            sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", lg: "center" }, mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: "1.05rem" }}>Resumo Executivo</Typography>
              <Typography variant="caption" color="text.secondary">
                Indicadores para análise interna e apresentação de resultados ao cliente
              </Typography>
            </Box>
            <Chip size="small" variant="outlined" label={selectedClient || `${summary.totalClients} cliente(s) na carteira`} />
          </Stack>

          <Box className="client-print-kpi-grid" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, gap: 1.25 }}>
            <ExecutiveMetric
              title="Taxa de resolução"
              value={`${portfolioSummary.resolutionRate}%`}
              description={`${portfolioSummary.resolved} de ${portfolioSummary.total} atendimento(s) do recorte`}
              info={{
                title: "Taxa de resolução",
                summary: "Percentual dos atendimentos do recorte atual que estão Resolvidos ou Fechados.",
                calculation: "Resolvidos/Fechados ÷ total de tickets do recorte × 100.",
                source: "Movidesk",
                reference: "Ticket.baseStatus",
                periodRule: "Respeita período, cliente e categoria selecionados.",
              }}
              onClick={() => showStatusTickets("resolved")}
            />
            <ExecutiveMetric
              title="SLA 1ª resposta"
              value={formatSlaPercent(portfolioSummary.responseSla.percent)}
              description={portfolioSummary.responseSla.measured ? `${portfolioSummary.responseSla.onTime} de ${portfolioSummary.responseSla.measured} medidos no prazo` : "Sem medição oficial no recorte"}
              info={{
                title: "SLA 1ª resposta",
                summary: "Percentual de tickets com medição oficial de primeira resposta atendidos dentro do prazo.",
                calculation: "Medições no prazo ÷ medições válidas × 100.",
                source: "Movidesk",
                reference: "responseSlaIndicator",
                periodRule: "Respeita o recorte atual; itens sem medição ficam fora do denominador.",
              }}
              onClick={() => showTickets("SLA 1ª resposta - tickets medidos", scopedTickets.filter((ticket) => Boolean(normalize(ticket.responseSlaIndicator))), "Tickets com indicador oficial disponível")}
            />
            <ExecutiveMetric
              title="SLA solução"
              value={formatSlaPercent(portfolioSummary.solutionSla.percent)}
              description={portfolioSummary.solutionSla.measured ? `${portfolioSummary.solutionSla.onTime} de ${portfolioSummary.solutionSla.measured} medidos no prazo` : "Sem medição oficial no recorte"}
              info={{
                title: "SLA solução",
                summary: "Percentual de tickets com medição oficial de solução atendidos dentro do prazo.",
                calculation: "Medições no prazo ÷ medições válidas × 100.",
                source: "Movidesk",
                reference: "solutionSlaIndicator",
                periodRule: "Respeita o recorte atual; itens sem medição ficam fora do denominador.",
              }}
              onClick={() => showTickets("SLA solução - tickets medidos", scopedTickets.filter((ticket) => Boolean(normalize(ticket.solutionSlaIndicator))), "Tickets com indicador oficial disponível")}
            />
            <ExecutiveMetric
              title="Desenvolvimento"
              value={portfolioSummary.azureTasks}
              description={`${portfolioSummary.azureCorrections} correção(ões) • ${portfolioSummary.azureEvolutions} evolução(ões)`}
              info={{
                title: "Desenvolvimento",
                summary: "Work Items únicos do Azure vinculados aos atendimentos do recorte atual.",
                calculation: "Contagem distinta por azureWorkItem.id.",
                source: "Movidesk + Azure DevOps",
                reference: "Ticket.azureWorkItem.id",
                periodRule: "A Task entra quando está vinculada a um ticket pertencente ao recorte atual.",
              }}
              onClick={() => showTickets("Tickets com desenvolvimento vinculado", scopedTickets.filter((ticket) => Boolean(ticket.azureWorkItem)), "Atendimentos com Work Item do Azure vinculado")}
            />
          </Box>

          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
            <Chip size="small" variant="outlined" label={`${portfolioSummary.azurePrioritized} priorizada(s)`} />
            <Chip size="small" variant="outlined" label={`${portfolioSummary.azureWithVersion} com versão`} />
            <Box sx={{ flexGrow: 1 }} />
            <Button size="small" variant="outlined" onClick={() => navigate("/correcoes")}>Correções</Button>
            <Button size="small" variant="outlined" onClick={() => navigate("/evolucoes")}>Evoluções</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.25 }}>
            SLA considera somente o indicador oficial disponível no Movidesk. Registros sem medição não são tratados como descumprimento.
          </Typography>
        </CardContent>
      </Card>

      {/* PAINEL PARA APRESENTAÇÃO AO CLIENTE */}
      {selectedClient && (
        <Card id="client-export-content" ref={presentationRef} elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.25, mb: 2, overflow: "hidden", bgcolor: "background.default", "@media print": { breakInside: "avoid", "& .presentation-actions": { display: "none !important" } }, "&:fullscreen": { position: "fixed", inset: 0, width: "100vw", height: "100vh", maxWidth: "none", borderRadius: 0, m: 0, zIndex: 99999, display: "flex", flexDirection: "column" } }}>
          <Box sx={{ px: { xs: 2, md: 3 }, py: 2, color: "white", background: `linear-gradient(110deg, ${aliareColors.greenDark}, ${aliareColors.green})` }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
              <Box>
                <Typography variant="overline" sx={{ opacity: .85, fontWeight: 800 }}>Suporte e Sustentação</Typography>
                <Typography sx={{ fontSize: { xs: "1.35rem", md: isPresenting ? "2.15rem" : "1.7rem" }, fontWeight: 900, lineHeight: 1.15 }}>{selectedClient}</Typography>
                <Typography variant="body2" sx={{ opacity: .9, mt: .5 }}>
                  {executiveArea || "Todas as frentes"} · {effectiveStartDate.toLocaleDateString("pt-BR")} a {effectiveEndDate.toLocaleDateString("pt-BR")}
                </Typography>
              </Box>
              <Stack className="presentation-actions" direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {isPresenting && <Typography variant="body2" sx={{ mr: 1, fontWeight: 800 }}>Página {presentationPage + 1} de 5</Typography>}
                {!isPresenting && <Button variant="outlined" color="inherit" startIcon={<PictureAsPdfOutlined />} disabled={exportingPresentation} onClick={() => void exportClientPresentation()} sx={{ color: "white", borderColor: "rgba(255,255,255,.65)", "&:hover": { borderColor: "white", bgcolor: "rgba(255,255,255,.10)" } }}>
                  {exportingPresentation ? "Gerando PDF..." : "Exportar PDF"}
                </Button>}
                <Button variant="contained" color="inherit" onClick={isPresenting ? () => void document.exitFullscreen() : () => void startPresentation()} startIcon={isPresenting ? <FullscreenExitOutlined /> : undefined} sx={{ color: aliareColors.greenDark, fontWeight: 800 }}>
                  {isPresenting ? "Sair da apresentação" : "Apresentar em tela cheia"}
                </Button>
              </Stack>
            </Stack>
          </Box>

          <CardContent sx={{ p: { xs: 1.5, md: isPresenting ? 3 : 2 }, flex: isPresenting ? 1 : undefined, overflow: isPresenting ? "hidden" : undefined, display: "flex", flexDirection: "column" }}>
            {(!isPresenting || presentationPage === 0) && <Box sx={{ height: isPresenting ? "100%" : "auto", display: "flex", flexDirection: "column", justifyContent: isPresenting ? "center" : undefined }}>
              <Typography variant="h5" sx={{ fontWeight: 900, mb: 2 }}>Resumo executivo</Typography>
              <Box className="client-print-kpi-grid" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", lg: "repeat(6,minmax(0,1fr))" }, gap: 1.25, mb: 2 }}>
                <PresentationKpi title="Atendimentos" value={scopedTickets.length} detail="no período" color="#075985" onClick={() => showTickets("Atendimentos no foco", scopedTickets)} />
                <PresentationKpi title="Bugs" value={presentationSummary.bugs.length} detail={`${presentationSummary.bugs.filter((ticket) => ticket.azureWorkItem || ticket.taskNumber).length} com Task`} color="#008A68" onClick={() => showTickets("Bugs identificados", presentationSummary.bugs)} />
                <PresentationKpi title="Com Task" value={presentationSummary.withTask.length} detail="correção, evolução ou apoio" color="#2676B9" onClick={() => showTickets("Atendimentos com Task", presentationSummary.withTask)} />
                <PresentationKpi title="Pendências" value={presentationSummary.pending.length} detail="em acompanhamento" color="#B7791F" onClick={() => showTickets("Pendências ativas", presentationSummary.pending)} />
                <PresentationKpi title="SLA solução" value={formatSlaPercent(portfolioSummary.solutionSla.percent)} detail={`${portfolioSummary.solutionSla.onTime} de ${portfolioSummary.solutionSla.measured} medidos`} color="#159A68" onClick={() => showTickets("SLA solução", scopedTickets.filter((ticket) => Boolean(normalize(ticket.solutionSlaIndicator))))} />
                <PresentationKpi title="Tempo médio de solução" value={formatMinutes(clients.find((item) => item.client === selectedClient)?.averageResolutionMinutes ?? null)} detail={`${clients.find((item) => item.client === selectedClient)?.measuredResolutionTimes ?? 0} atendimento(s) medido(s)`} color="#7C3AED" onClick={() => showTickets("Atendimentos com tempo de solução", scopedTickets.filter((ticket) => ticketResolutionMinutes(ticket) !== null))} />
              </Box>
              <Box sx={{ p: 2.25, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" }}>
                <Typography sx={{ fontWeight: 850 }}>Principais insights</Typography>
                <Stack spacing={1} sx={{ mt: 1.25 }}>{executiveInsights.slice(0, 5).map((item) => <Typography key={item} variant="body1" sx={{ lineHeight: 1.55 }}>• {item}</Typography>)}</Stack>
              </Box>
            </Box>}

            {(!isPresenting || presentationPage === 1) && <Box className="client-print-section-grid client-print-page" sx={{ mt: isPresenting ? 0 : 1.5, height: isPresenting ? "100%" : "auto", display: "grid", gridTemplateColumns: "1fr", gap: 2 }}>
              <Typography className="client-print-page-title" variant="h5" sx={{ fontWeight: 900 }}>Demanda e recorrência</Typography>
              <ExecutiveBarPanel title="Atendimentos por processo" data={presentationSummary.areas} onClick={(name) => showTickets(`Processo: ${name}`, scopedTickets.filter((ticket) => classifyExecutiveProcess(ticket) === name))} />
              <ExecutiveBarPanel title="Bugs por processo" data={presentationSummary.bugAreas} onClick={(name) => showTickets(`Bugs · ${name}`, presentationSummary.bugs.filter((ticket) => classifyExecutiveProcess(ticket) === name))} />
              <Box sx={{ p: 2.25, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" }}>
                <Typography variant="h6" sx={{ fontWeight: 900 }}>Leitura da demanda</Typography>
                <Typography sx={{ mt: 1.5, lineHeight: 1.65 }}>O processo com maior volume é {presentationSummary.areas[0]?.name ?? "não identificado"}, com {presentationSummary.areas[0]?.value ?? 0} atendimento(s). Entre os bugs, {presentationSummary.bugAreas[0]?.name ?? "nenhum processo"} concentra {presentationSummary.bugAreas[0]?.value ?? 0} ocorrência(s).</Typography>
                <Typography sx={{ mt: 1.25, lineHeight: 1.65, color: "text.secondary" }}>Direcionamento: avaliar causa raiz, recorrência, necessidade de treinamento e oportunidade de correção preventiva nos processos mais representativos.</Typography>
              </Box>
            </Box>}

            {(!isPresenting || presentationPage === 2) && <Box className="client-print-section-grid client-print-page" sx={{ mt: isPresenting ? 0 : 1.5, height: isPresenting ? "100%" : "auto", display: "grid", gridTemplateColumns: "1fr", gap: 2 }}>
              <Typography className="client-print-page-title" variant="h5" sx={{ fontWeight: 900 }}>Entregas e desenvolvimento</Typography>
              <ExecutiveDonutPanel title="Status das Tarefas" data={presentationSummary.taskStatuses} total={presentationSummary.taskItems.length} />
              <Box sx={{ p: 2.25, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" }}>
                <Typography variant="h6" sx={{ fontWeight: 900 }}>Leitura das entregas</Typography>
                <Typography sx={{ mt: 1.5, lineHeight: 1.65 }}>{presentationSummary.taskItems.length} Task(s) relacionadas ao cliente, sendo {portfolioSummary.azureWithVersion} com versão informada, {portfolioSummary.azurePrioritized} priorizada(s) e {portfolioSummary.azureBlocked} com processo bloqueado.</Typography>
              </Box>
            </Box>}

            {(!isPresenting || presentationPage === 3) && <Box className="client-print-section-grid client-print-page client-print-continuation" sx={{ mt: isPresenting ? 0 : 1.5, height: isPresenting ? "100%" : "auto", display: "grid", gridTemplateColumns: "1fr", gap: 2 }}>
              <Typography className="client-print-page-title" variant="h5" sx={{ fontWeight: 900 }}>Pendências e encaminhamentos</Typography>
              <ExecutiveDonutPanel title="Status das pendências" data={presentationSummary.pendingStatuses} total={presentationSummary.pending.length} />
              <Box sx={{ p: 2.25, borderRadius: 2, bgcolor: presentationSummary.pending.length ? "rgba(245,158,11,.10)" : "rgba(22,163,74,.08)", border: "1px solid", borderColor: presentationSummary.pending.length ? "rgba(245,158,11,.28)" : "rgba(22,163,74,.22)" }}>
                <Typography variant="h6" sx={{ fontWeight: 900 }}>Pontos de atenção e encaminhamento</Typography>
                <Typography sx={{ mt: 1.5, lineHeight: 1.65 }}>{presentationSummary.pending.length ? `${presentationSummary.pending.length} pendência(s) permanecem ativas. ${presentationSummary.bugs.filter(isOpen).length} são bugs e ${presentationSummary.pending.filter((ticket) => normalize(ticket.justification).includes("cliente")).length} aguardam ação ou retorno do cliente.` : "Não há pendências ativas no recorte selecionado."}</Typography>
              </Box>
            </Box>}

            {(!isPresenting || presentationPage === 4) && <Box className="client-print-section-grid client-print-page" sx={{ mt: isPresenting ? 0 : 1.5, height: isPresenting ? "100%" : "auto", display: "grid", gridTemplateColumns: "1fr", gap: 2 }}>
              <Typography className="client-print-page-title" variant="h5" sx={{ fontWeight: 900 }}>Conclusão executiva</Typography>
              <Box className="client-print-conclusion" sx={{ p: 3, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" }}>
                <Typography variant="h6" sx={{ fontWeight: 900, color: aliareColors.greenDark }}>Resumo do período</Typography>
                <Typography sx={{ mt: 1.5, lineHeight: 1.75 }}>
                  Foram analisados {scopedTickets.length} atendimento(s) de {selectedClient}, com taxa de resolução de {portfolioSummary.resolutionRate.toFixed(1)}%, SLA de solução de {formatSlaPercent(portfolioSummary.solutionSla.percent)} e tempo médio de solução de {formatMinutes(clients.find((item) => item.client === selectedClient)?.averageResolutionMinutes ?? null)}.
                </Typography>
                <Typography sx={{ mt: 1.5, lineHeight: 1.75 }}>
                  O recorte possui {presentationSummary.pending.length} pendência(s), {presentationSummary.bugs.length} bug(s) e {presentationSummary.taskItems.length} Tarefa(s) relacionada(s). O processo mais recorrente é {presentationSummary.areas[0]?.name ?? "não identificado"}, com {presentationSummary.areas[0]?.value ?? 0} ocorrência(s).
                </Typography>
                <Typography variant="h6" sx={{ mt: 3, fontWeight: 900 }}>Recomendação</Typography>
                <Typography sx={{ mt: 1, lineHeight: 1.75 }}>
                  {presentationSummary.pending.length
                    ? "Priorizar a revisão das pendências, acompanhar as entregas com versão informada e atuar preventivamente nos processos de maior recorrência."
                    : "Manter o acompanhamento periódico da carteira e preservar as práticas que sustentam o resultado atual."}
                </Typography>
              </Box>
              <Box className="client-print-conclusion" sx={{ p: 2.5, borderRadius: 2, bgcolor: "rgba(0,138,104,.08)", border: "1px solid rgba(0,138,104,.25)" }}>
                <Typography sx={{ fontWeight: 850 }}>Leitura para a direção</Typography>
                <Stack spacing={1} sx={{ mt: 1.25 }}>{executiveInsights.slice(0, 5).map((item) => <Typography key={item} sx={{ lineHeight: 1.55 }}>• {item}</Typography>)}</Stack>
              </Box>
            </Box>}

            {isPresenting && <Stack className="presentation-actions" direction="row" spacing={1.5} sx={{ mt: "auto", pt: 2, justifyContent: "space-between", alignItems: "center" }}>
              <Button variant="outlined" color="inherit" startIcon={<ArrowBackOutlined />} disabled={presentationPage === 0} onClick={() => setPresentationPage((page) => Math.max(0, page - 1))}>Anterior</Button>
              <Stack direction="row" spacing={0.75}>{[0, 1, 2, 3, 4].map((page) => <Box key={page} onClick={() => setPresentationPage(page)} sx={{ width: page === presentationPage ? 28 : 9, height: 9, borderRadius: 5, bgcolor: page === presentationPage ? aliareColors.green : "divider", cursor: "pointer", transition: "all .2s" }} />)}</Stack>
              <Button variant="contained" endIcon={<ArrowForwardOutlined />} disabled={presentationPage === 4} onClick={() => setPresentationPage((page) => Math.min(4, page + 1))}>Próxima</Button>
            </Stack>}
          </CardContent>
        </Card>
      )}

      {/* =================================================
          GRÁFICOS
      ================================================= */}

      <Box
        sx={{
          display: "grid",

          gridTemplateColumns: {
            xs: "1fr",
            lg: "repeat(3, minmax(0, 1fr))",
          },

          gap: 2,
          mb: 2,
        }}
      >
        {/* DISTRIBUIÇÃO POR CLIENTE */}

        <ChartCard
          title="Distribuição por Cliente"
          subtitle="Participação dos clientes no volume de chamados"
        >
          {clientPieData.length >
          0 ? (
            <Box
              sx={{
                display:
                  "grid",

                gridTemplateColumns:
                  {
                    xs: "1fr",
                    sm: "minmax(220px, 0.9fr) minmax(0, 1.1fr)",
                  },

                gap: 1.5,

                alignItems:
                  "center",
              }}
            >
              <Box
                sx={{
                  height: 235,
                  minWidth: 0,
                }}
              >
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <PieChart>
                    <Pie
                      data={clientChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={78}
                      innerRadius={46}
                      paddingAngle={2}
                      cursor="pointer"
                      onClick={(data) => {
                        const name =
                          String(
                            (
                              data as {
                                payload?: {
                                  name?: unknown;
                                };
                              }
                            ).payload?.name ??
                              ""
                          );

                        if (
                          !name ||
                          name ===
                            "Outros"
                        ) {
                          return;
                        }

                        const list =
                          periodTickets.filter(
                            (ticket) =>
                              (ticket.client ??
                                "Sem cliente") ===
                                name &&
                              (!category ||
                                ticket.category ===
                                  category)
                          );

                        showTickets(
                          `Cliente: ${name}`,
                          list,
                          "Tickets que compõem esta participação"
                        );
                      }}
                    >
                      {clientChartData.map(
                        (
                          _,
                          index
                        ) => (
                          <Cell
                            key={`${clientPieData[index]?.name ?? "client"}-${index}`}
                            fill={
                              PIE_COLORS[
                                index %
                                  PIE_COLORS.length
                              ]
                            }
                          />
                        )
                      )}
                    </Pie>

                    <Tooltip
                      content={
                        <CompactPieTooltip
                          valueLabel="ticket(s)"
                        />
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>

              <CompactPieLegend
                data={clientPieData}
                hiddenItems={hiddenClientSlices}
                onToggleItem={(name) => togglePieSlice(setHiddenClientSlices, clientPieData, name)}
                onItemClick={(
                  name
                ) => {
                  if (
                    name ===
                    "Outros"
                  ) {
                    return;
                  }

                  const list =
                    periodTickets.filter(
                      (ticket) =>
                        (ticket.client ??
                          "Sem cliente") ===
                          name &&
                        (!category ||
                          ticket.category ===
                            category)
                    );

                  showTickets(
                    `Cliente: ${name}`,
                    list,
                    "Tickets que compõem esta participação"
                  );
                }}
              />
            </Box>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard
          title="Atendimentos por Categoria"
          subtitle="Composição dos assuntos no recorte selecionado"
        >
          {categoryPieData.length ? (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "minmax(170px,.85fr) minmax(0,1.15fr)" }, gap: 1, alignItems: "center" }}>
              <Box sx={{ height: 235, minWidth: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={76} innerRadius={44} paddingAngle={2} cursor="pointer"
                      onClick={(data) => {
                        const name = String((data as { payload?: { name?: unknown } }).payload?.name ?? "");
                        if (name && name !== "Outros") showTickets(`Categoria: ${name}`, scopedTickets.filter((ticket) => (ticket.category?.trim() || "Sem categoria") === name));
                      }}>
                      {categoryChartData.map((item, index) => <Cell key={`${item.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<CompactPieTooltip valueLabel="ticket(s)" />} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
              <CompactPieLegend data={categoryPieData}
                hiddenItems={hiddenCategorySlices}
                onToggleItem={(name) => togglePieSlice(setHiddenCategorySlices, categoryPieData, name)}
                onItemClick={(name) => name !== "Outros" && showTickets(`Categoria: ${name}`, scopedTickets.filter((ticket) => (ticket.category?.trim() || "Sem categoria") === name))} />
            </Box>
          ) : <EmptyChart />}
        </ChartCard>

        {/* SITUAÇÃO DOS TICKETS */}

        <ChartCard
          title="Situação dos Tickets"
          subtitle="Composição operacional da carteira selecionada"
        >
          {statusPieData.length >
          0 ? (
            <Box
              sx={{
                display:
                  "grid",

                gridTemplateColumns:
                  {
                    xs: "1fr",
                    sm: "minmax(220px, 0.9fr) minmax(0, 1.1fr)",
                  },

                gap: 1.5,

                alignItems:
                  "center",
              }}
            >
              <Box
                sx={{
                  height: 235,
                  minWidth: 0,
                }}
              >
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={78}
                      innerRadius={46}
                      paddingAngle={2}
                      cursor="pointer"
                      onClick={(data) => {
                        const name =
                          String(
                            (
                              data as {
                                payload?: {
                                  name?: unknown;
                                };
                              }
                            ).payload?.name ??
                              ""
                          );

                        if (
                          name ===
                          "Novos"
                        ) {
                          showStatusTickets(
                            "new"
                          );
                        }

                        if (
                          name ===
                          "Em Atendimento"
                        ) {
                          showStatusTickets(
                            "attendance"
                          );
                        }

                        if (
                          name ===
                          "Parados"
                        ) {
                          showStatusTickets(
                            "stopped"
                          );
                        }

                        if (
                          name ===
                          "Resolvidos"
                        ) {
                          showStatusTickets(
                            "resolved"
                          );
                        }
                      }}
                    >
                      {statusChartData.map(
                        (
                          _,
                          index
                        ) => (
                          <Cell
                            key={`${statusPieData[index]?.name ?? "status"}-${index}`}
                            fill={
                              STATUS_COLORS[
                                statusPieData[
                                  index
                                ]?.name ??
                                  ""
                              ] ??
                              PIE_COLORS[
                                index %
                                  PIE_COLORS.length
                              ]
                            }
                          />
                        )
                      )}
                    </Pie>

                    <Tooltip
                      content={
                        <CompactPieTooltip
                          valueLabel="ticket(s)"
                        />
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>

              <CompactPieLegend
                data={statusPieData}
                hiddenItems={hiddenStatusSlices}
                onToggleItem={(name) => togglePieSlice(setHiddenStatusSlices, statusPieData, name)}
                onItemClick={(
                  name
                ) => {
                  if (
                    name ===
                    "Novos"
                  ) {
                    showStatusTickets(
                      "new"
                    );
                  }

                  if (
                    name ===
                    "Em Atendimento"
                  ) {
                    showStatusTickets(
                      "attendance"
                    );
                  }

                  if (
                    name ===
                    "Parados"
                  ) {
                    showStatusTickets(
                      "stopped"
                    );
                  }

                  if (
                    name ===
                    "Resolvidos"
                  ) {
                    showStatusTickets(
                      "resolved"
                    );
                  }
                }}
              />
            </Box>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.35fr .65fr" }, gap: 2, mb: 2 }}>
        <ChartCard title="Volume por Responsável" subtitle="Distribuição da demanda entre os analistas no recorte · clique para investigar">
          {ownerChartData.length ? (
            <Box sx={{ mt: 1 }}>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mb: 1.25 }}>
                <Chip size="small" variant="outlined" label={`${ownerChartData.length} responsável(is)`} />
                <Chip size="small" variant="outlined" label={`${ownerChartData.reduce((sum, item) => sum + Number(item.value || 0), 0)} tickets distribuídos`} />
                <Chip size="small" variant="outlined" label={`Maior carteira: ${ownerChartData[0]?.name ?? "—"} · ${ownerChartData[0]?.value ?? 0}`} />
              </Stack>
              <Box sx={{ height: Math.max(250, Math.min(390, ownerChartData.length * 43 + 52)) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ownerChartData} layout="vertical" barCategoryGap="28%" margin={{ top: 6, right: 54, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="4 6" horizontal={false} stroke={theme.palette.divider} opacity={0.4} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={185} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} tickFormatter={(value) => abbreviate(String(value), 27)} />
                    <Tooltip formatter={(value) => [`${Number(value)} ticket(s)`, "Volume"]} labelFormatter={(label) => `Responsável: ${label}`} contentStyle={{ borderRadius: 12, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, color: theme.palette.text.primary, boxShadow: "0 12px 32px rgba(0,0,0,.16)" }} labelStyle={{ color: theme.palette.text.primary, fontWeight: 800 }} cursor={{ fill: theme.palette.action.hover }} />
                    <Bar dataKey="value" name="Tickets" fill={aliareColors.green} radius={[0, 7, 7, 0]} maxBarSize={28} cursor="pointer"
                      label={{ position: "right", fill: theme.palette.text.secondary, fontSize: 11, fontWeight: 800 }}
                      onClick={(data) => {
                        const name = String((data as { name?: unknown }).name ?? "");
                        if (name && name !== "Outros") showTickets(`Responsável: ${name}`, scopedTickets.filter((ticket) => (ticket.owner?.trim() || "Sem responsável") === name));
                      }} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
              <Typography variant="caption" color="text.secondary">Ordenado por volume no período. O número ao final de cada barra representa a quantidade de tickets da carteira do responsável.</Typography>
            </Box>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="Insights do Período" subtitle="Leituras automáticas para apoiar a apresentação executiva">
          <Stack spacing={1.25} sx={{ mt: 2 }}>
            {executiveInsights.map((insight, index) => (
              <Box key={insight} sx={{ display: "flex", gap: 1.2, p: 1.2, borderRadius: 1.5, bgcolor: index === 2 && portfolioSummary.critical ? "rgba(211,47,47,.06)" : "rgba(0,122,96,.055)" }}>
                <Box sx={{ width: 24, height: 24, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: index === 2 && portfolioSummary.critical ? "error.main" : aliareColors.green, color: "white", fontSize: 12, fontWeight: 900 }}>{index + 1}</Box>
                <Typography variant="body2" sx={{ lineHeight: 1.5 }}>{insight}</Typography>
              </Box>
            ))}
          </Stack>
        </ChartCard>
      </Box>

      {/* =================================================
          SEM DADOS
      ================================================= */}

      {scopedTickets.length ===
        0 && (
        <Alert
          severity="info"
          sx={{
            mb: 2,
            borderRadius: 2,
          }}
        >
          Nenhum ticket foi encontrado para os filtros selecionados.
        </Alert>
      )}

      {/* =================================================
          TABELA
      ================================================= */}

      <Card
        elevation={0}
        sx={{
          border:
            "1px solid",

          borderColor:
            "divider",

          borderRadius:
            2.25,

          overflow:
            "hidden",

          backgroundColor:
            "background.paper",

          boxShadow:
            "0 1px 2px rgba(16,24,40,0.035)",
        }}
      >
        <CardContent
          sx={{
            py: 1.25,
            px: 2,

            "&:last-child": {
              pb: 1.25,
            },
          }}
        >
          <Stack
            direction={{
              xs: "column",
              sm: "row",
            }}
            spacing={1}
            sx={{
              justifyContent:
                "space-between",

              alignItems: {
                xs: "flex-start",
                sm: "center",
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
                Análise por Cliente
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Clique nos clientes e indicadores para investigar
              </Typography>
            </Box>

            <Chip
              size="small"
              variant="outlined"
              label={`${clients.length} cliente(s)`}
            />
          </Stack>
        </CardContent>

        <TableContainer>
          <Table size="small">
            <TableHead
              sx={{
                backgroundColor:
                  "background.paper",

                "& .MuiTableCell-root":
                  {
                    color:
                      "text.secondary",

                    fontSize:
                      "0.72rem",

                    letterSpacing:
                      "0.02em",

                    borderBottomColor:
                      "divider",
                  },
              }}
            >
              <TableRow>
                <TableCell>
                  <strong>
                    Cliente
                  </strong>
                </TableCell>

                <TableCell>
                  <strong>
                    Situação
                  </strong>
                </TableCell>

                <TableCell align="right">
                  <strong>
                    Total
                  </strong>
                </TableCell>

                <TableCell align="right">
                  <strong>
                    Abertos
                  </strong>
                </TableCell>

                <TableCell align="right">
                  <strong>
                    Críticos
                  </strong>
                </TableCell>

                <TableCell align="right">
                  <strong>
                    Parados
                  </strong>
                </TableCell>

                <TableCell align="right">
                  <strong>
                    Resolvidos
                  </strong>
                </TableCell>

                <TableCell align="right">
                  <strong>
                    Analistas
                  </strong>
                </TableCell>

                <TableCell align="right">
                  <strong>
                    Categorias
                  </strong>
                </TableCell>

                <TableCell>
                  <strong>
                    Principal assunto
                  </strong>
                </TableCell>

                <TableCell align="right" sx={{ minWidth: 145, whiteSpace: "nowrap" }}>
                  <strong>
                    Tempo médio de solução
                  </strong>
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {clients.slice(clientsPage * 10, clientsPage * 10 + 10).map(
                (client) => {
                  const ticketsOfClient =
                    scopedTickets.filter(
                      (ticket) =>
                        (ticket.client ??
                          "Sem cliente") ===
                        client.client
                    );

                  return (
                    <TableRow
                      key={
                        client.client
                      }
                      hover
                    >
                      <TableCell>
                        <Button
                          size="small"
                          variant="text"
                          title={
                            client.client
                          }
                          onClick={() =>
                            showClientTickets(
                              client.client
                            )
                          }
                          sx={{
                            p: 0,

                            minWidth:
                              0,

                            maxWidth:
                              220,

                            fontWeight:
                              700,

                            textTransform:
                              "none",

                            justifyContent:
                              "flex-start",

                            overflow:
                              "hidden",

                            whiteSpace:
                              "nowrap",

                            textOverflow:
                              "ellipsis",

                            display:
                              "block",

                            color:
                              aliareColors.greenDark,

                            "&:hover": {
                              backgroundColor:
                                "transparent",

                              color:
                                aliareColors.green,
                            },
                          }}
                        >
                          {
                            client.client
                          }
                        </Button>
                      </TableCell>

                      <TableCell>
                        <AttentionChip
                          level={
                            client.attentionLevel
                          }
                        />
                      </TableCell>

                      <ClickableNumber
                        value={
                          client.total
                        }
                        onClick={() =>
                          showTickets(
                            `${client.client} - Todos`,
                            ticketsOfClient
                          )
                        }
                      />

                      <ClickableNumber
                        value={
                          client.open
                        }
                        onClick={() =>
                          showTickets(
                            `${client.client} - Abertos`,
                            ticketsOfClient.filter(
                              isOpen
                            )
                          )
                        }
                      />

                      <ClickableNumber
                        value={
                          client.critical
                        }
                        severity={
                          client.critical >
                          0
                            ? "error"
                            : "default"
                        }
                        onClick={() =>
                          showTickets(
                            `${client.client} - Críticos`,

                            ticketsOfClient.filter(
                              (ticket) =>
                                isOpen(
                                  ticket
                                ) &&
                                normalize(
                                  ticket.urgency
                                ) ===
                                  "critica"
                            )
                          )
                        }
                      />

                      <ClickableNumber
                        value={
                          client.stopped
                        }
                        severity={
                          client.stopped >
                          0
                            ? "warning"
                            : "default"
                        }
                        onClick={() =>
                          showTickets(
                            `${client.client} - Parados`,

                            ticketsOfClient.filter(
                              (ticket) =>
                                ticket.baseStatus ===
                                "Stopped"
                            )
                          )
                        }
                      />

                      <ClickableNumber
                        value={
                          client.resolved
                        }
                        severity="success"
                        onClick={() =>
                          showTickets(
                            `${client.client} - Resolvidos`,

                            ticketsOfClient.filter(
                              (ticket) =>
                                ticket.baseStatus ===
                                  "Resolved" ||
                                ticket.baseStatus ===
                                  "Closed"
                            )
                          )
                        }
                      />

                      <TableCell align="right">
                        {
                          client.analysts
                        }
                      </TableCell>

                      <TableCell align="right">
                        {
                          client.categories
                        }
                      </TableCell>

                      <TableCell>
                        <Chip
                          size="small"
                          label={
                            client.topCategory
                          }
                          title={
                            client.topCategory
                          }
                          variant="outlined"
                          sx={{
                            maxWidth:
                              180,

                            "& .MuiChip-label":
                              {
                                overflow:
                                  "hidden",

                                textOverflow:
                                  "ellipsis",

                                whiteSpace:
                                  "nowrap",
                              },
                          }}
                        />
                      </TableCell>

                      <TableCell align="right" sx={{ minWidth: 145, whiteSpace: "nowrap" }} title={`${client.measuredResolutionTimes} ticket(s) com tempo de solução mensurável`}>
                        {formatMinutes(
                          client.averageResolutionMinutes
                        )}
                      </TableCell>
                    </TableRow>
                  );
                }
              )}

              {clients.length ===
                0 && (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    align="center"
                  >
                    <Box
                      sx={{
                        py: 4,
                      }}
                    >
                      <Typography
                      sx={{ fontWeight: 700 }}
                      >
                        Nenhum cliente encontrado
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        Altere o período, o cliente ou a categoria.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
              <TablePagination
                component="div"
                count={clients.length}
                page={Math.min(clientsPage, Math.max(0, Math.ceil(clients.length / 10) - 1))}
                onPageChange={(_event, value) => setClientsPage(value)}
                rowsPerPage={10}
                rowsPerPageOptions={[10]}
                labelRowsPerPage="Itens por página"
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
                showFirstButton
                showLastButton
              />
      </Card>

      {/* =================================================
          NOTA
      ================================================= */}

      <Alert
        severity="info"
        sx={{
          mt: 2,
          borderRadius: 2,
          py: 0.25,

          "& .MuiAlert-message":
            {
              fontSize:
                "0.82rem",
            },
        }}
      >
        Esta visão combina resultados operacionais do Movidesk com Correções e Evoluções do Azure DevOps.
        Os sinais de desenvolvimento apoiam o acompanhamento da carteira e não representam, por si só, uma medição contratual de SLA.
      </Alert>

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
                  aria-label="Fechar lista de tickets"
                  title="Fechar"
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
                  variant="outlined"
                  label={`${drilldown.tickets.length} ticket(s)`}
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
                        #{ticket.movideskId}
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

                      {" • "}

                      {ticket.category ??
                        "Sem categoria"}
                    </Typography>
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
                  aria-label="Fechar detalhes do ticket"
                  title="Fechar"
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
                  label="Analista"
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
                  label="Status"
                  value={
                    selectedTicket.status
                  }
                />

                <TicketField
                  label="Urgência"
                  value={
                    selectedTicket.urgency
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
    </>
  );
}

/* =========================================================
   KPI
========================================================= */

/* =========================================================
   LEGENDA COMPACTA DOS GRÁFICOS
========================================================= */

function CompactPieLegend({
  data,
  hiddenItems: controlledHiddenItems,
  onToggleItem,
  onItemClick,
}: {
  data: PieDataItem[];
  hiddenItems?: Set<string>;
  onToggleItem?: (name: string) => void;
  onItemClick?: (name: string) => void;
}) {
  const [localHiddenItems, setLocalHiddenItems] = useState<Set<string>>(() => new Set());
  const hiddenItems = controlledHiddenItems ?? localHiddenItems;
  const visibleTotal = data.reduce((sum, item) => hiddenItems.has(item.name) ? sum : sum + item.value, 0);
  const toggleItem = (name: string) => {
    if (onToggleItem) {
      onToggleItem(name);
      return;
    }
    setLocalHiddenItems((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else if (data.length - next.size > 1) next.add(name);
      return next;
    });
  };

  return (
    <Stack
      spacing={0.5}
      sx={{
        minWidth: 0,
      }}
    >
      {data.map(
        (
          item,
          index
        ) => {
          const percent =
            visibleTotal > 0
              ? Math.round(
                  (item.value /
                    visibleTotal) *
                    100
                )
              : 0;

          const active = !hiddenItems.has(item.name);
          const clickable = true;

          return (
            <Box
              key={`${item.name}-${index}`}
              role={
                clickable
                  ? "button"
                  : undefined
              }
              tabIndex={
                clickable
                  ? 0
                  : undefined
              }
              title={
                item.name
              }
              onClick={() => toggleItem(item.name)}
              onDoubleClick={() => {
                if (item.name !== "Outros") onItemClick?.(item.name);
              }}
              onKeyDown={(
                event
              ) => {
                if (event.key === "Enter" || event.key === " ") {
                  toggleItem(item.name);
                }
              }}
              sx={{
                display:
                  "grid",

                gridTemplateColumns:
                  "10px minmax(0, 1fr) auto",

                alignItems:
                  "center",

                gap: 0.8,

                px: 0.75,
                py: 0.6,

                borderRadius:
                  1.25,

                cursor: "pointer",
                opacity: active ? 1 : 0.38,
                textDecoration: active ? "none" : "line-through",
                transition: "all .2s ease",

                "&:hover":
                  clickable
                    ? {
                        backgroundColor:
                          "action.hover",
                      }
                    : undefined,
              }}
            >
              <Box
                sx={{
                  width: 9,
                  height: 9,

                  borderRadius:
                    "50%",

                  backgroundColor: active ? PIE_COLORS[index % PIE_COLORS.length] : "text.disabled",
                  boxShadow: active ? `0 0 8px ${PIE_COLORS[index % PIE_COLORS.length]}88` : "none",
                }}
              />

              <Typography
                variant="body2"
                sx={{
                  minWidth: 0,

                  fontWeight:
                    600,

                  fontSize:
                    "0.78rem",

                  lineHeight:
                    1.25,

                  overflow:
                    "hidden",

                  textOverflow:
                    "ellipsis",

                  whiteSpace:
                    "nowrap",
                }}
              >
                {item.name}
              </Typography>

              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  alignItems:
                    "center",

                  flexShrink:
                    0,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight:
                      800,

                    fontVariantNumeric:
                      "tabular-nums",
                  }}
                >
                  {item.value}
                </Typography>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    minWidth:
                      30,

                    textAlign:
                      "right",

                    fontVariantNumeric:
                      "tabular-nums",
                  }}
                >
                  {percent}%
                </Typography>
              </Stack>
            </Box>
          );
        }
      )}
    </Stack>
  );
}

/* =========================================================
   TOOLTIP COMPACTO DOS GRÁFICOS
========================================================= */

function CompactPieTooltip({
  active,
  payload,
  valueLabel,
}: {
  active?:
    boolean;

  payload?:
    Array<{
      name?:
        string;

      value?:
        number;

      payload?:
        PieDataItem;
    }>;

  valueLabel:
    string;
}) {
  if (
    !active ||
    !payload ||
    payload.length ===
      0
  ) {
    return null;
  }

  const entry =
    payload[0];

  const item =
    entry?.payload;

  const name =
    item?.name ??
    entry?.name ??
    "Item";

  const value =
    item?.value ??
    entry?.value ??
    0;

  return (
    <Box
      sx={{
        maxWidth:
          280,

        px: 1.25,
        py: 1,

        border:
          "1px solid",

        borderColor:
          "divider",

        borderRadius:
          1.5,

        backgroundColor:
          "background.paper",

        boxShadow:
          "0 10px 28px rgba(16,24,40,0.12)",

        borderTop:
          `3px solid ${aliareColors.green}`,
      }}
    >
      <Typography
        variant="body2"
        title={
          name
        }
        sx={{
          fontWeight:
            700,

          lineHeight:
            1.35,
        }}
      >
        {name}
      </Typography>

      <Typography
        variant="caption"
        color="text.secondary"
      >
        {value}{" "}
        {valueLabel}
      </Typography>
    </Box>
  );
}

/* =========================================================
   CARD DE MÉTRICA
========================================================= */

function ExecutiveMetric({
  title,
  value,
  description,
  info,
  onClick,
}: {
  title: string;
  value: string | number;
  description: string;
  info: MetricInfoDefinition;
  onClick: () => void;
}) {
  return (
    <StandardMetricCard
      title={title}
      value={value}
      description={description}
      info={info}
      accentColor={aliareColors.green}
      onClick={onClick}
    />
  );
}

function MetricCard({
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
  severity?: "default" | "error" | "warning";
  onClick?: () => void;
}) {
  const accentColor =
    severity === "error"
      ? semanticChartColors.overdue
      : severity === "warning"
      ? semanticChartColors.attention
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
  title, value, description, info, accentColor, onClick,
}: {
  title: string; value: ReactNode; description: string; info: MetricInfoDefinition; accentColor: string; onClick?: () => void;
}) {
  return <ExecutiveKpiCard title={title} value={value} subtitle={description} info={`${info.summary} • ${info.periodRule}`} accent={accentColor} onClick={onClick} />;
}


function PresentationKpi({ title, value, detail, color, onClick }: {
  title: string; value: ReactNode; detail: string; color: string; onClick: () => void;
}) {
  return (
    <Card elevation={0} role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && onClick()}
      sx={{ border: "1px solid", borderColor: "divider", borderTop: `4px solid ${color}`, cursor: "pointer", height: "100%", "&:hover": { boxShadow: "0 8px 22px rgba(16,24,40,.09)", transform: "translateY(-2px)" }, transition: ".15s" }}>
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Typography variant="body2" sx={{ fontWeight: 800 }}>{title}</Typography>
        <Typography sx={{ mt: .4, fontSize: "1.8rem", lineHeight: 1, fontWeight: 900, color }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .7 }}>{detail}</Typography>
      </CardContent>
    </Card>
  );
}

function ExecutiveDonutPanel({ title, data, total }: { title: string; data: PieDataItem[]; total: number }) {
  const safeTotal = Math.max(total, 0);
  let accumulated = 0;
  const segments = data.map((item, index) => {
    const start = safeTotal > 0 ? (accumulated / safeTotal) * 100 : 0;
    accumulated += item.value;
    const end = safeTotal > 0 ? (accumulated / safeTotal) * 100 : 0;
    return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}% ${end}%`;
  });
  const chartBackground = segments.length
    ? `conic-gradient(${segments.join(", ")})`
    : "#e5e7eb";

  return (
    <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2, minWidth: 0, bgcolor: "background.paper" }}>
      <Typography sx={{ fontWeight: 850 }}>{title}</Typography>
      {data.length ? (
        <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", md: "220px minmax(0,1fr)" }, gap: 2.5, alignItems: "center" }}>
          <Box sx={{ width: 170, height: 170, mx: "auto", borderRadius: "50%", background: chartBackground, position: "relative", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
            <Box sx={{ position: "absolute", inset: 28, borderRadius: "50%", bgcolor: "background.paper", display: "grid", placeContent: "center", textAlign: "center" }}>
              <Typography sx={{ fontWeight: 900, fontSize: "1.35rem", lineHeight: 1 }}>{safeTotal}</Typography>
              <Typography variant="caption">total</Typography>
            </Box>
          </Box>
          <CompactPieLegend data={data} />
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>Sem dados no recorte.</Typography>
      )}
    </Box>
  );
}

function ExecutiveBarPanel({ title, data, onClick }: { title: string; data: PieDataItem[]; onClick: (name: string) => void }) {
  const maximum = Math.max(...data.map((item) => item.value), 1);
  return (
    <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2, minWidth: 0, bgcolor: "background.paper" }}>
      <Typography sx={{ fontWeight: 850 }}>{title}</Typography>
      {data.length ? (
        <Stack spacing={0.8} sx={{ mt: 1.5 }}>
          {data.map((item) => (
            <Box key={item.name} role={item.name !== "Outros" ? "button" : undefined} tabIndex={item.name !== "Outros" ? 0 : undefined}
              onClick={() => item.name !== "Outros" && onClick(item.name)}
              onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && item.name !== "Outros" && onClick(item.name)}
              sx={{ display: "grid", gridTemplateColumns: { xs: "115px minmax(0,1fr) 30px", sm: "190px minmax(0,1fr) 38px" }, gap: 1, alignItems: "center", cursor: item.name !== "Outros" ? "pointer" : "default" }}>
              <Typography variant="caption" title={item.name} sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{item.name}</Typography>
              <Box sx={{ height: 20, borderRadius: 1, bgcolor: "rgba(0,138,104,.10)", overflow: "hidden" }}>
                <Box sx={{ width: `${Math.max((item.value / maximum) * 100, item.value > 0 ? 3 : 0)}%`, height: "100%", borderRadius: 1, bgcolor: aliareColors.green, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
              </Box>
              <Typography variant="caption" sx={{ fontWeight: 850, textAlign: "right" }}>{item.value}</Typography>
            </Box>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>Sem dados no recorte.</Typography>
      )}
    </Box>
  );
}

/* =========================================================
   CARD DE GRÁFICO
========================================================= */

function ChartCard({
  title, subtitle, children,
}: {
  title: string; subtitle: string; children: ReactNode;
}) {
  return <ExecutiveSection title={title} subtitle={subtitle} compact>{children}</ExecutiveSection>;
}

/* =========================================================
   GRÁFICO SEM DADOS
========================================================= */

function EmptyChart() {
  return (
    <Box
      sx={{
        height: 280,

        display:
          "flex",

        alignItems:
          "center",

        justifyContent:
          "center",
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
      >
        Nenhum dado disponível para o filtro selecionado.
      </Typography>
    </Box>
  );
}

/* =========================================================
   NÚMEROS CLICÁVEIS
========================================================= */

function ClickableNumber({
  value,
  onClick,
  severity = "default",
}: {
  value: number;
  onClick: () => void;

  severity?:
    | "default"
    | "error"
    | "warning"
    | "success";
}) {
  const color =
    severity === "error"
      ? "error.main"
      : severity ===
        "warning"
      ? "warning.main"
      : severity ===
        "success"
      ? "success.main"
      : "primary.main";

  return (
    <TableCell align="right">
      <Button
        size="small"
        variant="text"
        onClick={onClick}
        sx={{
          minWidth: 30,
          p: 0.25,
          fontWeight: 800,
          color,
        }}
      >
        {value}
      </Button>
    </TableCell>
  );
}

/* =========================================================
   SITUAÇÃO DO CLIENTE
========================================================= */

function AttentionChip({
  level,
}: {
  level:
    AttentionLevel;
}) {
  if (
    level === "alto"
  ) {
    return (
      <Chip
        size="small"
        color="error"
        label="Alta atenção"
      />
    );
  }

  if (
    level ===
    "atencao"
  ) {
    return (
      <Chip
        size="small"
        color="warning"
        label="Atenção"
      />
    );
  }

  return (
    <Chip
      size="small"
      color="success"
      label="Normal"
      variant="outlined"
    />
  );
}

/* =========================================================
   CAMPO DO DETALHE
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
   TICKET ABERTO
========================================================= */

function formatSlaPercent(value: number | null) {
  return value === null ? "Sem medição" : `${value.toFixed(1)}%`;
}

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
    .trim()
    .toLowerCase();
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
   TEMPO
========================================================= */

function ticketResolutionMinutes(ticket: Ticket): number | null {
  if (typeof ticket.lifetimeMinutes === "number" && ticket.lifetimeMinutes > 0) {
    return ticket.lifetimeMinutes;
  }

  const endValue = ticket.closedDate || ticket.resolvedDate;
  if (!endValue) return null;

  const createdAt = new Date(ticket.createdDate).getTime();
  const endedAt = new Date(endValue).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(endedAt) || endedAt <= createdAt) return null;

  const elapsed = Math.round((endedAt - createdAt) / 60000);
  const stopped = Math.max(ticket.stoppedMinutes ?? 0, 0);
  return Math.max(elapsed - stopped, 1);
}

function isBug(ticket: Ticket) {
  const category = normalize(ticket.category);
  const type = normalize(ticket.azureWorkItem?.workItemType);
  return category === "bug" || category.includes("erro de sistema") || type.includes("correcao");
}

function taskStatusGroup(ticket: Ticket) {
  const value = normalize(ticket.azureWorkItem?.state || ticket.taskStatus);
  if (!value) return "Sem status";
  if (["concluido", "closed", "done", "resolved"].some((item) => value.includes(item))) return "Concluída";
  if (["desenvolvimento", "development", "doing", "andamento"].some((item) => value.includes(item))) return "Em desenvolvimento";
  if (["analise", "analysis", "new", "novo", "qualificacao"].some((item) => value.includes(item))) return "Em análise";
  if (["cancelado", "canceled", "cancelled"].some((item) => value.includes(item))) return "Cancelada";
  return ticket.azureWorkItem?.state || ticket.taskStatus || "Outro";
}

function classifyExecutiveArea(ticket: Ticket) {
  const text = executiveClassificationText(ticket);
  const matches = (terms: string[]) => terms.some((term) => text.includes(term));

  if (matches(["insumo", "defensivo", "agrotoxico", "fertilizante", "receituario", "agriq", "sisdev", "indea"])) return "Insumos";
  if (matches(["legislacao", "legal", "tribut", "ibs", "cbs", "sped", "efd", "obrigacao fiscal"])) return "Legislação";
  if (matches(["vertical", "sementes", "beneficiamento de sementes", "armazenagem", "armazem"])) return "Verticais";
  if (matches(["financeiro", "titulo", "boleto", "bordero", "bancario", "contas a pagar", "contas a receber", "acerto", "pedido de compra", "cotacao", "solicitacao de compra", "ordem de compra", "compras", "faturamento de entrada", "importacao nf", "importador de nota", "nota de entrada", "nfe de terceiro", "contrato", "fixacao", "graos", "ato cooperado", "saldo agricola", "estoque", "romaneio", "pesagem", "lote", "classificacao"])) return "Backoffice";
  return "Outras frentes";
}

function classifyExecutiveProcess(ticket: Ticket) {
  const area = classifyExecutiveArea(ticket);
  const text = executiveClassificationText(ticket);
  const matches = (terms: string[]) => terms.some((term) => text.includes(term));

  if (matches(["pedido de venda", "orcamento", "tabela de preco", "comissao", "vendedor", "faturamento de saida", "venda"])) return "Vendas e Faturamento";
  if (matches(["cadastro de pessoa", "cadastro pessoa", "cliente", "fornecedor", "produto", "item", "filial", "usuario", "parametro", "configurador"])) return "Cadastros e Configurações";
  if (matches(["relatorio", "painel", "dashboard", "analytics", "consulta", "impressao", "layout"])) return "Relatórios e Consultas";
  if (matches(["integracao", "api", "webservice", "sincron", "importacao", "exportacao", "xml", "arquivo", "conector"])) return "Integrações e Importações";
  if (matches(["permissao", "acesso", "perfil", "senha", "login", "seguranca", "autorizacao"])) return "Acessos e Segurança";
  if (matches(["lentidao", "performance", "desempenho", "timeout", "servidor", "processamento", "erro 500"])) return "Desempenho e Infraestrutura";
  if (area === "Insumos") return "Insumos e Receituário";
  if (area === "Legislação") return "Legislação e Obrigações";
  if (area === "Verticais" && matches(["semente", "beneficiamento"])) return "Vertical - Sementes";
  if (area === "Verticais" && matches(["armazenagem", "armazem", "silo"])) return "Vertical - Armazém";
  if (matches(["romaneio", "pesagem", "classificacao", "balanca"])) return "Recebimento e Romaneios";
  if (matches(["financeiro", "titulo", "boleto", "bordero", "bancario", "contas a pagar", "contas a receber", "acerto", "caixa", "despesa"])) return "Financeiro";
  if (matches(["pedido de compra", "cotacao", "solicitacao de compra", "ordem de compra", "compras"])) return "Compras";
  if (matches(["faturamento de entrada", "importacao nf", "importador de nota", "nota de entrada", "nfe de terceiro"])) return "Faturamento de Entrada";
  if (matches(["contrato", "fixacao", "graos", "ato cooperado", "saldo agricola", "barter"])) return "Contratos e Grãos";
  if (matches(["estoque", "lote", "saldo", "inventario", "movimentacao"])) return "Estoque";
  if (matches(["fiscal", "nf-e", "nfe", "mdf-e", "mdfe", "ct-e", "cte", "sefaz", "tribut", "sped", "efd"])) return "Fiscal e Documentos Eletrônicos";
  if (matches(["contabil", "contabilidade", "plano de contas", "lancamento contabil", "centro de custo"])) return "Contábil";
  if (matches(["producao", "ordem de producao", "industrial", "formula", "beneficiamento"])) return "Produção";
  if (ticket.service?.trim()) return `Serviço: ${ticket.service.trim()}`;
  if (ticket.category?.trim()) return `Categoria: ${ticket.category.trim()}`;
  if (ticket.department?.trim()) return `Área: ${ticket.department.trim()}`;
  return "Processo não informado";
}

function executiveClassificationText(ticket: Ticket) {
  return normalize([
    ticket.subject,
    ticket.category,
    ticket.service,
    ticket.department,
    ticket.team,
    ticket.cause,
  ].filter(Boolean).join(" "));
}

function groupChartData(
  tickets: Ticket[],
  getName: (ticket: Ticket) => string,
  limit: number,
): PieDataItem[] {
  const counts = new Map<string, number>();
  tickets.forEach((ticket) => {
    const name = getName(ticket);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  const ordered = Array.from(counts, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const visible = ordered.slice(0, limit);
  const others = ordered.slice(limit).reduce((sum, item) => sum + item.value, 0);
  if (others) visible.push({ name: "Outros", value: others });
  return visible;
}

function clientInitials(client: string) {
  const ignored = new Set(["de", "da", "do", "das", "dos", "e"]);
  const words = client.split(/\s+/).filter((word) => word && !ignored.has(normalize(word)));
  return words.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
}

function abbreviate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

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

/* =========================================================
   DATA
========================================================= */

function formatDateTime(
  date:
    | string
    | null
) {
  if (!date) {
    return "—";
  }

  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
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
  ).format(parsed);
}
