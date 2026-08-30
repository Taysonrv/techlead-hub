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
  InputAdornment,
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
  TextField,
  Typography,
} from "@mui/material";

import {
  ContentCopyOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  OpenInNewOutlined,
  SearchOutlined,
  TuneOutlined,
} from "@mui/icons-material";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "../services/api";
import { useFilters } from "../context/FiltersContext";
import { PeriodFilter } from "../components/PeriodFilter";

import {
  aliareColors,
} from "../theme/theme";

import {
  semanticChartColors,
} from "../theme/chartPalette";

import {
  calculateServiceLevel,
  formatServiceMinutes,
  type DeadlineLevel,
  type ServiceLevelResult,
} from "../utils/serviceLevel";

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
  | "attention"
  | "high"
  | "critical"
  | "excluded";

type SortMode =
  | "priority"
  | "newest"
  | "oldest"
  | "urgency"
  | "stopped"
  | "deadline";

type QuickFilter =
  | "all"
  | "open"
  | "stopped"
  | "attention"
  | "unassigned"
  | null;

type FilterSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (
    value: string
  ) => void;
};

type KpiCardProps = {
  title: string;
  value: number;
  description: string;
  accent?: string;
  active?: boolean;
  onClick: () => void;
};

/* =========================================================
   COMPONENTE
========================================================= */

