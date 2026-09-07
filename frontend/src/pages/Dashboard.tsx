import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Popover,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";

import {
  InfoOutlined,
} from "@mui/icons-material";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useNavigate } from "react-router-dom";

import { api } from "../services/api";
import { PeriodFilter } from "../components/PeriodFilter";
import { useFilters } from "../context/FiltersContext";
import { aliareColors } from "../theme/theme";
import { calculateServiceLevel } from "../utils/serviceLevel";
import {
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

type TrendItem = {
  date: string;
  sortDate: string;
  total: number;
};

type AttentionLevel =
  | "critico"
  | "alto"
  | "medio";


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

  const [tickets, setTickets] =
    useState<Ticket[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [drilldown, setDrilldown] =
    useState<DrilldownState>(null);

  const [selectedTicket, setSelectedTicket] =
    useState<Ticket | null>(null);

  const [copyMessage, setCopyMessage] =
    useState("");

  const {
    period,
    effectiveStartDate,
    effectiveEndDate,
  } = useFilters();

  /* =======================================================
     CARREGAMENTO
  ======================================================= */

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        setError(null);

        const response = await api.get(
          "/dashboard/tickets"
        );

        setTickets(response.data);
      } catch (err) {
        console.error(
          "Erro ao carregar dashboard:",
          err
        );

        setError(
          "Não foi possível carregar os dados do Dashboard. Verifique se o backend está rodando."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
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

  const completedInPeriod = useMemo(() => {
    const ids = new Set<number>();
    return [...resolvedInPeriod, ...closedInPeriod].filter((ticket) => {
      if (ids.has(ticket.id)) return false;
      ids.add(ticket.id);
      return true;
    });
  }, [resolvedInPeriod, closedInPeriod]);

  // Rankings e gráficos de entrada continuam baseados na abertura do período.
  const filteredTickets = openedInPeriod;

  const newTickets = useMemo(() => pendingTickets.filter((ticket) => ticket.baseStatus === "New"), [pendingTickets]);
  const attendanceTickets = useMemo(() => pendingTickets.filter((ticket) => ticket.baseStatus === "InAttendance"), [pendingTickets]);
  const stoppedTickets = useMemo(() => pendingTickets.filter((ticket) => ticket.baseStatus === "Stopped"), [pendingTickets]);
  const criticalTickets = useMemo(() => pendingTickets.filter((ticket) => normalize(ticket.urgency) === "critica"), [pendingTickets]);

  const responseSla = useMemo(() => calculateHistoricalSla(openedInPeriod, "response"), [openedInPeriod]);
  const solutionSla = useMemo(() => calculateHistoricalSla(completedInPeriod, "solution"), [completedInPeriod]);

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

  /* =======================================================
     CATEGORIAS
  ======================================================= */

  const categories =
    useMemo(
      () =>
        groupByField(
          filteredTickets,
          "category",
          "Sem categoria"
        ),
      [filteredTickets]
    );

  /* =======================================================
     ANALISTAS
  ======================================================= */

  const owners =
    useMemo(
      () =>
        groupByField(
          filteredTickets,
          "owner",
          "Sem responsável"
        ),
      [filteredTickets]
    );

  /* =======================================================
     CLIENTES
  ======================================================= */

  const clients =
    useMemo(
      () =>
        groupByField(
          filteredTickets,
          "client",
          "Sem cliente"
        ),
      [filteredTickets]
    );

  /* =======================================================
     TENDÊNCIA
  ======================================================= */

  const trends =
    useMemo(() => {
      const grouped =
        new Map<
          string,
          number
        >();

      filteredTickets.forEach(
        (ticket) => {
          const date =
            new Date(
              ticket.createdDate
            );

          if (
            Number.isNaN(
              date.getTime()
            )
          ) {
            return;
          }

          const key =
            formatIsoDate(date);

          grouped.set(
            key,
            (grouped.get(key) ??
              0) + 1
          );
        }
      );

      /*
       * Mantemos todos os dias do período no gráfico,
       * inclusive dias sem abertura de tickets.
       *
       * Isso evita que a linha "pule" datas e deixa a
       * evolução operacional mais fiel.
       */
      const result:
        TrendItem[] = [];

      const cursor =
        startOfDay(
          effectiveStartDate
        );

      const lastDay =
        endOfDay(
          effectiveEndDate
        );

      while (
        cursor <= lastDay
      ) {
        const sortDate =
          formatIsoDate(
            cursor
          );

        result.push({
          sortDate,

          date:
            formatShortDate(
              sortDate
            ),

          total:
            grouped.get(
              sortDate
            ) ?? 0,
        });

        cursor.setDate(
          cursor.getDate() + 1
        );
      }

      return result;
    }, [
      filteredTickets,
      effectiveStartDate,
      effectiveEndDate,
    ]);

  /* =======================================================
     ÚLTIMA ATUALIZAÇÃO DOS DADOS
  ======================================================= */

const latestImportedAt =
  useMemo<Date | null>(() => {
    let latest:
      Date | null =
      null;

    tickets.forEach(
      (ticket) => {
        if (
          !ticket.importedAt
        ) {
          return;
        }

        const importedAt =
          new Date(
            ticket.importedAt
          );

        if (
          Number.isNaN(
            importedAt.getTime()
          )
        ) {
          return;
        }

        if (
          !latest ||
          importedAt.getTime() >
            latest.getTime()
        ) {
          latest =
            importedAt;
        }
      }
    );

    return latest;
  }, [tickets]);

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

  function showCategory(
    category: string
  ) {
    showTickets(
      `Categoria: ${category}`,
      filteredTickets.filter(
        (ticket) =>
          (ticket.category ??
            "Sem categoria") ===
          category
      ),
      "Tickets desta categoria no período selecionado"
    );
  }

  function showOwner(
    owner: string
  ) {
    showTickets(
      `Analista: ${owner}`,
      filteredTickets.filter(
        (ticket) =>
          (ticket.owner ??
            "Sem responsável") ===
          owner
      ),
      "Carteira do responsável no período"
    );
  }

  function showClient(
    client: string
  ) {
    showTickets(
      `Cliente: ${client}`,
      filteredTickets.filter(
        (ticket) =>
          (ticket.client ??
            "Sem cliente") ===
          client
      ),
      "Chamados relacionados ao cliente"
    );
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
        source: "Movidesk / regra histórica do TechLead Hub",
        reference: "responseSlaIndicator e prazos de primeira resposta",
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
        summary: "Percentual de tickets concluídos com solução dentro do prazo.",
        calculation: "Tickets dentro do prazo ÷ tickets concluídos com medição válida × 100.",
        source: "Movidesk / regra histórica do TechLead Hub",
        reference: "solutionSlaIndicator e prazo de solução",
        periodRule: "Considera tickets resolvidos ou fechados no período selecionado.",
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
    <>
      {/* =================================================
          CABEÇALHO
      ================================================= */}

      <Box
        sx={{
          mb: 2.5,

          display: "flex",

          flexDirection: {
            xs: "column",
            lg: "row",
          },

          justifyContent:
            "space-between",

          alignItems: {
            xs: "stretch",
            lg: "center",
          },

          gap: 2,
        }}
      >
        <Box>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems:
                "center",
            }}
          >
            <Box
              sx={{
                width:
                  30,

                height:
                  3,

                borderRadius:
                  99,

                backgroundColor:
                  aliareColors.green,
              }}
            />

            <Typography
              variant="caption"
              sx={{
                fontWeight:
                  800,

                letterSpacing:
                  "0.08em",

                textTransform:
                  "uppercase",

                color:
                  aliareColors.greenDark,
              }}
            >
              Operação
            </Typography>
          </Stack>

          <Typography
            sx={{
              mt:
                0.8,

              fontWeight:
                800,

              letterSpacing:
                "-0.025em",

              fontSize: {
                xs: "1.7rem",
                md: "1.9rem",
                xl: "2.1rem",
              },
            }}
          >
            Dashboard Executivo
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.25,
            }}
          >
            Visão consolidada da operação de suporte
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              mt: 0.5,
            }}
          >
            {periodLabel(period)}
            {" • "}
            {filteredTickets.length}
            {" ticket(s) analisado(s)"}
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              mt: 0.25,
            }}
          >
            Última atualização dos dados:{" "}
            {latestImportedAt
              ? formatDateTime(
                  latestImportedAt.toISOString()
                )
              : "informação de importação indisponível"}
          </Typography>
        </Box>

        <PeriodFilter />
      </Box>

      {/* =================================================
          KPIs
      ================================================= */}

      <Box
        sx={{
          display: "grid",

          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            lg: "repeat(3, 1fr)",
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
                  xl: "repeat(6, minmax(0, 1fr))",
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
              EVOLUÇÃO + CATEGORIA
          ============================================== */}

          <Box
            sx={{
              display:
                "grid",

              gridTemplateColumns:
                {
                  xs: "1fr",
                  lg: "2fr 1fr",
                },

              gap: 2,
              mb: 2,
            }}
          >
            <CardBase>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize:
                    "1.05rem",
                }}
              >
                Evolução dos Tickets
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Volume de abertura por dia
              </Typography>

              <Box
                sx={{
                  height: 250,
                  mt: 1.5,
                }}
              >
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <LineChart
                    data={trends}
                    margin={{
                      top: 8,
                      right: 12,
                      left: -8,
                      bottom: 4,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#EAECF0"
                    />

                    <XAxis
                      dataKey="date"
                      tick={{
                        fontSize: 11,
                      }}
                      minTickGap={22}
                      interval="preserveStartEnd"
                      tickMargin={8}
                    />

                    <YAxis
                      allowDecimals={
                        false
                      }
                      tick={{
                        fontSize: 11,
                      }}
                      width={34}
                    />

                    <Tooltip
                      content={
                        <TrendTooltip />
                      }
                    />

                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Tickets"
                      stroke={aliareColors.green}
                      strokeWidth={2.5}
                      dot={{
                        r: 3,
                        strokeWidth: 2,
                        fill: "#FFFFFF",
                        stroke:
                          aliareColors.green,
                      }}
                      activeDot={{
                        r: 5,
                        fill:
                          aliareColors.green,
                        stroke:
                          "#FFFFFF",
                        strokeWidth:
                          2,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardBase>

            <CardBase>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize:
                    "1.05rem",
                }}
              >
                Tickets por Categoria
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Clique em uma categoria para investigar
              </Typography>

              <Box
                sx={{
                  height: 250,
                  mt: 1.5,
                }}
              >
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={categories.slice(
                      0,
                      6
                    )}
                    layout="vertical"
                    margin={{
                      left: 15,
                      right: 15,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#EAECF0"
                    />

                    <XAxis
                      type="number"
                      allowDecimals={
                        false
                      }
                    />

                    <YAxis
                      type="category"
                      dataKey="label"
                      width={95}
                      tick={{
                        fontSize: 10,
                      }}
                    />

                    <Tooltip />

                    <Bar
                      dataKey="total"
                      fill={aliareColors.green}
                      radius={[
                        0,
                        5,
                        5,
                        0,
                      ]}
                      cursor="pointer"
                      onClick={(data) => {
                        const label =
                          (
                            data as {
                              payload?: {
                                label?: unknown;
                              };
                            }
                          ).payload?.label;

                        if (
                          typeof label ===
                          "string"
                        ) {
                          showCategory(
                            label
                          );
                        }
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardBase>
          </Box>

          {/* =============================================
              ANALISTAS + CLIENTES
          ============================================== */}

          <Box
            sx={{
              display:
                "grid",

              gridTemplateColumns:
                {
                  xs: "1fr",
                  lg: "1fr 1fr",
                },

              gap: 2,
              mb: 2,
            }}
          >
            <RankingCard
              title="Tickets por Analista"
              subtitle="Clique no responsável para visualizar a carteira"
              data={owners}
              onItemClick={
                showOwner
              }
            />

            <RankingCard
              title="Tickets por Cliente"
              subtitle="Clique no cliente para visualizar seus chamados"
              data={clients}
              onItemClick={
                showClient
              }
            />
          </Box>

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
    </>
  );
}

/* =========================================================
   TOOLTIP - EVOLUÇÃO DOS TICKETS
========================================================= */

function TrendTooltip({
  active,
  payload,
}: {
  active?:
    boolean;

  payload?:
    Array<{
      payload?:
        TrendItem;
    }>;
}) {
  if (
    !active ||
    !payload ||
    payload.length === 0
  ) {
    return null;
  }

  const item =
    payload[0]
      ?.payload;

  if (!item) {
    return null;
  }

  return (
    <Box
      sx={{
        minWidth: 150,

        px: 1.5,
        py: 1.25,

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
        variant="caption"
        color="text.secondary"
        sx={{
          display:
            "block",

          mb: 0.35,
        }}
      >
        {formatFullIsoDate(
          item.sortDate
        )}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          fontWeight:
            800,
        }}
      >
        {item.total}{" "}
        {item.total === 1
          ? "ticket aberto"
          : "tickets abertos"}
      </Typography>
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
    <Card
      elevation={0}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          onClick();
        }
      }}
      sx={{
        position: "relative",
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2.25,
        height: "100%",
        backgroundColor: "background.paper",
        cursor: onClick ? "pointer" : "default",
        transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 3,
          backgroundColor: accentColor,
        },
        ...(onClick && {
          "&:hover": {
            transform: "translateY(-2px)",
            borderColor: accentColor,
            boxShadow: "0 8px 24px rgba(16,24,40,0.08)",
          },
          "&:focus-visible": {
            outline: `2px solid ${accentColor}`,
            outlineOffset: "2px",
          },
        }),
      }}
    >
      <CardContent
        sx={{
          p: { xs: 1.6, md: 1.8 },
          "&:last-child": { pb: { xs: 1.6, md: 1.8 } },
        }}
      >
        <Stack
          direction="row"
          sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}
        >
          <Typography
            variant="body2"
            sx={{ fontWeight: 700, color: "text.primary", minWidth: 0 }}
          >
            {title}
          </Typography>

          <MetricInfo definition={info} />
        </Stack>

        <Typography
          sx={{
            fontWeight: 800,
            mt: 0.6,
            letterSpacing: "-0.025em",
            fontSize: { xs: "1.75rem", md: "1.95rem", xl: "2.1rem" },
            lineHeight: 1.05,
          }}
        >
          {value}
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 0.75, minHeight: 18 }}
        >
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
}

