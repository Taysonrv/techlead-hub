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

/* =========================================================
   TIPOS
========================================================= */

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

  averageLifetimeMinutes: number;

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

type MetricSeverity =
  | "default"
  | "error"
  | "warning"
  | "success";

/* =========================================================
   CORES DOS GRÁFICOS
========================================================= */

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

/* =========================================================
   COMPONENTE PRINCIPAL
========================================================= */

export function Clients() {
  const navigate = useNavigate();

  const [tickets, setTickets] =
    useState<Ticket[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  /* Filtros locais */

  const [
    selectedClient,
    setSelectedClient,
  ] = useState("");

  const [
    category,
    setCategory,
  ] = useState("");

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

  /* =======================================================
     ESCOPO FINAL
  ======================================================= */

  const scopedTickets =
    useMemo(() => {
      if (!category) {
        return clientScopedTickets;
      }

      return clientScopedTickets.filter(
        (ticket) =>
          ticket.category ===
          category
      );
    }, [
      clientScopedTickets,
      category,
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

          const lifetimes =
            clientTickets
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
                      total,
                      value
                    ) =>
                      total +
                      value,
                    0
                  ) /
                    lifetimes.length
                )
              : 0;

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

            averageLifetimeMinutes,

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

      highAttention:
        clients.filter(
          (item) =>
            item.attentionLevel ===
            "alto"
        ).length,

      attention:
        clients.filter(
          (item) =>
            item.attentionLevel ===
            "atencao"
        ).length,

      withCritical:
        clients.filter(
          (item) =>
            item.critical > 0
        ).length,
    };
  }, [clients]);

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

      return {
        total:
          scopedTickets.length,
        open,
        critical,
        stopped,
        resolved,
      };
    }, [scopedTickets]);

  /* =======================================================
     PIZZA 1 - DISTRIBUIÇÃO POR CLIENTE

     Usa período + categoria.
     Não restringimos ao selectedClient aqui para continuar
     permitindo comparação entre os clientes.
  ======================================================= */

  const clientPieData =
    useMemo<PieDataItem[]>(() => {
      const chartScope =
        category
          ? periodTickets.filter(
              (ticket) =>
                ticket.category ===
                category
            )
          : periodTickets;

      const grouped =
        new Map<
          string,
          number
        >();

      chartScope.forEach(
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
       * Para os dados reais teremos muitos clientes.
       * Mostramos Top 7 e agrupamos o restante.
       */

      if (
        ordered.length <= 7
      ) {
        return ordered;
      }

      const top =
        ordered.slice(
          0,
          7
        );

      const otherValue =
        ordered
          .slice(7)
          .reduce(
            (
              total,
              item
            ) =>
              total +
              item.value,
            0
          );

      return [
        ...top,
        {
          name: "Outros",
          value:
            otherValue,
        },
      ];
    }, [
      periodTickets,
      category,
    ]);

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
            Clientes
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.25,
            }}
          >
            Volume, recorrência e pontos de atenção por cliente
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
            no filtro atual
          </Typography>
        </Box>

        <PeriodFilter />
      </Box>

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
                  md: 190,
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
                Visão dos clientes
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Refine a carteira analisada
              </Typography>
            </Box>

            {/* CLIENTE */}

            <FormControl
              size="small"
              sx={{
                minWidth: {
                  xs: "100%",
                  md: 260,
                },
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
                minWidth: {
                  xs: "100%",
                  md: 230,
                },
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

            {(selectedClient ||
              category) && (
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
          title="Clientes ativos"
          value={
            summary.totalClients
          }
          description="Clientes com tickets"
          onClick={() =>
            showTickets(
              "Clientes ativos",
              scopedTickets
            )
          }
        />

        <MetricCard
          title="Alta atenção"
          value={
            summary.highAttention
          }
          description="Concentração crítica"
          severity="error"
          onClick={() =>
            showTickets(
              "Clientes em alta atenção",

              scopedTickets.filter(
                (ticket) => {
                  const metric =
                    clients.find(
                      (client) =>
                        client.client ===
                        (ticket.client ??
                          "Sem cliente")
                    );

                  return (
                    metric?.attentionLevel ===
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
          description="Exigem acompanhamento"
          severity="warning"
          onClick={() =>
            showTickets(
              "Clientes em atenção",

              scopedTickets.filter(
                (ticket) => {
                  const metric =
                    clients.find(
                      (client) =>
                        client.client ===
                        (ticket.client ??
                          "Sem cliente")
                    );

                  return (
                    metric?.attentionLevel ===
                    "atencao"
                  );
                }
              )
            )
          }
        />

        <MetricCard
          title="Com críticos"
          value={
            summary.withCritical
          }
          description="Clientes com críticos abertos"
          severity={
            summary.withCritical >
            0
              ? "error"
              : "default"
          }
          onClick={() =>
            showStatusTickets(
              "critical"
            )
          }
        />
      </Box>

      {/* =================================================
          RESUMO DA CARTEIRA
      ================================================= */}

      <Box
        sx={{
          display: "flex",
          gap: 1,
          mb: 2,
          flexWrap: "wrap",
        }}
      >
        <Chip
          size="small"
          label={`${portfolioSummary.total} tickets`}
          variant="outlined"
          onClick={() =>
            showTickets(
              "Todos os tickets",
              scopedTickets
            )
          }
        />

        <Chip
          size="small"
          label={`${portfolioSummary.open} abertos`}
          color="primary"
          variant="outlined"
          onClick={() =>
            showStatusTickets(
              "open"
            )
          }
        />

        <Chip
          size="small"
          label={`${portfolioSummary.critical} críticos`}
          color="error"
          onClick={() =>
            showStatusTickets(
              "critical"
            )
          }
        />

        <Chip
          size="small"
          label={`${portfolioSummary.stopped} parados`}
          color="warning"
          onClick={() =>
            showStatusTickets(
              "stopped"
            )
          }
        />

        <Chip
          size="small"
          label={`${portfolioSummary.resolved} resolvidos`}
          color="success"
          variant="outlined"
          onClick={() =>
            showStatusTickets(
              "resolved"
            )
          }
        />
      </Box>

      {/* =================================================
          GRÁFICOS
      ================================================= */}

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
        {/* DISTRIBUIÇÃO POR CLIENTE */}

        <ChartCard
          title="Distribuição por Cliente"
          subtitle="Participação dos clientes no volume de chamados"
        >
          {clientPieData.length >
          0 ? (
            <Box
              sx={{
                height: 280,
              }}
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <PieChart>
                  <Pie
                    data={
                      clientPieData
                    }
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="44%"
                    outerRadius={88}
                    innerRadius={48}
                    paddingAngle={2}
                    cursor="pointer"
                    onClick={(
                      data
                    ) => {
                      const name =
                        String(
                          data?.name ??
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
                    {clientPieData.map(
                      (
                        _,
                        index
                      ) => (
                        <Cell
                          key={`client-${index}`}
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
                    height={45}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <EmptyChart />
          )}
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
                height: 280,
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
                    cy="44%"
                    outerRadius={88}
                    innerRadius={48}
                    paddingAngle={2}
                    cursor="pointer"
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
                    {statusPieData.map(
                      (
                        _,
                        index
                      ) => (
                        <Cell
                          key={`status-${index}`}
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
                    height={45}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <EmptyChart />
          )}
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
            <TableHead>
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

                <TableCell align="right">
                  <strong>
                    Tempo médio
                  </strong>
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {clients.map(
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
                          onClick={() =>
                            showClientTickets(
                              client.client
                            )
                          }
                          sx={{
                            p: 0,
                            minWidth:
                              "auto",
                            fontWeight:
                              700,
                            textTransform:
                              "none",
                            justifyContent:
                              "flex-start",
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
                          variant="outlined"
                        />
                      </TableCell>

                      <TableCell align="right">
                        {formatMinutes(
                          client.averageLifetimeMinutes
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
                        fontWeight={700}
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
        A análise atual considera volume, criticidade, tickets
        parados e resolvidos. Com os dados completos do Movidesk
        adicionaremos SLA, recorrência, satisfação, evolução
        mensal e comparação entre clientes.
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
                    fontWeight={800}
                    sx={{
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
      : severity ===
        "warning"
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
            event.key ===
              " ")
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

        height:
          "100%",

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

            lineHeight:
              1.1,
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

/* =========================================================
   CARD DE GRÁFICO
========================================================= */

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children:
    React.ReactNode;
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
        fontWeight={600}
        sx={{
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