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
  TextField,
  Typography,
} from "@mui/material";

import { api } from "../services/api";
import { useFilters } from "../context/FiltersContext";
import { PeriodFilter } from "../components/PeriodFilter";

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

export function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTicket, setSelectedTicket] =
    useState<Ticket | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [urgency, setUrgency] = useState("");
  const [category, setCategory] = useState("");
  const [owner, setOwner] = useState("");
  const [client, setClient] = useState("");
  const [team, setTeam] = useState("");
  const [service, setService] = useState("");

  const [copyMessage, setCopyMessage] =
    useState("");

  const {
    effectiveStartDate,
    effectiveEndDate,
  } = useFilters();

  /* =====================================================
     CARREGAMENTO DOS TICKETS
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
          "Erro ao carregar tickets:",
          err
        );

        setError(
          "Não foi possível carregar os tickets. Verifique se o backend está rodando."
        );
      } finally {
        setLoading(false);
      }
    }

    loadTickets();
  }, []);

  /* =====================================================
     PERÍODO GLOBAL

     Primeiro restringimos a massa inteira ao período.
     Depois os filtros locais trabalham somente nessa massa.
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
     OPÇÕES DOS FILTROS

     Agora os combos exibem somente valores existentes
     dentro do período selecionado.
  ===================================================== */

  const statuses = useMemo(
    () =>
      uniqueValues(
        periodTickets,
        "status"
      ),
    [periodTickets]
  );

  const urgencies = useMemo(
    () =>
      uniqueValues(
        periodTickets,
        "urgency"
      ),
    [periodTickets]
  );

  const categories = useMemo(
    () =>
      uniqueValues(
        periodTickets,
        "category"
      ),
    [periodTickets]
  );

  const owners = useMemo(
    () =>
      uniqueValues(
        periodTickets,
        "owner"
      ),
    [periodTickets]
  );

  const clients = useMemo(
    () =>
      uniqueValues(
        periodTickets,
        "client"
      ),
    [periodTickets]
  );

  const teams = useMemo(
    () =>
      uniqueValues(
        periodTickets,
        "team"
      ),
    [periodTickets]
  );

  const services = useMemo(
    () =>
      uniqueValues(
        periodTickets,
        "service"
      ),
    [periodTickets]
  );

  /* =====================================================
     FILTROS LOCAIS
  ===================================================== */

  const filteredTickets = useMemo(() => {
    const normalizedSearch =
      normalize(search.trim());

    return periodTickets.filter(
      (ticket) => {
        const matchesSearch =
          normalizedSearch === "" ||
          normalize(
            String(ticket.movideskId)
          ).includes(normalizedSearch) ||
          normalize(
            String(ticket.id)
          ).includes(normalizedSearch) ||
          normalize(
            ticket.protocol
          ).includes(normalizedSearch) ||
          normalize(
            ticket.subject
          ).includes(normalizedSearch) ||
          normalize(
            ticket.client
          ).includes(normalizedSearch) ||
          normalize(
            ticket.contact
          ).includes(normalizedSearch) ||
          normalize(
            ticket.owner
          ).includes(normalizedSearch) ||
          normalize(
            ticket.team
          ).includes(normalizedSearch) ||
          normalize(
            ticket.category
          ).includes(normalizedSearch) ||
          normalize(
            ticket.cause
          ).includes(normalizedSearch) ||
          normalize(
            ticket.service
          ).includes(normalizedSearch) ||
          normalize(
            ticket.department
          ).includes(normalizedSearch) ||
          normalize(
            ticket.taskNumber !== null
              ? String(ticket.taskNumber)
              : null
          ).includes(normalizedSearch) ||
          normalize(
            ticket.taskStatus
          ).includes(normalizedSearch) ||
          normalize(
            ticket.deliveredVersion
          ).includes(normalizedSearch);

        const matchesStatus =
          status === "" ||
          ticket.status === status;

        const matchesUrgency =
          urgency === "" ||
          ticket.urgency === urgency;

        const matchesCategory =
          category === "" ||
          ticket.category === category;

        const matchesOwner =
          owner === "" ||
          ticket.owner === owner;

        const matchesClient =
          client === "" ||
          ticket.client === client;

        const matchesTeam =
          team === "" ||
          ticket.team === team;

        const matchesService =
          service === "" ||
          ticket.service === service;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesUrgency &&
          matchesCategory &&
          matchesOwner &&
          matchesClient &&
          matchesTeam &&
          matchesService
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
  ]);

  /* =====================================================
     QUANTIDADE DE FILTROS LOCAIS ATIVOS
  ===================================================== */

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
    ].filter(Boolean).length;

  function clearFilters() {
    setSearch("");
    setStatus("");
    setUrgency("");
    setCategory("");
    setOwner("");
    setClient("");
    setTeam("");
    setService("");
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
          justifyContent: "center",
          mt: 10,
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
            Tickets
          </Typography>

          <Typography
            sx={{
              color:
                "text.secondary",
              mt: 0.5,
            }}
          >
            Consulte e investigue os chamados da operação
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              mt: 0.75,
            }}
          >
            {periodTickets.length} ticket(s)
            no período selecionado
          </Typography>
        </Box>

        <PeriodFilter />
      </Box>

      {/* ===============================================
          SEM TICKETS NO PERÍODO
      ================================================ */}

      {periodTickets.length === 0 && (
        <Alert
          severity="info"
          sx={{
            mb: 3,
            borderRadius: 2,
          }}
        >
          Nenhum ticket foi encontrado no período
          selecionado. Escolha outro período para
          continuar a análise.
        </Alert>
      )}

      {/* ===============================================
          FILTROS LOCAIS
      ================================================ */}

      <Card
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          mb: 3,
        }}
      >
        <CardContent>
          <Stack
            direction={{
              xs: "column",
              sm: "row",
            }}
            spacing={2}
            sx={{
              mb: 2,

              alignItems: {
                xs: "flex-start",
                sm: "center",
              },

              justifyContent:
                "space-between",
            }}
          >
            <Box>
              <Typography
                fontWeight={700}
              >
                Filtros
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                Refine os tickets do período selecionado
              </Typography>
            </Box>

            {activeFilterCount > 0 && (
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={`${activeFilterCount} filtro(s) ativo(s)`}
              />
            )}
          </Stack>

          <Box
            sx={{
              display: "grid",

              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, 1fr)",
                xl: "repeat(4, 1fr)",
              },

              gap: 2,
            }}
          >
            <TextField
              label="Pesquisar"
              placeholder="Ticket, protocolo, assunto, cliente, responsável..."
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              fullWidth
            />

            <FilterSelect
              label="Status"
              value={status}
              options={statuses}
              onChange={setStatus}
            />

            <FilterSelect
              label="Urgência"
              value={urgency}
              options={urgencies}
              onChange={setUrgency}
            />

            <FilterSelect
              label="Categoria"
              value={category}
              options={categories}
              onChange={setCategory}
            />

            <FilterSelect
              label="Responsável"
              value={owner}
              options={owners}
              onChange={setOwner}
            />

            <FilterSelect
              label="Cliente"
              value={client}
              options={clients}
              onChange={setClient}
            />

            <FilterSelect
              label="Squad"
              value={team}
              options={teams}
              onChange={setTeam}
            />

            <FilterSelect
              label="Serviço"
              value={service}
              options={services}
              onChange={setService}
            />
          </Box>

          <Stack
            direction={{
              xs: "column",
              sm: "row",
            }}
            spacing={2}
            sx={{
              mt: 3,

              alignItems: {
                xs: "stretch",
                sm: "center",
              },

              justifyContent:
                "space-between",
            }}
          >
            <Typography color="text.secondary">
              Exibindo{" "}
              <strong>
                {filteredTickets.length}
              </strong>{" "}
              de{" "}
              <strong>
                {periodTickets.length}
              </strong>{" "}
              ticket(s) do período
            </Typography>

            <Button
              variant="outlined"
              disabled={
                activeFilterCount === 0
              }
              onClick={clearFilters}
            >
              Limpar filtros
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* ===============================================
          TABELA
      ================================================ */}

      <Card
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
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
                    Categoria
                  </strong>
                </TableCell>

                <TableCell>
                  <strong>
                    Status
                  </strong>
                </TableCell>

                <TableCell>
                  <strong>
                    Urgência
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

                      "&:hover": {
                        backgroundColor:
                          "action.hover",
                      },
                    }}
                  >
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
                          fontWeight={700}
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
                        variant="caption"
                        color="text.secondary"
                      >
                        {ticket.protocol ??
                          "Sem protocolo"}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography
                        sx={{
                          maxWidth: 340,
                        }}
                      >
                        {ticket.subject}
                      </Typography>
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
                    </TableCell>

                    <TableCell>
                      {ticket.category ??
                        "—"}
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

                    <TableCell
                      align="right"
                    >
                      {getTicketAge(
                        ticket
                      )}
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
                        py: 5,
                      }}
                    >
                      <Typography
                        fontWeight={700}
                      >
                        Nenhum ticket encontrado
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mt: 0.5,
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

      {/* ===============================================
          DETALHE DO TICKET
      ================================================ */}

      <Drawer
        anchor="right"
        open={Boolean(
          selectedTicket
        )}
        onClose={() =>
          setSelectedTicket(null)
        }
      >
        <Box
          sx={{
            width: {
              xs: 320,
              sm: 500,
            },

            p: 3,
          }}
        >
          {selectedTicket && (
            <>
              <Box
                sx={{
                  display: "flex",

                  justifyContent:
                    "space-between",

                  alignItems:
                    "flex-start",

                  gap: 2,
                  mb: 2,
                }}
              >
                <Box>
                  <Typography
                    variant="h5"
                    fontWeight={800}
                  >
                    Ticket #{selectedTicket.movideskId}
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                  >
                    {selectedTicket.protocol ??
                      "Sem protocolo"}
                  </Typography>
                </Box>

                <IconButton
                  aria-label="Fechar detalhes"
                  onClick={() =>
                    setSelectedTicket(
                      null
                    )
                  }
                >
                  ✕
                </IconButton>
              </Box>

              <Stack
                direction="row"
                spacing={1}
                sx={{
                  mb: 2,
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
                sx={{ mb: 3 }}
              />

              <Typography
                variant="overline"
                color="text.secondary"
              >
                Assunto
              </Typography>

              <Typography
                fontWeight={700}
                sx={{ mb: 3 }}
              >
                {selectedTicket.subject}
              </Typography>

              <Stack
                direction="row"
                spacing={1}
                sx={{
                  mb: 3,
                  flexWrap: "wrap",
                  gap: 1,
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
              </Stack>

              <Divider
                sx={{ mb: 3 }}
              />

              <Typography
                variant="subtitle2"
                fontWeight={800}
                sx={{ mb: 2 }}
              >
                Informações do chamado
              </Typography>

              <Box
                sx={{
                  display: "grid",

                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "1fr 1fr",
                  },

                  gap: 2,
                  mb: 3,
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
                sx={{ mb: 3 }}
              />

              <Typography
                variant="subtitle2"
                fontWeight={800}
                sx={{ mb: 2 }}
              >
                Datas
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  mb: 3,
                }}
              >
                <TicketField
                  label="Data de abertura"
                  value={formatDate(
                    selectedTicket.createdDate
                  )}
                />

                <TicketField
                  label="Vencimento"
                  value={formatDate(
                    selectedTicket.dueDate
                  )}
                />

                <TicketField
                  label="Primeira resposta"
                  value={formatDate(
                    selectedTicket.firstResponseDate
                  )}
                />

                <TicketField
                  label="Venc. primeira resposta"
                  value={formatDate(
                    selectedTicket.firstResponseDueDate
                  )}
                />

                <TicketField
                  label="Data de resolução"
                  value={formatDate(
                    selectedTicket.resolvedDate
                  )}
                />

                <TicketField
                  label="Data de fechamento"
                  value={formatDate(
                    selectedTicket.closedDate
                  )}
                />
              </Box>

              <Divider
                sx={{ mb: 3 }}
              />

              <Typography
                variant="subtitle2"
                fontWeight={800}
                sx={{ mb: 2 }}
              >
                Tempos
              </Typography>

              <Box
                sx={{
                  display: "grid",

                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "1fr 1fr",
                  },

                  gap: 2,
                }}
              >
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

              <Box
                sx={{
                  mt: 3,
                  p: 2,

                  borderRadius: 2,

                  backgroundColor:
                    "background.default",
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                >
                  Idade atual
                </Typography>

                <Typography
                  variant="h6"
                  fontWeight={800}
                >
                  {getTicketAge(
                    selectedTicket
                  )}
                </Typography>
              </Box>

              {selectedTicket.justification && (
                <>
                  <Divider
                    sx={{
                      my: 3,
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
                      my: 3,
                    }}
                  />

                  <Typography
                    variant="subtitle2"
                    fontWeight={800}
                    sx={{
                      mb: 2,
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

                      gap: 2,
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
   SELECT GENÉRICO
===================================================== */

type FilterSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: FilterSelectProps) {
  return (
    <FormControl fullWidth>
      <InputLabel>
        {label}
      </InputLabel>

      <Select
        value={value}
        label={label}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
      >
        <MenuItem value="">
          Todos
        </MenuItem>

        {options.map(
          (option) => (
            <MenuItem
              key={option}
              value={option}
            >
              {option}
            </MenuItem>
          )
        )}
      </Select>
    </FormControl>
  );
}

/* =====================================================
   STATUS
===================================================== */

function StatusChip({
  status,
  baseStatus,
}: {
  status: string;
  baseStatus: string | null;
}) {
  let color:
    | "default"
    | "primary"
    | "warning"
    | "success"
    | "error" = "default";

  if (
    baseStatus === "New" ||
    baseStatus === "InAttendance"
  ) {
    color = "primary";
  }

  if (
    baseStatus === "Stopped"
  ) {
    color = "warning";
  }

  if (
    baseStatus === "Resolved" ||
    baseStatus === "Closed"
  ) {
    color = "success";
  }

  if (
    baseStatus === "Canceled"
  ) {
    color = "error";
  }

  return (
    <Chip
      size="small"
      label={status}
      color={color}
      variant="outlined"
    />
  );
}

/* =====================================================
   URGÊNCIA
===================================================== */

function UrgencyChip({
  urgency,
}: {
  urgency: string | null;
}) {
  if (!urgency) {
    return <span>—</span>;
  }

  const normalized =
    normalize(urgency);

  let color:
    | "default"
    | "warning"
    | "error" = "default";

  if (
    normalized === "critica"
  ) {
    color = "error";
  } else if (
    normalized === "alta"
  ) {
    color = "warning";
  }

  return (
    <Chip
      size="small"
      label={urgency}
      color={color}
    />
  );
}

/* =====================================================
   CAMPO DO DRAWER
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

/* =====================================================
   VALORES ÚNICOS
===================================================== */

function uniqueValues(
  tickets: Ticket[],

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
            ticket[field]
        )
        .filter(
          (
            value
          ): value is string =>
            typeof value ===
              "string" &&
            value.trim() !== ""
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
   NORMALIZAÇÃO DE TEXTO
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
   LIMITES DO DIA
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
   IDADE DO TICKET
===================================================== */

function getTicketAge(
  ticket: Ticket
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

  const created =
    new Date(
      ticket.createdDate
    );

  const now =
    new Date();

  const hours = Math.max(
    0,

    Math.floor(
      (now.getTime() -
        created.getTime()) /
        (1000 * 60 * 60)
    )
  );

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

/* =====================================================
   DATAS
===================================================== */

function formatDate(
  date: string | null
) {
  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      dateStyle: "short",
      timeStyle: "short",
    }
  ).format(
    new Date(date)
  );
}

/* =====================================================
   MINUTOS
===================================================== */

function formatMinutes(
  minutes: number | null
) {
  if (
    minutes === null ||
    minutes === undefined
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

  return `${days}d ${remainingHours}h ${remainingMinutes}min`;
}