function MetricInfo({ definition }: { definition: MetricInfoDefinition }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton
        size="small"
        aria-label={`Informações sobre ${definition.title}`}
        title={`Informações sobre ${definition.title}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setAnchorEl(event.currentTarget);
        }}
        onKeyDown={(event) => event.stopPropagation()}
        sx={{
          p: 0.3,
          color: "text.secondary",
          flexShrink: 0,
          "&:hover": {
            color: aliareColors.greenDark,
            backgroundColor: "rgba(24,199,122,0.08)",
          },
        }}
      >
        <InfoOutlined sx={{ fontSize: 16 }} />
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            onClick: (event: React.MouseEvent<HTMLElement>) => event.stopPropagation(),
            sx: {
              width: { xs: 320, sm: 390 },
              maxWidth: "calc(100vw - 32px)",
              mt: 0.75,
              p: 2,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              boxShadow: "0 14px 40px rgba(16,24,40,0.14)",
            },
          },
        }}
      >
        <Stack spacing={1.2}>
          <Box>
            <Typography sx={{ fontWeight: 850 }}>{definition.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4, lineHeight: 1.55 }}>
              {definition.summary}
            </Typography>
          </Box>
          <Divider />
          <MetricInfoLine label="Como é calculado" value={definition.calculation} />
          <MetricInfoLine label="Fonte" value={definition.source} />
          <MetricInfoLine label="Campo de referência" value={definition.reference} />
          <MetricInfoLine label="Regra de período" value={definition.periodRule} />
          {definition.notes && (
            <Box sx={{ p: 1.1, borderRadius: 1.5, backgroundColor: "rgba(24,199,122,0.055)", border: "1px solid rgba(24,199,122,0.16)" }}>
              <Typography variant="caption" sx={{ fontWeight: 800, color: aliareColors.greenDark }}>Observação</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25, lineHeight: 1.5 }}>
                {definition.notes}
              </Typography>
            </Box>
          )}
        </Stack>
      </Popover>
    </>
  );
}

function MetricInfoLine({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{label}</Typography>
      <Typography variant="body2" sx={{ mt: 0.15, lineHeight: 1.5 }}>{value}</Typography>
    </Box>
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
  return (
    <Card
      elevation={0}
      sx={{
        border:
          "1px solid",

        borderColor:
          "divider",

        borderRadius:
          2.25,

        backgroundColor:
          "background.paper",

        boxShadow:
          "0 1px 2px rgba(16,24,40,0.035)",
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

/* =========================================================
   RANKING INTERATIVO
========================================================= */

function RankingCard({
  title,
  subtitle,
  data,
  onItemClick,
}: {
  title: string;
  subtitle: string;
  data: RankingItem[];
  onItemClick: (
    value: string
  ) => void;
}) {
  return (
    <CardBase>
      <Typography
        sx={{
          fontWeight: 800,
          fontSize:
            "1.05rem",
        }}
      >
        {title}
      </Typography>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: "block",
          mb: 1.25,
        }}
      >
        {subtitle}
      </Typography>

      {data
        .slice(0, 6)
        .map(
          (
            item,
            index
          ) => (
            <Box
              key={`${item.label}-${index}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                onItemClick(
                  item.label
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
                  onItemClick(
                    item.label
                  );
                }
              }}
              sx={{
                display: "flex",

                justifyContent:
                  "space-between",

                alignItems:
                  "center",

                py: 0.85,
                px: 0.75,

                borderTop:
                  index === 0
                    ? "none"
                    : "1px solid",

                borderColor:
                  "divider",

                borderRadius: 1,

                cursor:
                  "pointer",

                "&:hover": {
                  backgroundColor:
                    "action.hover",
                },
              }}
            >
              <Typography
                variant="body2"
              sx={{ fontWeight: 600 }}
              >
                {item.label}
              </Typography>

              <Chip
                size="small"
                label={
                  item.total
                }
                variant="outlined"
                sx={{
                  minWidth:
                    38,

                  fontWeight:
                    750,

                  color:
                    aliareColors.greenDark,

                  borderColor:
                    "rgba(24,199,122,0.32)",

                  backgroundColor:
                    "rgba(24,199,122,0.05)",
                }}
              />
            </Box>
          )
        )}
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
    | "client",

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

