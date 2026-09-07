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
  Typography,
} from "@mui/material";

import {
  InfoOutlined,
} from "@mui/icons-material";

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

/* =====================================================
   TIPOS
===================================================== */

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

  azureWorkItem?: AzureTaskSummary | null;

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

  azureTasks: number;
  azureCorrections: number;
  azureEvolutions: number;
  azurePrioritized: number;
  azureBlocked: number;
  azureHighCritical: number;
  azureUnassigned: number;

  workloadLevel: WorkloadLevel;
};

type DrilldownState = {
  title: string;
  subtitle?: string;
  tickets: Ticket[];
} | null;

type AzureDrilldownState = {
  title: string;
  subtitle?: string;
  items: AzureTaskSummary[];
} | null;

type PieDataItem = {
  name: string;
  value: number;
};


type ProductivityOutcome =
  | "DELIVERED"
  | "SUPPORT_CONCLUDED"
  | "CONCLUDED_WITHOUT_VERSION"
  | "CANCELLED"
  | "IN_PROGRESS";

type ProductivityWorkItem = {
  id: number;
  workItemType: string;
  title: string;
  state: string;
  reason: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  assignedToName: string | null;
  client: string | null;
  criticality: string | null;
  module: string | null;
  process: string | null;
  movideskTicket: number | null;
  deliveredVersion: string | null;
  prioritized: boolean | null;
  blockedProcess: boolean | null;
  azureCreatedAt: string | null;
  azureChangedAt: string | null;
  azureClosedAt: string | null;
  stateChangedAt: string | null;
  outcome: ProductivityOutcome;
};

type ProductivityAnalyst = {
  creator: string;
  creatorEmail: string | null;
  totalOpened: number;
  corrections: number;
  evolutions: number;
  supports: number;
  concluded: number;
  concludedWithVersion: number;
  concludedWithoutVersion: number;
  supportsConcluded: number;
  cancelled: number;
  inProgress: number;
  productiveOutcomes: number;
  terminalOutcomes: number;
  productivityRate: number | null;
  cancellationRate: number | null;
  deliveryConversionRate: number | null;
  averageCompletionHours: number | null;
  cancellationReasons: Array<{
    reason: string;
    total: number;
  }>;
  versions: Array<{
    version: string;
    total: number;
  }>;
  items: ProductivityWorkItem[];
};

type ProductivityResponse = {
  generatedAt: string;
  definition: {
    authorField: string;
    productivity: string;
    periodField: string;
  };
  summary: {
    analysts: number;
    totalOpened: number;
    corrections: number;
    evolutions: number;
    supports: number;
    concludedWithVersion: number;
    supportsConcluded: number;
    concludedWithoutVersion: number;
    cancelled: number;
    inProgress: number;
    productiveOutcomes: number;
    terminalOutcomes: number;
    productivityRate: number | null;
    cancellationRate: number | null;
  };
  analysts: ProductivityAnalyst[];
};

