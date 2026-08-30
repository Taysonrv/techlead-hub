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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { useNavigate } from "react-router-dom";

import { api } from "../services/api";
import { useFilters } from "../context/FiltersContext";
import { PeriodFilter } from "../components/PeriodFilter";
import { aliareColors } from "../theme/theme";
import {
  chartPalette,
  semanticChartColors,
} from "../theme/chartPalette";

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
              Carteira
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
          title="Tickets no período"
          value={
            executiveTicketGroups
              .all.length
          }
          description={`${summary.totalClients} cliente(s) com tickets`}
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
          variant="outlined"
          sx={{
            color:
              aliareColors.greenDark,

            borderColor:
              "rgba(24,199,122,0.32)",

            backgroundColor:
              "rgba(24,199,122,0.05)",
          }}
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
                      data={
                        clientPieData
                      }
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
                      {clientPieData.map(
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
                data={
                  clientPieData
                }
                total={
                  clientPieData.reduce(
                    (
                      sum,
                      item
                    ) =>
                      sum +
                      item.value,
                    0
                  )
                }
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
                      data={
                        statusPieData
                      }
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
                      {statusPieData.map(
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
                data={
                  statusPieData
                }
                total={
                  scopedTickets.length
                }
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
                  "#F8FAF9",

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
        parados e resolvidos. Nas próximas evoluções incluiremos
        prazos de primeira resposta e resolução, recorrência,
        CSAT, evolução mensal e comparação entre clientes.
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
  total,
  onItemClick,
}: {
  data:
    PieDataItem[];

  total:
    number;

  onItemClick?:
    (
      name:
        string
    ) => void;
}) {
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
            total > 0
              ? Math.round(
                  (item.value /
                    total) *
                    100
                )
              : 0;

          const clickable =
            Boolean(
              onItemClick
            ) &&
            item.name !==
              "Outros";

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
              onClick={() => {
                if (
                  clickable
                ) {
                  onItemClick?.(
                    item.name
                  );
                }
              }}
              onKeyDown={(
                event
              ) => {
                if (
                  clickable &&
                  (
                    event.key ===
                      "Enter" ||
                    event.key ===
                      " "
                  )
                ) {
                  onItemClick?.(
                    item.name
                  );
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

                cursor:
                  clickable
                    ? "pointer"
                    : "default",

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

                  backgroundColor:
                    PIE_COLORS[
                      index %
                        PIE_COLORS.length
                    ],
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
  const accentColor =
    severity === "error"
      ? semanticChartColors.overdue
      : severity ===
        "warning"
      ? semanticChartColors.attention
      : aliareColors.green;

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
        position:
          "relative",

        overflow:
          "hidden",

        border:
          "1px solid",

        borderColor:
          "divider",

        borderRadius:
          2.25,

        height:
          "100%",

        backgroundColor:
          "background.paper",

        "&::before": {
          content:
            '""',

          position:
            "absolute",

          top:
            0,

          left:
            0,

          width:
            "100%",

          height:
            3,

          backgroundColor:
            accentColor,
        },

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

            borderColor:
              accentColor,

            boxShadow:
              "0 8px 24px rgba(16,24,40,0.08)",
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
        sx={{ fontWeight: 600 }}
        >
          {title}
        </Typography>

        <Typography
        sx={{
          fontWeight: 800,
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
            sx={{
              display:
                "block",

              mt:
                0.65,

              fontWeight:
                700,

              color:
                aliareColors.greenDark,
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