export function Tickets() {
  const [
    tickets,
    setTickets,
  ] =
    useState<Ticket[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    selectedTicket,
    setSelectedTicket,
  ] =
    useState<
      Ticket | null
    >(null);

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    status,
    setStatus,
  ] =
    useState("");

  const [
    urgency,
    setUrgency,
  ] =
    useState("");

  const [
    category,
    setCategory,
  ] =
    useState("");

  const [
    owner,
    setOwner,
  ] =
    useState("");

  const [
    client,
    setClient,
  ] =
    useState("");

  const [
    team,
    setTeam,
  ] =
    useState("");

  const [
    service,
    setService,
  ] =
    useState("");

  const [
    showMoreFilters,
    setShowMoreFilters,
  ] =
    useState(false);

  const [
    sortMode,
    setSortMode,
  ] =
    useState<SortMode>(
      "priority"
    );

  const [
    quickFilter,
    setQuickFilter,
  ] =
    useState<QuickFilter>(
      null
    );

  const [
    copyMessage,
    setCopyMessage,
  ] =
    useState("");

  const {
    effectiveStartDate,
    effectiveEndDate,
  } =
    useFilters();

  /* =======================================================
     CARREGAMENTO
  ======================================================= */

  useEffect(() => {
    async function loadTickets() {
      try {
        setLoading(
          true
        );

        setError(
          null
        );

        const response =
          await api.get<
            Ticket[]
          >(
            "/dashboard/tickets"
          );

        setTickets(
          response.data
        );
      } catch (
        requestError
      ) {
        console.error(
          "Erro ao carregar tickets:",
          requestError
        );

        setError(
          "Não foi possível carregar os tickets. Verifique se o backend está rodando."
        );
      } finally {
        setLoading(
          false
        );
      }
    }

    void loadTickets();
  }, []);

  /* =======================================================
     PERÍODO GLOBAL
  ======================================================= */

  const periodTickets =
    useMemo(() => {
      const start =
        startOfDay(
          effectiveStartDate
        );

      const end =
        endOfDay(
          effectiveEndDate
        );

      return tickets.filter(
        (ticket) => {
          const created =
            new Date(
              ticket.createdDate
            );

          return (
            created >=
              start &&
            created <=
              end
          );
        }
      );
    }, [
      tickets,
      effectiveStartDate,
      effectiveEndDate,
    ]);

  /* =======================================================
     OPÇÕES DOS FILTROS
  ======================================================= */

  const statuses =
    useMemo(
      () =>
        uniqueValues(
          periodTickets,
          "status"
        ),
      [
        periodTickets,
      ]
    );

  const urgencies =
    useMemo(
      () =>
        uniqueValues(
          periodTickets,
          "urgency"
        ),
      [
        periodTickets,
      ]
    );

  const categories =
    useMemo(
      () =>
        uniqueValues(
          periodTickets,
          "category"
        ),
      [
        periodTickets,
      ]
    );

  const owners =
    useMemo(
      () =>
        uniqueValues(
          periodTickets,
          "owner"
        ),
      [
        periodTickets,
      ]
    );

  const clients =
    useMemo(
      () =>
        uniqueValues(
          periodTickets,
          "client"
        ),
      [
        periodTickets,
      ]
    );

  const teams =
    useMemo(
      () =>
        uniqueValues(
          periodTickets,
          "team"
        ),
      [
        periodTickets,
      ]
    );

  const services =
    useMemo(
      () =>
        uniqueValues(
          periodTickets,
          "service"
        ),
      [
        periodTickets,
      ]
    );

  /* =======================================================
     FILTROS LOCAIS
  ======================================================= */

  const filteredTickets =
    useMemo(() => {
      const normalizedSearch =
        normalize(
          search.trim()
        );

      return periodTickets.filter(
        (ticket) => {
          const matchesSearch =
            normalizedSearch ===
              "" ||
            normalize(
              String(
                ticket.movideskId
              )
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              String(
                ticket.id
              )
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.protocol
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.subject
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.client
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.contact
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.owner
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.team
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.category
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.cause
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.service
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.department
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.taskNumber !==
                null
                ? String(
                    ticket.taskNumber
                  )
                : null
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.taskStatus
            ).includes(
              normalizedSearch
            ) ||
            normalize(
              ticket.deliveredVersion
            ).includes(
              normalizedSearch
            );

          const matchesStatus =
            status === "" ||
            ticket.status ===
              status;

          const matchesUrgency =
            urgency === "" ||
            ticket.urgency ===
              urgency;

          const matchesCategory =
            category === "" ||
            ticket.category ===
              category;

          const matchesOwner =
            owner === "" ||
            ticket.owner ===
              owner;

          const matchesClient =
            client === "" ||
            ticket.client ===
              client;

          const matchesTeam =
            team === "" ||
            ticket.team ===
              team;

          const matchesService =
            service === "" ||
            ticket.service ===
              service;

          const attention =
            getAttentionLevel(
              ticket
            );

          const matchesQuickFilter =
            quickFilter ===
              null ||
            quickFilter ===
              "all" ||
            (
              quickFilter ===
                "open" &&
              isOpen(
                ticket
              )
            ) ||
            (
              quickFilter ===
                "stopped" &&
              ticket.baseStatus ===
                "Stopped"
            ) ||
            (
              quickFilter ===
                "attention" &&
              (
                attention ===
                  "high" ||
                attention ===
                  "critical"
              )
            ) ||
            (
              quickFilter ===
                "unassigned" &&
              isOpen(
                ticket
              ) &&
              !ticket.owner
            );

          return (
            matchesSearch &&
            matchesStatus &&
            matchesUrgency &&
            matchesCategory &&
            matchesOwner &&
            matchesClient &&
            matchesTeam &&
            matchesService &&
            matchesQuickFilter
          );
        }
      );
    }, [
      periodTickets,
      search,
      status,
      urgency,
      category,
      owner,
      client,
      team,
      service,
      quickFilter,
    ]);

  /* =======================================================
     ORDENAÇÃO OPERACIONAL
  ======================================================= */

  const sortedTickets =
    useMemo(() => {
      const result =
        [
          ...filteredTickets,
        ];

      result.sort(
        (a, b) =>
          compareTickets(
            a,
            b,
            sortMode
          )
      );

      return result;
    }, [
      filteredTickets,
      sortMode,
    ]);

  /* =======================================================
     FILTROS ATIVOS
  ======================================================= */

  const activeFilterCount =
    [
      search,
      status,
      urgency,
      category,
      owner,
      client,
      team,
      service,
      quickFilter,
    ].filter(
      Boolean
    ).length;

  function clearFilters() {
    setSearch("");
    setStatus("");
    setUrgency("");
    setCategory("");
    setOwner("");
    setClient("");
    setTeam("");
    setService("");
    setQuickFilter(
      null
    );
  }

  function activateQuickFilter(
    filter:
      Exclude<
        QuickFilter,
        null
      >
  ) {
    /*
     * Os KPIs representam a massa inteira do período.
     * Ao acioná-los, limpamos os filtros locais para que
     * a quantidade exibida no card seja exatamente igual
     * à quantidade apresentada na tabela.
     */
    setSearch("");
    setStatus("");
    setUrgency("");
    setCategory("");
    setOwner("");
    setClient("");
    setTeam("");
    setService("");

    setQuickFilter(
      filter
    );
  }

  /* =======================================================
     GRUPOS EXECUTIVOS

     O número exibido no card é sempre exatamente a
     quantidade que será aberta ao clicar.
  ======================================================= */

  const executiveGroups =
    useMemo(() => {
      const open =
        periodTickets.filter(
          isOpen
        );

      const stopped =
        periodTickets.filter(
          (ticket) =>
            ticket.baseStatus ===
            "Stopped"
        );

      const highAttention =
        periodTickets.filter(
          (ticket) => {
            const level =
              getAttentionLevel(
                ticket
              );

            return (
              level ===
                "high" ||
              level ===
                "critical"
            );
          }
        );

      const withoutOwner =
        periodTickets.filter(
          (ticket) =>
            isOpen(
              ticket
            ) &&
            !ticket.owner
        );

      return {
        all:
          periodTickets,

        open,

        stopped,

        highAttention,

        withoutOwner,
      };
    }, [
      periodTickets,
    ]);

  /* =======================================================
     AÇÕES
  ======================================================= */

  async function copyTicketNumber(
    ticket:
      Ticket
  ) {
    try {
      await navigator.clipboard
        .writeText(
          String(
            ticket.movideskId
          )
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
    ticket:
      Ticket
  ) {
    const attention =
      getAttentionInfo(
        ticket
      );

    const serviceLevel =
      getOfficialServiceLevel(
        ticket
      );

    const summaryText =
      [
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
        `Prazo operacional: ${attention.label}`,
        `1ª resposta vence em: ${formatDate(
          ticket.firstResponseDueDate
        )}`,
        `1ª resposta dada em: ${formatDate(
          ticket.firstResponseDate
        )}`,
        `Resultado 1ª resposta: ${
          getFirstResponseDeadlineStatus(
            ticket
          ).label
        }`,
        `Meta 1ª resposta: ${
          serviceLevel.applicable &&
          isOfficialMeasuredCategory(ticket)
            ? formatServiceMinutes(
                serviceLevel.firstResponse.targetMinutes
              )
            : "Fora da medição"
        }`,
        `Meta solução: ${
          serviceLevel.applicable &&
          isOfficialMeasuredCategory(ticket)
            ? formatServiceMinutes(
                serviceLevel.resolution.targetMinutes
              )
            : "Fora da medição"
        }`,
      ].join(
        "\n"
      );

    try {
      await navigator.clipboard
        .writeText(
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
    ticket:
      Ticket
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

  if (
    loading
  ) {
    return (
      <Box
        sx={{
          display:
            "flex",

          justifyContent:
            "center",

          mt:
            10,
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

  if (
    error
  ) {
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
      {/* ===================================================
          CABEÇALHO
      =================================================== */}

      <Box
        sx={{
          mb:
            2.25,

          display:
            "flex",

          flexDirection: {
            xs:
              "column",
            lg:
              "row",
          },

          justifyContent:
            "space-between",

          alignItems: {
            xs:
              "stretch",
            lg:
              "center",
          },

          gap:
            2,
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
                "-0.03em",

              fontSize: {
                xs:
                  "1.7rem",
                md:
                  "1.9rem",
                xl:
                  "2.1rem",
              },
            }}
          >
            Tickets
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt:
                0.25,
            }}
          >
            Consulte, priorize e investigue os chamados da operação
          </Typography>
        </Box>

        <PeriodFilter />
      </Box>

      <Alert
        severity="info"
        variant="outlined"
        sx={{
          mb:
            1.5,

          borderRadius:
            2,
        }}
      >
        <strong>
          Prazo oficial:
        </strong>{" "}
        esta fila usa horas úteis, urgência, categoria e tempo parado para calcular
        primeira resposta e solução. Adequação e Solicitação de Serviço ficam fora
        da medição. Até a identificação de clientes VIP ser incorporada ao banco,
        o perfil utilizado é Padrão.
      </Alert>

      {/* ===================================================
          KPIs OPERACIONAIS
      =================================================== */}

      <Box
        sx={{
          display:
            "grid",

          gridTemplateColumns: {
            xs:
              "1fr",
            sm:
              "repeat(2, minmax(0, 1fr))",
            lg:
              "repeat(5, minmax(0, 1fr))",
          },

          gap:
            1.25,

          mb:
            1.75,
        }}
      >
        <KpiCard
          title="No período"
          value={
            executiveGroups
              .all.length
          }
          description="Todos os atendimentos"
          active={
            quickFilter ===
            "all"
          }
          onClick={() =>
            activateQuickFilter(
              "all"
            )
          }
        />

        <KpiCard
          title="Abertos"
          value={
            executiveGroups
              .open.length
          }
          description="Ainda em andamento"
          accent={
            semanticChartColors.normal
          }
          active={
            quickFilter ===
            "open"
          }
          onClick={() =>
            activateQuickFilter(
              "open"
            )
          }
        />

        <KpiCard
          title="Parados"
          value={
            executiveGroups
              .stopped.length
          }
          description="Dependem de atuação"
          accent={
            semanticChartColors.attention
          }
          active={
            quickFilter ===
            "stopped"
          }
          onClick={() =>
            activateQuickFilter(
              "stopped"
            )
          }
        />

        <KpiCard
          title="Alta atenção"
          value={
            executiveGroups
              .highAttention.length
          }
          description="Prazo crítico ou vencido"
          accent={
            semanticChartColors.overdue
          }
          active={
            quickFilter ===
            "attention"
          }
          onClick={() => {
            activateQuickFilter(
              "attention"
            );

            setSortMode(
              "priority"
            );
          }}
        />

        <KpiCard
          title="Sem responsável"
          value={
            executiveGroups
              .withoutOwner.length
          }
          description="Abertos sem analista"
          accent={
            executiveGroups
              .withoutOwner
              .length >
            0
              ? semanticChartColors.attention
              : aliareColors.green
          }
          active={
            quickFilter ===
            "unassigned"
          }
          onClick={() => {
            activateQuickFilter(
              "unassigned"
            );

            setSortMode(
              "priority"
            );
          }}
        />
      </Box>

      {/* ===================================================
          FILTROS COMPACTOS
      =================================================== */}

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
            p: {
              xs:
                1.5,
              md:
                1.75,
            },

            "&:last-child":
              {
                pb: {
                  xs:
                    1.5,
                  md:
                    1.75,
                },
              },
          }}
        >
          <Stack
            direction={{
              xs:
                "column",
              md:
                "row",
            }}
            spacing={1}
            sx={{
              alignItems: {
                xs:
                  "stretch",
                md:
                  "center",
              },

              mb:
                1.25,
            }}
          >
            <TextField
              size="small"
              placeholder="Pesquisar ticket, assunto, cliente, analista, task ou versão..."
              value={
                search
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
              sx={{
                flex:
                  1,

                minWidth: {
                  md:
                    300,
                },
              }}
              slotProps={{
                input: {
                  startAdornment:
                    (
                      <InputAdornment position="start">
                        <SearchOutlined
                          sx={{
                            fontSize:
                              19,

                            color:
                              "text.secondary",
                          }}
                        />
                      </InputAdornment>
                    ),
                },
              }}
            />

            <FormControl
              size="small"
              sx={{
                minWidth: {
                  xs:
                    "100%",
                  md:
                    190,
                },
              }}
            >
              <InputLabel>
                Ordenar
              </InputLabel>

              <Select
                value={
                  sortMode
                }
                label="Ordenar"
                onChange={(
                  event
                ) =>
                  setSortMode(
                    event.target
                      .value as
                      SortMode
                  )
                }
              >
                <MenuItem value="priority">
                  Prioridade operacional
                </MenuItem>

                <MenuItem value="newest">
                  Mais recentes
                </MenuItem>

                <MenuItem value="oldest">
                  Mais antigos
                </MenuItem>

                <MenuItem value="urgency">
                  Maior urgência
                </MenuItem>

                <MenuItem value="stopped">
                  Mais tempo parado
                </MenuItem>

                <MenuItem value="deadline">
                  Próximos do vencimento
                </MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="outlined"
              startIcon={
                <TuneOutlined />
              }
              endIcon={
                showMoreFilters
                  ? (
                      <ExpandLessOutlined />
                    )
                  : (
                      <ExpandMoreOutlined />
                    )
              }
              onClick={() =>
                setShowMoreFilters(
                  (current) =>
                    !current
                )
              }
              sx={{
                minWidth:
                  150,

                whiteSpace:
                  "nowrap",
              }}
            >
              Mais filtros
              {activeFilterCount >
              0
                ? ` (${activeFilterCount})`
                : ""}
            </Button>

            <Button
              variant="text"
              disabled={
                activeFilterCount ===
                0
              }
              onClick={
                clearFilters
              }
              sx={{
                whiteSpace:
                  "nowrap",

                color:
                  "text.secondary",
              }}
            >
              Limpar
            </Button>
          </Stack>

          {/* FILTROS PRINCIPAIS */}

          <Box
            sx={{
              display:
                "grid",

              gridTemplateColumns: {
                xs:
                  "1fr",
                sm:
                  "repeat(2, minmax(0, 1fr))",
                lg:
                  "repeat(4, minmax(0, 1fr))",
              },

              gap:
                1,
            }}
          >
            <FilterSelect
              label="Status"
              value={
                status
              }
              options={
                statuses
              }
              onChange={
                setStatus
              }
            />

            <FilterSelect
              label="Urgência"
              value={
                urgency
              }
              options={
                urgencies
              }
              onChange={
                setUrgency
              }
            />

            <FilterSelect
              label="Cliente"
              value={
                client
              }
              options={
                clients
              }
              onChange={
                setClient
              }
            />

            <FilterSelect
              label="Responsável"
              value={
                owner
              }
              options={
                owners
              }
              onChange={
                setOwner
              }
            />
          </Box>

          {/* FILTROS AVANÇADOS */}

          {showMoreFilters && (
            <Box
              sx={{
                display:
                  "grid",

                gridTemplateColumns: {
                  xs:
                    "1fr",
                  sm:
                    "repeat(2, minmax(0, 1fr))",
                  lg:
                    "repeat(3, minmax(0, 1fr))",
                },

                gap:
                  1,

                mt:
                  1,
              }}
            >
              <FilterSelect
                label="Categoria"
                value={
                  category
                }
                options={
                  categories
                }
                onChange={
                  setCategory
                }
              />

              <FilterSelect
                label="Squad"
                value={
                  team
                }
                options={
                  teams
                }
                onChange={
                  setTeam
                }
              />

              <FilterSelect
                label="Serviço"
                value={
                  service
                }
                options={
                  services
                }
                onChange={
                  setService
                }
              />
            </Box>
          )}

          <Stack
            direction={{
              xs:
                "column",
              sm:
                "row",
            }}
            spacing={1}
            sx={{
              mt:
                1.25,

              alignItems: {
                xs:
                  "flex-start",
                sm:
                  "center",
              },

              justifyContent:
                "space-between",
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
            >
              Exibindo{" "}
              <Box
                component="span"
                sx={{
                  color:
                    "text.primary",

                  fontWeight:
                    800,
                }}
              >
                {
                  sortedTickets.length
                }
              </Box>{" "}
              de{" "}
              <Box
                component="span"
                sx={{
                  color:
                    "text.primary",

                  fontWeight:
                    800,
                }}
              >
                {
                  periodTickets.length
                }
              </Box>{" "}
              ticket(s)
            </Typography>

            <Stack
              direction="row"
              spacing={0.75}
              sx={{
                flexWrap:
                  "wrap",

                gap:
                  0.75,
              }}
            >
              {quickFilter && (
                <Chip
                  size="small"
                  label={
                    getQuickFilterLabel(
                      quickFilter
                    )
                  }
                  onDelete={() =>
                    setQuickFilter(
                      null
                    )
                  }
                  sx={{
                    color:
                      aliareColors.greenDark,

                    border:
                      "1px solid rgba(24,199,122,0.30)",

                    backgroundColor:
                      "rgba(24,199,122,0.06)",
                  }}
                />
              )}

              {activeFilterCount >
                0 && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${activeFilterCount} filtro(s) ativo(s)`}
                  sx={{
                    color:
                      aliareColors.greenDark,

                    borderColor:
                      "rgba(24,199,122,0.30)",

                    backgroundColor:
                      "rgba(24,199,122,0.05)",
                  }}
                />
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* ===================================================
          SEM TICKETS
      =================================================== */}

      {periodTickets.length ===
        0 && (
        <Alert
          severity="info"
          sx={{
            mb:
              2,

            borderRadius:
              2,
          }}
        >
          Nenhum ticket foi encontrado no período selecionado.
        </Alert>
      )}

      {/* ===================================================
          TABELA OPERACIONAL
      =================================================== */}

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
        <Box
          sx={{
            px:
              2,

            py:
              1.35,

            borderBottom:
              "1px solid",

            borderColor:
              "divider",
          }}
        >
          <Stack
            direction={{
              xs:
                "column",
              sm:
                "row",
            }}
            sx={{
              justifyContent:
                "space-between",

              alignItems: {
                xs:
                  "flex-start",
                sm:
                  "center",
              },

              gap:
                1,
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontWeight:
                    800,

                  fontSize:
                    "1rem",
                }}
              >
                Fila operacional
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Priorização baseada no prazo oficial, urgência e contexto operacional
              </Typography>
            </Box>

            <Typography
              variant="caption"
              sx={{
                color:
                  aliareColors.greenDark,

                fontWeight:
                  700,
              }}
            >
              Clique em um atendimento para investigar
            </Typography>
          </Stack>
        </Box>

        <TableContainer>
          <Table
            size="small"
            sx={{
              tableLayout:
                "fixed",
            }}
          >
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

                    fontWeight:
                      800,

                    letterSpacing:
                      "0.02em",

                    borderBottomColor:
                      "divider",
                  },
              }}
            >
              <TableRow>
                <TableCell
                  sx={{
                    width:
                      140,
                  }}
                >
                  Ticket
                </TableCell>

                <TableCell>
                  Assunto / Cliente
                </TableCell>

                <TableCell
                  sx={{
                    width:
                      190,
                  }}
                >
                  Responsável / Squad
                </TableCell>

                <TableCell
                  sx={{
                    width:
                      130,
                  }}
                >
                  Status
                </TableCell>

                <TableCell
                  sx={{
                    width:
                      105,
                  }}
                >
                  Urgência
                </TableCell>

                <TableCell
                  sx={{
                    width:
                      125,
                  }}
                >
                  Prazo
                </TableCell>

                <TableCell
                  align="right"
                  sx={{
                    width:
                      90,
                  }}
                >
                  Idade
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {sortedTickets.map(
                (ticket) => {
                  const attention =
                    getAttentionInfo(
                      ticket
                    );

                  return (
                    <TableRow
                      key={
                        ticket.id
                      }
                      hover
                      onClick={() =>
                        setSelectedTicket(
                          ticket
                        )
                      }
                      sx={{
                        cursor:
                          "pointer",

                        "& > td:first-of-type":
                          {
                            borderLeft:
                              `3px solid ${attention.color}`,
                          },

                        "&:hover":
                          {
                            backgroundColor:
                              "#FAFBFA",
                          },
                      }}
                    >
                      <TableCell>
                        <Stack
                          direction="row"
                          spacing={0.35}
                          sx={{
                            alignItems:
                              "center",
                          }}
                        >
                          <Typography
                            sx={{
                              fontWeight:
                                800,

                              fontSize:
                                "0.82rem",
                            }}
                          >
                            #
                            {
                              ticket.movideskId
                            }
                          </Typography>

                          <IconButton
                            size="small"
                            title="Copiar número"
                            onClick={(
                              event
                            ) => {
                              event.stopPropagation();

                              void copyTicketNumber(
                                ticket
                              );
                            }}
                            sx={{
                              width:
                                25,

                              height:
                                25,

                              color:
                                "text.secondary",
                            }}
                          >
                            <ContentCopyOutlined
                              sx={{
                                fontSize:
                                  14,
                              }}
                            />
                          </IconButton>

                          <IconButton
                            size="small"
                            title="Abrir no Movidesk"
                            onClick={(
                              event
                            ) => {
                              event.stopPropagation();

                              openMovideskTicket(
                                ticket
                              );
                            }}
                            sx={{
                              width:
                                25,

                              height:
                                25,

                              color:
                                "text.secondary",
                            }}
                          >
                            <OpenInNewOutlined
                              sx={{
                                fontSize:
                                  15,
                              }}
                            />
                          </IconButton>
                        </Stack>

                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display:
                              "block",

                            mt:
                              0.1,

                            overflow:
                              "hidden",

                            textOverflow:
                              "ellipsis",

                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {ticket.protocol ??
                            "Sem protocolo"}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <Typography
                          title={
                            ticket.subject
                          }
                          sx={{
                            fontWeight:
                              650,

                            fontSize:
                              "0.83rem",

                            overflow:
                              "hidden",

                            textOverflow:
                              "ellipsis",

                            display:
                              "-webkit-box",

                            WebkitLineClamp:
                              2,

                            WebkitBoxOrient:
                              "vertical",
                          }}
                        >
                          {ticket.subject}
                        </Typography>

                        <Typography
                          variant="caption"
                          color="text.secondary"
                          title={
                            ticket.client ??
                            undefined
                          }
                          sx={{
                            display:
                              "block",

                            mt:
                              0.25,

                            overflow:
                              "hidden",

                            textOverflow:
                              "ellipsis",

                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {ticket.client ??
                            "Sem cliente"}
                          {ticket.category
                            ? ` · ${ticket.category}`
                            : ""}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <Typography
                          sx={{
                            fontWeight:
                              650,

                            fontSize:
                              "0.8rem",

                            overflow:
                              "hidden",

                            textOverflow:
                              "ellipsis",

                            whiteSpace:
                              "nowrap",
                          }}
                          title={
                            ticket.owner ??
                            undefined
                          }
                        >
                          {ticket.owner ??
                            "Sem responsável"}
                        </Typography>

                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display:
                              "block",

                            mt:
                              0.15,

                            overflow:
                              "hidden",

                            textOverflow:
                              "ellipsis",

                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {ticket.team ??
                            "Sem squad"}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        <StatusChip
                          status={
                            ticket.status
                          }
                          baseStatus={
                            ticket.baseStatus
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <UrgencyChip
                          urgency={
                            ticket.urgency
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <AttentionChip
                          ticket={
                            ticket
                          }
                        />
                      </TableCell>

                      <TableCell
                        align="right"
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight:
                              attention.level ===
                                "critical" ||
                              attention.level ===
                                "high"
                                ? 800
                                : 600,

                            color:
                              attention.level ===
                                "critical"
                                ? semanticChartColors.overdue
                                : "text.primary",
                          }}
                        >
                          {
                            getTicketAge(
                              ticket
                            )
                          }
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                }
              )}

              {sortedTickets.length ===
                0 && (
                <TableRow>
                  <TableCell
                    colSpan={
                      7
                    }
                    align="center"
                  >
                    <Box
                      sx={{
                        py:
                          5,
                      }}
                    >
                      <Typography
                        sx={{
                          fontWeight:
                            700,
                        }}
                      >
                        Nenhum ticket encontrado
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mt:
                            0.5,
                        }}
                      >
                        Altere o período ou remova algum filtro.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ===================================================
          DRAWER GERENCIAL
      =================================================== */}

      <Drawer
        anchor="right"
        open={
          Boolean(
            selectedTicket
          )
        }
        onClose={() =>
          setSelectedTicket(
            null
          )
        }
      >
        <Box
          sx={{
            width: {
              xs:
                330,
              sm:
                540,
            },

            p:
              2.5,
          }}
        >
          {selectedTicket && (
            <>
              <TicketDrawerHeader
                ticket={
                  selectedTicket
                }
                onClose={() =>
                  setSelectedTicket(
                    null
                  )
                }
              />

              <Stack
                direction="row"
                spacing={0.75}
                sx={{
                  mt:
                    1.75,

                  flexWrap:
                    "wrap",

                  gap:
                    0.75,
                }}
              >
                <StatusChip
                  status={
                    selectedTicket.status
                  }
                  baseStatus={
                    selectedTicket.baseStatus
                  }
                />

                <UrgencyChip
                  urgency={
                    selectedTicket.urgency
                  }
                />

                <AttentionChip
                  ticket={
                    selectedTicket
                  }
                />
              </Stack>

              <Typography
                sx={{
                  mt:
                    2,

                  fontWeight:
                    750,

                  fontSize:
                    "1rem",

                  lineHeight:
                    1.5,
                }}
              >
                {
                  selectedTicket.subject
                }
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt:
                    0.4,
                }}
              >
                {selectedTicket.client ??
                  "Sem cliente"}
              </Typography>

              <Stack
                direction="row"
                spacing={0.75}
                sx={{
                  mt:
                    2,

                  flexWrap:
                    "wrap",

                  gap:
                    0.75,
                }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={
                    <ContentCopyOutlined />
                  }
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
                  endIcon={
                    <OpenInNewOutlined />
                  }
                  onClick={() =>
                    openMovideskTicket(
                      selectedTicket
                    )
                  }
                >
                  Abrir no Movidesk
                </Button>
              </Stack>

              <Divider
                sx={{
                  my:
                    2.25,
                }}
              />

              {/* VISÃO OPERACIONAL */}

              <SectionTitle>
                Visão operacional
              </SectionTitle>

              <Box
                sx={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    {
                      xs:
                        "1fr",
                      sm:
                        "1fr 1fr",
                    },

                  gap:
                    1.5,

                  mb:
                    2.25,
                }}
              >
                <TicketField
                  label="Idade"
                  value={
                    getTicketAge(
                      selectedTicket
                    )
                  }
                />

                <TicketField
                  label="Tempo parado"
                  value={
                    formatMinutes(
                      selectedTicket.stoppedMinutes
                    )
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
                  label="Perfil de prazo"
                  value="Padrão"
                />

                <TicketField
                  label="Regra aplicada"
                  value={
                    getOfficialRuleLabel(
                      selectedTicket
                    )
                  }
                />

                <TicketField
                  label="Meta 1ª resposta"
                  value={
                    getOfficialTargetLabel(
                      selectedTicket,
                      "firstResponse"
                    )
                  }
                />

                <TicketField
                  label="Meta solução"
                  value={
                    getOfficialTargetLabel(
                      selectedTicket,
                      "resolution"
                    )
                  }
                />
              </Box>

              <Divider
                sx={{
                  mb:
                    2.25,
                }}
              />

              {/* PRAZOS OFICIAIS */}

              <SectionTitle>
                Prazos do atendimento
              </SectionTitle>

              <Stack
                spacing={1}
                sx={{
                  mb:
                    2.25,
                }}
              >
                <DeadlineStatusRow
                  label="Primeira resposta"
                  status={
                    getFirstResponseDeadlineStatus(
                      selectedTicket
                    )
                  }
                />

                <DeadlineStatusRow
                  label="Conclusão"
                  status={
                    getResolutionDeadlineStatus(
                      selectedTicket
                    )
                  }
                />
              </Stack>

              <Divider
                sx={{
                  mb:
                    2.25,
                }}
              />

              {/* CLASSIFICAÇÃO */}

              <SectionTitle>
                Classificação
              </SectionTitle>

              <Box
                sx={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    {
                      xs:
                        "1fr",
                      sm:
                        "1fr 1fr",
                    },

                  gap:
                    1.5,

                  mb:
                    2.25,
                }}
              >
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
                  label="Solicitante"
                  value={
                    selectedTicket.contact
                  }
                />

                <TicketField
                  label="Protocolo"
                  value={
                    selectedTicket.protocol
                  }
                />
              </Box>

              <Divider
                sx={{
                  mb:
                    2.25,
                }}
              />

              {/* DATAS */}

              <SectionTitle>
                Datas
              </SectionTitle>

              <Box
                sx={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    {
                      xs:
                        "1fr",
                      sm:
                        "1fr 1fr",
                    },

                  gap:
                    1.5,

                  mb:
                    2.25,
                }}
              >
                <TicketField
                  label="Abertura"
                  value={
                    formatDate(
                      selectedTicket.createdDate
                    )
                  }
                />

                <TicketField
                  label="Vencimento"
                  value={
                    formatDate(
                      selectedTicket.dueDate
                    )
                  }
                />

                <TicketField
                  label="Primeira resposta"
                  value={
                    formatDate(
                      selectedTicket.firstResponseDate
                    )
                  }
                />

                <TicketField
                  label="Prazo da 1ª resposta"
                  value={
                    formatDate(
                      selectedTicket.firstResponseDueDate
                    )
                  }
                />

                <TicketField
                  label="Resolução"
                  value={
                    formatDate(
                      selectedTicket.resolvedDate
                    )
                  }
                />

                <TicketField
                  label="Fechamento"
                  value={
                    formatDate(
                      selectedTicket.closedDate
                    )
                  }
                />
              </Box>

              {/* JUSTIFICATIVA */}

              {selectedTicket.justification && (
                <>
                  <Divider
                    sx={{
                      mb:
                        2.25,
                    }}
                  />

                  <SectionTitle>
                    Justificativa
                  </SectionTitle>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mb:
                        2.25,

                      whiteSpace:
                        "pre-wrap",
                    }}
                  >
                    {
                      selectedTicket.justification
                    }
                  </Typography>
                </>
              )}

              {/* DESENVOLVIMENTO */}

              {(selectedTicket.taskNumber ||
                selectedTicket.taskStatus ||
                selectedTicket.deliveredVersion) && (
                <>
                  <Divider
                    sx={{
                      mb:
                        2.25,
                    }}
                  />

                  <SectionTitle>
                    Desenvolvimento
                  </SectionTitle>

                  <Box
                    sx={{
                      display:
                        "grid",

                      gridTemplateColumns:
                        {
                          xs:
                            "1fr",
                          sm:
                            "1fr 1fr",
                        },

                      gap:
                        1.5,
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
            </>
          )}
        </Box>
      </Drawer>

      <Snackbar
        open={
          Boolean(
            copyMessage
          )
        }
        autoHideDuration={
          2600
        }
        onClose={() =>
          setCopyMessage(
            ""
          )
        }
        message={
          copyMessage
        }
      />
    </>
  );
}

/* =========================================================
   KPI
========================================================= */

function KpiCard({
  title,
  value,
  description,
  accent =
    aliareColors.green,
  active =
    false,
  onClick,
}: KpiCardProps) {
  return (
    <Card
      elevation={0}
      role="button"
      tabIndex={0}
      onClick={
        onClick
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
          active
            ? accent
            : "divider",

        borderRadius:
          2.1,

        cursor:
          "pointer",

        backgroundColor:
          active
            ? "rgba(24,199,122,0.035)"
            : "background.paper",

        transition:
          "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",

        "&::before":
          {
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
              accent,
          },

        "&:hover":
          {
            transform:
              "translateY(-2px)",

            borderColor:
              accent,

            boxShadow:
              "0 8px 22px rgba(16,24,40,0.07)",
          },
      }}
    >
      <CardContent
        sx={{
          p:
            1.45,

          "&:last-child":
            {
              pb:
                1.45,
            },
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontWeight:
              700,
          }}
        >
          {title}
        </Typography>

        <Typography
          sx={{
            mt:
              0.35,

            fontSize:
              "1.65rem",

            lineHeight:
              1,

            fontWeight:
              800,

            letterSpacing:
              "-0.03em",
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

            mt:
              0.55,

            overflow:
              "hidden",

            textOverflow:
              "ellipsis",

            whiteSpace:
              "nowrap",
          }}
        >
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
}

/* =========================================================
   SELECT
========================================================= */

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: FilterSelectProps) {
  return (
    <FormControl
      fullWidth
      size="small"
    >
      <InputLabel>
        {label}
      </InputLabel>

      <Select
        value={
          value
        }
        label={
          label
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target
              .value
          )
        }
      >
        <MenuItem value="">
          Todos
        </MenuItem>

        {options.map(
          (
            option
          ) => (
            <MenuItem
              key={
                option
              }
              value={
                option
              }
            >
              {option}
            </MenuItem>
          )
        )}
      </Select>
    </FormControl>
  );
}

/* =========================================================
   STATUS
========================================================= */

function StatusChip({
  status,
  baseStatus,
}: {
  status:
    string;

  baseStatus:
    string | null;
}) {
  if (
    baseStatus ===
    "Stopped"
  ) {
    return (
      <Chip
        size="small"
        label={
          status
        }
        variant="outlined"
        sx={{
          color:
            "#B26A00",

          borderColor:
            "rgba(245,158,11,0.45)",

          backgroundColor:
            "rgba(245,158,11,0.06)",
        }}
      />
    );
  }

  if (
    baseStatus ===
      "Resolved" ||
    baseStatus ===
      "Closed"
  ) {
    return (
      <Chip
        size="small"
        label={
          status
        }
        variant="outlined"
        sx={{
          color:
            aliareColors.greenDark,

          borderColor:
            "rgba(24,199,122,0.34)",

          backgroundColor:
            "rgba(24,199,122,0.05)",
        }}
      />
    );
  }

  if (
    baseStatus ===
    "Canceled"
  ) {
    return (
      <Chip
        size="small"
        label={
          status
        }
        variant="outlined"
        color="error"
      />
    );
  }

  return (
    <Chip
      size="small"
      label={
        status
      }
      variant="outlined"
      sx={{
        color:
          aliareColors.greenDark,

        borderColor:
          "rgba(24,199,122,0.34)",

        backgroundColor:
          "rgba(24,199,122,0.05)",
      }}
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
    string | null;
}) {
  if (
    !urgency
  ) {
    return (
      <Typography
        variant="caption"
        color="text.secondary"
      >
        —
      </Typography>
    );
  }

  const normalized =
    normalize(
      urgency
    );

  if (
    normalized ===
    "critica"
  ) {
    return (
      <Chip
        size="small"
        label={
          urgency
        }
        color="error"
      />
    );
  }

  if (
    normalized ===
    "alta"
  ) {
    return (
      <Chip
        size="small"
        label={
          urgency
        }
        sx={{
          backgroundColor:
            "#F59E0B",

          color:
            "#171717",

          fontWeight:
            750,
        }}
      />
    );
  }

  return (
    <Chip
      size="small"
      label={
        urgency
      }
      variant="outlined"
    />
  );
}

/* =========================================================
   ATENÇÃO OPERACIONAL
========================================================= */

function AttentionChip({
  ticket,
}: {
  ticket:
    Ticket;
}) {
  const info =
    getAttentionInfo(
      ticket
    );

  return (
    <Chip
      size="small"
      label={
        info.label
      }
      variant="outlined"
      sx={{
        color:
          info.textColor,

        borderColor:
          info.color,

        backgroundColor:
          info.backgroundColor,

        fontWeight:
          700,
      }}
    />
  );
}

function getAttentionInfo(
  ticket:
    Ticket
) {
  const level =
    getAttentionLevel(
      ticket
    );

  if (
    level ===
    "excluded"
  ) {
    return {
      level,
      label:
        "Fora da medição",
      color:
        semanticChartColors.neutral,
      textColor:
        "#667085",
      backgroundColor:
        "rgba(102,112,133,0.05)",
    };
  }

  if (
    level ===
    "critical"
  ) {
    return {
      level,
      label:
        "Vencido",
      color:
        semanticChartColors.overdue,
      textColor:
        semanticChartColors.overdue,
      backgroundColor:
        "rgba(229,57,53,0.06)",
    };
  }

  if (
    level ===
    "high"
  ) {
    return {
      level,
      label:
        "Crítico",
      color:
        "#F97316",
      textColor:
        "#C25100",
      backgroundColor:
        "rgba(249,115,22,0.06)",
    };
  }

  if (
    level ===
    "attention"
  ) {
    return {
      level,
      label:
        "Atenção",
      color:
        semanticChartColors.attention,
      textColor:
        "#9A6500",
      backgroundColor:
        "rgba(245,179,1,0.06)",
    };
  }

  return {
    level,
    label:
      "Normal",
    color:
      aliareColors.green,
    textColor:
      aliareColors.greenDark,
    backgroundColor:
      "rgba(24,199,122,0.05)",
  };
}

/*
 * A fila usa a mesma regra central aplicada na tela
 * Desempenho. Os limiares de atenção são derivados do
 * serviceLevel.ts:
 *
 * NORMAL    -> Normal
 * ATTENTION -> Atenção (gatilho oficial: 40% restante)
 * CRITICAL  -> Crítico
 * OVERDUE   -> Vencido
 */
function getAttentionLevel(
  ticket:
    Ticket
):
  AttentionLevel {
  if (
    !isOfficialMeasuredCategory(
      ticket
    )
  ) {
    return "excluded";
  }

  if (
    !isOpen(
      ticket
    )
  ) {
    return "normal";
  }

  const result =
    getOfficialServiceLevel(
      ticket
    );

  if (
    !result.applicable
  ) {
    return "excluded";
  }

  const levels:
    DeadlineLevel[] = [
      result.resolution.level,
    ];

  if (
    !result.firstResponse
      .completed
  ) {
    levels.push(
      result.firstResponse.level
    );
  }

  if (
    levels.includes(
      "OVERDUE"
    )
  ) {
    return "critical";
  }

  if (
    levels.includes(
      "CRITICAL"
    )
  ) {
    return "high";
  }

  if (
    levels.includes(
      "ATTENTION"
    )
  ) {
    return "attention";
  }

  return "normal";
}

/* =========================================================
   DRAWER
========================================================= */

function TicketDrawerHeader({
  ticket,
  onClose,
}: {
  ticket:
    Ticket;

  onClose:
    () => void;
}) {
  return (
    <Stack
      direction="row"
      sx={{
        justifyContent:
          "space-between",

        alignItems:
          "flex-start",

        gap:
          2,
      }}
    >
      <Box>
        <Typography
          sx={{
            fontSize:
              "1.25rem",

            fontWeight:
              800,

            letterSpacing:
              "-0.025em",
          }}
        >
          Ticket #
          {
            ticket.movideskId
          }
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
        >
          {ticket.protocol ??
            "Sem protocolo"}
        </Typography>
      </Box>

      <IconButton
        size="small"
        aria-label="Fechar detalhes"
        onClick={
          onClose
        }
      >
        ✕
      </IconButton>
    </Stack>
  );
}

function SectionTitle({
  children,
}: {
  children:
    string;
}) {
  return (
    <Typography
      variant="subtitle2"
      sx={{
        mb:
          1.3,

        fontWeight:
          800,

        letterSpacing:
          "-0.01em",
      }}
    >
      {children}
    </Typography>
  );
}

function DeadlineStatusRow({
  label,
  status,
}: {
  label:
    string;

  status: {
    label:
      string;
    color:
      string;
    detail:
      string;
  };
}) {
  return (
    <Box
      sx={{
        p:
          1.25,

        border:
          "1px solid",

        borderColor:
          "divider",

        borderRadius:
          1.5,

        backgroundColor:
          "#FAFBFA",
      }}
    >
      <Stack
        direction="row"
        sx={{
          justifyContent:
            "space-between",

          alignItems:
            "center",

          gap:
            1.5,
        }}
      >
        <Box
          sx={{
            minWidth:
              0,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight:
                700,
            }}
          >
            {label}
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
          >
            {
              status.detail
            }
          </Typography>
        </Box>

        <Chip
          size="small"
          label={
            status.label
          }
          variant="outlined"
          sx={{
            flexShrink:
              0,

            color:
              status.color,

            borderColor:
              status.color,

            fontWeight:
              700,
          }}
        />
      </Stack>
    </Box>
  );
}

function TicketField({
  label,
  value,
}: {
  label:
    string;

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
        sx={{
          display:
            "block",

          mb:
            0.2,
        }}
      >
        {label}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          fontWeight:
            650,

          wordBreak:
            "break-word",
        }}
      >
        {value ??
          "—"}
      </Typography>
    </Box>
  );
}

/* =========================================================
   PRAZOS
========================================================= */

function getFirstResponseDeadlineStatus(
  ticket:
    Ticket
) {
  if (
    !isOfficialMeasuredCategory(
      ticket
    )
  ) {
    return notMeasuredDeadlineStatus();
  }

  const result =
    getOfficialServiceLevel(
      ticket
    );

  if (
    !result.applicable
  ) {
    return notMeasuredDeadlineStatus();
  }

  const deadline =
    result.firstResponse;

  if (
    deadline.completed
  ) {
    const within =
      deadline.targetMinutes !==
        null &&
      deadline.consumedMinutes <=
        deadline.targetMinutes;

    return {
      label:
        within
          ? "Dentro do prazo"
          : "Fora do prazo",

      color:
        within
          ? aliareColors.greenDark
          : semanticChartColors.overdue,

      detail:
        `${formatServiceMinutes(
          deadline.consumedMinutes
        )} consumido(s) de ${formatServiceMinutes(
          deadline.targetMinutes
        )} · resposta em ${formatDate(
          ticket.firstResponseDate
        )}`,
    };
  }

  return {
    label:
      deadlineLevelLabel(
        deadline.level
      ),

    color:
      deadlineLevelColor(
        deadline.level
      ),

    detail:
      `${formatServiceMinutes(
        deadline.consumedMinutes
      )} consumido(s) de ${formatServiceMinutes(
        deadline.targetMinutes
      )} · restante ${formatServiceMinutes(
        deadline.remainingMinutes
      )}`,
  };
}

function getResolutionDeadlineStatus(
  ticket:
    Ticket
) {
  if (
    !isOfficialMeasuredCategory(
      ticket
    )
  ) {
    return notMeasuredDeadlineStatus();
  }

  const result =
    getOfficialServiceLevel(
      ticket
    );

  if (
    !result.applicable
  ) {
    return notMeasuredDeadlineStatus();
  }

  const deadline =
    result.resolution;

  if (
    deadline.completed
  ) {
    const within =
      deadline.targetMinutes !==
        null &&
      deadline.consumedMinutes <=
        deadline.targetMinutes;

    return {
      label:
        within
          ? "Dentro do prazo"
          : "Fora do prazo",

      color:
        within
          ? aliareColors.greenDark
          : semanticChartColors.overdue,

      detail:
        `${formatServiceMinutes(
          deadline.consumedMinutes
        )} consumido(s) de ${formatServiceMinutes(
          deadline.targetMinutes
        )} · conclusão em ${formatDate(
          ticket.resolvedDate ??
            ticket.closedDate
        )}`,
    };
  }

  return {
    label:
      deadlineLevelLabel(
        deadline.level
      ),

    color:
      deadlineLevelColor(
        deadline.level
      ),

    detail:
      `${formatServiceMinutes(
        deadline.consumedMinutes
      )} consumido(s) de ${formatServiceMinutes(
        deadline.targetMinutes
      )} · restante ${formatServiceMinutes(
        deadline.remainingMinutes
      )}`,
  };
}

function notMeasuredDeadlineStatus() {
  return {
    label:
      "Fora da medição",

    color:
      "#667085",

    detail:
      "Categoria sem medição de prazo nesta regra.",
  };
}

function deadlineLevelLabel(
  level:
    DeadlineLevel
) {
  if (
    level ===
    "OVERDUE"
  ) {
    return "Vencido";
  }

  if (
    level ===
    "CRITICAL"
  ) {
    return "Crítico";
  }

  if (
    level ===
    "ATTENTION"
  ) {
    return "Atenção";
  }

  if (
    level ===
    "NOT_APPLICABLE"
  ) {
    return "Fora da medição";
  }

  return "Dentro do prazo";
}

function deadlineLevelColor(
  level:
    DeadlineLevel
) {
  if (
    level ===
    "OVERDUE"
  ) {
    return semanticChartColors.overdue;
  }

  if (
    level ===
    "CRITICAL"
  ) {
    return "#F97316";
  }

  if (
    level ===
    "ATTENTION"
  ) {
    return semanticChartColors.attention;
  }

  if (
    level ===
    "NOT_APPLICABLE"
  ) {
    return "#667085";
  }

  return aliareColors.greenDark;
}

/* =========================================================
   ORDENAÇÃO
========================================================= */

function compareTickets(
  a:
    Ticket,
  b:
    Ticket,
  mode:
    SortMode
) {
  if (
    mode ===
    "newest"
  ) {
    return (
      new Date(
        b.createdDate
      ).getTime() -
      new Date(
        a.createdDate
      ).getTime()
    );
  }

  if (
    mode ===
    "oldest"
  ) {
    return (
      new Date(
        a.createdDate
      ).getTime() -
      new Date(
        b.createdDate
      ).getTime()
    );
  }

  if (
    mode ===
    "urgency"
  ) {
    return (
      urgencyWeight(
        b.urgency
      ) -
      urgencyWeight(
        a.urgency
      )
    );
  }

  if (
    mode ===
    "stopped"
  ) {
    return (
      (
        b.stoppedMinutes ??
        0
      ) -
      (
        a.stoppedMinutes ??
        0
      )
    );
  }

  if (
    mode ===
    "deadline"
  ) {
    return (
      deadlineTimestamp(
        a
      ) -
      deadlineTimestamp(
        b
      )
    );
  }

  const attentionDifference =
    attentionWeight(
      getAttentionLevel(
        b
      )
    ) -
    attentionWeight(
      getAttentionLevel(
        a
      )
    );

  if (
    attentionDifference !==
    0
  ) {
    return attentionDifference;
  }

  const urgencyDifference =
    urgencyWeight(
      b.urgency
    ) -
    urgencyWeight(
      a.urgency
    );

  if (
    urgencyDifference !==
    0
  ) {
    return urgencyDifference;
  }

  return (
    getTicketAgeHours(
      b
    ) -
    getTicketAgeHours(
      a
    )
  );
}

function attentionWeight(
  level:
    AttentionLevel
) {
  if (
    level ===
    "critical"
  ) {
    return 4;
  }

  if (
    level ===
    "high"
  ) {
    return 3;
  }

  if (
    level ===
    "attention"
  ) {
    return 2;
  }

  if (
    level ===
    "excluded"
  ) {
    return 0;
  }

  return 1;
}

function urgencyWeight(
  urgency:
    string | null
) {
  const value =
    normalize(
      urgency
    );

  if (
    value ===
    "critica"
  ) {
    return 4;
  }

  if (
    value ===
    "alta"
  ) {
    return 3;
  }

  if (
    value ===
      "media" ||
    value ===
      "média"
  ) {
    return 2;
  }

  return 1;
}

function deadlineTimestamp(
  ticket:
    Ticket
) {
  if (
    !isOfficialMeasuredCategory(
      ticket
    ) ||
    !isOpen(
      ticket
    )
  ) {
    return Number.MAX_SAFE_INTEGER;
  }

  const result =
    getOfficialServiceLevel(
      ticket
    );

  if (
    !result.applicable
  ) {
    return Number.MAX_SAFE_INTEGER;
  }

  const remaining:
    number[] = [
      result.resolution
        .remainingMinutes ??
        Number.MAX_SAFE_INTEGER,
    ];

  if (
    !result.firstResponse
      .completed
  ) {
    remaining.push(
      result.firstResponse
        .remainingMinutes ??
        Number.MAX_SAFE_INTEGER
    );
  }

  /*
   * Quanto menor (inclusive negativo), maior a urgência
   * para a ordenação "Próximos do vencimento".
   */
  return Math.min(
    ...remaining
  );
}

/* =========================================================
   REGRA OFICIAL DE PRAZO
========================================================= */

function getOfficialServiceLevel(
  ticket:
    Ticket
):
  ServiceLevelResult {
  return calculateServiceLevel({
    urgency:
      ticket.urgency,

    category:
      ticket.category,

    cause:
      ticket.cause,

    subject:
      ticket.subject,

    createdDate:
      ticket.createdDate,
    dueDate: ticket.dueDate,
    baseStatus: ticket.baseStatus,

    firstResponseDate:
      ticket.firstResponseDate,

    firstResponseDueDate:
      ticket.firstResponseDueDate,

    resolvedDate:
      ticket.resolvedDate,

    closedDate:
      ticket.closedDate,

    stoppedMinutes:
      ticket.stoppedMinutes,

    /*
     * Temporário: ainda não temos o perfil VIP/Padrão
     * persistido no Ticket.
     */
    profile:
      "STANDARD",
  });
}

function isOfficialMeasuredCategory(
  ticket:
    Ticket
) {
  const result =
    getOfficialServiceLevel(
      ticket
    );

  if (
    !result.applicable
  ) {
    return false;
  }

  const classification =
    normalize(
      [
        ticket.category,
        ticket.cause,
      ]
        .filter(
          Boolean
        )
        .join(
          " "
        )
    );

  return (
    classification.includes(
      "duvida"
    ) ||
    classification.includes(
      "problema"
    ) ||
    classification.includes(
      "contorno"
    ) ||
    classification.includes(
      "bug"
    )
  );
}

function getOfficialRuleLabel(
  ticket:
    Ticket
) {
  if (
    !isOfficialMeasuredCategory(
      ticket
    )
  ) {
    return "Fora da medição";
  }

  const result =
    getOfficialServiceLevel(
      ticket
    );

  return result.kind ===
    "BUG"
    ? "Bug · Suporte + Fábrica"
    : "Dúvida / Problema / Contorno";
}

function getOfficialTargetLabel(
  ticket:
    Ticket,

  target:
    | "firstResponse"
    | "resolution"
) {
  if (
    !isOfficialMeasuredCategory(
      ticket
    )
  ) {
    return "—";
  }

  const result =
    getOfficialServiceLevel(
      ticket
    );

  return formatServiceMinutes(
    target ===
      "firstResponse"
      ? result.firstResponse
          .targetMinutes
      : result.resolution
          .targetMinutes
  );
}

/* =========================================================
   UTILITÁRIOS
========================================================= */

function getQuickFilterLabel(
  quickFilter:
    Exclude<
      QuickFilter,
      null
    >
) {
  if (
    quickFilter ===
    "all"
  ) {
    return "Todos do período";
  }

  if (
    quickFilter ===
    "open"
  ) {
    return "Abertos";
  }

  if (
    quickFilter ===
    "stopped"
  ) {
    return "Parados";
  }

  if (
    quickFilter ===
    "attention"
  ) {
    return "Alta atenção";
  }

  return "Sem responsável";
}

function isOpen(
  ticket:
    Ticket
) {
  return ![
    "Resolved",
    "Closed",
    "Canceled",
  ].includes(
    ticket.baseStatus ??
      ""
  );
}

function uniqueValues(
  tickets:
    Ticket[],

  field:
    | "status"
    | "urgency"
    | "category"
    | "owner"
    | "client"
    | "team"
    | "service"
) {
  return Array.from(
    new Set(
      tickets
        .map(
          (ticket) =>
            ticket[
              field
            ]
        )
        .filter(
          (
            value
          ): value is string =>
            typeof value ===
              "string" &&
            value.trim() !==
              ""
        )
    )
  ).sort(
    (
      a,
      b
    ) =>
      a.localeCompare(
        b,
        "pt-BR"
      )
  );
}

function normalize(
  value:
    | string
    | null
    | undefined
) {
  if (
    !value
  ) {
    return "";
  }

  return value
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase();
}

function startOfDay(
  date:
    Date
) {
  const result =
    new Date(
      date
    );

  result.setHours(
    0,
    0,
    0,
    0
  );

  return result;
}

function endOfDay(
  date:
    Date
) {
  const result =
    new Date(
      date
    );

  result.setHours(
    23,
    59,
    59,
    999
  );

  return result;
}

function getTicketAgeHours(
  ticket:
    Ticket
) {
  const created =
    new Date(
      ticket.createdDate
    );

  const end =
    ticket.closedDate
      ? new Date(
          ticket.closedDate
        )
      : ticket.resolvedDate
      ? new Date(
          ticket.resolvedDate
        )
      : new Date();

  return Math.max(
    0,
    Math.floor(
      (
        end.getTime() -
        created.getTime()
      ) /
        (
          1000 *
          60 *
          60
        )
    )
  );
}

function getTicketAge(
  ticket:
    Ticket
) {
  if (
    ticket.baseStatus ===
      "Closed" &&
    ticket.closedDate
  ) {
    return "Fechado";
  }

  if (
    ticket.baseStatus ===
      "Resolved" &&
    ticket.resolvedDate
  ) {
    return "Resolvido";
  }

  const hours =
    getTicketAgeHours(
      ticket
    );

  if (
    hours <
    24
  ) {
    return `${hours}h`;
  }

  const days =
    Math.floor(
      hours /
        24
    );

  const remainingHours =
    hours %
    24;

  return `${days}d ${remainingHours}h`;
}

function formatDate(
  date:
    string | null
) {
  if (
    !date
  ) {
    return "—";
  }

  const value =
    new Date(
      date
    );

  if (
    Number.isNaN(
      value.getTime()
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
  ).format(
    value
  );
}

function formatMinutes(
  minutes:
    number | null
) {
  if (
    minutes ===
      null ||
    minutes ===
      undefined
  ) {
    return "—";
  }

  if (
    minutes <
    60
  ) {
    return `${minutes} min`;
  }

  const hours =
    Math.floor(
      minutes /
        60
    );

  const remainingMinutes =
    minutes %
    60;

  if (
    hours <
    24
  ) {
    return `${hours}h ${remainingMinutes}min`;
  }

  const days =
    Math.floor(
      hours /
        24
    );

  const remainingHours =
    hours %
    24;

  return `${days}d ${remainingHours}h ${remainingMinutes}min`;
}