type ProductivityDrilldown = {
  title: string;
  subtitle?: string;
  items: ProductivityWorkItem[];
} | null;

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


  const [azureDrilldown, setAzureDrilldown] =
    useState<AzureDrilldownState>(null);

  const [selectedTicket, setSelectedTicket] =
    useState<Ticket | null>(null);

  const [copyMessage, setCopyMessage] =
    useState("");


  const [
    productivity,
    setProductivity,
  ] =
    useState<ProductivityResponse | null>(
      null
    );

  const [
    productivityLoading,
    setProductivityLoading,
  ] =
    useState(false);

  const [
    productivityError,
    setProductivityError,
  ] =
    useState<string | null>(null);

  const [
    productivityDrilldown,
    setProductivityDrilldown,
  ] =
    useState<ProductivityDrilldown>(null);

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
     PRODUTIVIDADE AZURE POR AUTOR DA TASK
  ===================================================== */

  useEffect(() => {
    async function loadProductivity() {
      try {
        setProductivityLoading(true);
        setProductivityError(null);

        const response =
          await api.get<ProductivityResponse>(
            "/azure-work-items/productivity/analysts",
            {
              params: {
                createdFrom:
                  formatDateForApi(
                    effectiveStartDate
                  ),
                createdTo:
                  formatDateForApi(
                    effectiveEndDate
                  ),
              },
            }
          );

        setProductivity(
          response.data
        );
      } catch (err) {
        console.error(
          "Erro ao carregar produtividade Azure:",
          err
        );

        setProductivityError(
          "Não foi possível carregar a produtividade de abertura de Tasks."
        );
      } finally {
        setProductivityLoading(false);
      }
    }

    void loadProductivity();
  }, [
    effectiveStartDate,
    effectiveEndDate,
  ]);

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

          const azureItems = Array.from(
            new Map(
              ownerTickets
                .map((ticket) => ticket.azureWorkItem)
                .filter((item): item is AzureTaskSummary => Boolean(item))
                .map((item) => [item.id, item])
            ).values()
          );

          const azureCorrections = azureItems.filter(
            (item) => item.workItemType === "Correção Clientes"
          ).length;

          const azureEvolutions = azureItems.filter(
            (item) => item.workItemType === "Evolução"
          ).length;

          const azurePrioritized = azureItems.filter(
            (item) => item.prioritized === true
          ).length;

          const azureBlocked = azureItems.filter(
            (item) => item.blockedProcess === true
          ).length;

          const azureHighCritical = azureItems.filter((item) => {
            const criticality = normalize(item.criticality);
            return criticality === "alta" || criticality === "critica";
          }).length;

          const azureUnassigned = azureItems.filter((item) => {
            const state = normalize(item.state);
            return (
              !item.assignedToName?.trim() &&
              state !== "concluido" &&
              state !== "cancelado"
            );
          }).length;

          let workloadLevel:
            WorkloadLevel =
            "normal";

          if (
            criticalTickets.length >= 2 ||
            openTickets.length >= 5 ||
            azureBlocked >= 2 ||
            azureHighCritical >= 2
          ) {
            workloadLevel = "alto";
          } else if (
            criticalTickets.length >= 1 ||
            stoppedTickets.length >= 1 ||
            openTickets.length >= 3 ||
            azureBlocked >= 1 ||
            azureHighCritical >= 1 ||
            azureUnassigned >= 1
          ) {
            workloadLevel = "atencao";
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

            azureTasks: azureItems.length,
            azureCorrections,
            azureEvolutions,
            azurePrioritized,
            azureBlocked,
            azureHighCritical,
            azureUnassigned,

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
    const openTickets =
      scopedTickets.filter(
        isOpen
      );

    const resolvedTickets =
      scopedTickets.filter(
        (ticket) =>
          ticket.baseStatus ===
            "Resolved" ||
          ticket.baseStatus ===
            "Closed"
      );

    const attentionTickets =
      openTickets.filter(
        (ticket) =>
          normalize(
            ticket.urgency
          ) ===
            "critica" ||
          ticket.baseStatus ===
            "Stopped"
      );

    return {
      totalTickets:
        scopedTickets.length,
      openTickets:
        openTickets.length,
      resolvedTickets:
        resolvedTickets.length,
      attentionTickets:
        attentionTickets.length,

      azureTasks: new Set(
        scopedTickets
          .map((ticket) => ticket.azureWorkItem?.id)
          .filter((id): id is number => typeof id === "number")
      ).size,

      azurePrioritized: new Set(
        scopedTickets
          .filter((ticket) => ticket.azureWorkItem?.prioritized === true)
          .map((ticket) => ticket.azureWorkItem!.id)
      ).size,

      azureBlocked: new Set(
        scopedTickets
          .filter((ticket) => ticket.azureWorkItem?.blockedProcess === true)
          .map((ticket) => ticket.azureWorkItem!.id)
      ).size,

      azureUnassigned: new Set(
        scopedTickets
          .filter((ticket) => {
            const item = ticket.azureWorkItem;
            if (!item) return false;
            const state = normalize(item.state);
            return (
              !item.assignedToName?.trim() &&
              state !== "concluido" &&
              state !== "cancelado"
            );
          })
          .map((ticket) => ticket.azureWorkItem!.id)
      ).size,
    };
  }, [scopedTickets]);

  const scopedAzureItems =
    useMemo(() => {
      const byId =
        new Map<
          number,
          AzureTaskSummary
        >();

      scopedTickets.forEach(
        (ticket) => {
          const item =
            ticket.azureWorkItem;

          if (!item) {
            return;
          }

          byId.set(
            item.id,
            item
          );
        }
      );

      return Array.from(
        byId.values()
      );
    }, [scopedTickets]);

  function showAzureItems(
    title: string,
    items: AzureTaskSummary[],
    subtitle?: string
  ) {
    setAzureDrilldown({
      title,
      subtitle,
      items,
    });
  }

  /* =====================================================
     PRODUTIVIDADE - APENAS ANALISTAS DE SUPORTE CONHECIDOS

     O Azure contém também pessoas de Produto/Dev/QA.
     Para não misturar papéis, cruzamos System.CreatedBy com
     responsáveis que aparecem no Movidesk.
  ===================================================== */

  const knownSupportAnalysts =
    useMemo(() => {
      const values =
        new Map<
          string,
          {
            name: string;
            teams: Set<string>;
          }
        >();

      tickets.forEach(
        (ticket) => {
          const owner =
            ticket.owner?.trim();

          if (!owner) {
            return;
          }

          const key =
            normalize(owner);

          const current =
            values.get(key) ?? {
              name:
                owner,
              teams:
                new Set<string>(),
            };

          if (
            ticket.team?.trim()
          ) {
            current.teams.add(
              ticket.team.trim()
            );
          }

          values.set(
            key,
            current
          );
        }
      );

      return Array.from(
        values.values()
      );
    }, [tickets]);

  const productivityAnalysts =
    useMemo(() => {
      const source =
        productivity?.analysts ??
        [];

      return source
        .filter(
          (item) => {
            const support =
              knownSupportAnalysts.find(
                (candidate) =>
                  namesLikelySamePerson(
                    candidate.name,
                    item.creator
                  )
              );

            if (!support) {
              return false;
            }

            if (
              selectedSquad &&
              !support.teams.has(
                selectedSquad
              )
            ) {
              return false;
            }

            if (
              selectedAnalyst &&
              !namesLikelySamePerson(
                selectedAnalyst,
                item.creator
              )
            ) {
              return false;
            }

            return true;
          }
        )
        .sort(
          (a, b) => {
            const rateA =
              a.productivityRate ??
              -1;

            const rateB =
              b.productivityRate ??
              -1;

            if (
              rateB !== rateA
            ) {
              return (
                rateB -
                rateA
              );
            }

            return (
              b.totalOpened -
              a.totalOpened
            );
          }
        );
    }, [
      productivity?.analysts,
      knownSupportAnalysts,
      selectedSquad,
      selectedAnalyst,
    ]);

  const productivitySummary =
    useMemo(() => {
      const totalOpened =
        productivityAnalysts.reduce(
          (
            total,
            item
          ) =>
            total +
            item.totalOpened,
          0
        );

      const corrections =
        productivityAnalysts.reduce(
          (
            total,
            item
          ) =>
            total +
            item.corrections,
          0
        );

      const evolutions =
        productivityAnalysts.reduce(
          (
            total,
            item
          ) =>
            total +
            item.evolutions,
          0
        );

      const supports =
        productivityAnalysts.reduce(
          (
            total,
            item
          ) =>
            total +
            item.supports,
          0
        );

      const delivered =
        productivityAnalysts.reduce(
          (
            total,
            item
          ) =>
            total +
            item.concludedWithVersion,
          0
        );

      const supportsConcluded =
        productivityAnalysts.reduce(
          (
            total,
            item
          ) =>
            total +
            item.supportsConcluded,
          0
        );

      const cancelled =
        productivityAnalysts.reduce(
          (
            total,
            item
          ) =>
            total +
            item.cancelled,
          0
        );

      const inProgress =
        productivityAnalysts.reduce(
          (
            total,
            item
          ) =>
            total +
            item.inProgress,
          0
        );

      const productiveOutcomes =
        productivityAnalysts.reduce(
          (
            total,
            item
          ) =>
            total +
            item.productiveOutcomes,
          0
        );

      const terminalOutcomes =
        productivityAnalysts.reduce(
          (
            total,
            item
          ) =>
            total +
            item.terminalOutcomes,
          0
        );

      return {
        totalOpened,
        corrections,
        evolutions,
        supports,
        delivered,
        supportsConcluded,
        cancelled,
        inProgress,
        productiveOutcomes,
        terminalOutcomes,

        productivityRate:
          terminalOutcomes >
          0
            ? Math.round(
                (
                  productiveOutcomes /
                  terminalOutcomes
                ) *
                  1000
              ) /
                10
            : null,

        cancellationRate:
          terminalOutcomes >
          0
            ? Math.round(
                (
                  cancelled /
                  terminalOutcomes
                ) *
                  1000
              ) /
                10
            : null,
      };
    }, [
      productivityAnalysts,
    ]);

  function showProductivityItems(
    title: string,
    items: ProductivityWorkItem[],
    subtitle?: string
  ) {
    setProductivityDrilldown({
      title,
      subtitle,
      items,
    });
  }

  /* =====================================================
     GRÁFICO DE PIZZA - CARTEIRA POR ANALISTA
  ===================================================== */

  const analystPieData =
    useMemo<PieDataItem[]>(() => {
      const sorted =
        analysts
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
          )
          .sort(
            (a, b) =>
              b.value -
              a.value
          );

      const visible =
        sorted.slice(
          0,
          6
        );

      const remainingTotal =
        sorted
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
        remainingTotal >
        0
      ) {
        visible.push({
          name:
            "Outros",

          value:
            remainingTotal,
        });
      }

      return visible;
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
              Equipe
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
                  md: 180,
                },
              }}
            >
              <Typography
                sx={{
                  fontWeight:
                    800,

                  fontSize:
                    "1rem",

                  letterSpacing:
                    "-0.01em",
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
          title="Tickets analisados"
          value={
            summary.totalTickets
          }
          description="Tickets do período e filtros selecionados"
          info={{
            title: "Tickets analisados",
            summary:
              "Quantidade de tickets que compõem a carteira atual do analista ou da equipe no período selecionado.",
            calculation:
              "Contagem dos tickets após aplicar período, Squad e Analista.",
            source:
              "Movidesk",
            reference:
              "Ticket.owner + Ticket.team + Ticket.createdDate",
            periodRule:
              "Respeita integralmente o período global selecionado na tela.",
            notes:
              "Clique no card para abrir exatamente os tickets que formam este total.",
          }}
          onClick={() =>
            showTickets(
              "Tickets analisados",
              scopedTickets,
              selectedAnalyst
                ? `Analista: ${selectedAnalyst}`
                : selectedSquad
                  ? `Squad: ${selectedSquad}`
                  : "Carteira filtrada"
            )
          }
        />

        <MetricCard
          title="Pendentes"
          value={
            summary.openTickets
          }
          description="Tickets ainda não concluídos"
          info={{
            title: "Pendentes",
            summary:
              "Tickets da carteira filtrada que ainda estão abertos no atendimento.",
            calculation:
              "Contagem dos tickets considerados abertos pela regra operacional da tela.",
            source:
              "Movidesk",
            reference:
              "Ticket.baseStatus + Ticket.status",
            periodRule:
              "Usa somente os tickets que já passaram pelos filtros de período, Squad e Analista.",
            notes:
              "Clique para listar os tickets pendentes da seleção atual.",
          }}
          severity={
            summary.openTickets >
            0
              ? "warning"
              : "default"
          }
          onClick={() =>
            showTickets(
              "Tickets pendentes",
              scopedTickets.filter(
                isOpen
              )
            )
          }
        />

        <MetricCard
          title="Resolvidos / Fechados"
          value={
            summary.resolvedTickets
          }
          description="Entregas concluídas na carteira filtrada"
          info={{
            title: "Resolvidos / Fechados",
            summary:
              "Tickets da seleção atual que se encontram resolvidos ou fechados.",
            calculation:
              "Contagem de Ticket.baseStatus = Resolved ou Closed.",
            source:
              "Movidesk",
            reference:
              "Ticket.baseStatus",
            periodRule:
              "A população é formada pelos tickets do período e filtros atuais.",
            notes:
              "Clique para conferir todos os tickets que compõem este resultado.",
          }}
          onClick={() =>
            showTickets(
              "Tickets resolvidos / fechados",
              scopedTickets.filter(
                (ticket) =>
                  ticket.baseStatus ===
                    "Resolved" ||
                  ticket.baseStatus ===
                    "Closed"
              )
            )
          }
        />

        <MetricCard
          title="Atenção imediata"
          value={
            summary.attentionTickets
          }
          description="Críticos ou parados ainda pendentes"
          info={{
            title: "Atenção imediata",
            summary:
              "Tickets pendentes que exigem acompanhamento mais próximo por criticidade ou paralisação.",
            calculation:
              "Ticket aberto e (urgência Crítica ou baseStatus = Stopped).",
            source:
              "Movidesk",
            reference:
              "Ticket.urgency + Ticket.baseStatus",
            periodRule:
              "Respeita o período, Squad e Analista selecionados.",
            notes:
              "Clique para abrir somente os tickets que exigem atenção na carteira atual.",
          }}
          severity={
            summary.attentionTickets >
            0
              ? "error"
              : "default"
          }
          onClick={() =>
            showTickets(
              "Tickets que exigem atenção",
              scopedTickets.filter(
                (ticket) =>
                  isOpen(ticket) &&
                  (
                    normalize(
                      ticket.urgency
                    ) ===
                      "critica" ||
                    ticket.baseStatus ===
                      "Stopped"
                  )
              )
            )
          }
        />
      </Box>

      {/* ===============================================
          DESENVOLVIMENTO / AZURE DEVOPS
      ================================================ */}

      <Card
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2.25,
          mb: 2,
          backgroundColor: "background.paper",
          boxShadow: "0 1px 2px rgba(16,24,40,0.035)",
        }}
      >
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "stretch", md: "center" },
              mb: 1.5,
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: "1.05rem" }}>
                Desenvolvimento por Analista
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Tasks Azure vinculadas aos atendimentos da carteira selecionada
              </Typography>
            </Box>

            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
            >
              <Chip
                size="small"
                variant="outlined"
                label={`${summary.azureTasks} Task(s) única(s)`}
              />
              <Button size="small" variant="outlined" onClick={() => navigate("/correcoes")}>
                Ver Correções
              </Button>
              <Button size="small" variant="outlined" onClick={() => navigate("/evolucoes")}>
                Ver Evoluções
              </Button>
            </Stack>
          </Stack>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                lg: "repeat(4, 1fr)",
              },
              gap: 1.25,
            }}
          >
            <AzureMetricCard
              title="Tasks vinculadas"
              value={summary.azureTasks}
              description="Work Items únicos na carteira filtrada"
              info={{
                title: "Tasks vinculadas",
                summary:
                  "Work Items únicos do Azure associados aos tickets que permanecem após os filtros da tela.",
                calculation:
                  "Contagem distinta por Azure Work Item ID.",
                source:
                  "Movidesk + Azure DevOps",
                reference:
                  "Ticket.taskNumber / azureWorkItem.id",
                periodRule:
                  "A Task aparece quando está vinculada a um ticket pertencente à carteira filtrada.",
                notes:
                  "Clique no card para abrir o detalhamento das Tasks consideradas.",
              }}
              onClick={() =>
                showAzureItems(
                  "Tasks vinculadas",
                  scopedAzureItems,
                  selectedAnalyst
                    ? `Analista: ${selectedAnalyst}`
                    : "Carteira filtrada"
                )
              }
            />
            <AzureMetricCard
              title="Priorizadas"
              value={summary.azurePrioritized}
              description="Tasks sinalizadas como priorizadas"
              info={{
                title: "Priorizadas",
                summary:
                  "Tasks vinculadas à carteira atual que estão sinalizadas como priorizadas no Azure DevOps.",
                calculation:
                  "Contagem distinta das Tasks com prioritized = true.",
                source:
                  "Azure DevOps",
                reference:
                  "Custom.Priorizada",
                periodRule:
                  "Parte somente das Tasks vinculadas aos tickets filtrados na tela.",
                notes:
                  "Clique para conferir quais Tasks estão priorizadas.",
              }}
              severity={summary.azurePrioritized > 0 ? "warning" : "default"}
              onClick={() =>
                showAzureItems(
                  "Tasks priorizadas",
                  scopedAzureItems.filter(
                    (item) =>
                      item.prioritized ===
                      true
                  )
                )
              }
            />
            <AzureMetricCard
              title="Bloqueadas"
              value={summary.azureBlocked}
              description="Tasks com processo bloqueado"
              info={{
                title: "Bloqueadas",
                summary:
                  "Tasks da carteira atual marcadas com processo bloqueado no Azure DevOps.",
                calculation:
                  "Contagem distinta das Tasks com blockedProcess = true.",
                source:
                  "Azure DevOps",
                reference:
                  "Custom.ProcessoBloqueado",
                periodRule:
                  "Considera somente as Tasks vinculadas aos tickets filtrados.",
                notes:
                  "Clique para abrir a relação de Tasks bloqueadas.",
              }}
              severity={summary.azureBlocked > 0 ? "error" : "default"}
              onClick={() =>
                showAzureItems(
                  "Tasks bloqueadas",
                  scopedAzureItems.filter(
                    (item) =>
                      item.blockedProcess ===
                      true
                  )
                )
              }
            />
            <AzureMetricCard
              title="Sem responsável Azure"
              value={summary.azureUnassigned}
              description="Tasks ativas sem responsável de desenvolvimento"
              info={{
                title: "Sem responsável Azure",
                summary:
                  "Tasks ainda ativas e sem responsável atual no Azure DevOps.",
                calculation:
                  "assignedToName vazio e estado diferente de Concluído/Cancelado.",
                source:
                  "Azure DevOps",
                reference:
                  "System.AssignedTo + System.State",
                periodRule:
                  "Considera somente as Tasks vinculadas à carteira filtrada.",
                notes:
                  "Clique para identificar rapidamente quais Tasks precisam de atribuição.",
              }}
              severity={summary.azureUnassigned > 0 ? "warning" : "default"}
              onClick={() =>
                showAzureItems(
                  "Tasks sem responsável Azure",
                  scopedAzureItems.filter(
                    (item) => {
                      const state =
                        normalize(
                          item.state
                        );

                      return (
                        !item.assignedToName?.trim() &&
                        state !==
                          "concluido" &&
                        state !==
                          "cancelado"
                      );
                    }
                  )
                )
              }
            />
          </Box>
        </CardContent>
      </Card>

      {/* ===============================================
          PRODUTIVIDADE NA ABERTURA DE TASKS
      ================================================ */}

      <Card
        elevation={0}
        sx={{
          mb: 2,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2.25,
        }}
      >
        <CardContent>
          <Stack
            direction={{
              xs: "column",
              lg: "row",
            }}
            spacing={1.5}
            sx={{
              justifyContent:
                "space-between",
              alignItems: {
                xs: "stretch",
                lg: "flex-start",
              },
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: "1.05rem",
                }}
              >
                Produtividade na abertura de Tasks
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt: 0.35,
                  maxWidth: 900,
                }}
              >
                Mede as Tasks criadas pelo analista no Azure por System.CreatedBy,
                separando entregas efetivas, APOIOs, cancelamentos e itens em andamento.
              </Typography>
            </Box>

            <Chip
              size="small"
              variant="outlined"
              label="Fonte: Azure DevOps"
            />
          </Stack>

          {productivityError && (
            <Alert
              severity="warning"
              sx={{
                mt: 1.5,
              }}
            >
              {productivityError}
            </Alert>
          )}

          {productivityLoading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent:
                  "center",
                py: 4,
              }}
            >
              <CircularProgress
                size={28}
              />
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, 1fr)",
                    lg: "repeat(4, 1fr)",
                  },
                  gap: 1.25,
                  mt: 2,
                }}
              >
                <ProductivityCard
                  title="Tasks abertas"
                  value={
                    productivitySummary.totalOpened
                  }
                  subtitle={`${productivitySummary.corrections} correções • ${productivitySummary.evolutions} evoluções`}
                  info={{
                    title: "Tasks abertas",
                    summary:
                      "Quantidade de Correções, Evoluções e APOIOs criados pelo analista no Azure DevOps dentro do período selecionado.",
                    calculation:
                      "Contagem dos Work Items em que System.CreatedBy corresponde ao analista.",
                    source:
                      "Azure DevOps",
                    reference:
                      "System.CreatedBy + System.CreatedDate",
                    periodRule:
                      "Considera a data de criação da Task dentro do período selecionado.",
                    notes:
                      "A autoria permanece com quem criou a Task, mesmo que ela seja posteriormente atribuída a outra pessoa.",
                  }}
                  onClick={() =>
                    showProductivityItems(
                      "Tasks abertas",
                      productivityAnalysts.flatMap(
                        (item) =>
                          item.items
                      ),
                      selectedAnalyst
                        ? `Analista: ${selectedAnalyst}`
                        : "Criadas pelos analistas da seleção atual"
                    )
                  }
                />

                <ProductivityCard
                  title="Concluídas com versão"
                  value={
                    productivitySummary.delivered
                  }
                  subtitle="Correções/Evoluções com entrega versionada"
                  info={{
                    title: "Concluídas com versão",
                    summary:
                      "Correções e Evoluções abertas pelo analista que chegaram ao estado Concluído e possuem versão de entrega válida.",
                    calculation:
                      "Estado = Concluído e campo de versão preenchido com valor válido.",
                    source:
                      "Azure DevOps",
                    reference:
                      "System.State + versão de entrega",
                    periodRule:
                      "A Task pertence ao período pela sua data de criação.",
                    notes:
                      "A versão associa a Task a uma entrega; isoladamente, não comprova que a release já foi publicada no cliente.",
                  }}
                  severity="success"
                  onClick={() =>
                    showProductivityItems(
                      "Concluídas com versão",
                      productivityAnalysts.flatMap(
                        (item) =>
                          item.items.filter(
                            (workItem) =>
                              workItem.outcome ===
                              "DELIVERED"
                          )
                      )
                    )
                  }
                />

                <ProductivityCard
                  title="APOIOs abertos"
                  value={
                    productivitySummary.supports
                  }
                  subtitle={`${productivitySummary.supportsConcluded} concluído(s)`}
                  info={{
                    title: "APOIOs abertos",
                    summary:
                      "Quantidade de Work Items do tipo APOIO criados pelo analista no período selecionado.",
                    calculation:
                      "Contagem de Work Items com tipo APOIO e System.CreatedBy correspondente ao analista.",
                    source:
                      "Azure DevOps",
                    reference:
                      "System.WorkItemType + System.CreatedBy",
                    periodRule:
                      "Considera a data de criação do APOIO.",
                    notes:
                      "O subtítulo informa quantos dos APOIOs abertos já chegaram ao estado Concluído.",
                  }}
                  onClick={() =>
                    showProductivityItems(
                      "APOIOs abertos",
                      productivityAnalysts.flatMap(
                        (item) =>
                          item.items.filter(
                            (workItem) =>
                              workItem.workItemType ===
                              "APOIO"
                          )
                      )
                    )
                  }
                />

                <ProductivityCard
                  title="Canceladas"
                  value={
                    productivitySummary.cancelled
                  }
                  subtitle={
                    productivitySummary.cancellationRate ===
                    null
                      ? "Sem desfechos suficientes"
                      : `${productivitySummary.cancellationRate.toFixed(1)}% dos desfechos`
                  }
                  info={{
                    title: "Canceladas",
                    summary:
                      "Tasks abertas pelos analistas que chegaram ao estado Cancelado no Azure DevOps.",
                    calculation:
                      "Contagem dos Work Items cujo estado atual é Cancelado.",
                    source:
                      "Azure DevOps",
                    reference:
                      "System.State + System.Reason",
                    periodRule:
                      "A Task pertence ao período pela sua data de criação.",
                    notes:
                      "No detalhamento, os motivos são apresentados a partir do System.Reason registrado no Azure.",
                  }}
                  severity={
                    productivitySummary.cancelled >
                    0
                      ? "warning"
                      : "default"
                  }
                  onClick={() =>
                    showProductivityItems(
                      "Tasks canceladas",
                      productivityAnalysts.flatMap(
                        (item) =>
                          item.items.filter(
                            (workItem) =>
                              workItem.outcome ===
                              "CANCELLED"
                          )
                      ),
                      "O motivo exibido vem do campo System.Reason do Azure."
                    )
                  }
                />

                <ProductivityCard
                  title="Em andamento"
                  value={
                    productivitySummary.inProgress
                  }
                  subtitle="Não entram no denominador da produtividade"
                  info={{
                    title: "Em andamento",
                    summary:
                      "Tasks que ainda não chegaram a um desfecho terminal de Concluído ou Cancelado.",
                    calculation:
                      "Tasks abertas menos os itens que já chegaram a Concluído ou Cancelado.",
                    source:
                      "Azure DevOps",
                    reference:
                      "System.State",
                    periodRule:
                      "A Task pertence ao período pela sua data de criação.",
                    notes:
                      "Itens em andamento ficam fora do denominador para não penalizar o analista por demandas ainda percorrendo o fluxo.",
                  }}
                  onClick={() =>
                    showProductivityItems(
                      "Tasks em andamento",
                      productivityAnalysts.flatMap(
                        (item) =>
                          item.items.filter(
                            (workItem) =>
                              workItem.outcome ===
                              "IN_PROGRESS"
                          )
                      )
                    )
                  }
                />

                <ProductivityCard
                  title="Resultados produtivos"
                  value={
                    productivitySummary.productiveOutcomes
                  }
                  subtitle="Entregas com versão + APOIOs concluídos"
                  info={{
                    title: "Resultados produtivos",
                    summary:
                      "Quantidade de desfechos que atendem à regra atual de resultado produtivo.",
                    calculation:
                      "Correções/Evoluções concluídas com versão válida + APOIOs concluídos.",
                    source:
                      "TechLead Hub sobre dados do Azure DevOps",
                    reference:
                      "Tipo + estado + versão",
                    periodRule:
                      "Considera as Tasks criadas no período selecionado.",
                    notes:
                      "Correções/Evoluções concluídas sem versão continuam visíveis na análise, mas não entram como resultado produtivo.",
                  }}
                  severity="success"
                  onClick={() =>
                    showProductivityItems(
                      "Resultados produtivos",
                      productivityAnalysts.flatMap(
                        (item) =>
                          item.items.filter(
                            (workItem) =>
                              workItem.outcome ===
                                "DELIVERED" ||
                              workItem.outcome ===
                                "SUPPORT_CONCLUDED"
                          )
                      )
                    )
                  }
                />

                <ProductivityCard
                  title="Taxa de produtividade"
                  value={
                    productivitySummary.productivityRate ===
                    null
                      ? "—"
                      : `${productivitySummary.productivityRate.toFixed(1)}%`
                  }
                  subtitle="Resultados produtivos ÷ desfechos terminais"
                  info={{
                    title: "Taxa de produtividade",
                    summary:
                      "Percentual de resultados produtivos entre as Tasks que já chegaram a um desfecho terminal.",
                    calculation:
                      "(Correções/Evoluções concluídas com versão + APOIOs concluídos) ÷ (itens Concluídos + Cancelados) × 100.",
                    source:
                      "TechLead Hub sobre dados do Azure DevOps",
                    reference:
                      "System.State + tipo + versão",
                    periodRule:
                      "Considera as Tasks criadas no período; itens ainda em andamento não entram no denominador.",
                    notes:
                      "A taxa deve ser analisada junto com volume, cancelamentos e complexidade. Ela não deve ser usada isoladamente como avaliação de desempenho individual.",
                  }}
                  severity="success"
                  onClick={() =>
                    showProductivityItems(
                      "Desfechos usados na taxa de produtividade",
                      productivityAnalysts.flatMap(
                        (item) =>
                          item.items.filter(
                            (workItem) =>
                              workItem.outcome !==
                              "IN_PROGRESS"
                          )
                      ),
                      "Inclui os itens concluídos e cancelados que formam o denominador da taxa."
                    )
                  }
                />


              </Box>

              <Alert
                severity="info"
                sx={{
                  mt: 1.5,
                  borderRadius: 2,
                }}
              >
                Taxa de produtividade = Correções/Evoluções concluídas com versão
                válida + APOIOs concluídos, dividido pelos itens que já chegaram a
                Concluído ou Cancelado. Tasks em andamento ficam fora do denominador.
              </Alert>

              <TableContainer
                sx={{
                  mt: 2,
                }}
              >
                <Table
                  size="small"
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <strong>
                          Analista
                        </strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Abertas</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Correções</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Evoluções</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>APOIOs</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Concl. c/ versão</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Concl. s/ versão</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Canceladas</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Em andamento</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Produtividade</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Tempo médio</strong>
                      </TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {productivityAnalysts.map(
                      (item) => (
                        <TableRow
                          key={
                            item.creator
                          }
                          hover
                        >
                          <TableCell>
                            <Button
                              variant="text"
                              size="small"
                              onClick={() =>
                                showProductivityItems(
                                  `Tasks abertas por ${item.creator}`,
                                  item.items
                                )
                              }
                              sx={{
                                p: 0,
                                minWidth: 0,
                                textTransform:
                                  "none",
                                fontWeight: 750,
                                color: "text.primary",
                              }}
                            >
                              {item.creator}
                            </Button>
                          </TableCell>

                          <TableCell align="right">
                            {item.totalOpened}
                          </TableCell>
                          <TableCell align="right">
                            {item.corrections}
                          </TableCell>
                          <TableCell align="right">
                            {item.evolutions}
                          </TableCell>
                          <TableCell align="right">
                            {item.supports}
                          </TableCell>

                          <TableCell align="right">
                            <ProductivityNumber
                              value={
                                item.concludedWithVersion
                              }
                              severity="success"
                              onClick={() =>
                                showProductivityItems(
                                  `${item.creator} - Concluídas com versão`,
                                  item.items.filter(
                                    (workItem) =>
                                      workItem.outcome ===
                                      "DELIVERED"
                                  )
                                )
                              }
                            />
                          </TableCell>

                          <TableCell align="right">
                            <ProductivityNumber
                              value={
                                item.concludedWithoutVersion
                              }
                              severity={
                                item.concludedWithoutVersion >
                                0
                                  ? "warning"
                                  : "default"
                              }
                              onClick={() =>
                                showProductivityItems(
                                  `${item.creator} - Concluídas sem versão`,
                                  item.items.filter(
                                    (workItem) =>
                                      workItem.outcome ===
                                      "CONCLUDED_WITHOUT_VERSION"
                                  )
                                )
                              }
                            />
                          </TableCell>

                          <TableCell align="right">
                            <ProductivityNumber
                              value={
                                item.cancelled
                              }
                              severity={
                                item.cancelled >
                                0
                                  ? "warning"
                                  : "default"
                              }
                              onClick={() =>
                                showProductivityItems(
                                  `${item.creator} - Canceladas`,
                                  item.items.filter(
                                    (workItem) =>
                                      workItem.outcome ===
                                      "CANCELLED"
                                  ),
                                  item.cancellationReasons.length >
                                  0
                                    ? item.cancellationReasons
                                        .map(
                                          (reason) =>
                                            `${reason.reason}: ${reason.total}`
                                        )
                                        .join(" • ")
                                    : "Sem motivos de cancelamento no período."
                                )
                              }
                            />
                          </TableCell>

                          <TableCell align="right">
                            {item.inProgress}
                          </TableCell>

                          <TableCell align="right">
                            <Chip
                              size="small"
                              variant="outlined"
                              color={
                                productivityColor(
                                  item.productivityRate
                                )
                              }
                              label={
                                item.productivityRate ===
                                null
                                  ? "—"
                                  : `${item.productivityRate.toFixed(1)}%`
                              }
                            />
                          </TableCell>

                          <TableCell align="right">
                            {formatHours(
                              item.averageCompletionHours
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    )}

                    {productivityAnalysts.length ===
                      0 && (
                      <TableRow>
                        <TableCell
                          colSpan={11}
                          align="center"
                        >
                          <Box
                            sx={{
                              py: 3,
                            }}
                          >
                            <Typography
                              sx={{
                                fontWeight: 700,
                              }}
                            >
                              Nenhuma Task criada pelos analistas no período
                            </Typography>

                            <Typography
                              variant="body2"
                              color="text.secondary"
                            >
                              Verifique o período, os filtros e se a sincronização FULL
                              foi executada após habilitar o tipo APOIO.
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </CardContent>
      </Card>

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
                        analystPieData
                      }
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={78}
                      innerRadius={46}
                      paddingAngle={2}
                      onClick={(data) => {
                        const name =
                          (
                            data as {
                              payload?: {
                                name?: unknown;
                              };
                            }
                          ).payload?.name;

                        if (
                          typeof name ===
                            "string" &&
                          name &&
                          name !==
                            "Outros"
                        ) {
                          showAnalystTickets(
                            name
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
                            key={`${analystPieData[index]?.name ?? "analyst"}-${index}`}
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
                  analystPieData
                }
                total={
                  analystPieData.reduce(
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
                    name !==
                    "Outros"
                  ) {
                    showAnalystTickets(
                      name
                    );
                  }
                }}
              />
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
                      style={{
                        cursor:
                          "pointer",
                      }}
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
              />
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

                <TableCell align="right"><strong>Tasks</strong></TableCell>
                <TableCell align="right"><strong>Correções</strong></TableCell>
                <TableCell align="right"><strong>Evoluções</strong></TableCell>
                <TableCell align="right"><strong>Risco Azure</strong></TableCell>

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
                          title={
                            analyst.owner
                          }
                          onClick={() =>
                            showAnalystTickets(
                              analyst.owner
                            )
                          }
                          sx={{
                            p: 0,

                            minWidth:
                              0,

                            maxWidth:
                              190,

                            fontWeight:
                              700,

                            justifyContent:
                              "flex-start",

                            textTransform:
                              "none",

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

                      {/* AZURE */}

                      <ClickableNumber
                        value={analyst.azureTasks}
                        onClick={() =>
                          showTickets(
                            `${analyst.owner} - Tasks Azure`,
                            analystTickets.filter((ticket) => Boolean(ticket.azureWorkItem))
                          )
                        }
                      />

                      <ClickableNumber
                        value={analyst.azureCorrections}
                        onClick={() =>
                          showTickets(
                            `${analyst.owner} - Correções`,
                            analystTickets.filter(
                              (ticket) =>
                                ticket.azureWorkItem?.workItemType === "Correção Clientes"
                            )
                          )
                        }
                      />

                      <ClickableNumber
                        value={analyst.azureEvolutions}
                        onClick={() =>
                          showTickets(
                            `${analyst.owner} - Evoluções`,
                            analystTickets.filter(
                              (ticket) => ticket.azureWorkItem?.workItemType === "Evolução"
                            )
                          )
                        }
                      />

                      <ClickableNumber
                        value={
                          analyst.azureBlocked +
                          analyst.azureHighCritical +
                          analyst.azureUnassigned
                        }
                        severity={
                          analyst.azureBlocked > 0 || analyst.azureHighCritical > 0
                            ? "error"
                            : analyst.azureUnassigned > 0
                              ? "warning"
                              : "default"
                        }
                        onClick={() =>
                          showTickets(
                            `${analyst.owner} - Risco Azure`,
                            analystTickets.filter((ticket) => {
                              const item = ticket.azureWorkItem;
                              if (!item) return false;
                              const criticality = normalize(item.criticality);
                              const state = normalize(item.state);
                              return (
                                item.blockedProcess === true ||
                                criticality === "alta" ||
                                criticality === "critica" ||
                                (
                                  !item.assignedToName?.trim() &&
                                  state !== "concluido" &&
                                  state !== "cancelado"
                                )
                              );
                            })
                          )
                        }
                      />

                      {/* TEMPO */}

                      <TableCell align="right">
                        {formatMinutes(analyst.averageLifetimeMinutes)}
                      </TableCell>
                    </TableRow>
                  );
                }
              )}

              {analysts.length ===
                0 && (
                <TableRow>
                  <TableCell
                    colSpan={14}
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
        A classificação combina a carga operacional do Movidesk
        com sinais de risco das Tasks vinculadas no Azure DevOps.
        O responsável pelo atendimento e o responsável pela Task são
        papéis distintos; os indicadores Azure não representam
        produtividade individual do desenvolvimento.
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
                      {" • "}
                      {ticket.team ??
                        "Sem squad"}
                      {ticket.service
                        ? ` • ${ticket.service}`
                        : ""}
                    </Typography>

                    {ticket.azureWorkItem && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", mt: 0.25 }}
                      >
                        Azure #{ticket.azureWorkItem.id}
                        {" • "}
                        {ticket.azureWorkItem.state}
                        {ticket.azureWorkItem.assignedToName
                          ? ` • ${ticket.azureWorkItem.assignedToName}`
                          : " • Sem responsável Azure"}
                      </Typography>
                    )}
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

      <Drawer
        anchor="right"
        open={Boolean(azureDrilldown)}
        onClose={() =>
          setAzureDrilldown(null)
        }
      >
        <Box
          sx={{
            width: {
              xs: 340,
              sm: 620,
            },
            p: 2.5,
          }}
        >
          {azureDrilldown && (
            <>
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    {azureDrilldown.title}
                  </Typography>

                  {azureDrilldown.subtitle && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                      {azureDrilldown.subtitle}
                    </Typography>
                  )}

                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.4 }}>
                    {azureDrilldown.items.length} Task(s) única(s)
                  </Typography>
                </Box>

                <IconButton size="small" onClick={() => setAzureDrilldown(null)}>
                  ✕
                </IconButton>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Stack spacing={1}>
                {azureDrilldown.items.map((item) => (
                  <Card
                    key={item.id}
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1.75,
                    }}
                  >
                    <CardContent sx={{ "&:last-child": { pb: 2 } }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                            Azure #{item.id} • {item.workItemType}
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 0.35, fontWeight: 750 }}>
                            {item.title}
                          </Typography>
                        </Box>

                        <Chip size="small" variant="outlined" label={item.state} />
                      </Stack>

                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 1, flexWrap: "wrap" }}>
                        {item.prioritized && (
                          <Chip size="small" variant="outlined" color="warning" label="Priorizada" />
                        )}
                        {item.blockedProcess && (
                          <Chip size="small" variant="outlined" color="error" label="Bloqueada" />
                        )}
                        {item.deliveredVersion && (
                          <Chip size="small" variant="outlined" color="success" label={`Versão ${item.deliveredVersion}`} />
                        )}
                      </Stack>

                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                        Cliente: {item.client ?? "—"}
                        {" • "}
                        Responsável Azure: {item.assignedToName ?? "—"}
                      </Typography>

                      <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() =>
                            navigate(
                              item.workItemType === "Evolução"
                                ? `/evolucoes?task=${item.id}`
                                : `/correcoes?task=${item.id}`
                            )
                          }
                        >
                          Abrir Task
                        </Button>

                        {item.movideskTicket && (
                          <Button
                            size="small"
                            onClick={() =>
                              navigate(`/tickets?movidesk=${item.movideskTicket}`)
                            }
                          >
                            Atendimento #{item.movideskTicket}
                          </Button>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                ))}

                {azureDrilldown.items.length === 0 && (
                  <Alert severity="info">
                    Nenhuma Task encontrada para os filtros atuais.
                  </Alert>
                )}
              </Stack>
            </>
          )}
        </Box>
      </Drawer>

      <Drawer
        anchor="right"
        open={
          Boolean(
            productivityDrilldown
          )
        }
        onClose={() =>
          setProductivityDrilldown(
            null
          )
        }
      >
        <Box
          sx={{
            width: {
              xs: 340,
              sm: 620,
            },
            p: 2.5,
          }}
        >
          {productivityDrilldown && (
            <>
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
                <Box>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 800,
                    }}
                  >
                    {productivityDrilldown.title}
                  </Typography>

                  {productivityDrilldown.subtitle && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mt: 0.35,
                      }}
                    >
                      {productivityDrilldown.subtitle}
                    </Typography>
                  )}

                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "block",
                      mt: 0.4,
                    }}
                  >
                    {productivityDrilldown.items.length} Task(s)
                  </Typography>
                </Box>

                <IconButton
                  size="small"
                  onClick={() =>
                    setProductivityDrilldown(
                      null
                    )
                  }
                >
                  ✕
                </IconButton>
              </Stack>

              <Divider
                sx={{
                  my: 2,
                }}
              />

              <Stack
                spacing={1}
              >
                {productivityDrilldown.items.map(
                  (item) => (
                    <Card
                      key={item.id}
                      elevation={0}
                      sx={{
                        border: "1px solid",
                        borderColor:
                          "divider",
                        borderRadius: 1.75,
                      }}
                    >
                      <CardContent
                        sx={{
                          "&:last-child": {
                            pb: 2,
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
                              minWidth: 0,
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                fontWeight: 800,
                              }}
                            >
                              Azure #{item.id} • {item.workItemType}
                            </Typography>

                            <Typography
                              variant="body2"
                              sx={{
                                mt: 0.35,
                                fontWeight: 750,
                              }}
                            >
                              {item.title}
                            </Typography>
                          </Box>

                          <OutcomeChip
                            outcome={
                              item.outcome
                            }
                          />
                        </Stack>

                        <Stack
                          direction="row"
                          spacing={0.75}
                          useFlexGap
                          sx={{
                            mt: 1,
                            flexWrap:
                              "wrap",
                          }}
                        >
                          <Chip
                            size="small"
                            variant="outlined"
                            label={
                              item.state
                            }
                          />

                          {item.deliveredVersion && (
                            <Chip
                              size="small"
                              variant="outlined"
                              color="success"
                              label={`Versão ${item.deliveredVersion}`}
                            />
                          )}

                          {item.reason &&
                            item.outcome ===
                              "CANCELLED" && (
                            <Chip
                              size="small"
                              variant="outlined"
                              color="warning"
                              label={`Motivo: ${item.reason}`}
                            />
                          )}
                        </Stack>

                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: "block",
                            mt: 1,
                          }}
                        >
                          Criado em {formatDateTime(item.azureCreatedAt)}
                          {" • "}
                          Cliente: {item.client ?? "—"}
                          {" • "}
                          Responsável atual: {item.assignedToName ?? "—"}
                        </Typography>

                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{
                            mt: 1.25,
                          }}
                        >
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() =>
                              navigate(
                                item.workItemType ===
                                "Evolução"
                                  ? `/evolucoes?task=${item.id}`
                                  : item.workItemType ===
                                    "Correção Clientes"
                                    ? `/correcoes?task=${item.id}`
                                    : `/versoes`
                              )
                            }
                          >
                            {item.workItemType ===
                            "APOIO"
                              ? "Ver desenvolvimento"
                              : "Abrir Task"}
                          </Button>

                          {item.movideskTicket && (
                            <Button
                              size="small"
                              onClick={() =>
                                navigate(
                                  `/tickets?movidesk=${item.movideskTicket}`
                                )
                              }
                            >
                              Atendimento #{item.movideskTicket}
                            </Button>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  )
                )}
              </Stack>
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
   LEGENDA COMPACTA DOS GRÁFICOS
