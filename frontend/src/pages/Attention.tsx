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
  Tooltip,
  Typography,
} from "@mui/material";

import {
  ContentCopyOutlined,
  OpenInNewOutlined,
  PriorityHighOutlined,
  ReportProblemOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";



import { api } from "../services/api";
import { useFilters } from "../context/FiltersContext";
import { PeriodFilter } from "../components/PeriodFilter";
import { aliareColors } from "../theme/theme";
import {
  semanticChartColors,
} from "../theme/chartPalette";

import {
  calculateServiceLevel,
  formatServiceMinutes,
  type DeadlineLevel,
  type ServiceLevelResult,
} from "../utils/serviceLevel";

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
};

type AttentionLevel =
  | "vencido"
  | "critico"
  | "atencao";

type AttentionTicket = Ticket & {
  ageHours: number;
  level: AttentionLevel;
  reasons: string[];
  serviceLevel: ServiceLevelResult;
};

export function Attention() {
  const [tickets, setTickets] =
    useState<Ticket[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [level, setLevel] =
    useState("");

  const [owner, setOwner] =
    useState("");

  const [client, setClient] =
    useState("");

  const [selectedTicket, setSelectedTicket] =
    useState<AttentionTicket | null>(null);

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

        const response =
          await api.get<
            Ticket[]
          >(
            "/dashboard/tickets"
          );

        setTickets(response.data);
      } catch (err) {
        console.error(
          "Erro ao carregar pontos de atenção:",
          err
        );

        setError(
          "Não foi possível carregar os pontos de atenção."
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
     PONTOS DE ATENÇÃO
  ===================================================== */

  const attentionTickets =
    useMemo<AttentionTicket[]>(() => {
      const now =
        new Date();

      return periodTickets
        .filter(
          isOpen
        )
        .map(
          (ticket) => {
            const created =
              new Date(
                ticket.createdDate
              );

            const ageHours =
              Math.max(
                0,
                Math.floor(
                  (
                    now.getTime() -
                    created.getTime()
                  ) /
                    (
                      1000 *
                      60 *
                      60
                    )
                )
              );

            const serviceLevel =
              getOfficialServiceLevel(
                ticket
              );

            if (
              !serviceLevel.applicable ||
              !isOfficialMeasuredCategory(
                ticket
              )
            ) {
              return null;
            }

            const reasons:
              string[] = [];

            const firstResponse =
              serviceLevel
                .firstResponse;

            const resolution =
              serviceLevel
                .resolution;

            if (
              !firstResponse
                .completed
            ) {
              if (
                firstResponse.level ===
                "OVERDUE"
              ) {
                reasons.push(
                  "Primeira resposta vencida"
                );
              } else if (
                firstResponse.level ===
                "CRITICAL"
              ) {
                reasons.push(
                  "Primeira resposta em nível crítico"
                );
              } else if (
                firstResponse.level ===
                "ATTENTION"
              ) {
                reasons.push(
                  "Primeira resposta entrou na faixa de atenção"
                );
              }
            }

            if (
              resolution.level ===
              "OVERDUE"
            ) {
              reasons.push(
                "Prazo de solução vencido"
              );
            } else if (
              resolution.level ===
              "CRITICAL"
            ) {
              reasons.push(
                "Prazo de solução em nível crítico"
              );
            } else if (
              resolution.level ===
              "ATTENTION"
            ) {
              reasons.push(
                "Prazo de solução entrou na faixa de atenção"
              );
            }

            if (
              ticket.baseStatus ===
              "Stopped"
            ) {
              reasons.push(
                "Ticket em status de espera/parada"
              );
            }

            if (
              !ticket.owner
            ) {
              reasons.push(
                "Sem responsável"
              );
            }

            if (
              reasons.length ===
              0
            ) {
              return null;
            }

            const level =
              resolveAttentionLevel(
                serviceLevel
              );

            return {
              ...ticket,

              ageHours,

              reasons,

              level,

              serviceLevel,
            };
          }
        )
        .filter(
          (
            ticket
          ): ticket is
            AttentionTicket =>
            Boolean(
              ticket
            )
        )
        .sort(
          (
            a,
            b
          ) => {
            const priority =
              priorityWeight(
                b.level
              ) -
              priorityWeight(
                a.level
              );

            if (
              priority !==
              0
            ) {
              return priority;
            }

            return (
              a.serviceLevel
                .resolution
                .remainingMinutes ??
              Number.MAX_SAFE_INTEGER
            ) -
              (
                b.serviceLevel
                  .resolution
                  .remainingMinutes ??
                Number.MAX_SAFE_INTEGER
              );
          }
        );
    }, [
      periodTickets,
    ]);

  /* =====================================================
     RESUMO
  ===================================================== */

  const summary =
    useMemo(() => {
      return {
        total:
          attentionTickets.length,

        vencidos:
          attentionTickets.filter(
            (ticket) =>
              ticket.level ===
              "vencido"
          ).length,

        criticos:
          attentionTickets.filter(
            (ticket) =>
              ticket.level ===
              "critico"
          ).length,

        atencao:
          attentionTickets.filter(
            (ticket) =>
              ticket.level ===
              "atencao"
          ).length,
      };
    }, [
      attentionTickets,
    ]);

  /* =====================================================
     OPÇÕES DE FILTRO
  ===================================================== */

  const owners = useMemo(() => {
    return uniqueValues(
      attentionTickets,
      "owner"
    );
  }, [attentionTickets]);

  const clients = useMemo(() => {
    return uniqueValues(
      attentionTickets,
      "client"
    );
  }, [attentionTickets]);

  /* =====================================================
     FILTROS LOCAIS
  ===================================================== */

  const filteredTickets =
    useMemo(() => {
      return attentionTickets.filter(
        (ticket) => {
          const matchesLevel =
            level === "" ||
            ticket.level === level;

          const matchesOwner =
            owner === "" ||
            ticket.owner === owner;

          const matchesClient =
            client === "" ||
            ticket.client ===
              client;

          return (
            matchesLevel &&
            matchesOwner &&
            matchesClient
          );
        }
      );
    }, [
      attentionTickets,
      level,
      owner,
      client,
    ]);

  const activeFilterCount =
    [
      level,
      owner,
      client,
    ].filter(Boolean).length;

  function clearFilters() {
    setLevel("");
    setOwner("");
    setClient("");
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
    ticket: AttentionTicket
  ) {
    const text = [
      `Ticket #${ticket.movideskId}`,
      ticket.subject,
      `Cliente: ${ticket.client ?? "—"}`,
      `Responsável: ${ticket.owner ?? "—"}`,
      `Squad: ${ticket.team ?? "—"}`,
      `Categoria: ${ticket.category ?? "—"}`,
      `Urgência: ${ticket.urgency ?? "—"}`,
      `Status: ${ticket.status}`,
      `Nível: ${attentionLabel(ticket.level)}`,
      `1ª resposta vence em: ${formatDateTime(
        ticket.firstResponseDueDate
      )}`,
      `1ª resposta dada em: ${formatDateTime(
        ticket.firstResponseDate
      )}`,
      `Resultado 1ª resposta: ${
        ticket.serviceLevel.firstResponse.completed
          ? ticket.serviceLevel.firstResponse.withinDeadline
            ? "Dentro do prazo"
            : "Fora do prazo"
          : ticket.serviceLevel.firstResponse.level === "OVERDUE"
          ? "Vencida e ainda sem resposta"
          : "Pendente"
      }`,
      `Meta 1ª resposta: ${formatServiceMinutes(
        ticket.serviceLevel.firstResponse.targetMinutes
      )}`,
      `Meta solução: ${formatServiceMinutes(
        ticket.serviceLevel.resolution.targetMinutes
      )}`,
      `Restante solução: ${formatServiceMinutes(
        ticket.serviceLevel.resolution.remainingMinutes
      )}`,
      `Motivos: ${ticket.reasons.join(" | ")}`,
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

  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <>
      {/* CABEÇALHO */}

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
              Gestão de risco
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
            Pontos de Atenção
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt:
                0.25,
            }}
          >
            Situações que exigem acompanhamento da liderança
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display:
                "block",

              mt:
                0.5,
            }}
          >
            {periodTickets.length} ticket(s) analisado(s) no período
          </Typography>
        </Box>

        <PeriodFilter />
      </Box>

      <Alert
        severity="info"
        variant="outlined"
        sx={{
          mb: 1.5,
          borderRadius: 2,
        }}
      >
        <strong>Regra oficial aplicada:</strong>{" "}
        esta tela considera somente atendimentos medidos pelo prazo oficial,
        em horas úteis, com base em urgência, categoria e pausas registradas.
        Adequação e Solicitação de Serviço ficam fora da medição.
      </Alert>

      {/* INDICADORES */}

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
        <IndicatorCard
          title="Requerem atenção"
          value={summary.total}
          description="Total identificado pela regra"
          onClick={() =>
            setLevel("")
          }
        />

        <IndicatorCard
          title="Vencidos"
          value={summary.vencidos}
          description="Prazo já ultrapassado"
          severity="error"
          onClick={() =>
            setLevel(
              "vencido"
            )
          }
        />

        <IndicatorCard
          title="Críticos"
          value={summary.criticos}
          description="Próximos do limite"
          severity="warning"
          onClick={() =>
            setLevel(
              "critico"
            )
          }
        />

        <IndicatorCard
          title="Em atenção"
          value={summary.atencao}
          description="Gatilho oficial de acompanhamento"
          severity="info"
          onClick={() =>
            setLevel(
              "atencao"
            )
          }
        />
      </Box>

      {summary.vencidos > 0 && (
        <Alert
          severity="error"
          sx={{
            mb: 2,
            borderRadius: 2,
            py: 0.25,

            "& .MuiAlert-message": {
              fontSize: "0.82rem",
            },
          }}
        >
          Existem{" "}
          <strong>
            {summary.vencidos}
          </strong>{" "}
          ticket(s) com prazo vencido que devem ser priorizados.
        </Alert>
      )}

      {/* FILTROS */}

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
            <FormControl
              size="small"
              sx={{
                minWidth: {
                  xs:
                    "100%",
                  md:
                    180,
                },
              }}
            >
              <InputLabel>
                Situação do prazo
              </InputLabel>

              <Select
                value={level}
                label="Situação do prazo"
                onChange={(event) =>
                  setLevel(
                    event.target.value
                  )
                }
              >
                <MenuItem value="">
                  Todos
                </MenuItem>

                <MenuItem value="vencido">
                  Vencido
                </MenuItem>

                <MenuItem value="critico">
                  Crítico
                </MenuItem>

                <MenuItem value="atencao">
                  Atenção
                </MenuItem>
              </Select>
            </FormControl>

            <FormControl
              size="small"
              sx={{
                minWidth: {
                  xs:
                    "100%",
                  md:
                    220,
                },
              }}
            >
              <InputLabel>
                Responsável
              </InputLabel>

              <Select
                value={owner}
                label="Responsável"
                onChange={(event) =>
                  setOwner(
                    event.target.value
                  )
                }
              >
                <MenuItem value="">
                  Todos
                </MenuItem>

                {owners.map(
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

            <FormControl
              size="small"
              sx={{
                minWidth: {
                  xs:
                    "100%",
                  md:
                    220,
                },
              }}
            >
              <InputLabel>
                Cliente
              </InputLabel>

              <Select
                value={client}
                label="Cliente"
                onChange={(event) =>
                  setClient(
                    event.target.value
                  )
                }
              >
                <MenuItem value="">
                  Todos
                </MenuItem>

                {clients.map(
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

            {activeFilterCount > 0 && (
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

      {/* TABELA */}

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
                sx={{ fontWeight: 800, fontSize:
                    "1.05rem", }}
              >
                Atendimentos com risco de prazo
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Priorizados pela mesma regra oficial usada em Desempenho e Tickets
              </Typography>
            </Box>

            <Chip
              size="small"
              label={`${filteredTickets.length} ticket(s)`}
              variant="outlined"
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
                <TableCell>
                  <strong>
                    Situação
                  </strong>
                </TableCell>

                <TableCell>
                  <strong>
                    Ticket
                  </strong>
                </TableCell>

                <TableCell>
                  <strong>
                    Assunto
                  </strong>
                </TableCell>

                <TableCell>
                  <strong>
                    Cliente
                  </strong>
                </TableCell>

                <TableCell>
                  <strong>
                    Responsável
                  </strong>
                </TableCell>

                <TableCell>
                  <strong>
                    Status
                  </strong>
                </TableCell>

                <TableCell>
                  <strong>
                    Motivo
                  </strong>
                </TableCell>

                <TableCell align="right">
                  <strong>
                    Idade
                  </strong>
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {filteredTickets.map(
                (ticket) => (
                  <TableRow
                    key={ticket.id}
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
                            `3px solid ${attentionColor(ticket.level)}`,
                        },

                      "&:hover":
                        {
                          backgroundColor:
                            "#FAFBFA",
                        },
                    }}
                  >
                    <TableCell>
                      <LevelChip
                        level={
                          ticket.level
                        }
                      />
                    </TableCell>

                    <TableCell>
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
                         sx={{ fontWeight: 700 }}>
                          #{ticket.movideskId}
                        </Typography>

                        <Tooltip title="Copiar número do ticket">
                          <IconButton
                            size="small"
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
                            <ContentCopyOutlined
                              sx={{
                                fontSize:
                                  14,
                              }}
                            />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="Abrir no Movidesk">
                          <IconButton
                            size="small"
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
                            <OpenInNewOutlined
                              sx={{
                                fontSize:
                                  15,
                              }}
                            />
                          </IconButton>
                        </Tooltip>
                      </Stack>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                      >
                        {ticket.protocol ??
                          "Sem protocolo"}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          maxWidth: 280,
                        }}
                      >
                        {ticket.subject}
                      </Typography>

                      {ticket.category && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                         sx={{ display: "block" }}>
                          {ticket.category}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      {ticket.client ??
                        "—"}
                    </TableCell>

                    <TableCell>
                      {ticket.owner ?? (
                        <Chip
                          size="small"
                          label="Sem responsável"
                        />
                      )}

                      {ticket.team && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", mt: 0.25, }}
                        >
                          {ticket.team}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Chip
                        size="small"
                        label={
                          ticket.status
                        }
                        variant="outlined"
                      />
                    </TableCell>

                    <TableCell>
                      <Stack
                        spacing={0.25}
                      >
                        {ticket.reasons.map(
                          (reason) => (
                            <Typography
                              key={reason}
                              variant="caption"
                              color="text.secondary"
                            >
                              • {reason}
                            </Typography>
                          )
                        )}
                      </Stack>
                    </TableCell>

                    <TableCell align="right">
                      <Typography
                        variant="body2"
                       sx={{ fontWeight: 700 }}>
                        {formatAge(
                          ticket.ageHours
                        )}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )
              )}

              {filteredTickets.length ===
                0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    align="center"
                  >
                    <Box
                      sx={{
                        py: 4,
                      }}
                    >
                      <Typography
                       sx={{ fontWeight: 700 }}>
                        Nenhum ponto de atenção encontrado
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mt: 0.5,
                        }}
                      >
                        Altere o período ou os filtros selecionados.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* DRAWER DE DETALHE */}

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
              sm: 520,
            },

            p: 2.5,
          }}
        >
          {selectedTicket && (
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
                   sx={{ fontWeight: 800 }}>
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
                  aria-label="Fechar detalhes"
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
                <LevelChip
                  level={
                    selectedTicket.level
                  }
                />

                <Chip
                  size="small"
                  label={
                    selectedTicket.status
                  }
                  variant="outlined"
                />

                {selectedTicket.urgency && (
                  <Chip
                    size="small"
                    label={
                      selectedTicket.urgency
                    }
                    color={
                      normalize(
                        selectedTicket.urgency
                      ) ===
                      "critica"
                        ? "error"
                        : normalize(
                            selectedTicket.urgency
                          ) ===
                          "alta"
                        ? "warning"
                        : "default"
                    }
                  />
                )}
              </Stack>

              <Stack
                direction="row"
                spacing={1}
                sx={{
                  mt: 1.5,
                }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={
                    <ContentCopyOutlined />
                  }
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
                sx={{ fontWeight: 700, mb: 2, }}
              >
                {selectedTicket.subject}
              </Typography>

              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 800, mb: 1, }}
              >
                Motivos de priorização
              </Typography>

              <Stack
                spacing={0.5}
                sx={{
                  mb: 2,
                }}
              >
                {selectedTicket.reasons.map(
                  (reason) => (
                    <Alert
                      key={reason}
                      severity={
                        reason.includes(
                          "crítica"
                        ) ||
                        reason.includes(
                          "Primeira resposta"
                        )
                          ? "error"
                          : reason.includes(
                              "parado"
                            ) ||
                            reason.includes(
                              "vencido"
                            )
                          ? "warning"
                          : "info"
                      }
                      sx={{
                        py:
                          0,

                        borderRadius:
                          1.5,
                      }}
                    >
                      {reason}
                    </Alert>
                  )
                )}
              </Stack>

              <Divider
                sx={{
                  my: 2,
                }}
              />

              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 800, mb: 1.5, }}
              >
                Atendimento
              </Typography>

              <Box
                sx={{
                  display: "grid",

                  gridTemplateColumns: {
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
              </Box>

              <Divider
                sx={{
                  my: 2,
                }}
              />

              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 800, mb: 1.5, }}
              >
                Prazos e tempos
              </Typography>

              <Box
                sx={{
                  display: "grid",

                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "1fr 1fr",
                  },

                  gap: 1.5,
                }}
              >
                <TicketField
                  label="Regra"
                  value={
                    getOfficialRuleLabel(
                      selectedTicket
                    )
                  }
                />

                <TicketField
                  label="Perfil"
                  value="Padrão"
                />

                <TicketField
                  label="Meta 1ª resposta"
                  value={
                    formatServiceMinutes(
                      selectedTicket
                        .serviceLevel
                        .firstResponse
                        .targetMinutes
                    )
                  }
                />

                <TicketField
                  label="Consumido 1ª resposta"
                  value={
                    formatServiceMinutes(
                      selectedTicket
                        .serviceLevel
                        .firstResponse
                        .consumedMinutes
                    )
                  }
                />

                <TicketField
                  label="Meta solução"
                  value={
                    formatServiceMinutes(
                      selectedTicket
                        .serviceLevel
                        .resolution
                        .targetMinutes
                    )
                  }
                />

                <TicketField
                  label="Restante solução"
                  value={
                    formatServiceMinutes(
                      selectedTicket
                        .serviceLevel
                        .resolution
                        .remainingMinutes
                    )
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

                <TicketField
                  label="Idade atual"
                  value={formatAge(
                    selectedTicket.ageHours
                  )}
                />
              </Box>

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
                    sx={{ fontWeight: 800, mb: 1.5, }}
                  >
                    Desenvolvimento
                  </Typography>

                  <Box
                    sx={{
                      display: "grid",

                      gridTemplateColumns: {
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
   CARD DE INDICADOR
===================================================== */

function IndicatorCard({
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
    | "warning"
    | "info";

  onClick?: () => void;
}) {
  const accentColor =
    severity === "error"
      ? semanticChartColors.overdue
      : severity === "warning"
      ? semanticChartColors.attention
      : severity === "info"
      ? semanticChartColors.normal
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
          2.15,

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
         sx={{ fontWeight: 600 }}>
          {title}
        </Typography>

        <Typography
          sx={{ fontWeight: 800, mt: 0.5,

            fontSize: {
              xs: "1.7rem",
              md: "1.9rem",
              xl: "2.05rem",
            },

            lineHeight: 1.1, }}
        >
          {value}
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: "block",
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
                0.6,

              fontWeight:
                700,

              color:
                aliareColors.greenDark,
            }}
          >
            Filtrar →
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

/* =====================================================
   NÍVEL
===================================================== */

function LevelChip({
  level,
}: {
  level:
    AttentionLevel;
}) {
  if (
    level ===
    "vencido"
  ) {
    return (
      <Chip
        size="small"
        icon={
          <PriorityHighOutlined />
        }
        color="error"
        label="Vencido"
      />
    );
  }

  if (
    level ===
    "critico"
  ) {
    return (
      <Chip
        size="small"
        icon={
          <ReportProblemOutlined />
        }
        label="Crítico"
        sx={{
          color:
            "#B54708",

          backgroundColor:
            "rgba(249,115,22,0.10)",

          border:
            "1px solid rgba(249,115,22,0.35)",
        }}
      />
    );
  }

  return (
    <Chip
      size="small"
      icon={
        <WarningAmberOutlined />
      }
      label="Atenção"
      variant="outlined"
      sx={{
        color:
          "#9A6500",

        borderColor:
          "rgba(245,179,1,0.40)",

        backgroundColor:
          "rgba(245,179,1,0.05)",
      }}
    />
  );
}

function attentionColor(
  level:
    AttentionLevel
) {
  if (
    level ===
    "vencido"
  ) {
    return semanticChartColors.overdue;
  }

  if (
    level ===
    "critico"
  ) {
    return "#F97316";
  }

  return semanticChartColors.attention;
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
        sx={{ fontWeight: 600, wordBreak:
            "break-word", }}
      >
        {value ?? "—"}
      </Typography>
    </Box>
  );
}

/* =====================================================
   VALORES ÚNICOS
===================================================== */

function uniqueValues(
  tickets: AttentionTicket[],
  field:
    | "owner"
    | "client"
) {
  return Array.from(
    new Set(
      tickets
        .map(
          (ticket) =>
            ticket[field]
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
}

/* =====================================================
   STATUS ABERTO
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
    .trim()
    .toLowerCase();
}

/* =====================================================
   PRIORIDADE
===================================================== */

function priorityWeight(
  level:
    AttentionLevel
) {
  if (
    level ===
    "vencido"
  ) {
    return 3;
  }

  if (
    level ===
    "critico"
  ) {
    return 2;
  }

  return 1;
}

function attentionLabel(
  level:
    AttentionLevel
) {
  if (
    level ===
    "vencido"
  ) {
    return "Vencido";
  }

  if (
    level ===
    "critico"
  ) {
    return "Crítico";
  }

  return "Atenção";
}

/* =====================================================
   REGRA OFICIAL DE PRAZO
===================================================== */

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

function resolveAttentionLevel(
  serviceLevel:
    ServiceLevelResult
):
  AttentionLevel {
  const levels:
    DeadlineLevel[] = [
      serviceLevel
        .resolution
        .level,
    ];

  if (
    !serviceLevel
      .firstResponse
      .completed
  ) {
    levels.push(
      serviceLevel
        .firstResponse
        .level
    );
  }

  if (
    levels.includes(
      "OVERDUE"
    )
  ) {
    return "vencido";
  }

  if (
    levels.includes(
      "CRITICAL"
    )
  ) {
    return "critico";
  }

  return "atencao";
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
   IDADE / TEMPO / DATA
===================================================== */

function formatAge(
  hours: number
) {
  if (hours < 24) {
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

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  const remainingMinutes =
    minutes % 60;

  if (hours < 24) {
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
      dateStyle: "short",
      timeStyle: "short",
    }
  ).format(parsed);
}