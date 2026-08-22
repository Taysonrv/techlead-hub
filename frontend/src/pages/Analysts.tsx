import { useEffect, useMemo, useState } from "react";

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
  TableRow,
  Typography,
} from "@mui/material";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { useNavigate } from "react-router-dom";

import { api } from "../services/api";
import { useFilters } from "../context/FiltersContext";
import { PeriodFilter } from "../components/PeriodFilter";

/* =====================================================
   TIPOS
===================================================== */

type Ticket = {
  // ID técnico do PostgreSQL
  id: number;

  // Número real do atendimento no Movidesk
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

  importSource?: string | null;
  importedAt?: string | null;
  importBatch?: string | null;
};

type WorkloadLevel =
  | "normal"
  | "atencao"
  | "alto";

type AnalystMetric = {
  owner: string;

  teams: string[];

  total: number;
  open: number;
  critical: number;
  stopped: number;
  resolved: number;

  clients: number;
  categories: number;

  averageLifetimeMinutes: number;

  workloadLevel: WorkloadLevel;
};

type DrilldownState = {
  title: string;
  subtitle?: string;
  tickets: Ticket[];
} | null;

type PieDataItem = {
  name: string;
  value: number;
};

/* =====================================================
   SQUADS CONHECIDOS

   Os nomes precisam corresponder ao ownerTeam do Movidesk.
   Caso existam outros nomes na API, eles serão adicionados
   automaticamente aos filtros.
===================================================== */

const KNOWN_SQUADS = [
  "Nível 1",
  "Nível 2",
  "Nível 3",
  "Nível 1 Legal e Contábil",
  "Nível 2 Legal e Contábil",
  "Nível 3 Legal e Contábil",
  "BDS",
];

/* =====================================================
   CORES DO GRÁFICO DE PIZZA
===================================================== */

const PIE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#64748b",
  "#db2777",
];

/* =====================================================
   COMPONENTE
===================================================== */

