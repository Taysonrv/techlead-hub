import { KpiGrid } from "../components/KpiGrid";
import { subscribeTicketSnapshotRefresh } from "../services/ticketSnapshot";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
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



import { useNavigate } from "react-router-dom";

import { api } from "../services/api";
import { isOperationallyOpen } from "../utils/operationalMetrics";
import { useFilters } from "../context/FiltersContext";
import { PeriodFilter } from "../components/PeriodFilter";
import { PageHeader } from "../components/PageHeader";
import { AsyncState } from "../components/AsyncState";
import { ContentState } from "../components/ContentState";
import { StatusPill } from "../components/StatusPill";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { KpiCard as ExecutiveKpiCard } from "../components/KpiCard";
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
  stoppedWorkingMinutes?: number | null;

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

type RecurrenceCandidate = { service:string; category:string; cause:string; cases:number; clients:number; tickets:number[]; priority:"high"|"medium"|"review"; score:number; recent30:number; trendPct:number; topTerms:string[] };
type RecurrenceResponse = { items: RecurrenceCandidate[]; summary:{total:number;high:number;rising:number;multiClient:number;anomalies:number}; anomalies?:Array<{service:string;reason:string;severity:"critical"|"warning";score:number;trendPct:number;recent30:number;tickets:number[]}> };

type CardInfoDefinition = {
  title: string;
  summary: string;
  calculation: string;
  source: string;
  reference: string;
  periodRule: string;
  notes?: string;
};

type ClosureAudit = {
  client: string; checkedTickets: number; enrichedTickets: number; coverageLimited: boolean;
  openWithProduct: number; openWithSupport: number; authorizedOpenWithProduct: number; authorizedOpenWithSupport: number;
  totalCandidates: number; openCandidates: number; closedCandidates: number; disclaimer: string;
  items: Array<{ ticketId: number; subject: string; client?: string | null; status: string; stillOpen: boolean;
    area: "Produto" | "Suporte" | "Outros"; owner: string | null; ownerTeam: string | null; hasClosureRequest: boolean; hasActions?: boolean;
    actionDate: string | null; actionAuthor: string | null; evidence: string; actionId: number }>;
};