===================================================== */

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

/* =====================================================
   TOOLTIP COMPACTO DOS GRÁFICOS
===================================================== */

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
          260,

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
          3,
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

/* =====================================================
   CARD DE MÉTRICA
===================================================== */

function AzureMetricCard({
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
  info: ProductivityInfoDefinition;
  severity?: "default" | "warning" | "error";
  onClick?: () => void;
}) {
  const accentColor =
    severity === "error"
      ? semanticChartColors.overdue
      : severity === "warning"
      ? semanticChartColors.attention
      : aliareColors.green;

  return (
    <UnifiedMetricCard
      title={title}
      value={value}
      description={description}
      info={info}
      accentColor={accentColor}
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
  info: ProductivityInfoDefinition;
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
    <UnifiedMetricCard
      title={title}
      value={value}
      description={description}
      info={info}
      accentColor={accentColor}
      onClick={onClick}
    />
  );
}

function UnifiedMetricCard({
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
  info: ProductivityInfoDefinition;
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
          content: '\"\"',
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
          <Typography variant="body2" sx={{ fontWeight: 700, color: "text.primary", minWidth: 0 }}>
            {title}
          </Typography>
          <ProductivityInfo definition={info} />
        </Stack>

        <Typography
          sx={{
            mt: 0.6,
            fontWeight: 800,
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

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
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
       sx={{ fontWeight: 600 }}
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

type ProductivityInfoDefinition = {
  title: string;
  summary: string;
  calculation: string;
  source: string;
  reference: string;
  periodRule: string;
  notes?: string;
};

function ProductivityInfo({
  definition,
}: {
  definition: ProductivityInfoDefinition;
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
          p: 0.3,
          color: "text.secondary",
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
            fontSize: 16,
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
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        slotProps={{
          paper: {
            onClick: (
              event: React.MouseEvent<HTMLElement>
            ) =>
              event.stopPropagation(),
            sx: {
              width: {
                xs: 320,
                sm: 390,
              },
              maxWidth:
                "calc(100vw - 32px)",
              mt: 0.75,
              p: 2,
              borderRadius: 2,
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
          spacing={1.2}
        >
          <Box>
            <Typography
              sx={{
                fontWeight: 850,
              }}
            >
              {definition.title}
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 0.4,
                lineHeight: 1.55,
              }}
            >
              {definition.summary}
            </Typography>
          </Box>

          <Divider />

          <ProductivityInfoLine
            label="Como é calculado"
            value={
              definition.calculation
            }
          />

          <ProductivityInfoLine
            label="Fonte"
            value={
              definition.source
            }
          />

          <ProductivityInfoLine
            label="Campo de referência"
            value={
              definition.reference
            }
          />

          <ProductivityInfoLine
            label="Regra de período"
            value={
              definition.periodRule
            }
          />

          {definition.notes && (
            <Box
              sx={{
                p: 1.1,
                borderRadius: 1.5,
                backgroundColor:
                  "rgba(24,199,122,0.055)",
                border:
                  "1px solid rgba(24,199,122,0.16)",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 800,
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
                  display: "block",
                  mt: 0.25,
                  lineHeight: 1.5,
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

function ProductivityInfoLine({
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
          fontWeight: 700,
        }}
      >
        {label}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          mt: 0.15,
          lineHeight: 1.5,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function ProductivityCard({
  title,
  value,
  subtitle,
  info,
  severity = "default",
  onClick,
}: {
  title: string;
  value: ReactNode;
  subtitle: string;
  info: ProductivityInfoDefinition;
  severity?: "default" | "success" | "warning";
  onClick?: () => void;
}) {
  const accentColor =
    severity === "success"
      ? semanticChartColors.positive
      : severity === "warning"
      ? semanticChartColors.attention
      : aliareColors.green;

  return (
    <UnifiedMetricCard
      title={title}
      value={value}
      description={subtitle}
      info={info}
      accentColor={accentColor}
      onClick={onClick}
    />
  );
}

function ProductivityNumber({
  value,
  severity = "default",
  onClick,
}: {
  value: number;
  severity?:
    | "default"
    | "success"
    | "warning";
  onClick?: () => void;
}) {
  return (
    <Button
      size="small"
      variant="text"
      onClick={onClick}
      sx={{
        minWidth: 0,
        p: 0.25,
        fontWeight: 800,
        color:
          severity ===
          "success"
            ? "success.main"
            : severity ===
              "warning"
              ? "warning.main"
              : "text.primary",
      }}
    >
      {value}
    </Button>
  );
}

function OutcomeChip({
  outcome,
}: {
  outcome:
    ProductivityOutcome;
}) {
  if (
    outcome ===
    "DELIVERED"
  ) {
    return (
      <Chip
        size="small"
        color="success"
        variant="outlined"
        label="Entregue c/ versão"
      />
    );
  }

  if (
    outcome ===
    "SUPPORT_CONCLUDED"
  ) {
    return (
      <Chip
        size="small"
        color="success"
        variant="outlined"
        label="APOIO concluído"
      />
    );
  }

  if (
    outcome ===
    "CANCELLED"
  ) {
    return (
      <Chip
        size="small"
        color="warning"
        variant="outlined"
        label="Cancelada"
      />
    );
  }

  if (
    outcome ===
    "CONCLUDED_WITHOUT_VERSION"
  ) {
    return (
      <Chip
        size="small"
        color="warning"
        variant="outlined"
        label="Concluída s/ versão"
      />
    );
  }

  return (
    <Chip
      size="small"
      variant="outlined"
      label="Em andamento"
    />
  );
}

function productivityColor(
  value:
    number |
    null
):
  | "default"
  | "success"
  | "warning"
  | "error" {
  if (
    value ===
    null
  ) {
    return "default";
  }

  if (
    value >=
    85
  ) {
    return "success";
  }

  if (
    value >=
    70
  ) {
    return "warning";
  }

  return "error";
}

function formatHours(
  value:
    number |
    null
): string {
  if (
    value ===
    null
  ) {
    return "—";
  }

  if (
    value <
    24
  ) {
    return `${value.toFixed(1)} h`;
  }

  return `${(
    value /
    24
  ).toFixed(1)} d`;
}

function formatDateForApi(
  value:
    Date
): string {
  const year =
    value.getFullYear();

  const month =
    String(
      value.getMonth() +
      1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      value.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}

function namesLikelySamePerson(
  first: string | null | undefined,
  second: string | null | undefined
): boolean {
  const a =
    normalizePersonName(
      first
    );

  const b =
    normalizePersonName(
      second
    );

  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  const tokensA =
    personNameTokens(a);

  const tokensB =
    personNameTokens(b);

  if (
    tokensA.length < 2 ||
    tokensB.length < 2
  ) {
    return false;
  }

  const shorter =
    tokensA.length <=
    tokensB.length
      ? tokensA
      : tokensB;

  const longer =
    new Set(
      tokensA.length <=
      tokensB.length
        ? tokensB
        : tokensA
    );

  const sameFirstName =
    tokensA[0] ===
    tokensB[0];

  const sameLastName =
    tokensA[
      tokensA.length - 1
    ] ===
    tokensB[
      tokensB.length - 1
    ];

  return (
    sameFirstName &&
    sameLastName &&
    shorter.every(
      (token) =>
        longer.has(token)
    )
  );
}

function normalizePersonName(
  value: string | null | undefined
): string {
  return normalize(value)
    .replace(
      /[^a-z0-9\s]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function personNameTokens(
  value: string
): string[] {
  const ignored =
    new Set([
      "da",
      "das",
      "de",
      "do",
      "dos",
      "e",
    ]);

  return value
    .split(" ")
    .filter(
      (token) =>
        token.length > 0 &&
        !ignored.has(token)
    );
}

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