export function Analysts() {
  const navigate = useNavigate();

  const [tickets, setTickets] =
    useState<Ticket[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  /* Filtros */

  const [selectedSquad, setSelectedSquad] =
    useState("");

  const [selectedAnalyst, setSelectedAnalyst] =
    useState("");

  /* Drill-down */

  const [drilldown, setDrilldown] =
    useState<DrilldownState>(null);

  const [selectedTicket, setSelectedTicket] =
    useState<Ticket | null>(null);

  const [copyMessage, setCopyMessage] =
    useState("");

  const {
    effectiveStartDate,
    effectiveEndDate,
  } = useFilters();

  /* =====================================================
     CARREGAMENTO
  ===================================================== */

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
          "Erro ao carregar dados dos analistas:",
          err
        );

        setError(
          "Não foi possível carregar os indicadores dos analistas."
        );
      } finally {
        setLoading(false);
      }
    }

    loadTickets();
  }, []);

  /* =====================================================
     PERÍODO GLOBAL
  ===================================================== */

  const periodTickets = useMemo(() => {
    const start =
      startOfDay(effectiveStartDate);

    const end =
      endOfDay(effectiveEndDate);

    return tickets.filter((ticket) => {
      const created =
        new Date(ticket.createdDate);

      return (
        created >= start &&
        created <= end
      );
    });
  }, [
    tickets,
    effectiveStartDate,
    effectiveEndDate,
  ]);

  /* =====================================================
     SQUADS DISPONÍVEIS
  ===================================================== */

  const squads = useMemo(() => {
    const apiTeams =
      periodTickets
        .map((ticket) => ticket.team)
        .filter(
          (value): value is string =>
            Boolean(value?.trim())
        );

    return Array.from(
      new Set([
        ...KNOWN_SQUADS,
        ...apiTeams,
      ])
    ).sort((a, b) =>
      a.localeCompare(
        b,
        "pt-BR"
      )
    );
  }, [periodTickets]);

  /* =====================================================
     FILTRO POR SQUAD
  ===================================================== */

  const squadTickets = useMemo(() => {
    if (!selectedSquad) {
      return periodTickets;
    }

    return periodTickets.filter(
      (ticket) =>
        ticket.team ===
        selectedSquad
    );
  }, [
    periodTickets,
    selectedSquad,
  ]);

  /* =====================================================
     ANALISTAS DISPONÍVEIS
  ===================================================== */

  const analystOptions = useMemo(() => {
    return Array.from(
      new Set(
        squadTickets
          .map(
            (ticket) =>
              ticket.owner
          )
          .filter(
            (
              value
            ): value is string =>
              Boolean(value?.trim())
          )
      )
    ).sort((a, b) =>
      a.localeCompare(
        b,
        "pt-BR"
      )
    );
  }, [squadTickets]);

  /* =====================================================
     FILTRO FINAL DA TELA
  ===================================================== */

  const scopedTickets = useMemo(() => {
    if (!selectedAnalyst) {
      return squadTickets;
    }

    return squadTickets.filter(
      (ticket) =>
        ticket.owner ===
        selectedAnalyst
    );
  }, [
    squadTickets,
    selectedAnalyst,
  ]);

  /* =====================================================
     LIMPA ANALISTA SE TROCAR O SQUAD
  ===================================================== */

  useEffect(() => {
    if (
      selectedAnalyst &&
      !analystOptions.includes(
        selectedAnalyst
      )
    ) {
      setSelectedAnalyst("");
    }
  }, [
    selectedSquad,
    selectedAnalyst,
    analystOptions,
  ]);

  /* =====================================================
     MÉTRICAS POR ANALISTA
  ===================================================== */

  const analysts = useMemo(() => {
    const grouped =
      new Map<
        string,
        Ticket[]
      >();

    scopedTickets.forEach(
      (ticket) => {
        const owner =
          ticket.owner ??
          "Sem responsável";

        if (
          !grouped.has(owner)
        ) {
          grouped.set(
            owner,
            []
          );
        }

        grouped
          .get(owner)!
          .push(ticket);
      }
    );

    const result:
      AnalystMetric[] =
      Array.from(
        grouped.entries()
      ).map(
        ([
          owner,
          ownerTickets,
        ]) => {
          const openTickets =
            ownerTickets.filter(
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
            ownerTickets.filter(
              (ticket) =>
                ticket.baseStatus ===
                "Stopped"
            );

          const resolvedTickets =
            ownerTickets.filter(
              (ticket) =>
                ticket.baseStatus ===
                  "Resolved" ||
                ticket.baseStatus ===
                  "Closed"
            );

          const uniqueClients =
            new Set(
              ownerTickets
                .map(
                  (ticket) =>
                    ticket.client
                )
                .filter(Boolean)
            ).size;

          const uniqueCategories =
            new Set(
              ownerTickets
                .map(
                  (ticket) =>
                    ticket.category
                )
                .filter(Boolean)
            ).size;

          const teams =
            Array.from(
              new Set(
                ownerTickets
                  .map(
                    (ticket) =>
                      ticket.team
                  )
                  .filter(
                    (
                      value
                    ): value is string =>
                      Boolean(value)
                  )
              )
            );

          const lifetimes =
            ownerTickets
              .map(
                (ticket) =>
                  ticket.lifetimeMinutes
              )
              .filter(
                (
                  value
                ): value is number =>
                  value !== null &&
                  value !== undefined
              );

          const averageLifetimeMinutes =
            lifetimes.length > 0
              ? Math.round(
                  lifetimes.reduce(
                    (
                      sum,
                      value
                    ) =>
                      sum +
                      value,
                    0
                  ) /
                    lifetimes.length
                )
              : 0;

          let workloadLevel:
            WorkloadLevel =
            "normal";

          if (
            criticalTickets.length >=
              2 ||
            openTickets.length >= 5
          ) {
            workloadLevel =
              "alto";
          } else if (
            criticalTickets.length >=
              1 ||
            stoppedTickets.length >=
              1 ||
            openTickets.length >= 3
          ) {
            workloadLevel =
              "atencao";
          }

          return {
            owner,

            teams,

            total:
              ownerTickets.length,

            open:
              openTickets.length,

            critical:
              criticalTickets.length,

            stopped:
              stoppedTickets.length,

            resolved:
              resolvedTickets.length,

            clients:
              uniqueClients,

            categories:
              uniqueCategories,

            averageLifetimeMinutes,

            workloadLevel,
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

  /* =====================================================
     RESUMO
  ===================================================== */

  const summary = useMemo(() => {
    const activeAnalysts =
      analysts.filter(
        (analyst) =>
          analyst.owner !==
          "Sem responsável"
      ).length;

    const overloaded =
      analysts.filter(
        (analyst) =>
          analyst.workloadLevel ===
          "alto"
      ).length;

    const attention =
      analysts.filter(
        (analyst) =>
          analyst.workloadLevel ===
          "atencao"
      ).length;

    const withoutOwner =
      scopedTickets.filter(
        (ticket) =>
          !ticket.owner &&
          isOpen(ticket)
      ).length;

    return {
      activeAnalysts,
      overloaded,
      attention,
      withoutOwner,
    };
  }, [
    analysts,
    scopedTickets,
  ]);

  /* =====================================================
     GRÁFICO DE PIZZA - CARTEIRA POR ANALISTA
  ===================================================== */

  const analystPieData =
    useMemo<PieDataItem[]>(() => {
      return analysts
        .filter(
          (analyst) =>
            analyst.total > 0
        )
        .map(
          (analyst) => ({
            name:
              analyst.owner,
            value:
              analyst.total,
          })
        );
    }, [analysts]);

  /* =====================================================
     GRÁFICO DE PIZZA - SITUAÇÃO DA CARTEIRA
  ===================================================== */

  const statusPieData =
    useMemo<PieDataItem[]>(() => {
      const newCount =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "New"
        ).length;

      const attendanceCount =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "InAttendance"
        ).length;

      const stoppedCount =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "Stopped"
        ).length;

      const resolvedCount =
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
          value: newCount,
        },
        {
          name:
            "Em Atendimento",
          value:
            attendanceCount,
        },
        {
          name: "Parados",
          value:
            stoppedCount,
        },
        {
          name:
            "Resolvidos",
          value:
            resolvedCount,
        },
      ].filter(
        (item) =>
          item.value > 0
      );
    }, [scopedTickets]);

  /* =====================================================
     DRILL-DOWN
  ===================================================== */

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

  function showAnalystTickets(
    analyst: string
  ) {
    showTickets(
      `Analista: ${analyst}`,

      scopedTickets.filter(
        (ticket) =>
          (ticket.owner ??
            "Sem responsável") ===
          analyst
      ),

      "Carteira do analista no período selecionado"
    );
  }

  function showMetricTickets(
    type:
      | "new"
      | "attendance"
      | "open"
      | "critical"
      | "stopped"
      | "resolved"
  ) {
    let list: Ticket[] = [];
    let title = "";

    if (type === "new") {
      list =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "New"
        );

      title =
        "Tickets novos";
    }

    if (
      type === "attendance"
    ) {
      list =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "InAttendance"
        );

      title =
        "Tickets em atendimento";
    }

    if (type === "open") {
      list =
        scopedTickets.filter(
          isOpen
        );

      title =
        "Tickets abertos";
    }

    if (
      type === "critical"
    ) {
      list =
        scopedTickets.filter(
          (ticket) =>
            isOpen(ticket) &&
            normalize(
              ticket.urgency
            ) ===
              "critica"
        );

      title =
        "Tickets críticos";
    }

    if (
      type === "stopped"
    ) {
      list =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "Stopped"
        );

      title =
        "Tickets parados";
    }

    if (
      type === "resolved"
    ) {
      list =
        scopedTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
              "Resolved" ||
            ticket.baseStatus ===
              "Closed"
        );

      title =
        "Tickets resolvidos";
    }

    showTickets(
      title,
      list
    );
  }

  /* =====================================================
     LIMPAR FILTROS LOCAIS
  ===================================================== */

  function clearFilters() {
    setSelectedSquad("");
    setSelectedAnalyst("");
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

  /* =====================================================
     LOADING / ERROR
  ===================================================== */

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
        <CircularProgress />
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

  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <>
      {/* ===============================================
          CABEÇALHO
      ================================================ */}

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
          <Typography
            fontWeight={800}
            sx={{
              fontSize: {
                xs: "1.7rem",
                md: "1.9rem",
                xl: "2.1rem",
              },
            }}
          >
            Analistas
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.25,
            }}
          >
            Visão de carga, distribuição e riscos da equipe
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display:
                "block",
              mt: 0.5,
            }}
          >
            {
              scopedTickets.length
            }{" "}
            ticket(s) analisado(s)
            no período
          </Typography>
        </Box>

        <PeriodFilter />
      </Box>

      {/* ===============================================
          FILTROS GERENCIAIS
      ================================================ */}

      <Card
        elevation={0}
        sx={{
          border:
            "1px solid",
          borderColor:
            "divider",
          borderRadius:
            2.5,
          mb: 2,
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
            direction={{
              xs: "column",
              md: "row",
            }}
            spacing={1.5}
            sx={{
              alignItems: {
                xs: "stretch",
                md: "center",
              },
            }}
          >
            <Box
              sx={{
                minWidth: {
                  md: 180,
                },
              }}
            >
              <Typography
                fontWeight={800}
                sx={{
                  fontSize:
                    "1rem",
                }}
              >
                Visão da equipe
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Filtre por squad ou analista
              </Typography>
            </Box>

            {/* SQUAD */}

            <FormControl
              size="small"
              sx={{
                minWidth: {
                  xs: "100%",
                  md: 240,
                },
              }}
            >
              <InputLabel>
                Squad
              </InputLabel>

              <Select
                value={
                  selectedSquad
                }
                label="Squad"
                onChange={(
                  event
                ) =>
                  setSelectedSquad(
                    event.target
                      .value
                  )
                }
              >
                <MenuItem value="">
                  Todos os squads
                </MenuItem>

                {squads.map(
                  (squad) => (
                    <MenuItem
                      key={squad}
                      value={squad}
                    >
                      {squad}
                    </MenuItem>
                  )
                )}
              </Select>
            </FormControl>

            {/* ANALISTA */}

            <FormControl
              size="small"
              sx={{
                minWidth: {
                  xs: "100%",
                  md: 220,
                },
              }}
            >
              <InputLabel>
                Analista
              </InputLabel>

              <Select
                value={
                  selectedAnalyst
                }
                label="Analista"
                onChange={(
                  event
                ) =>
                  setSelectedAnalyst(
                    event.target
                      .value
                  )
                }
              >
                <MenuItem value="">
                  Todos os analistas
                </MenuItem>

                {analystOptions.map(
                  (analyst) => (
                    <MenuItem
                      key={
                        analyst
                      }
                      value={
                        analyst
                      }
                    >
                      {
                        analyst
                      }
                    </MenuItem>
                  )
                )}
              </Select>
            </FormControl>

            {(selectedSquad ||
              selectedAnalyst) && (
              <Button
                size="small"
                variant="outlined"
                onClick={
                  clearFilters
                }
                sx={{
                  flexShrink: 0,
                }}
              >
                Limpar filtros
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* ===============================================
          INDICADORES
      ================================================ */}

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
          title="Analistas ativos"
          value={
            summary.activeAnalysts
          }
          description="Responsáveis com tickets"
          onClick={() =>
            showTickets(
              "Carteira da equipe",
              scopedTickets
            )
          }
        />

        <MetricCard
          title="Carga alta"
          value={
            summary.overloaded
          }
          description="Exigem atuação da liderança"
          severity="error"
          onClick={() =>
            showTickets(
              "Analistas com carga alta",

              scopedTickets.filter(
                (ticket) => {
                  const analyst =
                    analysts.find(
                      (item) =>
                        item.owner ===
                        (ticket.owner ??
                          "Sem responsável")
                    );

                  return (
                    analyst?.workloadLevel ===
                    "alto"
                  );
                }
              )
            )
          }
        />

        <MetricCard
          title="Em atenção"
          value={
            summary.attention
          }
          description="Carteiras para monitorar"
          severity="warning"
          onClick={() =>
            showTickets(
              "Carteiras em atenção",

              scopedTickets.filter(
                (ticket) => {
                  const analyst =
                    analysts.find(
                      (item) =>
                        item.owner ===
                        (ticket.owner ??
                          "Sem responsável")
                    );

                  return (
                    analyst?.workloadLevel ===
                    "atencao"
                  );
                }
              )
            )
          }
        />

        <MetricCard
          title="Sem responsável"
          value={
            summary.withoutOwner
          }
          description="Tickets abertos sem analista"
          severity={
            summary.withoutOwner >
            0
              ? "warning"
              : "default"
          }
          onClick={() =>
            showTickets(
              "Tickets sem responsável",

              scopedTickets.filter(
                (ticket) =>
                  !ticket.owner &&
                  isOpen(ticket)
              )
            )
          }
        />
      </Box>

      {/* ===============================================
          GRÁFICOS
      ================================================ */}

      <Box
        sx={{
          display: "grid",

          gridTemplateColumns: {
            xs: "1fr",
            lg: "1fr 1fr",
          },

          gap: 2,
          mb: 2,
        }}
      >
        {/* DISTRIBUIÇÃO POR ANALISTA */}

        <ChartCard
          title="Distribuição da Carteira"
          subtitle="Quantidade de tickets por analista"
        >
          {analystPieData.length >
          0 ? (
            <Box
              sx={{
                height: 270,
              }}
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <PieChart>
                  <Pie
                    data={
                      analystPieData
                    }
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    outerRadius={85}
                    innerRadius={45}
                    paddingAngle={2}
                    onClick={(
                      data
                    ) => {
                      if (
                        data?.name
                      ) {
                        showAnalystTickets(
                          String(
                            data.name
                          )
                        );
                      }
                    }}
                    style={{
                      cursor:
                        "pointer",
                    }}
                  >
                    {analystPieData.map(
                      (
                        _,
                        index
                      ) => (
                        <Cell
                          key={
                            index
                          }
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

                  <Tooltip />

                  <Legend
                    verticalAlign="bottom"
                    height={40}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* SITUAÇÃO */}

        <ChartCard
          title="Situação da Carteira"
          subtitle="Distribuição dos tickets por status"
        >
          {statusPieData.length >
          0 ? (
            <Box
              sx={{
                height: 270,
              }}
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <PieChart>
                  <Pie
                    data={
                      statusPieData
                    }
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    outerRadius={85}
                    innerRadius={45}
                    paddingAngle={2}
                    style={{
                      cursor:
                        "pointer",
                    }}
                    onClick={(
                      data
                    ) => {
                      const name =
                        String(
                          data?.name ??
                            ""
                        );

                      if (
                        name ===
                        "Novos"
                      ) {
                        showMetricTickets(
                          "new"
                        );
                      }

                      if (
                        name ===
                        "Em Atendimento"
                      ) {
                        showMetricTickets(
                          "attendance"
                        );
                      }

                      if (
                        name ===
                        "Parados"
                      ) {
                        showMetricTickets(
                          "stopped"
                        );
                      }

                      if (
                        name ===
                        "Resolvidos"
                      ) {
                        showMetricTickets(
                          "resolved"
                        );
                      }
                    }}
                  >
                    {statusPieData.map(
                      (
                        _,
                        index
                      ) => (
                        <Cell
                          key={
                            index
                          }
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

                  <Tooltip />

                  <Legend
                    verticalAlign="bottom"
                    height={40}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </Box>

      {/* ===============================================
          TABELA
      ================================================ */}

      <Card
        elevation={0}
        sx={{
          border:
            "1px solid",

          borderColor:
            "divider",

          borderRadius:
            2.5,

          overflow:
            "hidden",
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
                fontWeight={800}
                sx={{
                  fontSize:
                    "1.05rem",
                }}
              >
                Desempenho por Analista
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Clique no nome ou nos indicadores para investigar
              </Typography>
            </Box>

            <Chip
              size="small"
              variant="outlined"
              label={`${analysts.length} analista(s)`}
            />
          </Stack>
        </CardContent>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <strong>
                    Analista
                  </strong>
                </TableCell>

                <TableCell>
                  <strong>
                    Squad
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
                    Clientes
                  </strong>
                </TableCell>

                <TableCell align="right">
                  <strong>
                    Tempo médio
                  </strong>
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {analysts.map(
                (analyst) => {
                  const analystTickets =
                    scopedTickets.filter(
                      (ticket) =>
                        (ticket.owner ??
                          "Sem responsável") ===
                        analyst.owner
                    );

                  return (
                    <TableRow
                      key={
                        analyst.owner
                      }
                      hover
                    >
                      {/* ANALISTA */}

                      <TableCell>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() =>
                            showAnalystTickets(
                              analyst.owner
                            )
                          }
                          sx={{
                            p: 0,
                            minWidth:
                              "auto",
                            fontWeight:
                              700,
                            justifyContent:
                              "flex-start",
                          }}
                        >
                          {
                            analyst.owner
                          }
                        </Button>
                      </TableCell>

                      {/* SQUAD */}

                      <TableCell>
                        <Stack
                          spacing={
                            0.25
                          }
                        >
                          {analyst.teams.length >
                          0 ? (
                            analyst.teams.map(
                              (
                                team
                              ) => (
                                <Typography
                                  key={
                                    team
                                  }
                                  variant="caption"
                                >
                                  {
                                    team
                                  }
                                </Typography>
                              )
                            )
                          ) : (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              —
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>

                      {/* SITUAÇÃO */}

                      <TableCell>
                        <WorkloadChip
                          level={
                            analyst.workloadLevel
                          }
                        />
                      </TableCell>

                      {/* TOTAL */}

                      <ClickableNumber
                        value={
                          analyst.total
                        }
                        onClick={() =>
                          showTickets(
                            `${analyst.owner} - Todos`,
                            analystTickets
                          )
                        }
                      />

                      {/* ABERTOS */}

                      <ClickableNumber
                        value={
                          analyst.open
                        }
                        onClick={() =>
                          showTickets(
                            `${analyst.owner} - Abertos`,

                            analystTickets.filter(
                              isOpen
                            )
                          )
                        }
                      />

                      {/* CRÍTICOS */}

                      <ClickableNumber
                        value={
                          analyst.critical
                        }
                        severity={
                          analyst.critical >
                          0
                            ? "error"
                            : "default"
                        }
                        onClick={() =>
                          showTickets(
                            `${analyst.owner} - Críticos`,

                            analystTickets.filter(
                              (
                                ticket
                              ) =>
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

                      {/* PARADOS */}

                      <ClickableNumber
                        value={
                          analyst.stopped
                        }
                        severity={
                          analyst.stopped >
                          0
                            ? "warning"
                            : "default"
                        }
                        onClick={() =>
                          showTickets(
                            `${analyst.owner} - Parados`,

                            analystTickets.filter(
                              (
                                ticket
                              ) =>
                                ticket.baseStatus ===
                                "Stopped"
                            )
                          )
                        }
                      />

                      {/* RESOLVIDOS */}

                      <ClickableNumber
                        value={
                          analyst.resolved
                        }
                        severity="success"
                        onClick={() =>
                          showTickets(
                            `${analyst.owner} - Resolvidos`,

                            analystTickets.filter(
                              (
                                ticket
                              ) =>
                                ticket.baseStatus ===
                                  "Resolved" ||
                                ticket.baseStatus ===
                                  "Closed"
                            )
                          )
                        }
                      />

                      {/* CLIENTES */}

                      <TableCell
                        align="right"
                      >
                        {
                          analyst.clients
                        }
                      </TableCell>

                      {/* TEMPO */}

                      <TableCell
                        align="right"
                      >
                        {formatMinutes(
                          analyst.averageLifetimeMinutes
                        )}
                      </TableCell>
                    </TableRow>
                  );
                }
              )}

              {analysts.length ===
                0 && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    align="center"
                  >
                    <Box
                      sx={{
                        py: 4,
                      }}
                    >
                      <Typography
                        fontWeight={700}
                      >
                        Nenhum analista encontrado
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        Altere o período, squad ou analista selecionado.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ===============================================
          NOTA
      ================================================ */}

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
        A classificação atual considera quantidade de
        tickets abertos, críticos e parados. Com os dados
        completos do Movidesk incluiremos SLA, horas
        apontadas, resoluções, reaberturas e produtividade
        por período.
      </Alert>

      {/* ===============================================
          DRAWER - LISTA DE TICKETS
      ================================================ */}

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
                spacing={2}
                sx={{
                  justifyContent:
                    "space-between",

                  alignItems:
                    "flex-start",
                }}
              >
                <Box>
                  <Typography
                    variant="h6"
                    fontWeight={800}
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
                        fontWeight={800}
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
                      fontWeight={600}
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
                      {ticket.team ??
                        "Sem squad"}
                      {ticket.service
                        ? ` • ${ticket.service}`
                        : ""}
                    </Typography>
                  </Box>
                )
              )}
            </>
          )}
        </Box>
      </Drawer>

      {/* ===============================================
          DRAWER - DETALHE
      ================================================ */}

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
                    fontWeight={800}
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
                fontWeight={700}
                sx={{
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
                  value={selectedTicket.client}
                />

                <TicketField
                  label="Solicitante"
                  value={selectedTicket.contact}
                />

                <TicketField
                  label="Analista"
                  value={selectedTicket.owner}
                />

                <TicketField
                  label="Squad"
                  value={selectedTicket.team}
                />

                <TicketField
                  label="Categoria"
                  value={selectedTicket.category}
                />

                <TicketField
                  label="Causa"
                  value={selectedTicket.cause}
                />

                <TicketField
                  label="Serviço"
                  value={selectedTicket.service}
                />

                <TicketField
                  label="Departamento"
                  value={selectedTicket.department}
                />

                <TicketField
                  label="Status"
                  value={selectedTicket.status}
                />

                <TicketField
                  label="Urgência"
                  value={selectedTicket.urgency}
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
                  label="1ª resposta"
                  value={formatDateTime(
                    selectedTicket.firstResponseDate
                  )}
                />

                <TicketField
                  label="Venc. 1ª resposta"
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
                  value={selectedTicket.taskStatus}
                />

                <TicketField
                  label="Versão entregue"
                  value={selectedTicket.deliveredVersion}
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
                    fontWeight={800}
                    sx={{
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

/* =====================================================
   CARD DE MÉTRICA
===================================================== */

function MetricCard({
  title,
  value,
  description,
  severity = "default",
  onClick,
}: {
  title: string;
  value: number;
  description: string;

  severity?:
    | "default"
    | "error"
    | "warning";

  onClick?: () => void;
}) {
  const borderColor =
    severity === "error"
      ? "error.main"
      : severity === "warning"
      ? "warning.main"
      : "divider";

  return (
    <Card
      elevation={0}
      role={
        onClick
          ? "button"
          : undefined
      }
      tabIndex={
        onClick
          ? 0
          : undefined
      }
      onClick={onClick}
      onKeyDown={(
        event
      ) => {
        if (
          onClick &&
          (event.key ===
            "Enter" ||
            event.key === " ")
        ) {
          onClick();
        }
      }}
      sx={{
        border:
          "1px solid",

        borderColor,

        borderRadius:
          2.5,

        height: "100%",

        cursor:
          onClick
            ? "pointer"
            : "default",

        transition:
          "transform 0.15s ease, box-shadow 0.15s ease",

        ...(onClick && {
          "&:hover": {
            transform:
              "translateY(-2px)",
            boxShadow: 2,
          },
        }),
      }}
    >
      <CardContent
        sx={{
          p: {
            xs: 1.5,
            md: 1.75,
          },

          "&:last-child": {
            pb: {
              xs: 1.5,
              md: 1.75,
            },
          },
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          fontWeight={600}
        >
          {title}
        </Typography>

        <Typography
          fontWeight={800}
          sx={{
            mt: 0.5,

            fontSize: {
              xs: "1.7rem",
              md: "1.9rem",
              xl: "2.05rem",
            },

            lineHeight: 1.1,
          }}
        >
          {value}
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display:
              "block",
            mt: 0.75,
          }}
        >
          {description}
        </Typography>

        {onClick && (
          <Typography
            variant="caption"
            color="primary.main"
            sx={{
              display:
                "block",
              mt: 0.5,
              fontWeight:
                600,
            }}
          >
            Ver tickets →
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

/* =====================================================
   CARD DE GRÁFICO
===================================================== */

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
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
          2.5,
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
        <Typography
          fontWeight={800}
          sx={{
            fontSize:
              "1.05rem",
          }}
        >
          {title}
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
        >
          {subtitle}
        </Typography>

        {children}
      </CardContent>
    </Card>
  );
}

/* =====================================================
   GRÁFICO VAZIO
===================================================== */

function EmptyChart() {
  return (
    <Box
      sx={{
        height: 270,

        display: "flex",

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

/* =====================================================
   NÚMERO CLICÁVEL
===================================================== */

function ClickableNumber({
  value,
  onClick,
  severity = "default",
}: {
  value: number;

  onClick:
    () => void;

  severity?:
    | "default"
    | "error"
    | "warning"
    | "success";
}) {
  const color =
    severity === "error"
      ? "error.main"
      : severity === "warning"
      ? "warning.main"
      : severity === "success"
      ? "success.main"
      : "primary.main";

  return (
    <TableCell align="right">
      <Button
        size="small"
        variant="text"
        onClick={
          onClick
        }
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

/* =====================================================
   CARGA
===================================================== */

function WorkloadChip({
  level,
}: {
  level:
    WorkloadLevel;
}) {
  if (
    level === "alto"
  ) {
    return (
      <Chip
        size="small"
        color="error"
        label="Carga alta"
      />
    );
  }

  if (
    level === "atencao"
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

/* =====================================================
   CAMPO DO TICKET
===================================================== */

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
        fontWeight={600}
      >
        {value ?? "—"}
      </Typography>
    </Box>
  );
}

/* =====================================================
   ABERTOS
===================================================== */

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

/* =====================================================
   NORMALIZAÇÃO
===================================================== */

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

/* =====================================================
   PERÍODO
===================================================== */

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

/* =====================================================
   TEMPO
===================================================== */

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

/* =====================================================
   DATA
===================================================== */

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