export function Attention() {
  const navigate =
    useNavigate();

  const [closureAudit, setClosureAudit] = useState<ClosureAudit | null>(null);
  const [closureBusy, setClosureBusy] = useState(false);
  const [closureClient, setClosureClient] = useState("BOM JESUS COOPERATIVA AGROINDUSTRIAL - LAPA-PR");
  const [closureClients, setClosureClients] = useState<string[]>([]);
  const [selectedClosure, setSelectedClosure] = useState<ClosureAudit["items"][number] | null>(null);
  const [closureMetric, setClosureMetric] = useState<string | null>(null);
  const [closureError, setClosureError] = useState<string | null>(null);
  const [showAllClosure, setShowAllClosure] = useState(false);
  const [closureArea, setClosureArea] = useState<"Todos" | "Produto" | "Suporte" | "Outros">("Todos");
  const [closureAuthorization, setClosureAuthorization] = useState<"all" | "identified" | "missing">("identified");

  const [tickets, setTickets] =
    useState<Ticket[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);
  const loadRequestRef = useRef<AbortController | null>(null);

  const [level, setLevel] = useState<AttentionLevel[]>([]);

  const [owner, setOwner] = useState<string[]>([]);

  const [client, setClient] = useState<string[]>([]);

  const [riskFilter, setRiskFilter] =
    useState<"" | "azure">("");

  const [page, setPage] =
    useState(0);

  const [rowsPerPage, setRowsPerPage] =
    useState(10);

  const [selectedTicket, setSelectedTicket] =
    useState<AttentionTicket | null>(null);

  const [copyMessage, setCopyMessage] =
    useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceResponse | null>(null);

  const {
    effectiveStartDate,
    effectiveEndDate,
  } = useFilters();

  const displayedClosureItems = useMemo(
    () => (closureAudit?.items ?? []).filter((item) =>
      (showAllClosure || item.stillOpen) &&
      (closureArea === "Todos" || item.area === closureArea) &&
      (closureAuthorization === "all" || (closureAuthorization === "identified" ? item.hasClosureRequest : !item.hasClosureRequest))
    ),
    [closureAudit, showAllClosure, closureArea, closureAuthorization],
  );

  const closureMetricItems = useMemo(() => {
    if (!closureAudit || !closureMetric) return [];
    return closureAudit.items.filter((item) => {
      if (closureMetric === "openCandidates") return item.stillOpen && item.hasClosureRequest;
      if (closureMetric === "closedCandidates") return !item.stillOpen && item.hasClosureRequest;
      if (closureMetric === "enrichedTickets") return item.hasActions === true;
      if (closureMetric === "product") return item.stillOpen && item.area === "Produto";
      if (closureMetric === "support") return item.stillOpen && item.area === "Suporte";
      return false;
    });
  }, [closureAudit, closureMetric]);

  function openClosureMetric(key: string) {
    setClosureMetric(key);
    if (key === "product") { setClosureArea("Produto"); setClosureAuthorization("all"); setShowAllClosure(false); }
    else if (key === "support") { setClosureArea("Suporte"); setClosureAuthorization("all"); setShowAllClosure(false); }
    else if (key === "closedCandidates") { setClosureArea("Todos"); setClosureAuthorization("identified"); setShowAllClosure(true); }
    else if (key === "enrichedTickets") { setClosureArea("Todos"); setClosureAuthorization("all"); setShowAllClosure(true); }
    else { setClosureArea("Todos"); setClosureAuthorization("identified"); setShowAllClosure(false); }
  }

  function exportClosureList(rowsOverride?: ClosureAudit["items"]) {
    if (!closureAudit) return;
    const columns = ["Ticket", "Assunto", "Equipe", "Responsável", "Situação", "Ainda aberto", "Indício de autorização", "Autor", "Data da interação", "Evidência"];
    const escapeCsv = (value: unknown) => {
      const raw = String(value ?? "");
      const safe = /^[\t\r\n ]*[=+@-]/.test(raw) ? "'" + raw : raw;
      return '"' + safe.replace(/"/g, '""') + '"';
    };
    const records = (rowsOverride ?? displayedClosureItems).map((item) => [
      item.ticketId, item.subject, item.ownerTeam ?? item.area, item.owner ?? "", item.status, item.stillOpen ? "Sim" : "Não", item.hasClosureRequest ? "Sim - verificar autoria" : "Não identificado",
      item.actionAuthor ?? "", item.actionDate ? new Date(item.actionDate).toLocaleString("pt-BR") : "", item.evidence,
    ].map(escapeCsv).join(";"));
    const csv = "\uFEFF" + [columns.map(escapeCsv).join(";"), ...records].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `bom-jesus-${closureArea.toLowerCase()}-${closureAuthorization}-${showAllClosure ? "todos-status" : "abertos"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    let active = true;
    void api.get<{ clients: string[] }>("/movidesk/closure-requests/clients")
      .then(({ data }) => { if (active) setClosureClients(data.clients); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function loadClosureAudit() {
    setClosureBusy(true);
    setClosureError(null);
    try {
      const { data } = await api.get<ClosureAudit>("/movidesk/closure-requests", { params: { client: closureClient } });
      setClosureAudit(data);
      setClosureMetric(null);
      setSelectedClosure(null);
    } catch {
      setClosureError("Não foi possível consultar as interações. Verifique as permissões e a cobertura da sincronização Movidesk.");
    } finally {
      setClosureBusy(false);
    }
  }

  /* =====================================================
     CARREGAMENTO
  ===================================================== */

  useEffect(() => {
    const controller = new AbortController();
    loadRequestRef.current?.abort();
    loadRequestRef.current = controller;

    let refreshing = false;
    async function loadTickets(initial = false) {
      if (refreshing) return;
      refreshing = true;
      try {
        if (initial) setLoading(true);
        setError(null);
        const response = await api.get<Ticket[]>("/dashboard/pending-tickets", { signal: controller.signal });
        if (!controller.signal.aborted) setTickets(response.data);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Erro ao carregar pontos de atenção:", err);
        setError("Não foi possível carregar os pontos de atenção.");
      } finally {
        refreshing = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadTickets(true);
    const unsubscribe = subscribeTicketSnapshotRefresh(() => { void loadTickets(); });
    api.get<RecurrenceResponse>("/known-problems/candidates").then(r => setRecurrence(r.data)).catch(() => setRecurrence(null));
    return () => { unsubscribe(); controller.abort(); };
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
          const matchesOwner = !owner.length || Boolean(ticket.owner && owner.includes(ticket.owner));
          const matchesClient = !client.length || Boolean(ticket.client && client.includes(ticket.client));

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
          const matchesLevel = !level.length || level.includes(ticket.level);
          const matchesOwner = !owner.length || Boolean(ticket.owner && owner.includes(ticket.owner));
          const matchesClient = !client.length || Boolean(ticket.client && client.includes(ticket.client));

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

  useEffect(() => {
    setPage(0);
  }, [level, owner, client, riskFilter, effectiveStartDate, effectiveEndDate]);

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(filteredTickets.length / rowsPerPage) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [filteredTickets.length, page, rowsPerPage]);

  const paginatedTickets = useMemo(
    () => filteredTickets.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [filteredTickets, page, rowsPerPage],
  );

  function clearFilters() {
    setLevel([]);
    setOwner([]);
    setClient([]);
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
    setLevel(nextLevel ? [nextLevel] : []);

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

  if (loading || (error && tickets.length === 0)) {
    return (
      <AsyncState
        status={loading ? "loading" : "error"}
        data={tickets}
        error={error}
        loading={<ContentState kind="loading" title="Carregando pontos de atenção" minHeight={360} />}
      >
        {() => null}
      </AsyncState>
    );
  }

  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <>
      {/* CABEÇALHO */}

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      <PageHeader
        eyebrow="Gestão de risco"
        title="Pontos de Atenção"
        description="Situações que exigem acompanhamento da liderança"
        meta={<>{periodTickets.length} ticket(s) analisado(s) no período</>}
        action={<PeriodFilter />}
      />

      <Card variant="outlined" sx={{ mb: 2, borderRadius: 3, bgcolor: "background.paper", overflow: "hidden" }}>
        <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: 2.5 } }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "center" }, justifyContent: "space-between", mb: 2 }}>
            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 750, letterSpacing: 1 }}>INTELIGÊNCIA OPERACIONAL · CARTEIRA DE CLIENTES</Typography>
              <Typography variant="h6" sx={{ fontWeight: 850, letterSpacing: "-.02em" }}>Solicitações de baixa e cancelamento</Typography>
              <Typography variant="body2" color="text.secondary">Identifique pedidos de encerramento e acompanhe pendências por equipe responsável.</Typography>
            </Box>
            <Button variant="contained" disabled={closureBusy} onClick={() => void loadClosureAudit()} sx={{ flexShrink: 0, minHeight: 40 }}>
              {closureBusy ? "Analisando..." : "Atualizar análise"}
            </Button>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 300 }, maxWidth: 460 }}>
              <InputLabel>Cliente da carteira</InputLabel>
              <Select value={closureClient} label="Cliente da carteira" onChange={(event) => { setClosureClient(event.target.value); setClosureAudit(null); setClosureMetric(null); setSelectedClosure(null); }}>
                <MenuItem value="__all__">Toda a carteira SIMER</MenuItem>
                {closureClients.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">Carteira oficial SIMER. Selecione o cliente e clique em Atualizar análise.</Typography>
          </Stack>
          {closureError && <Alert severity="warning" sx={{ mb: 1.5 }}>{closureError}</Alert>}
          {closureAudit && (
            <>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", lg: "repeat(5, minmax(0, 1fr))" }, gap: 1.25, mb: 2 }}>
                {[
                  { key: "openCandidates", label: "Abertos com indício", value: closureAudit.openCandidates, detail: "Pendentes de validação", tone: "warning.main" },
                  { key: "closedCandidates", label: "Já concluídos", value: closureAudit.closedCandidates, detail: "Resolvidos ou fechados", tone: "success.main" },
                  { key: "enrichedTickets", label: "Histórico disponível", value: closureAudit.enrichedTickets, detail: `De ${closureAudit.checkedTickets} tickets`, tone: "info.main" },
                  { key: "product", label: "Produto · abertos", value: closureAudit.openWithProduct, detail: `${closureAudit.authorizedOpenWithProduct} com indício`, tone: "primary.main" },
                  { key: "support", label: "Suporte · abertos", value: closureAudit.openWithSupport, detail: `${closureAudit.authorizedOpenWithSupport} com indício`, tone: "primary.main" },
                ].map((metric) => (
                  <Box key={metric.key} role="button" tabIndex={0} onClick={() => openClosureMetric(metric.key)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openClosureMetric(metric.key); } }} sx={{ border: "1px solid", borderColor: closureMetric === metric.key ? "primary.main" : "divider", borderRadius: 2.25, px: 1.75, py: 1.4, bgcolor: "background.paper", minWidth: 0, cursor: "pointer", transition: "border-color .15s, box-shadow .15s", boxShadow: closureMetric === metric.key ? 2 : 0, "&:hover": { borderColor: "primary.main", boxShadow: 2 }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 750, display: "block" }}>{metric.label}</Typography>
                    <Typography sx={{ fontSize: "1.65rem", fontWeight: 850, lineHeight: 1.4, color: metric.tone, fontVariantNumeric: "tabular-nums" }}>{metric.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{metric.detail}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5, p: 1.5, mb: 1.5, bgcolor: "background.default" }}>
                <Stack direction={{ xs: "column", lg: "row" }} spacing={1.25} sx={{ alignItems: { lg: "center" }, justifyContent: "space-between" }}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ flexWrap: "wrap" }}>
                    <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 190 } }}>
                      <InputLabel>Equipe atual</InputLabel>
                      <Select value={closureArea} label="Equipe atual" onChange={(event) => setClosureArea(event.target.value as typeof closureArea)}>
                        <MenuItem value="Todos">Todas as equipes</MenuItem>
                        <MenuItem value="Produto">Produto</MenuItem>
                        <MenuItem value="Suporte">Suporte</MenuItem>
                        <MenuItem value="Outros">Outras equipes</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 230 } }}>
                      <InputLabel>Pedido de encerramento</InputLabel>
                      <Select value={closureAuthorization} label="Pedido de encerramento" onChange={(event) => setClosureAuthorization(event.target.value as typeof closureAuthorization)}>
                        <MenuItem value="identified">Com indício</MenuItem>
                        <MenuItem value="missing">Sem indício identificado</MenuItem>
                        <MenuItem value="all">Todos</MenuItem>
                      </Select>
                    </FormControl>
                    <Button size="small" variant="text" onClick={() => setShowAllClosure((v) => !v)}>
                      {showAllClosure ? "Somente abertos" : "Incluir fechados"}
                    </Button>
                  </Stack>
                  <Button size="small" variant="outlined" disabled={!displayedClosureItems.length} onClick={() => exportClosureList()} sx={{ flexShrink: 0 }}>Exportar CSV</Button>
                </Stack>
              </Box>
              <Alert severity={closureAudit.enrichedTickets < closureAudit.checkedTickets || closureAudit.coverageLimited ? "warning" : "info"}
                sx={{ mb: 1.5, py: .25, border: "1px solid", borderColor: "divider", "& .MuiAlert-message": { color: "text.secondary", fontSize: ".8rem" } }}>
                <Typography component="span" variant="body2" sx={{ fontWeight: 750 }}>Leitura analítica do histórico. </Typography>
                Correspondências textuais exigem validação da autoria e do contexto. {closureAudit.coverageLimited ? "Limite de consulta atingido. " : ""}
                Cobertura: {closureAudit.enrichedTickets} de {closureAudit.checkedTickets} tickets.
              </Alert>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                <Typography sx={{ fontWeight: 750, fontSize: ".9rem" }}>Atendimentos identificados</Typography>
                <Typography variant="caption" color="text.secondary">{displayedClosureItems.length} resultado(s) · até 200 visíveis na tabela · exportação completa do filtro</Typography>
              </Stack>
              <TableContainer sx={{ maxHeight: 500, overflowX: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2.25, bgcolor: "background.paper",
                "& .MuiTableCell-head": { backgroundColor: "background.paper", color: "text.primary", opacity: 1, fontWeight: 800, fontSize: ".73rem", letterSpacing: ".025em", whiteSpace: "nowrap", borderColor: "divider" },
                "& .MuiTableCell-body": { color: "text.primary", borderColor: "divider", py: 1.35 },
                "& .MuiTableRow-root:hover": { bgcolor: "action.hover" } }}>
                <Table size="small" stickyHeader sx={{ minWidth: 940 }}>
                  <TableHead><TableRow>
                    <TableCell sx={{ width: 210 }}>TICKET</TableCell><TableCell sx={{ width: 200 }}>EQUIPE / RESPONSÁVEL</TableCell><TableCell>INDÍCIO</TableCell>
                    <TableCell>SITUAÇÃO</TableCell><TableCell sx={{ width: 180 }}>AUTOR / DATA</TableCell><TableCell>EVIDÊNCIA</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {displayedClosureItems.slice(0, 200).map((item) => (
                      <TableRow key={item.ticketId} hover sx={{ cursor: "pointer" }} onClick={() => setSelectedClosure(item)}>
                        <TableCell>
                          <Typography sx={{ color: "primary.main", fontWeight: 850, fontSize: ".88rem" }}>#{item.ticketId}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.5 }} title={item.subject}>{item.subject}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 650, lineHeight: 1.35 }}>{item.ownerTeam || item.area}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{item.owner || "Sem responsável"}</Typography>
                        </TableCell>
                        <TableCell><StatusPill tone={item.hasClosureRequest ? "warning" : "neutral"} label={item.hasClosureRequest ? "Com indício" : "Sem indício"} /></TableCell>
                        <TableCell><Chip size="small" variant="outlined" color={item.stillOpen ? "warning" : "success"} label={item.status} sx={{ fontWeight: 650 }} /></TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontWeight: 650, display: "block" }}>{item.actionAuthor || "Não identificado"}</Typography>
                          <Typography variant="caption" color="text.secondary">{item.actionDate ? new Date(item.actionDate).toLocaleDateString("pt-BR") : "—"}</Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 280 }}>
                          <Typography variant="caption" title={item.evidence} sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.55 }} color="text.secondary">{item.evidence || "Sem evidência identificada"}</Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </CardContent>
      </Card>

      {recurrence && recurrence.items.length > 0 && (
        <Card variant="outlined" sx={{ mb: 1.5, borderColor: "rgba(245,158,11,.28)", overflow: "hidden" }}>
          <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Stack direction={{ xs:"column", md:"row" }} spacing={1} sx={{ justifyContent:"space-between", alignItems:{md:"center"} }}>
              <Box>
                <Typography sx={{ fontWeight: 850 }}>Sinais de recorrência operacional</Typography>
                <Typography variant="body2" color="text.secondary">
                  {recurrence.summary.high} alta(s) · {recurrence.summary.rising} em crescimento · {recurrence.summary.multiClient} atingindo múltiplos clientes · {recurrence.summary.anomalies} anomalia(s)
                </Typography>
              </Box>
              <Button size="small" variant="outlined" onClick={() => navigate("/problemas-conhecidos")}>Revisar recorrências</Button>
            </Stack>
            <Stack direction="row" spacing={.7} useFlexGap sx={{ mt:1, flexWrap:"wrap", "& .MuiChip-root": { maxWidth: { xs: "100%", md: 360 } }, "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }}>
              {recurrence.items.slice(0,4).map((item,index) => <Chip key={`${item.service}|${item.cause}|${item.score}|${index}`} color={item.priority==="high"?"error":"warning"} variant="outlined" label={`${item.service} · ${item.cases} casos · score ${item.score}`} onClick={() => navigate(`/problemas-conhecidos?q=${encodeURIComponent(item.service)}`)} />)}
            </Stack>
            {recurrence.anomalies?.[0] && <Alert severity={recurrence.anomalies[0].severity==="critical"?"error":"warning"} variant="outlined" sx={{mt:1}}>
              <strong>Anomalia detectada:</strong> {recurrence.anomalies[0].service} — {recurrence.anomalies[0].reason}.
            </Alert>}
          </CardContent>
        </Card>
      )}

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

      <KpiGrid sx={{mb: 2}}>
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
      </KpiGrid>

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
            "&:last-child": { pb: 1.5 },
          }}
        >
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 1.5, justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Typography sx={{ fontWeight: 850 }}>Recorte de atenção</Typography>
              <Typography variant="caption" color="text.secondary">Combine prazo, responsável e cliente para investigar somente os riscos relevantes.</Typography>
            </Box>
            {(level.length > 0 || owner.length > 0 || client.length > 0 || riskFilter) && <Chip size="small" variant="outlined" label="Filtros ativos" />}
          </Stack>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(2, minmax(0, 1fr))",
                xl: "repeat(3, minmax(0, 1fr))",
              },
              gap: 1.25,
              alignItems: "center",
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
              <InputLabel shrink id="attention-select-1-label">
                Situação do prazo
              </InputLabel><Select notched labelId="attention-select-1-label" inputProps={{ id: "attention-select-1", "aria-labelledby": "attention-select-1-label" }} multiple displayEmpty value={level} label="Situação do prazo"
                onChange={(event) => { const next = typeof event.target.value === "string" ? event.target.value.split(",") : event.target.value as string[]; setLevel((next.includes("__all__") ? ["vencido","critico","atencao"] : next.filter((item) => item !== "__all__")) as AttentionLevel[]); }}
                renderValue={(selected) => !selected.length ? "Todos" : selected.length === 1 ? selected[0] : `${selected.length} selecionados`}>
                <MenuItem value="__all__"><Checkbox size="small" checked={level.length === 3} indeterminate={level.length > 0 && level.length < 3} />Todos</MenuItem>
                {[["vencido","Vencido"],["critico","Crítico"],["atencao","Atenção"]].map(([key,label]) => <MenuItem key={key} value={key}><Checkbox size="small" checked={level.includes(key as AttentionLevel)} />{label}</MenuItem>)}
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
              <InputLabel shrink id="attention-select-2-label">
                Responsável
              </InputLabel><Select notched labelId="attention-select-2-label" inputProps={{ id: "attention-select-2", "aria-labelledby": "attention-select-2-label" }} multiple displayEmpty value={owner} label="Responsável"
                onChange={(event) => { const next = typeof event.target.value === "string" ? event.target.value.split(",") : event.target.value as string[]; setOwner(next.includes("__all__") ? [...owners] : next.filter((item) => item !== "__all__")); }}
                renderValue={(selected) => !selected.length ? "Todos" : selected.length === 1 ? selected[0] : `${selected.length} selecionados`}>
                <MenuItem value="__all__"><Checkbox size="small" checked={owners.length > 0 && owner.length === owners.length} indeterminate={owner.length > 0 && owner.length < owners.length} />Todos</MenuItem>
                {owners.map((item) => <MenuItem key={item} value={item}><Checkbox size="small" checked={owner.includes(item)} />{item}</MenuItem>)}
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
              <InputLabel shrink id="attention-select-3-label">
                Cliente
              </InputLabel><Select notched labelId="attention-select-3-label" inputProps={{ id: "attention-select-3", "aria-labelledby": "attention-select-3-label" }} multiple displayEmpty value={client} label="Cliente"
                onChange={(event) => { const next = typeof event.target.value === "string" ? event.target.value.split(",") : event.target.value as string[]; setClient(next.includes("__all__") ? [...clients] : next.filter((item) => item !== "__all__")); }}
                renderValue={(selected) => !selected.length ? "Todos" : selected.length === 1 ? selected[0] : `${selected.length} selecionados`}>
                <MenuItem value="__all__"><Checkbox size="small" checked={clients.length > 0 && client.length === clients.length} indeterminate={client.length > 0 && client.length < clients.length} />Todos</MenuItem>
                {clients.map((item) => <MenuItem key={item} value={item}><Checkbox size="small" checked={client.includes(item)} />{item}</MenuItem>)}
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
              <InputLabel shrink id="attention-select-4-label">
                Origem do risco
              </InputLabel><Select notched labelId="attention-select-4-label" inputProps={{ id: "attention-select-4", "aria-labelledby": "attention-select-4-label" }}
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
          </Box>
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

        <TableContainer sx={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
          <Table size="small" sx={{
            width: "100%",
            tableLayout: "fixed",
            "& th:nth-of-type(1)": { width: "8%" },
            "& th:nth-of-type(2)": { width: "10%" },
            "& th:nth-of-type(3)": { width: "18%" },
            "& th:nth-of-type(4)": { width: "16%" },
            "& th:nth-of-type(5)": { width: "15%" },
            "& th:nth-of-type(6)": { width: "9%" },
            "& th:nth-of-type(7)": { width: "11%" },
            "& th:nth-of-type(8)": { width: "7%" },
            "& th:nth-of-type(9)": { width: "6%" },
            "& .MuiTableCell-root": { minWidth: 0, px: { xs: 0.65, sm: 0.9 }, py: 1.2, verticalAlign: "top", overflowWrap: "anywhere", wordBreak: "normal" },
            "& .MuiChip-root": { maxWidth: "100%", height: "auto", minHeight: 24 },
            "& .MuiChip-label": { whiteSpace: "normal", display: "block", overflowWrap: "anywhere", py: 0.25 },
          }}>
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

                    fontWeight:
                      800,

                    letterSpacing:
                      "0.02em",

                    whiteSpace: "normal",

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
              {paginatedTickets.map(
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
                            "action.hover",
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
                          flexWrap: "wrap",
                          minWidth: 0,
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
                            aria-label="Copiar número do ticket"
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
                          overflowWrap: "anywhere",
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

        <TablePagination
          component="div"
          count={filteredTickets.length}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(Number(event.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage="Itens por página:"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          showFirstButton
          showLastButton
        />
      </Card>

      <Drawer anchor="right" open={Boolean(closureMetric)} onClose={() => setClosureMetric(null)} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
        <Box sx={{ width: { xs: "100vw", sm: 560 }, maxWidth: "100vw", p: 2.5, bgcolor: "background.paper", minHeight: "100%", color: "text.primary" }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
            <Box>
              <Typography variant="overline" color="text.secondary">ATENDIMENTOS · DETALHAMENTO</Typography>
              <Typography variant="h6" sx={{ fontWeight: 850 }}>{({ openCandidates: "Abertos com indício", closedCandidates: "Já concluídos", enrichedTickets: "Histórico disponível", product: "Produto · abertos", support: "Suporte · abertos" } as Record<string, string>)[closureMetric ?? ""]}</Typography>
              <Typography variant="body2" color="text.secondary">{closureMetricItems.length} atendimento(s) no recorte</Typography>
            </Box>
            <Button onClick={() => setClosureMetric(null)}>Fechar</Button>
          </Stack>
          <Button variant="outlined" size="small" sx={{ mb: 2 }} onClick={() => exportClosureList(closureMetricItems)}>Exportar lista filtrada</Button>
          <Stack spacing={1}>
            {closureMetricItems.slice(0, 200).map((item) => (
              <Box key={item.ticketId} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
                  <Typography sx={{ color: "primary.main", fontWeight: 800 }}>#{item.ticketId}</Typography>
                  <Chip size="small" variant="outlined" color={item.stillOpen ? "warning" : "success"} label={item.status} />
                </Stack>
                <Typography variant="body2" sx={{ fontWeight: 650, my: .5 }}>{item.subject}</Typography>
                <Typography variant="caption" color="text.secondary">{item.ownerTeam || item.area} · {item.owner || "Sem responsável"}</Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: "wrap" }}>
                  <Button size="small" onClick={() => { setClosureMetric(null); setSelectedClosure(item); }}>Ver evidência</Button>
                  <Button size="small" onClick={() => navigate(`/operacao/tickets?movidesk=${item.ticketId}`)}>Detalhe completo</Button>
                  <Button size="small" onClick={() => navigate(`/investigacao?q=${item.ticketId}`)}>Investigar</Button>
                  <Button size="small" onClick={() => void navigator.clipboard.writeText(`#${item.ticketId} - ${item.subject}`)}>Copiar</Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>
      </Drawer>

      <Drawer anchor="right" open={Boolean(selectedClosure)} onClose={() => setSelectedClosure(null)}
        slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
        <Box sx={{ width: { xs: "100vw", sm: 540 }, maxWidth: "100vw", p: 2.5, color: "text.primary", bgcolor: "background.paper", minHeight: "100%" }}>
          {selectedClosure && (
            <Stack spacing={2.25}>
              <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid", borderColor: "divider", pb: 1.5 }}>
                <Box>
                  <Typography variant="overline" color="text.secondary">Solicitação de encerramento · Cliente</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 850, letterSpacing: "-.02em" }}>Ticket #{selectedClosure.ticketId}</Typography>
                </Box>
                <Button size="small" onClick={() => setSelectedClosure(null)}>Fechar</Button>
              </Stack>
              <Typography sx={{ fontWeight: 750, fontSize: "1.05rem", lineHeight: 1.4 }}>{selectedClosure.subject}</Typography>
              <Typography variant="body2" color="text.secondary">Equipe atual: {selectedClosure.ownerTeam || selectedClosure.area} · Responsável: {selectedClosure.owner || "Não informado"}</Typography>
              <Chip sx={{ alignSelf: "flex-start" }} size="small" variant="outlined" label={selectedClosure.hasClosureRequest ? "Indício de autorização identificado" : "Sem autorização identificada"} />
              <Chip sx={{ alignSelf: "flex-start" }} size="small" label={selectedClosure.status} color={selectedClosure.stillOpen ? "warning" : "success"} />
              <Alert severity="info">A identificação de autorização é preliminar e depende da cobertura do histórico. Confirme a autoria, a intenção e a situação atual antes de encaminhar para encerramento.</Alert>
              <Box sx={{ bgcolor: "action.hover", border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: .5 }}>Evidência da interação</Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedClosure.actionAuthor || "Autor não identificado"} · {selectedClosure.actionDate ? new Date(selectedClosure.actionDate).toLocaleString("pt-BR") : "Sem data"}
                </Typography>
                <Typography sx={{ mt: 1, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selectedClosure.evidence}</Typography>
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Button variant="contained" onClick={() => navigate(`/operacao/tickets?movidesk=${selectedClosure.ticketId}`)}>Abrir detalhe completo</Button>
                <Button variant="outlined" onClick={() => navigate(`/investigacao?q=${selectedClosure.ticketId}`)}>Investigar ticket</Button>
                <Button variant="outlined" onClick={() => void navigator.clipboard.writeText(`#${selectedClosure.ticketId} - ${selectedClosure.subject}\\n${selectedClosure.evidence}`)}>Copiar resumo</Button>
                <Button variant="outlined" onClick={() => window.dispatchEvent(new CustomEvent("techlead-hub:share-chat", { detail: { label: "Ticket", recordId: selectedClosure.ticketId, title: selectedClosure.subject, client: selectedClosure.client ?? closureClient, status: selectedClosure.status, path: `/operacao/tickets?movidesk=${selectedClosure.ticketId}` } }))}>Compartilhar no chat</Button>
              </Stack>
              <Typography variant="caption" color="text.secondary">Para histórico completo, tarefas vinculadas, prazos e demais ações, utilize “Abrir detalhe completo”.</Typography>
            </Stack>
          )}
        </Box>
      </Drawer>

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
      slotProps={{ paper: { sx: detailDrawerPaperSx } }}
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
          minWidth: 0,
          maxWidth: "100%",
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
            overflowWrap: "anywhere",
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
            overflowWrap: "anywhere",
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
  title, value, description, info, severity = "default", onClick,
}: {
  title: string; value: number; description: string; info: CardInfoDefinition;
  severity?: "default" | "error" | "warning" | "info"; onClick?: () => void;
}) {
  const accentColor = severity === "error"
    ? semanticChartColors.overdue
    : severity === "warning"
    ? semanticChartColors.attention
    : severity === "info"
    ? semanticChartColors.normal
    : aliareColors.green;
  return <ExecutiveKpiCard title={title} value={value} subtitle={description} info={`${info.summary} • ${info.periodRule}`} accent={accentColor} onClick={onClick} />;
}

/* =====================================================
   INFORMAÇÃO DO CARD
===================================================== */


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
  return isOperationallyOpen(ticket);
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

    stoppedWorkingMinutes:
      ticket.stoppedWorkingMinutes,

    dueDate:
      ticket.dueDate,

    firstResponseDueDate:
      ticket.firstResponseDueDate,

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
