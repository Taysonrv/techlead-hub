import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";

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
  Popover,
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
  InfoOutlined,
  OpenInNewOutlined,
  PriorityHighOutlined,
  ReportProblemOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";



import { useNavigate } from "react-router-dom";

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

type CardInfoDefinition = {
  title: string;
  summary: string;
  calculation: string;
  source: string;
  reference: string;
  periodRule: string;
  notes?: string;
};

export function Attention() {
  const navigate =
    useNavigate();

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

  const [riskFilter, setRiskFilter] =
    useState<"" | "azure">("");

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

          const reasons:
            string[] = [];

          const slaMeasured =
            serviceLevel.applicable &&
            isOfficialMeasuredCategory(
              ticket
            );

          /*
           * SLA / Movidesk.
           *
           * Continuamos usando a mesma regra operacional já
           * utilizada pela tela, porém um ticket fora da medição
           * também pode aparecer quando existir risco no Azure.
           */
          if (slaMeasured) {
            const firstResponse =
              serviceLevel
                .firstResponse;

            const resolution =
              serviceLevel
                .resolution;

            if (
              !firstResponse.completed
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
              "Sem responsável no atendimento"
            );
          }

          /*
           * Azure DevOps.
           */
          const azure =
            ticket.azureWorkItem;

          if (
            ticket.taskNumber &&
            !azure
          ) {
            reasons.push(
              "Task ainda não sincronizada com o Azure"
            );
          }

          if (azure) {
            const azureState =
              normalize(
                azure.state
              );

            const azureCriticality =
              normalize(
                azure.criticality
              );

            if (
              azure.blockedProcess ===
              true
            ) {
              reasons.push(
                "Task Azure com processo bloqueado"
              );
            }

            if (
              !azure.assignedToName?.trim() &&
              azureState !==
                "concluido" &&
              azureState !==
                "cancelado"
            ) {
              reasons.push(
                "Task Azure sem responsável"
              );
            }

            if (
              azureCriticality ===
                "critica" ||
              azureCriticality ===
                "alta"
            ) {
              reasons.push(
                `Task Azure com criticidade ${azure.criticality}`
              );
            }

            if (
              azureState ===
              "concluido"
            ) {
              reasons.push(
                "Task Azure concluída com atendimento ainda aberto"
              );
            }

            if (
              azure.prioritized ===
                true &&
              azureState !==
                "concluido" &&
              azureState !==
                "cancelado"
            ) {
              const movementDate =
                toValidDate(
                  azure.stateChangedAt ??
                    azure.azureChangedAt
                );

              if (movementDate) {
                const daysWithoutMovement =
                  Math.floor(
                    (
                      now.getTime() -
                      movementDate.getTime()
                    ) /
                      (
                        1000 *
                        60 *
                        60 *
                        24
                      )
                  );

                if (
                  daysWithoutMovement >=
                  7
                ) {
                  reasons.push(
                    `Task priorizada sem movimentação há ${daysWithoutMovement} dias`
                  );
                }
              }
            }
          }

          if (
            reasons.length === 0
          ) {
            return null;
          }

          const level =
            resolveCombinedAttentionLevel(
              serviceLevel,
              slaMeasured,
              reasons
            );

          return {
            ...ticket,
            ageHours,
            reasons,
            level,
            serviceLevel,
          };
        })
        .filter(
          (
            ticket
          ): ticket is
            AttentionTicket =>
            Boolean(ticket)
        )
        .sort((a, b) => {
          const priority =
            priorityWeight(
              b.level
            ) -
            priorityWeight(
              a.level
            );

          if (
            priority !== 0
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
        });
    }, [
      periodTickets,
    ]);

  /* =====================================================
     RESUMO DOS CARDS

     Os cards respeitam período + responsável + cliente.
     O próprio filtro de nível/risco não altera o valor dos
     cards, evitando que um card mude depois de ser clicado.
  ===================================================== */

  const cardScopeTickets =
    useMemo(() => {
      return attentionTickets.filter(
        (ticket) => {
          const matchesOwner =
            owner === "" ||
            ticket.owner === owner;

          const matchesClient =
            client === "" ||
            ticket.client === client;

          return (
            matchesOwner &&
            matchesClient
          );
        }
      );
    }, [
      attentionTickets,
      owner,
      client,
    ]);

  const summary =
    useMemo(() => {
      return {
        total:
          cardScopeTickets.length,

        vencidos:
          cardScopeTickets.filter(
            (ticket) =>
              ticket.level ===
              "vencido"
          ).length,

        criticos:
          cardScopeTickets.filter(
            (ticket) =>
              ticket.level ===
              "critico"
          ).length,

        atencao:
          cardScopeTickets.filter(
            (ticket) =>
              ticket.level ===
              "atencao"
          ).length,

        azure:
          cardScopeTickets.filter(
            (ticket) =>
              ticket.reasons.some(
                isAzureAttentionReason
              )
          ).length,
      };
    }, [
      cardScopeTickets,
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

          const matchesRisk =
            riskFilter === "" ||
            (
              riskFilter === "azure" &&
              ticket.reasons.some(
                isAzureAttentionReason
              )
            );

          return (
            matchesLevel &&
            matchesOwner &&
            matchesClient &&
            matchesRisk
          );
        }
      );
    }, [
      attentionTickets,
      level,
      owner,
      client,
      riskFilter,
    ]);

  const activeFilterCount =
    [
      level,
      owner,
      client,
      riskFilter,
    ].filter(Boolean).length;

  function clearFilters() {
    setLevel("");
    setOwner("");
    setClient("");
    setRiskFilter("");
  }

  function filterByCard(
    nextLevel:
      | ""
      | AttentionLevel,
    nextRisk:
      | ""
      | "azure" = ""
  ) {
    setLevel(
      nextLevel
    );

    setRiskFilter(
      nextRisk
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
        <strong>Regra de priorização:</strong>{" "}
        a tela combina o prazo operacional em horas úteis com sinais de risco
        do atendimento e do Azure DevOps. Adequação e Solicitação de Serviço
        ficam fora da medição de prazo, mas ainda podem aparecer quando houver
        outro risco relevante, como parada, ausência de responsável ou risco
        de desenvolvimento.
      </Alert>

      {/* INDICADORES */}

      <Box
        sx={{
          display: "grid",

          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(5, minmax(0, 1fr))",
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
          description="Todos os riscos identificados"
          info={{
            title: "Requerem atenção",
            summary:
              "Total de atendimentos abertos que possuem pelo menos um motivo de acompanhamento operacional ou de desenvolvimento.",
            calculation:
              "Contagem dos tickets abertos com ao menos um gatilho de prazo, parada, ausência de responsável ou risco Azure.",
            source:
              "Movidesk + Azure DevOps",
            reference:
              "Status, prazo operacional, responsável e dados da Task vinculada",
            periodRule:
              "Respeita o período global e os filtros de Responsável e Cliente.",
            notes:
              "Clique no card para remover os filtros de nível e origem do risco e exibir exatamente este conjunto.",
          }}
          onClick={() =>
            filterByCard(
              "",
              ""
            )
          }
        />

        <IndicatorCard
          title="Vencidos"
          value={summary.vencidos}
          description="Prazo operacional ultrapassado"
          severity="error"
          info={{
            title: "Vencidos",
            summary:
              "Atendimentos em que a primeira resposta ou a solução já ultrapassou o limite operacional aplicável.",
            calculation:
              "Nível combinado = Vencido quando existe prazo de primeira resposta ou solução classificado como OVERDUE.",
            source:
              "Movidesk + regra operacional do TechLead Hub",
            reference:
              "Urgência, categoria, abertura, pausas e conclusão",
            periodRule:
              "Respeita o período global e os filtros de Responsável e Cliente.",
            notes:
              "Clique no card para listar exatamente os atendimentos vencidos deste recorte.",
          }}
          onClick={() =>
            filterByCard(
              "vencido",
              ""
            )
          }
        />

        <IndicatorCard
          title="Críticos"
          value={summary.criticos}
          description="Próximos do limite ou com risco alto"
          severity="warning"
          info={{
            title: "Críticos",
            summary:
              "Atendimentos em situação crítica de prazo ou com um risco de desenvolvimento tratado como crítico.",
            calculation:
              "Inclui nível CRITICAL da regra operacional e riscos Azure como processo bloqueado, criticidade Alta/Crítica, Task priorizada sem movimentação e Task concluída com atendimento ainda aberto.",
            source:
              "Movidesk + Azure DevOps",
            reference:
              "Prazo operacional + criticidade/estado da Task",
            periodRule:
              "Respeita o período global e os filtros de Responsável e Cliente.",
            notes:
              "Clique para exibir exatamente os atendimentos classificados como críticos.",
          }}
          onClick={() =>
            filterByCard(
              "critico",
              ""
            )
          }
        />

        <IndicatorCard
          title="Em atenção"
          value={summary.atencao}
          description="Acompanhamento preventivo"
          severity="info"
          info={{
            title: "Em atenção",
            summary:
              "Atendimentos que já possuem um gatilho de acompanhamento, mas ainda não atingiram os níveis Vencido ou Crítico.",
            calculation:
              "Nível final = Atenção após avaliar prazo operacional e demais motivos de risco.",
            source:
              "Movidesk + Azure DevOps",
            reference:
              "Prazo, status, responsável e vínculo com desenvolvimento",
            periodRule:
              "Respeita o período global e os filtros de Responsável e Cliente.",
            notes:
              "Clique para listar somente os atendimentos atualmente classificados em atenção.",
          }}
          onClick={() =>
            filterByCard(
              "atencao",
              ""
            )
          }
        />

        <IndicatorCard
          title="Risco Azure"
          value={summary.azure}
          description="Risco ou inconsistência no desenvolvimento"
          severity={
            summary.azure > 0
              ? "warning"
              : "default"
          }
          info={{
            title: "Risco Azure",
            summary:
              "Atendimentos com algum risco relacionado à Task vinculada ou à sincronização com o Azure DevOps.",
            calculation:
              "Conta tickets com motivos como Task não sincronizada, processo bloqueado, ausência de responsável, criticidade Alta/Crítica, Task concluída com ticket aberto ou priorizada sem movimentação.",
            source:
              "Azure DevOps + vínculo Movidesk",
            reference:
              "azureWorkItem + taskNumber",
            periodRule:
              "Respeita o período global e os filtros de Responsável e Cliente. Pode sobrepor Vencidos, Críticos e Em atenção.",
            notes:
              "Clique no card para filtrar exatamente os atendimentos que possuem algum motivo de risco Azure.",
          }}
          onClick={() =>
            filterByCard(
              "",
              "azure"
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
                Origem do risco
              </InputLabel>

              <Select
                value={riskFilter}
                label="Origem do risco"
                onChange={(event) =>
                  setRiskFilter(
                    event.target.value as
                      | ""
                      | "azure"
                  )
                }
              >
                <MenuItem value="">
                  Todos
                </MenuItem>

                <MenuItem value="azure">
                  Risco Azure
                </MenuItem>
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
                Clique em uma linha para abrir os detalhes do atendimento e do desenvolvimento
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
                    Desenvolvimento
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
                      <AzureAttentionSummary
                        ticket={ticket}
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
                    colSpan={9}
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
                selectedTicket.deliveredVersion ||
                selectedTicket.azureWorkItem) && (
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

                  {selectedTicket.azureWorkItem ? (
                    <>
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
                          value={`#${selectedTicket.azureWorkItem.id}`}
                        />

                        <TicketField
                          label="Tipo"
                          value={
                            selectedTicket.azureWorkItem.workItemType
                          }
                        />

                        <TicketField
                          label="Estado Azure"
                          value={
                            selectedTicket.azureWorkItem.state
                          }
                        />

                        <TicketField
                          label="Responsável Azure"
                          value={
                            selectedTicket.azureWorkItem.assignedToName
                          }
                        />

                        <TicketField
                          label="Criticidade"
                          value={
                            selectedTicket.azureWorkItem.criticality
                          }
                        />

                        <TicketField
                          label="Versão"
                          value={
                            selectedTicket.azureWorkItem.deliveredVersion ??
                            selectedTicket.deliveredVersion
                          }
                        />

                        <TicketField
                          label="Módulo"
                          value={
                            selectedTicket.azureWorkItem.module
                          }
                        />

                        <TicketField
                          label="Processo"
                          value={
                            selectedTicket.azureWorkItem.process
                          }
                        />

                        <TicketField
                          label="Última movimentação"
                          value={formatDateTime(
                            selectedTicket.azureWorkItem.stateChangedAt ??
                            selectedTicket.azureWorkItem.azureChangedAt
                          )}
                        />

                        <TicketField
                          label="Movidesk informado na Task"
                          value={
                            selectedTicket.azureWorkItem.movideskTicket
                              ? `#${selectedTicket.azureWorkItem.movideskTicket}`
                              : null
                          }
                        />
                      </Box>

                      <Stack
                        direction="row"
                        spacing={1}
                        useFlexGap
                        sx={{
                          mt: 1.5,
                          flexWrap: "wrap",
                        }}
                      >
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() =>
                            navigate(
                              `${
                                selectedTicket.azureWorkItem?.workItemType ===
                                "Evolução"
                                  ? "/evolucoes"
                                  : "/correcoes"
                              }?task=${selectedTicket.azureWorkItem?.id}`
                            )
                          }
                        >
                          Ver no TechLead Hub
                        </Button>
                      </Stack>
                    </>
                  ) : (
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

                      <TicketField
                        label="Integração Azure"
                        value={
                          selectedTicket.taskNumber
                            ? "Task ainda não sincronizada"
                            : null
                        }
                      />
                    </Box>
                  )}
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
   RESUMO AZURE NA LISTAGEM
===================================================== */

function AzureAttentionSummary({
  ticket,
}: {
  ticket: AttentionTicket;
}) {
  const azure =
    ticket.azureWorkItem;

  if (azure) {
    return (
      <Box
        sx={{
          minWidth: 130,
          maxWidth: 210,
        }}
      >
        <Stack
          direction="row"
          spacing={0.5}
          useFlexGap
          sx={{
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontWeight: 800,
            }}
          >
            #{azure.id}
          </Typography>

          {azure.blockedProcess && (
            <Chip
              size="small"
              label="Bloqueada"
              color="error"
              variant="outlined"
              sx={{
                height: 20,
                fontSize: "0.65rem",
              }}
            />
          )}

          {azure.prioritized && (
            <Chip
              size="small"
              label="Priorizada"
              variant="outlined"
              sx={{
                height: 20,
                fontSize: "0.65rem",
              }}
            />
          )}
        </Stack>

        <Typography
          variant="caption"
          sx={{
            display: "block",
            mt: 0.2,
            fontWeight: 700,
            color: aliareColors.greenDark,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={azure.state}
        >
          {azure.state}
        </Typography>

        {(azure.assignedToName ||
          azure.criticality) && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              mt: 0.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={[
              azure.assignedToName,
              azure.criticality,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            {[
              azure.assignedToName,
              azure.criticality,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Typography>
        )}
      </Box>
    );
  }

  if (ticket.taskNumber) {
    return (
      <Typography
        variant="caption"
        color="text.secondary"
      >
        #{ticket.taskNumber}
        <br />
        Não sincronizada
      </Typography>
    );
  }

  return (
    <Typography
      variant="caption"
      color="text.secondary"
    >
      —
    </Typography>
  );
}

/* =====================================================
   CARD DE INDICADOR
===================================================== */

function IndicatorCard({
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
  info: CardInfoDefinition;

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
      onKeyDown={(event) => {
        if (
          onClick &&
          (
            event.key ===
              "Enter" ||
            event.key ===
              " "
          )
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

        cursor:
          onClick
            ? "pointer"
            : "default",

        transition:
          "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",

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

        ...(onClick && {
          "&:hover": {
            transform:
              "translateY(-2px)",

            borderColor:
              accentColor,

            boxShadow:
              "0 8px 24px rgba(16,24,40,0.08)",
          },

          "&:focus-visible": {
            outline:
              `2px solid ${accentColor}`,

            outlineOffset:
              "2px",
          },
        }),
      }}
    >
      <CardContent
        sx={{
          p: {
            xs:
              1.6,
            md:
              1.8,
          },

          "&:last-child": {
            pb: {
              xs:
                1.6,
              md:
                1.8,
            },
          },
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems:
              "center",

            justifyContent:
              "space-between",

            gap:
              1,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight:
                800,

              color:
                "text.primary",
            }}
          >
            {title}
          </Typography>

          <CardInfo
            definition={info}
          />
        </Stack>

        <Typography
          sx={{
            fontWeight:
              800,

            mt:
              0.6,

            letterSpacing:
              "-0.025em",

            fontSize: {
              xs:
                "1.75rem",
              md:
                "1.95rem",
              xl:
                "2.1rem",
            },

            lineHeight:
              1.05,
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
              0.75,

            minHeight:
              18,
          }}
        >
          {description}
        </Typography>

        {onClick && (
          <Typography
            variant="caption"
            sx={{
              display:
                "inline-block",

              mt:
                0.85,

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

/* =====================================================
   INFORMAÇÃO DO CARD
===================================================== */

function CardInfo({
  definition,
}: {
  definition:
    CardInfoDefinition;
}) {
  const [
    anchorEl,
    setAnchorEl,
  ] =
    useState<HTMLElement | null>(
      null
    );

  const open =
    Boolean(anchorEl);

  return (
    <>
      <IconButton
        size="small"
        aria-label={`Informações sobre ${definition.title}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Como é calculado: ${definition.title}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();

          setAnchorEl(
            event.currentTarget
          );
        }}
        onKeyDown={(event) =>
          event.stopPropagation()
        }
        sx={{
          p:
            0.3,

          color:
            "text.secondary",

          "&:hover": {
            color:
              aliareColors.greenDark,

            backgroundColor:
              "rgba(24,199,122,0.08)",
          },
        }}
      >
        <InfoOutlined
          sx={{
            fontSize:
              16,
          }}
        />
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() =>
          setAnchorEl(null)
        }
        anchorOrigin={{
          vertical:
            "bottom",
          horizontal:
            "left",
        }}
        transformOrigin={{
          vertical:
            "top",
          horizontal:
            "left",
        }}
        slotProps={{
          paper: {
            onClick: (
              event:
                MouseEvent<HTMLElement>
            ) =>
              event.stopPropagation(),

            sx: {
              width: {
                xs:
                  320,
                sm:
                  390,
              },

              maxWidth:
                "calc(100vw - 32px)",

              mt:
                0.75,

              p:
                2,

              borderRadius:
                2,

              border:
                "1px solid",

              borderColor:
                "divider",

              boxShadow:
                "0 14px 40px rgba(16,24,40,0.14)",
            },
          },
        }}
      >
        <Stack
          spacing={
            1.2
          }
        >
          <Box>
            <Typography
              sx={{
                fontWeight:
                  850,
              }}
            >
              {definition.title}
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt:
                  0.4,

                lineHeight:
                  1.55,
              }}
            >
              {definition.summary}
            </Typography>
          </Box>

          <Divider />

          <CardInfoLine
            label="Como é calculado"
            value={
              definition.calculation
            }
          />

          <CardInfoLine
            label="Fonte"
            value={
              definition.source
            }
          />

          <CardInfoLine
            label="Campo de referência"
            value={
              definition.reference
            }
          />

          <CardInfoLine
            label="Regra de período"
            value={
              definition.periodRule
            }
          />

          {definition.notes && (
            <Box
              sx={{
                p:
                  1.1,

                borderRadius:
                  1.5,

                backgroundColor:
                  "rgba(24,199,122,0.055)",

                border:
                  "1px solid rgba(24,199,122,0.16)",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight:
                    800,

                  color:
                    aliareColors.greenDark,
                }}
              >
                Observação
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display:
                    "block",

                  mt:
                    0.25,

                  lineHeight:
                    1.5,
                }}
              >
                {definition.notes}
              </Typography>
            </Box>
          )}
        </Stack>
      </Popover>
    </>
  );
}

function CardInfoLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          fontWeight:
            700,
        }}
      >
        {label}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          mt:
            0.15,

          lineHeight:
            1.5,
        }}
      >
        {value}
      </Typography>
    </Box>
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

    firstResponseDate:
      ticket.firstResponseDate,

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

function isAzureAttentionReason(
  reason: string
) {
  return (
    reason.includes("Task Azure") ||
    reason.includes("Task priorizada") ||
    reason.includes("Task ainda não sincronizada")
  );
}

function resolveCombinedAttentionLevel(
  serviceLevel: ServiceLevelResult,
  slaMeasured: boolean,
  reasons: string[]
): AttentionLevel {
  const normalizedReasons =
    reasons.map(normalize);

  const hasOverdue =
    normalizedReasons.some(
      (reason) =>
        reason.includes("vencida") ||
        reason.includes("vencido")
    );

  if (hasOverdue) {
    return "vencido";
  }

  const hasCriticalAzureRisk =
    normalizedReasons.some(
      (reason) =>
        reason.includes("processo bloqueado") ||
        reason.includes("criticidade critica") ||
        reason.includes("criticidade alta") ||
        reason.includes("concluida com atendimento ainda aberto") ||
        reason.includes("priorizada sem movimentacao")
    );

  if (hasCriticalAzureRisk) {
    return "critico";
  }

  if (slaMeasured) {
    return resolveAttentionLevel(
      serviceLevel
    );
  }

  return "atencao";
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

function toValidDate(
  value:
    | string
    | Date
    | null
    | undefined
) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
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