type HistoricalSlaSummary = {
  within: number; outside: number; unmeasured: number;
  percentage: number | null; measuredTickets: Ticket[];
};

function isDateInPeriod(value: string | null | undefined, start: Date, end: Date) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= start && date <= end;
}

function normalizeSlaIndicator(value: string | null | undefined): boolean | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  if (["fora", "violado", "vencido", "estourado", "nao cumprido"].some((term) => normalized.includes(term))) return false;
  if (["dentro", "cumprido", "no prazo"].some((term) => normalized.includes(term))) return true;
  return null;
}

function calculateHistoricalSla(tickets: Ticket[], kind: "response" | "solution"): HistoricalSlaSummary {
  let within = 0; let outside = 0; let unmeasured = 0;
  const measuredTickets: Ticket[] = [];

  tickets.forEach((ticket) => {
    let result = normalizeSlaIndicator(kind === "response" ? ticket.responseSlaIndicator : ticket.solutionSlaIndicator);

    // Fallback para importações antigas sem os indicadores oficiais do Movidesk.
    if (result === null) {
      const serviceLevel = calculateServiceLevel({
        urgency: ticket.urgency, category: ticket.category, cause: ticket.cause, subject: ticket.subject,
        createdDate: ticket.createdDate, dueDate: ticket.dueDate, baseStatus: ticket.baseStatus,
        firstResponseDueDate: ticket.firstResponseDueDate, firstResponseDate: ticket.firstResponseDate,
        resolvedDate: ticket.resolvedDate, closedDate: ticket.closedDate, stoppedMinutes: ticket.stoppedMinutes,
      });
      const deadline = kind === "response" ? serviceLevel.firstResponse : serviceLevel.resolution;
      if (deadline.completed) result = deadline.withinDeadline;
    }

    if (result === true) { within += 1; measuredTickets.push(ticket); }
    else if (result === false) { outside += 1; measuredTickets.push(ticket); }
    else unmeasured += 1;
  });

  const measured = within + outside;
  return { within, outside, unmeasured, measuredTickets, percentage: measured ? Math.round((within / measured) * 1000) / 10 : null };
}

function formatSlaPercentage(summary: HistoricalSlaSummary) {
  return summary.percentage === null ? "—" : `${summary.percentage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatSlaDescription(summary: HistoricalSlaSummary) {
  return `${summary.within + summary.outside} medidos • ${summary.unmeasured} sem medição`;
}

function slaSeverity(summary: HistoricalSlaSummary): Severity {
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

function formatFullIsoDate(
  isoDate: string
) {
  const [
    year,
    month,
    day,
  ] =
    isoDate
      .split("-")
      .map(Number);

  if (
    !year ||
    !month ||
    !day
  ) {
    return isoDate;
  }

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
  )}/${year}`;
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

    case "month":
      return "Este mês";

    case "custom":
      return "Período personalizado";

    default:
      return "Período selecionado";
  }
}
