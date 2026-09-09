import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Pagination,
  Popover,
  Select,
  Stack as MuiStack,
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
  AccountTreeOutlined,
  AssignmentOutlined,
  BlockOutlined,
  BugReportOutlined,
  CloseOutlined,
  ExpandMoreOutlined,
  InfoOutlined,
  LinkOutlined,
  OpenInNewOutlined,
  PersonOffOutlined,
  PriorityHighOutlined,
  RefreshOutlined,
  SearchOutlined,
  TaskAltOutlined,
  TimelineOutlined,
  TuneOutlined,
} from "@mui/icons-material";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from "recharts";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  api,
} from "../services/api";

import { useNavigate, useSearchParams } from "react-router-dom";

import {
  aliareColors,
} from "../theme/theme";

import {
  chartPalette,
  semanticChartColors,
} from "../theme/chartPalette";

/*
 * Compatibilidade com a versão do MUI usada pelo projeto:
 * o runtime do Stack aceita system props como alignItems/justifyContent/flexWrap,
 * mas a tipagem instalada não os expõe diretamente.
 */
function Stack(
  props: React.ComponentProps<typeof MuiStack> & Record<string, unknown>,
) {
  return (
    <MuiStack
      {...props}
    />
  );
}

/* =========================================================
   TIPOS
========================================================= */

type AzureWorkItemType =
  | "Correção Clientes"
  | "Evolução"
  | "APOIO";

type NullableBoolean =
  | boolean
  | null;

type AzureWorkItem = {
  id: number;
  revision: number;
  workItemType: string;
  title: string;
  state: string;
  reason?: string | null;
  assignedToName: string | null;
  client: string | null;
  criticality: string | null;
  module: string | null;
  process: string | null;
  movideskTicket: number | null;
  deliveredVersion: string | null;
  prioritized: NullableBoolean;
  blockedProcess: NullableBoolean;
  parentId?: number | null;
  azureCreatedAt?: string | null;
  azureChangedAt: string | null;
  azureClosedAt?: string | null;
  stateChangedAt?: string | null;
  remoteUrl?: string | null;
  syncedAt: string;
};

type RelatedTicket = {
  id: number;
  movideskId: number;
  protocol: string | null;
  subject: string;
  client: string | null;
  contact: string | null;
  owner: string | null;
  ownerTeam: string | null;
  category: string | null;
  urgency: string | null;
  status: string;
  baseStatus: string | null;
  createdDate: string;
  dueDate: string | null;
  firstResponseDueDate?: string | null;
  firstResponseDate?: string | null;
  resolvedDate: string | null;
  closedDate: string | null;
  responseSlaIndicator?: string | null;
  solutionSlaIndicator?: string | null;
  taskNumber: number | null;
  taskStatus: string | null;
  deliveredVersion: string | null;
  relationType:
    | "TASK_NUMBER"
    | "MOVIDESK_TICKET"
    | "BOTH"
    | string;
};

type RelatedWorkItem = {
  id: number;
  workItemType: string;
  title: string;
  state: string;
  criticality?: string | null;
  assignedToName?: string | null;
  client?: string | null;
  deliveredVersion?: string | null;
  azureChangedAt?: string | null;
};

type SyncRun = {
  id: number;
  batch: string | null;
  status: string;
  source: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type AzureWorkItemDetail =
  AzureWorkItem & {
    areaPath?: string | null;
    iterationPath?: string | null;
    nodeName?: string | null;
    boardColumn?: string | null;

    assignedToEmail?: string | null;
    assignedToId?: string | null;

    createdByName?: string | null;
    changedByName?: string | null;

    origin?: string | null;
    detectedIn?: string | null;

    impactScale?: string | null;
    defectType?: string | null;
    branchType?: string | null;
    correctionType?: string | null;
    rdmNumber?: string | null;
    slaLimit?: string | null;
    tags?: string | null;

    descriptionText?: string | null;
    workaroundText?: string | null;
    technicalSolutionText?: string | null;

    azureWebUrl?: string | null;

    tickets: RelatedTicket[];
    relatedTicket: RelatedTicket | null;

    relations: {
      parent: RelatedWorkItem | null;
      children: RelatedWorkItem[];
    };

    syncRun?: SyncRun | null;
  };

type ListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  items: AzureWorkItem[];
};

type SummaryResponse = {
  type: string | null;
  total: number;
  corrections: number;
  evolutions: number;
  prioritized: number;
  blockedProcess: number;
  withVersion: number;
  withMovideskTicket: number;
  withoutMovideskTicket: number;
  highOrCritical: number;
  unassigned: number;

  dataQuality: {
    withoutClient: number;
    withoutModule: number;
    withoutCriticality: number;
    withoutAssignedTo: number;
    withoutMovideskTicket: number;
  };

  byCriticality: Array<{
    criticality: string | null;
    total: number;
  }>;

  byState: Array<{
    state: string;
    total: number;
  }>;
};

type FiltersResponse = {
  types: string[];
  states: string[];
  assignedTo: string[];
  clients: string[];
  criticalities: string[];
  modules: string[];
  processes: string[];
  versions: string[];
};

type Props = {
  type: AzureWorkItemType;
};

type BooleanFilter =
  | ""
  | "true"
  | "false";

type CardFilter =
  | "all"
  | "prioritized"
  | "blocked"
  | "unassigned"
  | "withoutMovidesk";

type MetricCardDefinition = {
  key: CardFilter;
  label: string;
  value: number;
  description: string;
  info: CardInfo;
  icon: React.ReactNode;
  severity?: "default" | "success" | "warning" | "error" | "info";
};

type PipelineStage = {
  key: string;
  label: string;
  states: string[];
};

type CardInfo = {
  title: string;
  summary: string;
  calculation: string;
  source: string;
  reference?: string;
  periodRule: string;
  notes?: string;
};

type PieDataItem = {
  name: string;
  value: number;
  color: string;
  filterValue?: string;
  clickable?: boolean;
};

/* =========================================================
   CONSTANTES
========================================================= */

const PAGE_SIZE =
  25;

const DRAWER_WIDTH =
  620;

const PIPELINE_STAGES: PipelineStage[] = [
  {
    key: "qualification",
    label: "Qualificação",
    states: [
      "Registro",
      "Qualificação",
    ],
  },
  {
    key: "business",
    label: "Negócio",
    states: [
      "Fila de Negócio",
      "Negócio",
    ],
  },
  {
    key: "development",
    label: "Desenvolvimento",
    states: [
      "Fila Desenvolvimento",
      "Desenvolvimento",
      "Bloqueado Correção",
      "Bloqueado Retrabalho",
    ],
  },
  {
    key: "integration",
    label: "Integração",
    states: [
      "Integração",
    ],
  },
  {
    key: "quality",
    label: "Qualidade",
    states: [
      "Fila Qualidade",
      "Qualidade",
    ],
  },
  {
    key: "completed",
    label: "Concluídas",
    states: [
      "Concluído",
    ],
  },
];

const EMPTY_TEXT =
  "Não informado";

/* =========================================================
   HELPERS
========================================================= */

function formatDateTime(
  value:
    string |
    null |
    undefined,
): string {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "-";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      dateStyle:
        "short",
      timeStyle:
        "short",
    },
  ).format(date);
}

function formatNumber(
  value:
    number |
    null |
    undefined,
): string {
  return (
    value ??
    0
  ).toLocaleString(
    "pt-BR",
  );
}

function normalizeText(
  value:
    string |
    null |
    undefined,
): string {
  return (
    value?.trim() ||
    EMPTY_TEXT
  );
}

function criticalityTone(
  criticality:
    string |
    null |
    undefined,
):
  | "error"
  | "warning"
  | "success"
  | "default" {
  const normalized =
    criticality
      ?.trim()
      .toLocaleLowerCase(
        "pt-BR",
      );

  if (
    normalized ===
    "crítica"
  ) {
    return "error";
  }

  if (
    normalized ===
    "alta"
  ) {
    return "warning";
  }

  if (
    normalized ===
    "baixa"
  ) {
    return "success";
  }

  return "default";
}

function slaTone(
  value:
    string |
    null |
    undefined,
):
  | "success"
  | "error"
  | "default" {
  const normalized =
    value
      ?.trim()
      .toLocaleLowerCase(
        "pt-BR",
      );

  if (
    normalized?.includes(
      "no prazo",
    )
  ) {
    return "success";
  }

  if (
    normalized?.includes(
      "fora",
    )
  ) {
    return "error";
  }

  return "default";
}

/* =========================================================
   COMPONENTES AUXILIARES
========================================================= */

function CardInfoButton({
  info,
}: {
  info: CardInfo;
}) {
  const [
    anchorEl,
    setAnchorEl,
  ] =
    useState<HTMLElement | null>(null);

  const open =
    Boolean(anchorEl);

  return (
    <>
      <IconButton
        size="small"
        aria-label={`Informações sobre ${info.title}`}
        title={`Informações sobre ${info.title}`}
        onClick={(event) => {
          event.stopPropagation();
          setAnchorEl(event.currentTarget);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
        sx={{
          width: 28,
          height: 28,
          p: 0.35,
          color: "text.secondary",
          flexShrink: 0,
        }}
      >
        <InfoOutlined
          sx={{
            fontSize: 17,
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
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        onClick={(event) =>
          event.stopPropagation()
        }
        slotProps={{
          paper: {
            sx: {
              width: 350,
              maxWidth: "calc(100vw - 32px)",
              p: 2,
              borderRadius: 2,
            },
          },
        }}
      >
        <Typography
          sx={{
            fontWeight: 800,
          }}
        >
          {info.title}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 0.75,
          }}
        >
          {info.summary}
        </Typography>

        <Divider
          sx={{
            my: 1.5,
          }}
        />

        <InfoLine
          label="Cálculo"
          value={info.calculation}
        />

        <InfoLine
          label="Fonte"
          value={info.source}
        />

        {info.reference && (
          <InfoLine
            label="Referência"
            value={info.reference}
          />
        )}

        <InfoLine
          label="Recorte"
          value={info.periodRule}
        />

        {info.notes && (
          <InfoLine
            label="Observação"
            value={info.notes}
          />
        )}
      </Popover>
    </>
  );
}

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Box
      sx={{
        mt: 1,
      }}
    >
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
          lineHeight: 1.45,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function InfoHint({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <CardInfoButton
      info={{
        title,
        summary: text,
        calculation:
          "Indicador informativo da seção.",
        source:
          "TechLead Hub / Azure DevOps",
        periodRule:
          "Respeita o recorte atual da tela quando aplicável.",
      }}
    />
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value:
    React.ReactNode;
}) {
  return (
    <Box
      sx={{
        minWidth:
          0,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display:
            "block",
          mb:
            0.35,
          fontWeight:
            700,
        }}
      >
        {label}
      </Typography>

      <Typography
        variant="body2"
       
        sx={{
          fontWeight:
            600,
          overflowWrap:
            "anywhere",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function TextSection({
  title,
  value,
  defaultExpanded = false,
}: {
  title: string;
  value:
    string |
    null |
    undefined;
  defaultExpanded?: boolean;
}) {
  if (!value?.trim()) {
    return null;
  }

  return (
    <Accordion
      disableGutters
      defaultExpanded={
        defaultExpanded
      }
      elevation={0}
      sx={{
        border:
          "1px solid",
        borderColor:
          "divider",
        borderRadius:
          "10px !important",
        "&::before": {
          display:
            "none",
        },
      }}
    >
      <AccordionSummary
        expandIcon={
          <ExpandMoreOutlined />
        }
      >
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight:
              800,
          }}
        >
          {title}
        </Typography>
      </AccordionSummary>

      <AccordionDetails>
        <Typography
          variant="body2"
          sx={{
            whiteSpace:
              "pre-wrap",
            lineHeight:
              1.65,
            color:
              "text.secondary",
          }}
        >
          {value}
        </Typography>
      </AccordionDetails>
    </Accordion>
  );
}

function AnalysisDonutCard({
  title,
  subtitle,
  centerValue,
  centerLabel,
  data,
  info,
  onItemClick,
}: {
  title: string;
  subtitle: string;
  centerValue: string | number;
  centerLabel: string;
  data: PieDataItem[];
  info: CardInfo;
  onItemClick?: (
    item:
      PieDataItem,
  ) => void;
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
      <CardContent>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems:
              "flex-start",
            justifyContent:
              "space-between",
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
              {title}
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
            >
              {subtitle}
            </Typography>
          </Box>

          <CardInfoButton
            info={
              info
            }
          />
        </Stack>

        <Box
          sx={{
            height:
              205,
            mt:
              1,
          }}
        >
          {data.length >
          0 ? (
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <PieChart>
                <Pie
                  data={
                    data
                  }
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={84}
                  paddingAngle={2}
                  stroke="none"
                  cursor="pointer"
                  onClick={(entry) => {
                    const candidate =
                      entry as
                        | PieDataItem
                        | {
                            payload?:
                              PieDataItem;
                          };

                    const item =
                      "payload" in
                        candidate &&
                      candidate.payload
                        ? candidate.payload
                        : candidate as PieDataItem;

                    if (
                      item.clickable !==
                      false
                    ) {
                      onItemClick?.(
                        item,
                      );
                    }
                  }}
                >
                  {data.map(
                    (
                      item,
                    ) => (
                      <Cell
                        key={
                          item.name
                        }
                        fill={
                          item.color
                        }
                      />
                    ),
                  )}
                </Pie>

                <ChartTooltip />

                <text
                  x="50%"
                  y="47%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontSize:
                      22,
                    fontWeight:
                      800,
                    fill:
                      aliareColors.text,
                  }}
                >
                  {centerValue}
                </text>

                <text
                  x="50%"
                  y="59%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontSize:
                      11,
                    fill:
                      aliareColors.textSecondary,
                  }}
                >
                  {centerLabel}
                </text>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Box
              sx={{
                height:
                  "100%",
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
                Sem dados para este indicador.
              </Typography>
            </Box>
          )}
        </Box>

        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{
            justifyContent:
              "center",
            alignItems:
              "center",
            flexWrap:
              "wrap",
            mt:
              0.5,
          }}
        >
          {data.map(
            (
              item,
            ) => (
              <Box
                key={
                  item.name
                }
                role={
                  item.clickable ===
                  false
                    ? undefined
                    : "button"
                }
                tabIndex={
                  item.clickable ===
                  false
                    ? undefined
                    : 0
                }
                onClick={() => {
                  if (
                    item.clickable !==
                    false
                  ) {
                    onItemClick?.(
                      item,
                    );
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    item.clickable !==
                      false &&
                    (
                      event.key ===
                        "Enter" ||
                      event.key ===
                        " "
                    )
                  ) {
                    onItemClick?.(
                      item,
                    );
                  }
                }}
                sx={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap:
                    0.55,
                  px:
                    0.4,
                  py:
                    0.2,
                  borderRadius:
                    1,
                  cursor:
                    item.clickable ===
                    false
                      ? "default"
                      : "pointer",
                  "&:hover":
                    item.clickable ===
                    false
                      ? undefined
                      : {
                          backgroundColor:
                            "action.hover",
                        },
                }}
              >
                <Box
                  sx={{
                    width:
                      10,
                    height:
                      10,
                    borderRadius:
                      "50%",
                    backgroundColor:
                      item.color,
                    flexShrink:
                      0,
                  }}
                />

                <Typography
                  variant="caption"
                  sx={{
                    fontWeight:
                      600,
                  }}
                >
                  {item.name}
                </Typography>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight:
                      800,
                  }}
                >
                  {formatNumber(
                    item.value,
                  )}
                </Typography>
              </Box>
            ),
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

/* =========================================================
   COMPONENTE
========================================================= */

export function AzureWorkItems({
  type,
}: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    detailLoading,
    setDetailLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    detailError,
    setDetailError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    summary,
    setSummary,
  ] =
    useState<SummaryResponse | null>(
      null,
    );

  const [
    filters,
    setFilters,
  ] =
    useState<FiltersResponse | null>(
      null,
    );

  const [
    list,
    setList,
  ] =
    useState<ListResponse | null>(
      null,
    );

  const [
    selectedWorkItem,
    setSelectedWorkItem,
  ] =
    useState<AzureWorkItemDetail | null>(
      null,
    );

  const [
    drawerOpen,
    setDrawerOpen,
  ] =
    useState(false);

  const [
    page,
    setPage,
  ] =
    useState(1);

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    appliedSearch,
    setAppliedSearch,
  ] =
    useState("");

  const [
    state,
    setState,
  ] =
    useState("");

  const [
    criticality,
    setCriticality,
  ] =
    useState("");

  const [
    assignedTo,
    setAssignedTo,
  ] =
    useState("");

  const [
    client,
    setClient,
  ] =
    useState("");

  const [
    module,
    setModule,
  ] =
    useState("");

  const [
    process,
    setProcess,
  ] =
    useState("");

  const [
    deliveredVersion,
    setDeliveredVersion,
  ] =
    useState("");

  const [
    prioritized,
    setPrioritized,
  ] =
    useState<BooleanFilter>(
      "",
    );

  const [
    blockedProcess,
    setBlockedProcess,
  ] =
    useState<BooleanFilter>(
      "",
    );

  const [
    hasMovideskTicket,
    setHasMovideskTicket,
  ] =
    useState<BooleanFilter>(
      "",
    );

  const [
    hasAssignedTo,
    setHasAssignedTo,
  ] =
    useState<BooleanFilter>(
      "",
    );

  const [
    activeCard,
    setActiveCard,
  ] =
    useState<CardFilter>(
      "all",
    );

  const [
    showMoreFilters,
    setShowMoreFilters,
  ] =
    useState(false);

  const [
    sortDirection,
    setSortDirection,
  ] =
    useState<"asc" | "desc">(
      "desc",
    );

  const advancedFilterCount =
    [
      module,
      process,
      deliveredVersion,
      prioritized,
      blockedProcess,
      hasMovideskTicket,
      hasAssignedTo,
    ].filter(
      (value) =>
        value !== "",
    ).length;

  /* =======================================================
     CONFIGURAÇÃO DA PÁGINA
  ======================================================= */

  const isCorrection =
    type ===
    "Correção Clientes";

  const isSupport =
    type ===
    "APOIO";

  const title =
    isCorrection
      ? "Correções"
      : isSupport
        ? "Apoios"
        : "Evoluções";

  const itemLabel =
    isCorrection
      ? "correções"
      : isSupport
        ? "apoios"
        : "evoluções";

  const subtitle =
    isCorrection
      ? "Visão operacional e gerencial das correções do SIMER sincronizadas com o Azure DevOps."
      : isSupport
        ? "Visão operacional e gerencial dos APOIOs vinculados aos atendimentos do Movidesk."
        : "Visão operacional e gerencial das evoluções do SIMER sincronizadas com o Azure DevOps.";

  /* =======================================================
     CARREGAMENTO
  ======================================================= */

  const loadSummary =
    useCallback(
      async () => {
        const response =
          await api.get<SummaryResponse>(
            "/azure-work-items/summary",
            {
              params: {
                type,
              },
            },
          );

        setSummary(
          response.data,
        );
      },
      [
        type,
      ],
    );

  const loadFilters =
    useCallback(
      async () => {
        const response =
          await api.get<FiltersResponse>(
            "/azure-work-items/filters",
            {
              params: {
                type,
              },
            },
          );

        setFilters(
          response.data,
        );
      },
      [
        type,
      ],
    );

  const loadList =
    useCallback(
      async () => {
        const response =
          await api.get<ListResponse>(
            "/azure-work-items",
            {
              params: {
                type,
                page,
                pageSize:
                  PAGE_SIZE,

                search:
                  appliedSearch ||
                  undefined,

                state:
                  state ||
                  undefined,

                criticality:
                  criticality ||
                  undefined,

                assignedTo:
                  assignedTo ||
                  undefined,

                client:
                  client ||
                  undefined,

                module:
                  module ||
                  undefined,

                process:
                  process ||
                  undefined,

                deliveredVersion:
                  deliveredVersion ||
                  undefined,

                prioritized:
                  prioritized ===
                  ""
                    ? undefined
                    : prioritized,

                blockedProcess:
                  blockedProcess ===
                  ""
                    ? undefined
                    : blockedProcess,

                hasMovideskTicket:
                  hasMovideskTicket ===
                  ""
                    ? undefined
                    : hasMovideskTicket,

                hasAssignedTo:
                  hasAssignedTo ===
                  ""
                    ? undefined
                    : hasAssignedTo,

                sortBy:
                  "stateChangedAt",

                sortDirection,
              },
            },
          );

        setList(
          response.data,
        );
      },
      [
        appliedSearch,
        assignedTo,
        blockedProcess,
        client,
        criticality,
        deliveredVersion,
        hasAssignedTo,
        hasMovideskTicket,
        module,
        page,
        prioritized,
        process,
        sortDirection,
        state,
        type,
      ],
    );

  const loadAll =
    useCallback(
      async () => {
        try {
          setLoading(
            true,
          );

          setError(
            null,
          );

          await Promise.all([
            loadSummary(),
            loadFilters(),
            loadList(),
          ]);
        } catch (
          loadError
        ) {
          console.error(
            "[AzureWorkItems]",
            loadError,
          );

          setError(
            "Não foi possível carregar os dados sincronizados do Azure DevOps.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        loadFilters,
        loadList,
        loadSummary,
      ],
    );

  useEffect(() => {
    void loadAll();
  }, [
    loadAll,
  ]);

  useEffect(() => {
    const timeout =
      window.setTimeout(
        () => {
          const normalized =
            search.trim();

          if (
            normalized !==
            appliedSearch
          ) {
            setPage(1);
            setAppliedSearch(
              normalized,
            );
          }
        },
        400,
      );

    return () =>
      window.clearTimeout(
        timeout,
      );
  }, [
    search,
    appliedSearch,
  ]);

  useEffect(() => {
    setPage(
      1,
    );

    setSearch(
      "",
    );

    setAppliedSearch(
      "",
    );

    setState(
      "",
    );

    setCriticality(
      "",
    );

    setAssignedTo(
      "",
    );

    setClient(
      "",
    );

    setModule(
      "",
    );

    setProcess(
      "",
    );

    setDeliveredVersion(
      "",
    );

    setPrioritized(
      "",
    );

    setBlockedProcess(
      "",
    );

    setHasMovideskTicket(
      "",
    );

    setHasAssignedTo(
      "",
    );

    setActiveCard(
      "all",
    );

    setSortDirection(
      "desc",
    );

    setDrawerOpen(
      false,
    );

    setSelectedWorkItem(
      null,
    );
  }, [
    type,
  ]);

  /* =======================================================
     KPIs
  ======================================================= */

  const cards =
    useMemo<MetricCardDefinition[]>(
      () => [
        {
          key:
            "all",
          label:
            title,
          value:
            summary?.total ??
            0,
          description:
            "Total sincronizado no recorte",
          info: {
            title:
              isCorrection
                ? "Correções"
                : "Evoluções",
            summary:
              `Quantidade total de ${itemLabel} disponíveis no banco local para o recorte atual.`,
            calculation:
              "Contagem dos Work Items sincronizados do tipo selecionado.",
            source:
              "Azure DevOps sincronizado no PostgreSQL do TechLead Hub",
            reference:
              "System.WorkItemType",
            periodRule:
              "Não utiliza período de abertura; representa o snapshot local sincronizado e os filtros aplicados na listagem.",
            notes:
              "Clique no card para limpar os filtros operacionais e voltar ao conjunto completo deste tipo.",
          },
          icon:
            isCorrection
              ? <BugReportOutlined />
              : isSupport
                ? <AssignmentOutlined />
                : <TimelineOutlined />,
          severity:
            "default",
        },
        {
          key:
            "prioritized",
          label:
            "Priorizadas",
          value:
            summary?.prioritized ??
            0,
          description:
            "Marcadas como prioridade",
          info: {
            title:
              "Priorizadas",
            summary:
              "Work Items em que a marcação de priorização está ativa.",
            calculation:
              "Contagem de Work Items com prioritized = true.",
            source:
              "Azure DevOps",
            reference:
              "Campo de priorização sincronizado",
            periodRule:
              "Snapshot local do tipo selecionado.",
            notes:
              "Clique para filtrar exatamente os Work Items priorizados.",
          },
          icon:
            <PriorityHighOutlined />,
          severity:
            (summary?.prioritized ?? 0) > 0
              ? "warning"
              : "default",
        },
        {
          key:
            "blocked",
          label:
            "Processo bloqueado",
          value:
            summary?.blockedProcess ??
            0,
          description:
            "Com bloqueio de processo",
          info: {
            title:
              "Processo bloqueado",
            summary:
              "Work Items sinalizados como bloqueio de processo, um indicador de impacto operacional relevante para coordenação.",
            calculation:
              "Contagem de Work Items com blockedProcess = true.",
            source:
              "Azure DevOps",
            reference:
              "Campo Processo Bloqueado",
            periodRule:
              "Snapshot local do tipo selecionado.",
            notes:
              "Clique para listar exatamente os itens bloqueados.",
          },
          icon:
            <BlockOutlined />,
          severity:
            (summary?.blockedProcess ?? 0) > 0
              ? "error"
              : "success",
        },
        {
          key:
            "unassigned",
          label:
            "Sem responsável",
          value:
            summary?.unassigned ??
            0,
          description:
            "Sem Assigned To",
          info: {
            title:
              "Sem responsável",
            summary:
              "Work Items sem responsável atribuído no Azure DevOps.",
            calculation:
              "Contagem dos itens em que Assigned To não possui valor.",
            source:
              "Azure DevOps",
            reference:
              "System.AssignedTo",
            periodRule:
              "Snapshot local do tipo selecionado.",
            notes:
              "Ajuda a identificar itens sem dono operacional. Clique para filtrar.",
          },
          icon:
            <PersonOffOutlined />,
          severity:
            (summary?.unassigned ?? 0) > 0
              ? "warning"
              : "success",
        },
        {
          key:
            "withoutMovidesk",
          label:
            "Sem Movidesk na Task",
          value:
            summary?.withoutMovideskTicket ??
            0,
          description:
            "Campo Movidesk não informado",
          info: {
            title:
              "Sem Movidesk na Task",
            summary:
              "Work Items cujo campo de ticket Movidesk está vazio no Azure.",
            calculation:
              "Contagem dos Work Items sem movideskTicket informado.",
            source:
              "Azure DevOps",
            reference:
              "Campo Movidesk Ticket sincronizado",
            periodRule:
              "Snapshot local do tipo selecionado.",
            notes:
              "A ausência do campo não significa necessariamente inexistência total de vínculo: o atendimento também pode apontar para a Task pelo número da tarefa.",
          },
          icon:
            <LinkOutlined />,
          severity:
            (summary?.withoutMovideskTicket ?? 0) > 0
              ? "warning"
              : "success",
        },
      ],
      [
        isCorrection,
        isSupport,
        itemLabel,
        summary,
        title,
      ],
    );

  const pipeline =
    useMemo(
      () =>
        PIPELINE_STAGES.map(
          (
            stage,
          ) => {
            const total =
              stage.states.reduce(
                (
                  accumulator,
                  stageState,
                ) =>
                  accumulator +
                  (
                    summary?.byState.find(
                      (
                        item,
                      ) =>
                        item.state ===
                        stageState,
                    )?.total ??
                    0
                  ),
                0,
              );

            return {
              ...stage,
              total,
            };
          },
        ),
      [
        summary,
      ],
    );

  const uncategorizedStates =
    useMemo(
      () =>
        (
          summary?.byState ??
          []
        ).filter(
          (
            item,
          ) =>
            !PIPELINE_STAGES.some(
              (
                stage,
              ) =>
                stage.states.includes(
                  item.state,
                ),
            ),
        ),
      [
        summary,
      ],
    );

  const stateChartData =
    useMemo<PieDataItem[]>(
      () =>
        (
          summary?.byState ??
          []
        )
          .filter(
            (item) =>
              item.total >
              0,
          )
          .sort(
            (a, b) =>
              b.total -
              a.total,
          )
          .map(
            (item, index) => ({
              name:
                item.state,
              value:
                item.total,
              color:
                chartPalette[
                  index %
                  chartPalette.length
                ],
              filterValue:
                item.state,
              clickable:
                true,
            }),
          ),
      [
        summary,
      ],
    );

  const criticalityChartData =
    useMemo<PieDataItem[]>(
      () =>
        (
          summary?.byCriticality ??
          []
        )
          .filter(
            (item) =>
              item.total >
              0,
          )
          .sort(
            (a, b) =>
              b.total -
              a.total,
          )
          .map(
            (item, index) => {
              const label =
                item.criticality?.trim() ||
                "Não informada";

              const normalized =
                label
                  .normalize("NFD")
                  .replace(
                    /[\u0300-\u036f]/g,
                    "",
                  )
                  .toLowerCase();

              const color =
                normalized ===
                "critica"
                  ? semanticChartColors.overdue
                  : normalized ===
                    "alta"
                  ? semanticChartColors.attention
                  : chartPalette[
                      index %
                      chartPalette.length
                    ];

              return {
                name:
                  label,
                value:
                  item.total,
                color,
                filterValue:
                  item.criticality ??
                  undefined,
                clickable:
                  Boolean(
                    item.criticality?.trim(),
                  ),
              };
            },
          ),
      [
        summary,
      ],
    );

  const movideskChartData =
    useMemo<PieDataItem[]>(
      () => [
        {
          name:
            "Com Movidesk",
          value:
            summary?.withMovideskTicket ??
            0,
          color:
            aliareColors.green,
          filterValue:
            "true",
          clickable:
            true,
        },
        {
          name:
            "Sem Movidesk",
          value:
            summary?.withoutMovideskTicket ??
            0,
          color:
            semanticChartColors.attention,
          filterValue:
            "false",
          clickable:
            true,
        },
      ].filter(
        (item) =>
          item.value >
          0,
      ),
      [
        summary,
      ],
    );

  /* =======================================================
     BUSCA / FILTROS
  ======================================================= */

  function handleSearch() {
    setPage(
      1,
    );

    setAppliedSearch(
      search.trim(),
    );
  }

  function clearOperationalFilters() {
    setState(
      "",
    );

    setCriticality(
      "",
    );

    setAssignedTo(
      "",
    );

    setClient(
      "",
    );

    setModule(
      "",
    );

    setProcess(
      "",
    );

    setDeliveredVersion(
      "",
    );

    setPrioritized(
      "",
    );

    setBlockedProcess(
      "",
    );

    setHasMovideskTicket(
      "",
    );

    setHasAssignedTo(
      "",
    );

    setActiveCard(
      "all",
    );
  }

  function handleClearFilters() {
    setPage(
      1,
    );

    setSearch(
      "",
    );

    setAppliedSearch(
      "",
    );

    clearOperationalFilters();
  }

  function handleCardClick(
    card:
      CardFilter,
  ) {
    setPage(
      1,
    );

    clearOperationalFilters();

    if (
      card ===
      "all"
    ) {
      return;
    }

    setActiveCard(
      card,
    );

    if (
      card ===
      "prioritized"
    ) {
      setPrioritized(
        "true",
      );
    }

    if (
      card ===
      "blocked"
    ) {
      setBlockedProcess(
        "true",
      );
    }

    if (
      card ===
      "unassigned"
    ) {
      setHasAssignedTo(
        "false",
      );
    }

    if (
      card ===
      "withoutMovidesk"
    ) {
      setHasMovideskTicket(
        "false",
      );
    }
  }

  function handlePipelineClick(
    stage:
      PipelineStage,
  ) {
    setPage(
      1,
    );

    setActiveCard(
      "all",
    );

    setPrioritized(
      "",
    );

    setBlockedProcess(
      "",
    );

    setHasMovideskTicket(
      "",
    );

    setHasAssignedTo(
      "",
    );

    /*
     * A API atual filtra um estado por vez.
     * Para estágios compostos, usamos o primeiro estado existente
     * no resumo. O detalhamento completo do estágio permanece visível
     * no próprio pipeline.
     */
    const availableState =
      stage.states.find(
        (
          candidate,
        ) =>
          (
            summary?.byState.find(
              (
                item,
              ) =>
                item.state ===
                candidate,
            )?.total ??
            0
          ) > 0,
      );

    setState(
      availableState ??
      stage.states[0] ??
      "",
    );
  }

  function handleStateChartClick(
    item:
      PieDataItem,
  ) {
    if (
      !item.clickable ||
      !item.filterValue
    ) {
      return;
    }

    setPage(
      1,
    );

    setActiveCard(
      "all",
    );

    setState(
      item.filterValue,
    );
  }

  function handleCriticalityChartClick(
    item:
      PieDataItem,
  ) {
    if (
      !item.clickable ||
      !item.filterValue
    ) {
      return;
    }

    setPage(
      1,
    );

    setActiveCard(
      "all",
    );

    setCriticality(
      item.filterValue,
    );
  }

  function handleMovideskChartClick(
    item:
      PieDataItem,
  ) {
    if (
      !item.clickable ||
      (
        item.filterValue !==
        "true" &&
        item.filterValue !==
        "false"
      )
    ) {
      return;
    }

    setPage(
      1,
    );

    setActiveCard(
      item.filterValue ===
      "false"
        ? "withoutMovidesk"
        : "all",
    );

    setHasMovideskTicket(
      item.filterValue as BooleanFilter,
    );
  }

  /* =======================================================
     DETALHE
  ======================================================= */

  const openDetail =
    useCallback(
      async (
        id:
          number,
      ) => {
        try {
          setDrawerOpen(
            true,
          );

          setDetailLoading(
            true,
          );

          setDetailError(
            null,
          );

          setSelectedWorkItem(
            null,
          );

          const response =
            await api.get<AzureWorkItemDetail>(
              `/azure-work-items/${id}`,
            );

          setSelectedWorkItem(
            response.data,
          );
        } catch (
          detailLoadError
        ) {
          console.error(
            "[AzureWorkItems:detail]",
            detailLoadError,
          );

          setDetailError(
            "Não foi possível carregar os detalhes desta tarefa.",
          );
        } finally {
          setDetailLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(() => {
    const taskParam = Number(searchParams.get("task"));

    if (Number.isInteger(taskParam) && taskParam > 0) {
      void openDetail(taskParam);
    }
  }, [searchParams, openDetail]);

  function openTicketInHub(movideskId: number) {
    navigate(`/tickets?movidesk=${movideskId}`);
  }

  function closeDetail() {
    setDrawerOpen(
      false,
    );

    setDetailError(
      null,
    );
  }

  const orderedTickets =
    useMemo(
      () => {
        if (
          !selectedWorkItem
        ) {
          return [];
        }

        return [
          ...selectedWorkItem.tickets,
        ].sort(
          (
            first,
            second,
          ) => {
            const firstOrigin =
              selectedWorkItem.movideskTicket ===
              first.movideskId;

            const secondOrigin =
              selectedWorkItem.movideskTicket ===
              second.movideskId;

            if (
              firstOrigin &&
              !secondOrigin
            ) {
              return -1;
            }

            if (
              secondOrigin &&
              !firstOrigin
            ) {
              return 1;
            }

            return (
              new Date(
                second.createdDate,
              ).getTime() -
              new Date(
                first.createdDate,
              ).getTime()
            );
          },
        );
      },
      [
        selectedWorkItem,
      ],
    );

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <>
      <Stack
        spacing={2.5}
      >
        {/* =================================================
            CABEÇALHO
        ================================================= */}

        <Stack
          direction={{
            xs:
              "column",
            md:
              "row",
          }}
          spacing={2}
          sx={{
            alignItems: {
              md:
                "center",
            },
            justifyContent:
              "space-between",
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
                  width: 30,
                  height: 3,
                  borderRadius: 99,
                  backgroundColor:
                    aliareColors.green,
                }}
              />

              <Typography
                variant="caption"
                sx={{
                  fontWeight: 800,
                  letterSpacing:
                    "0.08em",
                  textTransform:
                    "uppercase",
                  color:
                    aliareColors.greenDark,
                }}
              >
                Desenvolvimento
              </Typography>
            </Stack>

            <Typography
              sx={{
                mt: 0.8,
                fontWeight: 800,
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
              {title}
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 0.25,
              }}
            >
              {subtitle}
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
              {formatNumber(summary?.total)} Work Item(s) sincronizado(s)
            </Typography>
          </Box>

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: {
                  xs:
                    "none",
                  md:
                    "block",
                },
              }}
            >
              Dados locais sincronizados com Azure DevOps
            </Typography>

            <Button
              variant="outlined"
              startIcon={
                <RefreshOutlined />
              }
              onClick={() =>
                void loadAll()
              }
            >
              Recarregar
            </Button>
          </Stack>
        </Stack>

        {error && (
          <Alert
            severity="error"
          >
            {error}
          </Alert>
        )}

        {/* =================================================
            KPIs
        ================================================= */}

        <Box
          sx={{
            order:
              1,
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
            gap: {
              xs:
                1.25,
              md:
                1.5,
              xl:
                2,
            },
          }}
        >
          {cards.map(
            (
              card,
            ) => {
              const active =
                activeCard ===
                card.key;

              const accentColor =
                card.severity ===
                "error"
                  ? semanticChartColors.overdue
                  : card.severity ===
                    "warning"
                  ? semanticChartColors.attention
                  : card.severity ===
                    "info"
                  ? semanticChartColors.normal
                  : aliareColors.green;

              return (
                <Card
                  key={
                    card.key
                  }
                  elevation={0}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    handleCardClick(
                      card.key,
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                        "Enter" ||
                      event.key ===
                        " "
                    ) {
                      handleCardClick(
                        card.key,
                      );
                    }
                  }}
                  sx={{
                    position:
                      "relative",
                    overflow:
                      "hidden",
                    height:
                      "100%",
                    minHeight:
                      122,
                    border:
                      "1px solid",
                    borderColor:
                      active
                        ? accentColor
                        : "divider",
                    borderRadius:
                      2.25,
                    cursor:
                      "pointer",
                    backgroundColor:
                      "background.paper",
                    boxShadow:
                      active
                        ? `0 0 0 1px ${accentColor}`
                        : "none",
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
                  }}
                >
                  <CardContent
                    sx={{
                      p: {
                        xs:
                          1.4,
                        md:
                          1.55,
                      },
                      "&:last-child": {
                        pb: {
                          xs:
                            1.4,
                          md:
                            1.55,
                        },
                      },
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{
                        alignItems:
                          "flex-start",
                        justifyContent:
                          "space-between",
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
                              750,
                          }}
                        >
                          {card.label}
                        </Typography>

                        <Typography
                          sx={{
                            mt:
                              0.55,
                            fontSize: {
                              xs:
                                "1.65rem",
                              md:
                                "1.8rem",
                              xl:
                                "1.9rem",
                            },
                            fontWeight:
                              800,
                            lineHeight:
                              1.1,
                            fontVariantNumeric:
                              "tabular-nums",
                          }}
                        >
                          {formatNumber(
                            card.value,
                          )}
                        </Typography>
                      </Box>

                      <Stack
                        direction="row"
                        spacing={0.25}
                        sx={{
                          alignItems:
                            "center",
                        }}
                      >
                        <Box
                          sx={{
                            display:
                              "flex",
                            color:
                              accentColor,
                          }}
                        >
                          {card.icon}
                        </Box>

                        <CardInfoButton
                          info={
                            card.info
                          }
                        />
                      </Stack>
                    </Stack>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display:
                          "block",
                        mt:
                          0.75,
                      }}
                    >
                      {card.description}
                    </Typography>

                  </CardContent>
                </Card>
              );
            },
          )}
        </Box>

        {/* =================================================
            ANÁLISE EXECUTIVA
        ================================================= */}

        <Box
          sx={{
            order:
              3,
            display:
              "grid",
            gridTemplateColumns: {
              xs:
                "1fr",
              xl:
                "repeat(3, minmax(0, 1fr))",
            },
            gap:
              1.5,
          }}
        >
          <AnalysisDonutCard
            title="Distribuição por estado"
            subtitle="Composição atual do fluxo no Azure"
            centerValue={
              summary?.total ??
              0
            }
            centerLabel="Work Items"
            data={
              stateChartData
            }
            info={{
              title:
                "Distribuição por estado",
              summary:
                "Mostra como os Work Items estão distribuídos entre os estados sincronizados do Azure.",
              calculation:
                "Contagem de Work Items agrupados por estado atual.",
              source:
                "Azure DevOps",
              reference:
                "System.State",
              periodRule:
                "Snapshot sincronizado do tipo selecionado.",
              notes:
                "Clique em uma fatia ou legenda para filtrar a lista pelo estado correspondente.",
            }}
            onItemClick={
              handleStateChartClick
            }
          />

          <AnalysisDonutCard
            title="Criticidade"
            subtitle="Distribuição dos itens por criticidade"
            centerValue={
              summary?.total ??
              0
            }
            centerLabel="Work Items"
            data={
              criticalityChartData
            }
            info={{
              title:
                "Criticidade",
              summary:
                "Distribuição da carteira conforme a criticidade cadastrada no Azure.",
              calculation:
                "Contagem agrupada pelo campo de criticidade.",
              source:
                "Azure DevOps",
              reference:
                "Criticidade sincronizada",
              periodRule:
                "Snapshot sincronizado do tipo selecionado.",
              notes:
                "Criticidades informadas são clicáveis. Registros sem criticidade ficam visíveis para análise de qualidade, mas não são filtrados automaticamente porque a API atual não possui filtro específico para valor vazio.",
            }}
            onItemClick={
              handleCriticalityChartClick
            }
          />

          <AnalysisDonutCard
            title="Vínculo com Movidesk"
            subtitle="Qualidade do relacionamento Task × atendimento"
            centerValue={
              summary?.total ??
              0
            }
            centerLabel="Work Items"
            data={
              movideskChartData
            }
            info={{
              title:
                "Vínculo com Movidesk",
              summary:
                "Compara Work Items com e sem número Movidesk preenchido diretamente na Task.",
              calculation:
                "Com Movidesk + sem Movidesk = total sincronizado do tipo.",
              source:
                "Azure DevOps",
              reference:
                "Campo Movidesk Ticket",
              periodRule:
                "Snapshot sincronizado do tipo selecionado.",
              notes:
                "Clique em uma cor para filtrar a listagem exatamente pela presença ou ausência do número Movidesk na Task.",
            }}
            onItemClick={
              handleMovideskChartClick
            }
          />
        </Box>

        {/* =================================================
            PIPELINE
        ================================================= */}

        <Card
          variant="outlined"
          sx={{
            order:
              4,
          }}
        >
          <CardContent>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={1}
              sx={{
                mb:
                  1.5,
              }}
            >
              <Box>
                <Stack
                  direction="row"
                  spacing={0.5}
                  alignItems="center"
                >
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight:
                        800,
                    }}
                  >
                    Pipeline
                  </Typography>

                  <InfoHint
                    title="Pipeline"
                    text="Distribuição dos Work Items pelos principais estágios do fluxo. Os números são derivados do estado atual sincronizado do Azure DevOps."
                  />
                </Stack>

                <Typography
                  variant="caption"
                  color="text.secondary"
                >
                  Clique em um estágio para filtrar a listagem pelo primeiro estado ativo daquele estágio.
                </Typography>
              </Box>

              <AccountTreeOutlined
                sx={{
                  color:
                    "text.secondary",
                }}
              />
            </Stack>

            <Box
              sx={{
                display:
                  "grid",
                gridTemplateColumns: {
                  xs:
                    "repeat(2, minmax(0, 1fr))",
                  md:
                    "repeat(3, minmax(0, 1fr))",
                  xl:
                    "repeat(6, minmax(0, 1fr))",
                },
                gap:
                  1,
              }}
            >
              {pipeline.map(
                (
                  stage,
                ) => (
                  <Box
                    key={
                      stage.key
                    }
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      handlePipelineClick(
                        stage,
                      )
                    }
                    onKeyDown={(
                      event,
                    ) => {
                      if (
                        event.key ===
                          "Enter" ||
                        event.key ===
                          " "
                      ) {
                        handlePipelineClick(
                          stage,
                        );
                      }
                    }}
                    sx={{
                      p:
                        1.4,
                      border:
                        "1px solid",
                      borderColor:
                        stage.states.includes(
                          state,
                        )
                          ? aliareColors.green
                          : "divider",
                      borderRadius:
                        2,
                      cursor:
                        "pointer",
                      bgcolor:
                        stage.states.includes(
                          state,
                        )
                          ? "action.selected"
                          : "background.paper",
                      "&:hover": {
                        borderColor:
                          aliareColors.green,
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
                      {stage.label}
                    </Typography>

                    <Typography
                      sx={{
                        mt:
                          0.3,
                        fontSize:
                          "1.35rem",
                        fontWeight:
                          800,
                        fontVariantNumeric:
                          "tabular-nums",
                      }}
                    >
                      {formatNumber(
                        stage.total,
                      )}
                    </Typography>
                  </Box>
                ),
              )}
            </Box>

            {uncategorizedStates.length >
              0 && (
              <Stack
                direction="row"
                spacing={0.75}
                flexWrap="wrap"
                useFlexGap
                sx={{
                  mt:
                    1.5,
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    alignSelf:
                      "center",
                  }}
                >
                  Outros estados:
                </Typography>

                {uncategorizedStates.map(
                  (
                    item,
                  ) => (
                    <Chip
                      key={
                        item.state
                      }
                      size="small"
                      variant="outlined"
                      label={`${item.state}: ${formatNumber(item.total)}`}
                      onClick={() => {
                        setPage(
                          1,
                        );

                        setState(
                          item.state,
                        );
                      }}
                    />
                  ),
                )}
              </Stack>
            )}
          </CardContent>
        </Card>

        {/* =================================================
            QUALIDADE DOS DADOS
        ================================================= */}

        {summary && (
          <Card
            variant="outlined"
            sx={{
              order:
                5,
            }}
          >
            <CardContent
              sx={{
                py:
                  1.5,
                "&:last-child": {
                  pb:
                    1.5,
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
                spacing={1.25}
                alignItems={{
                  md:
                    "center",
                }}
                justifyContent="space-between"
              >
                <Stack
                  direction="row"
                  spacing={0.5}
                  alignItems="center"
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight:
                        800,
                    }}
                  >
                    Qualidade dos dados
                  </Typography>

                  <InfoHint
                    title="Qualidade dos dados"
                    text="Indicadores de campos relevantes não preenchidos no Work Item sincronizado. Eles ajudam a identificar lacunas de cadastro e não representam, por si só, erro funcional."
                  />
                </Stack>

                <Stack
                  direction="row"
                  spacing={0.75}
                  flexWrap="wrap"
                  useFlexGap
                >
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Sem responsável: ${formatNumber(summary.dataQuality.withoutAssignedTo)}`}
                    onClick={() =>
                      handleCardClick(
                        "unassigned",
                      )
                    }
                  />

                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Sem cliente: ${formatNumber(summary.dataQuality.withoutClient)}`}
                  />

                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Sem módulo: ${formatNumber(summary.dataQuality.withoutModule)}`}
                  />

                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Sem criticidade: ${formatNumber(summary.dataQuality.withoutCriticality)}`}
                  />

                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Sem Movidesk na Task: ${formatNumber(summary.dataQuality.withoutMovideskTicket)}`}
                    onClick={() =>
                      handleCardClick(
                        "withoutMovidesk",
                      )
                    }
                  />
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* =================================================
            FILTROS E LISTAGEM
        ================================================= */}

        <Card
          variant="outlined"
          sx={{
            order:
              2,
          }}
        >
          <CardContent>
            <Stack
              spacing={2}
            >
              <Box
                sx={{
                  display:
                    "grid",
                  gridTemplateColumns: {
                    xs:
                      "1fr",
                    md:
                      "repeat(2, minmax(0, 1fr))",
                    lg:
                      "repeat(12, minmax(0, 1fr))",
                  },
                  gap:
                    1.25,
                  alignItems:
                    "center",
                }}
              >
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Pesquisar ID, título, cliente, responsável, módulo, processo ou atendimento..."
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleSearch();
                    }
                  }}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <SearchOutlined
                          sx={{
                            mr: 1,
                            fontSize: 20,
                            color: "text.secondary",
                          }}
                        />
                      ),
                    },
                  }}
                  sx={{
                    gridColumn: {
                      md:
                        "1 / -1",
                      lg:
                        "1 / 8",
                    },
                  }}
                />

                <FormControl
                  size="small"
                  fullWidth
                  sx={{
                    gridColumn: {
                      lg:
                        "8 / 10",
                    },
                  }}
                >
                  <InputLabel>
                    Ordenar
                  </InputLabel>

                  <Select
                    value={
                      sortDirection
                    }
                    label="Ordenar"
                    onChange={(event) => {
                      setPage(1);
                      setSortDirection(
                        event.target.value as
                          | "asc"
                          | "desc",
                      );
                    }}
                  >
                    <MenuItem value="desc">
                      Movimentação mais recente
                    </MenuItem>
                    <MenuItem value="asc">
                      Movimentação mais antiga
                    </MenuItem>
                  </Select>
                </FormControl>

                <Button
                  variant="outlined"
                  startIcon={<TuneOutlined />}
                  endIcon={
                    <ExpandMoreOutlined
                      sx={{
                        transform: showMoreFilters
                          ? "rotate(180deg)"
                          : "rotate(0deg)",
                        transition: "transform 0.2s ease",
                      }}
                    />
                  }
                  onClick={() =>
                    setShowMoreFilters(
                      (current) => !current,
                    )
                  }
                  sx={{
                    whiteSpace: "nowrap",
                    color: aliareColors.greenDark,
                    borderColor: "rgba(24,199,122,0.55)",
                    gridColumn: {
                      lg:
                        "10 / 12",
                    },
                  }}
                >
                  {advancedFilterCount > 0
                    ? `Mais filtros (${advancedFilterCount})`
                    : "Mais filtros"}
                </Button>

                <Button
                  variant="text"
                  disabled={
                    !search &&
                    !appliedSearch &&
                    !state &&
                    !criticality &&
                    !client &&
                    !assignedTo &&
                    advancedFilterCount === 0
                  }
                  onClick={handleClearFilters}
                  sx={{
                    whiteSpace: "nowrap",
                    gridColumn: {
                      lg:
                        "12 / 13",
                    },
                  }}
                >
                  Limpar
                </Button>
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                    lg: "repeat(4, minmax(0, 1fr))",
                  },
                  gap: 1.25,
                }}
              >
                <FormControl
                  size="small"
                  fullWidth
                >
                  <InputLabel>
                    Estado
                  </InputLabel>

                  <Select
                    label="Estado"
                    value={
                      state
                    }
                    onChange={(
                      event,
                    ) => {
                      setPage(
                        1,
                      );

                      setState(
                        event.target.value,
                      );
                    }}
                  >
                    <MenuItem value="">
                      Todos
                    </MenuItem>

                    {filters?.states.map(
                      (
                        option,
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
                      ),
                    )}
                  </Select>
                </FormControl>

                <FormControl
                  size="small"
                  fullWidth
                >
                  <InputLabel>
                    Criticidade
                  </InputLabel>

                  <Select
                    label="Criticidade"
                    value={
                      criticality
                    }
                    onChange={(
                      event,
                    ) => {
                      setPage(
                        1,
                      );

                      setCriticality(
                        event.target.value,
                      );
                    }}
                  >
                    <MenuItem value="">
                      Todas
                    </MenuItem>

                    {filters?.criticalities.map(
                      (
                        option,
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
                      ),
                    )}
                  </Select>
                </FormControl>

                <Autocomplete
                  size="small"
                  options={
                    filters?.clients ??
                    []
                  }
                  value={
                    client ||
                    null
                  }
                  onChange={(
                    _event,
                    value,
                  ) => {
                    setPage(
                      1,
                    );

                    setClient(
                      value ??
                      "",
                    );
                  }}
                  renderInput={(
                    params,
                  ) => (
                    <TextField
                      {...params}
                      label="Cliente"
                    />
                  )}
                />

                <Autocomplete
                  size="small"
                  options={
                    filters?.assignedTo ??
                    []
                  }
                  value={
                    assignedTo ||
                    null
                  }
                  onChange={(
                    _event,
                    value,
                  ) => {
                    setPage(
                      1,
                    );

                    setAssignedTo(
                      value ??
                      "",
                    );
                  }}
                  renderInput={(
                    params,
                  ) => (
                    <TextField
                      {...params}
                      label="Responsável"
                    />
                  )}
                />

              </Box>

              <Collapse
                in={showMoreFilters}
                timeout="auto"
                unmountOnExit
              >
                <Box
                  sx={{
                    pt: 0.25,
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, minmax(0, 1fr))",
                      lg: "repeat(4, minmax(0, 1fr))",
                    },
                    gap: 1.25,
                  }}
                >
                  <Autocomplete
                    size="small"
                    options={
                      filters?.modules ??
                      []
                    }
                    value={
                      module ||
                      null
                    }
                    onChange={(
                      _event,
                      value,
                    ) => {
                      setPage(
                        1,
                      );

                      setModule(
                        value ??
                        "",
                      );
                    }}
                    renderInput={(
                      params,
                    ) => (
                      <TextField
                        {...params}
                        label="Módulo"
                      />
                    )}
                  />

                  <Autocomplete
                    size="small"
                    options={
                      filters?.processes ??
                      []
                    }
                    value={
                      process ||
                      null
                    }
                    onChange={(
                      _event,
                      value,
                    ) => {
                      setPage(
                        1,
                      );

                      setProcess(
                        value ??
                        "",
                      );
                    }}
                    renderInput={(
                      params,
                    ) => (
                      <TextField
                        {...params}
                        label="Processo"
                      />
                    )}
                  />

                  <Autocomplete
                    size="small"
                    options={
                      filters?.versions ??
                      []
                    }
                    value={
                      deliveredVersion ||
                      null
                    }
                    onChange={(
                      _event,
                      value,
                    ) => {
                      setPage(
                        1,
                      );

                      setDeliveredVersion(
                        value ??
                        "",
                      );
                    }}
                    renderInput={(
                      params,
                    ) => (
                      <TextField
                        {...params}
                        label="Versão"
                      />
                    )}
                  />

                  <FormControl
                    size="small"
                    fullWidth
                  >
                    <InputLabel>
                      Priorização
                    </InputLabel>

                    <Select
                      label="Priorização"
                      value={
                        prioritized
                      }
                      onChange={(
                        event,
                      ) => {
                        setPage(
                          1,
                        );

                        setPrioritized(
                          event.target.value as BooleanFilter,
                        );
                      }}
                    >
                      <MenuItem value="">
                        Todas
                      </MenuItem>

                      <MenuItem value="true">
                        Priorizadas
                      </MenuItem>

                      <MenuItem value="false">
                        Não priorizadas
                      </MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl
                    size="small"
                    fullWidth
                  >
                    <InputLabel>
                      Bloqueio
                    </InputLabel>

                    <Select
                      label="Bloqueio"
                      value={
                        blockedProcess
                      }
                      onChange={(
                        event,
                      ) => {
                        setPage(
                          1,
                        );

                        setBlockedProcess(
                          event.target.value as BooleanFilter,
                        );
                      }}
                    >
                      <MenuItem value="">
                        Todos
                      </MenuItem>

                      <MenuItem value="true">
                        Processo bloqueado
                      </MenuItem>

                      <MenuItem value="false">
                        Sem bloqueio
                      </MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl
                    size="small"
                    fullWidth
                  >
                    <InputLabel>
                      Responsável
                    </InputLabel>

                    <Select
                      label="Responsável"
                      value={
                        hasAssignedTo
                      }
                      onChange={(
                        event,
                      ) => {
                        setPage(
                          1,
                        );

                        setHasAssignedTo(
                          event.target.value as BooleanFilter,
                        );
                      }}
                    >
                      <MenuItem value="">
                        Todos
                      </MenuItem>

                      <MenuItem value="true">
                        Com responsável
                      </MenuItem>

                      <MenuItem value="false">
                        Sem responsável
                      </MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl
                    size="small"
                    fullWidth
                  >
                    <InputLabel>
                      Movidesk na Task
                    </InputLabel>

                    <Select
                      label="Movidesk na Task"
                      value={
                        hasMovideskTicket
                      }
                      onChange={(
                        event,
                      ) => {
                        setPage(
                          1,
                        );

                        setHasMovideskTicket(
                          event.target.value as BooleanFilter,
                        );
                      }}
                    >
                      <MenuItem value="">
                        Todos
                      </MenuItem>

                      <MenuItem value="true">
                        Informado
                      </MenuItem>

                      <MenuItem value="false">
                        Não informado
                      </MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </Collapse>

              {loading ? (
                <Box
                  sx={{
                    minHeight:
                      280,
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                  }}
                >
                  <CircularProgress
                    size={30}
                    sx={{
                      color:
                        aliareColors.green,
                    }}
                  />
                </Box>
              ) : (
                <>
                  <Stack
                    direction={{
                      xs:
                        "column",
                      sm:
                        "row",
                    }}
                    spacing={1}
                    sx={{
                      justifyContent:
                        "space-between",
                      alignItems: {
                        xs:
                          "stretch",
                        sm:
                          "center",
                      },
                    }}
                  >
                    <Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight:
                            700,
                        }}
                      >
                        {formatNumber(
                          list?.total,
                        )}{" "}
                        registros encontrados
                      </Typography>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                      >
                        Clique em uma tarefa para abrir os detalhes.
                      </Typography>
                    </Box>

                  </Stack>

                  <TableContainer>
                    <Table
                      size="small"
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell>
                            ID
                          </TableCell>

                          <TableCell>
                            Título
                          </TableCell>

                          <TableCell>
                            Estado
                          </TableCell>

                          <TableCell>
                            Criticidade
                          </TableCell>

                          <TableCell>
                            Cliente
                          </TableCell>

                          <TableCell>
                            Responsável
                          </TableCell>

                          <TableCell>
                            Módulo
                          </TableCell>

                          <TableCell>
                            Versão
                          </TableCell>

                          <TableCell>
                            Movidesk
                          </TableCell>

                          <TableCell>
                            Último movimento
                          </TableCell>
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {list?.items.map(
                          (
                            item,
                          ) => (
                            <TableRow
                              hover
                              key={
                                item.id
                              }
                              tabIndex={0}
                              onClick={() =>
                                void openDetail(
                                  item.id,
                                )
                              }
                              onKeyDown={(
                                event,
                              ) => {
                                if (
                                  event.key ===
                                    "Enter" ||
                                  event.key ===
                                    " "
                                ) {
                                  void openDetail(
                                    item.id,
                                  );
                                }
                              }}
                              sx={{
                                cursor:
                                  "pointer",
                              }}
                            >
                              <TableCell
                                sx={{
                                  fontWeight:
                                    800,
                                  whiteSpace:
                                    "nowrap",
                                }}
                              >
                                {item.id}
                              </TableCell>

                              <TableCell
                                sx={{
                                  minWidth:
                                    340,
                                  maxWidth:
                                    520,
                                }}
                              >
                                <Stack
                                  spacing={0.45}
                                >
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight:
                                        650,
                                    }}
                                  >
                                    {item.title}
                                  </Typography>

                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    flexWrap="wrap"
                                    useFlexGap
                                  >
                                    {item.prioritized && (
                                      <Chip
                                        size="small"
                                        label="Priorizada"
                                        icon={
                                          <PriorityHighOutlined />
                                        }
                                        variant="outlined"
                                      />
                                    )}

                                    {item.blockedProcess && (
                                      <Chip
                                        size="small"
                                        label="Bloqueio"
                                        icon={
                                          <BlockOutlined />
                                        }
                                        variant="outlined"
                                      />
                                    )}
                                  </Stack>
                                </Stack>
                              </TableCell>

                              <TableCell>
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={
                                    item.state
                                  }
                                />
                              </TableCell>

                              <TableCell>
                                <Chip
                                  size="small"
                                  variant={
                                    item.criticality
                                      ? "filled"
                                      : "outlined"
                                  }
                                  color={
                                    criticalityTone(
                                      item.criticality,
                                    )
                                  }
                                  label={
                                    item.criticality ??
                                    "-"
                                  }
                                />
                              </TableCell>

                              <TableCell
                                sx={{
                                  minWidth:
                                    190,
                                }}
                              >
                                {item.client ??
                                  "-"}
                              </TableCell>

                              <TableCell
                                sx={{
                                  minWidth:
                                    160,
                                }}
                              >
                                {item.assignedToName ??
                                  "-"}
                              </TableCell>

                              <TableCell>
                                {item.module ??
                                  "-"}
                              </TableCell>

                              <TableCell
                                sx={{
                                  whiteSpace:
                                    "nowrap",
                                }}
                              >
                                {item.deliveredVersion ??
                                  "-"}
                              </TableCell>

                              <TableCell>
                                {item.movideskTicket ??
                                  "-"}
                              </TableCell>

                              <TableCell
                                sx={{
                                  whiteSpace:
                                    "nowrap",
                                }}
                              >
                                {formatDateTime(
                                  item.stateChangedAt ??
                                  item.azureChangedAt,
                                )}
                              </TableCell>
                            </TableRow>
                          ),
                        )}

                        {list?.items.length ===
                          0 && (
                          <TableRow>
                            <TableCell
                              colSpan={10}
                              align="center"
                              sx={{
                                py:
                                  5,
                              }}
                            >
                              Nenhum Work Item encontrado para os filtros selecionados.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <Stack
                    direction={{
                      xs:
                        "column",
                      sm:
                        "row",
                    }}
                    spacing={1.5}
                    sx={{
                      alignItems: {
                        sm:
                          "center",
                      },
                      justifyContent:
                        "space-between",
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                    >
                      Página{" "}
                      {list?.page ??
                        1}{" "}
                      de{" "}
                      {list?.totalPages ??
                        0}
                    </Typography>

                    {(
                      list?.totalPages ??
                      0
                    ) > 1 && (
                      <Pagination
                        page={
                          page
                        }
                        count={
                          list?.totalPages ??
                          1
                        }
                        onChange={(
                          _event,
                          value,
                        ) =>
                          setPage(
                            value,
                          )
                        }
                        size="small"
                        shape="rounded"
                      />
                    )}
                  </Stack>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      {/* ===================================================
          DRAWER DE DETALHE
      =================================================== */}

      <Drawer
        anchor="right"
        open={
          drawerOpen
        }
        onClose={
          closeDetail
        }
        slotProps={{
          paper: {
            sx: {
              width: {
                xs:
                  "100%",
                sm:
                  DRAWER_WIDTH,
              },
              maxWidth:
                "100vw",
            },
          },
        }}
      >
        <Stack
          sx={{
            height:
              "100%",
          }}
        >
          <Box
            sx={{
              px:
                2.5,
              py:
                2,
              borderBottom:
                "1px solid",
              borderColor:
                "divider",
              position:
                "sticky",
              top:
                0,
              bgcolor:
                "background.paper",
              zIndex:
                2,
            }}
          >
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="flex-start"
              justifyContent="space-between"
            >
              <Box
                sx={{
                  minWidth:
                    0,
                }}
              >
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{
                    fontWeight:
                      800,
                  }}
                >
                  {selectedWorkItem?.workItemType ??
                    type}
                  {selectedWorkItem
                    ? ` #${selectedWorkItem.id}`
                    : ""}
                </Typography>

                <Typography
                  variant="h6"
                  sx={{
                    mt:
                      0.15,
                    fontWeight:
                      800,
                    lineHeight:
                      1.25,
                  }}
                >
                  {selectedWorkItem?.title ??
                    "Carregando tarefa..."}
                </Typography>
              </Box>

              <IconButton
                aria-label="Fechar detalhes"
                onClick={
                  closeDetail
                }
              >
                <CloseOutlined />
              </IconButton>
            </Stack>

            {selectedWorkItem && (
              <Stack
                direction="row"
                spacing={0.75}
                flexWrap="wrap"
                useFlexGap
                sx={{
                  mt:
                    1.25,
                }}
              >
                <Chip
                  size="small"
                  variant="outlined"
                  label={
                    selectedWorkItem.state
                  }
                />

                {selectedWorkItem.criticality && (
                  <Chip
                    size="small"
                    color={
                      criticalityTone(
                        selectedWorkItem.criticality,
                      )
                    }
                    label={
                      selectedWorkItem.criticality
                    }
                  />
                )}

                {selectedWorkItem.prioritized && (
                  <Chip
                    size="small"
                    variant="outlined"
                    icon={
                      <PriorityHighOutlined />
                    }
                    label="Priorizada"
                  />
                )}

                {selectedWorkItem.blockedProcess && (
                  <Chip
                    size="small"
                    variant="outlined"
                    icon={
                      <BlockOutlined />
                    }
                    label="Processo bloqueado"
                  />
                )}

                {selectedWorkItem.branchType && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={
                      selectedWorkItem.branchType
                    }
                  />
                )}
              </Stack>
            )}
          </Box>

          <Box
            sx={{
              flex:
                1,
              overflowY:
                "auto",
              px:
                2.5,
              py:
                2,
            }}
          >
            {detailLoading && (
              <Box
                sx={{
                  minHeight:
                    260,
                  display:
                    "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                }}
              >
                <CircularProgress
                  size={30}
                  sx={{
                    color:
                      aliareColors.green,
                  }}
                />
              </Box>
            )}

            {detailError && (
              <Alert
                severity="error"
              >
                {detailError}
              </Alert>
            )}

            {!detailLoading &&
              selectedWorkItem && (
              <Stack
                spacing={2.25}
              >
                {/* RESUMO */}

                <Box>
                  <Stack
                    direction="row"
                    spacing={0.5}
                    alignItems="center"
                    sx={{
                      mb:
                        1.25,
                    }}
                  >
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight:
                          800,
                      }}
                    >
                      Resumo
                    </Typography>

                    <InfoHint
                      title="Resumo da tarefa"
                      text="Informações sincronizadas do Work Item no Azure DevOps. A tela é somente leitura; alterações devem ser feitas no Azure."
                    />
                  </Stack>

                  <Box
                    sx={{
                      display:
                        "grid",
                      gridTemplateColumns: {
                        xs:
                          "1fr",
                        sm:
                          "repeat(2, minmax(0, 1fr))",
                      },
                      gap:
                        1.5,
                    }}
                  >
                    <DetailField
                      label="Cliente"
                      value={
                        normalizeText(
                          selectedWorkItem.client,
                        )
                      }
                    />

                    <DetailField
                      label="Responsável"
                      value={
                        normalizeText(
                          selectedWorkItem.assignedToName,
                        )
                      }
                    />

                    <DetailField
                      label="Módulo"
                      value={
                        normalizeText(
                          selectedWorkItem.module,
                        )
                      }
                    />

                    <DetailField
                      label="Processo"
                      value={
                        normalizeText(
                          selectedWorkItem.process,
                        )
                      }
                    />

                    <DetailField
                      label="Versão"
                      value={
                        normalizeText(
                          selectedWorkItem.deliveredVersion,
                        )
                      }
                    />

                    <DetailField
                      label="RDM"
                      value={
                        normalizeText(
                          selectedWorkItem.rdmNumber,
                        )
                      }
                    />

                    <DetailField
                      label="Detectado em"
                      value={
                        normalizeText(
                          selectedWorkItem.detectedIn,
                        )
                      }
                    />

                    <DetailField
                      label="Origem"
                      value={
                        normalizeText(
                          selectedWorkItem.origin,
                        )
                      }
                    />

                    <DetailField
                      label="Tipo de correção"
                      value={
                        normalizeText(
                          selectedWorkItem.correctionType,
                        )
                      }
                    />

                    <DetailField
                      label="Tipo de defeito"
                      value={
                        normalizeText(
                          selectedWorkItem.defectType,
                        )
                      }
                    />

                    <DetailField
                      label="Mudança de estado"
                      value={
                        formatDateTime(
                          selectedWorkItem.stateChangedAt,
                        )
                      }
                    />

                    <DetailField
                      label="Limite SLA"
                      value={
                        formatDateTime(
                          selectedWorkItem.slaLimit,
                        )
                      }
                    />
                  </Box>
                </Box>

                <Divider />

                {/* ATENDIMENTOS */}

                <Box>
                  <Stack
                    direction="row"
                    spacing={0.5}
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{
                      mb:
                        1.25,
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={0.5}
                      alignItems="center"
                    >
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight:
                            800,
                        }}
                      >
                        Atendimentos relacionados
                      </Typography>

                      <InfoHint
                        title="Atendimentos relacionados"
                        text="O atendimento de origem é identificado pelo número Movidesk informado na própria Task. Outros atendimentos podem estar relacionados pelo campo Número da Task."
                      />
                    </Stack>

                    <Chip
                      size="small"
                      variant="outlined"
                      label={
                        orderedTickets.length
                      }
                    />
                  </Stack>

                  {orderedTickets.length ===
                    0 ? (
                    <Alert
                      severity="info"
                    >
                      Nenhum atendimento relacionado foi localizado no snapshot atual.
                    </Alert>
                  ) : (
                    <Stack
                      spacing={1}
                    >
                      {orderedTickets.map(
                        (
                          ticket,
                        ) => {
                          const isOrigin =
                            selectedWorkItem.movideskTicket ===
                            ticket.movideskId;

                          return (
                            <Card
                              key={
                                ticket.id
                              }
                              variant="outlined"
                              sx={{
                                borderColor:
                                  isOrigin
                                    ? aliareColors.green
                                    : "divider",
                              }}
                            >
                              <CardContent
                                sx={{
                                  "&:last-child": {
                                    pb:
                                      2,
                                  },
                                }}
                              >
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="flex-start"
                                  justifyContent="space-between"
                                >
                                  <Box
                                    sx={{
                                      minWidth:
                                        0,
                                    }}
                                  >
                                    <Stack
                                      direction="row"
                                      spacing={0.65}
                                      alignItems="center"
                                      flexWrap="wrap"
                                      useFlexGap
                                    >
                                      <Typography
                                        variant="subtitle2"
                                        sx={{
                                          fontWeight:
                                            800,
                                        }}
                                      >
                                        #{ticket.movideskId}
                                      </Typography>

                                      {isOrigin && (
                                        <Chip
                                          size="small"
                                          label="Origem"
                                          sx={{
                                            height:
                                              22,
                                          }}
                                        />
                                      )}

                                      <Chip
                                        size="small"
                                        variant="outlined"
                                        label={
                                          ticket.status
                                        }
                                        sx={{
                                          height:
                                            22,
                                        }}
                                      />

                                      {ticket.category && (
                                        <Chip
                                          size="small"
                                          variant="outlined"
                                          label={
                                            ticket.category
                                          }
                                          sx={{
                                            height:
                                              22,
                                          }}
                                        />
                                      )}
                                    </Stack>

                                    <Typography
                                      variant="body2"
                                      sx={{
                                        mt:
                                          0.7,
                                        fontWeight:
                                          650,
                                      }}
                                    >
                                      {ticket.subject}
                                    </Typography>
                                  </Box>

                                  <AssignmentOutlined
                                    sx={{
                                      color:
                                        "text.secondary",
                                      flexShrink:
                                        0,
                                    }}
                                  />
                                </Stack>

                                <Box
                                  sx={{
                                    display:
                                      "grid",
                                    gridTemplateColumns: {
                                      xs:
                                        "1fr",
                                      sm:
                                        "repeat(2, minmax(0, 1fr))",
                                    },
                                    gap:
                                      1,
                                    mt:
                                      1.25,
                                  }}
                                >
                                  <DetailField
                                    label="Responsável"
                                    value={
                                      normalizeText(
                                        ticket.owner,
                                      )
                                    }
                                  />

                                  <DetailField
                                    label="Urgência"
                                    value={
                                      normalizeText(
                                        ticket.urgency,
                                      )
                                    }
                                  />
                                </Box>

                                <Stack
                                  direction="row"
                                  spacing={0.65}
                                  flexWrap="wrap"
                                  useFlexGap
                                  sx={{
                                    mt:
                                      1.25,
                                  }}
                                >
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    color={
                                      slaTone(
                                        ticket.responseSlaIndicator,
                                      )
                                    }
                                    label={`SLA resposta: ${ticket.responseSlaIndicator ?? "-"}`}
                                  />

                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    color={
                                      slaTone(
                                        ticket.solutionSlaIndicator,
                                      )
                                    }
                                    label={`SLA solução: ${ticket.solutionSlaIndicator ?? "-"}`}
                                  />
                                </Stack>

                                <Button
                                  size="small"
                                  variant="text"
                                  sx={{ mt: 0.8, px: 0 }}
                                  onClick={() =>
                                    openTicketInHub(
                                      ticket.movideskId,
                                    )
                                  }
                                >
                                  Ver atendimento no TechLead Hub
                                </Button>
                              </CardContent>
                            </Card>
                          );
                        },
                      )}
                    </Stack>
                  )}
                </Box>

                {/* RELAÇÕES AZURE */}

                {(
                  selectedWorkItem.relations.parent ||
                  selectedWorkItem.relations.children.length >
                    0
                ) && (
                  <>
                    <Divider />

                    <Box>
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight:
                            800,
                          mb:
                            1.25,
                        }}
                      >
                        Relações no Azure
                      </Typography>

                      <Stack
                        spacing={1}
                      >
                        {selectedWorkItem.relations.parent && (
                          <Card
                            variant="outlined"
                          >
                            <CardContent
                              sx={{
                                "&:last-child": {
                                  pb:
                                    2,
                                },
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Pai
                              </Typography>

                              <Typography
                                variant="body2"
                                sx={{
                                  mt:
                                    0.4,
                                  fontWeight:
                                    700,
                                }}
                              >
                                #{selectedWorkItem.relations.parent.id}{" "}
                                {selectedWorkItem.relations.parent.title}
                              </Typography>
                            </CardContent>
                          </Card>
                        )}

                        {selectedWorkItem.relations.children.map(
                          (
                            child,
                          ) => (
                            <Card
                              key={
                                child.id
                              }
                              variant="outlined"
                              onClick={() =>
                                void openDetail(
                                  child.id,
                                )
                              }
                              sx={{
                                cursor:
                                  "pointer",
                                "&:hover": {
                                  borderColor:
                                    aliareColors.green,
                                },
                              }}
                            >
                              <CardContent
                                sx={{
                                  "&:last-child": {
                                    pb:
                                      2,
                                  },
                                }}
                              >
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Filho
                                </Typography>

                                <Typography
                                  variant="body2"
                                  sx={{
                                    mt:
                                      0.4,
                                    fontWeight:
                                      700,
                                  }}
                                >
                                  #{child.id}{" "}
                                  {child.title}
                                </Typography>
                              </CardContent>
                            </Card>
                          ),
                        )}
                      </Stack>
                    </Box>
                  </>
                )}

                <Divider />

                {/* CONTEÚDO */}

                <Stack
                  spacing={1}
                >
                  <TextSection
                    title="Descrição"
                    value={
                      selectedWorkItem.descriptionText
                    }
                    defaultExpanded
                  />

                  <TextSection
                    title="Solução de contorno"
                    value={
                      selectedWorkItem.workaroundText
                    }
                  />

                  <TextSection
                    title="Solução técnica"
                    value={
                      selectedWorkItem.technicalSolutionText
                    }
                  />
                </Stack>

                <Divider />

                {/* AUDITORIA */}

                <Box>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight:
                        800,
                      mb:
                        1.25,
                    }}
                  >
                    Histórico e sincronização
                  </Typography>

                  <Box
                    sx={{
                      display:
                        "grid",
                      gridTemplateColumns: {
                        xs:
                          "1fr",
                        sm:
                          "repeat(2, minmax(0, 1fr))",
                      },
                      gap:
                        1.5,
                    }}
                  >
                    <DetailField
                      label="Criado por"
                      value={
                        normalizeText(
                          selectedWorkItem.createdByName,
                        )
                      }
                    />

                    <DetailField
                      label="Alterado por"
                      value={
                        normalizeText(
                          selectedWorkItem.changedByName,
                        )
                      }
                    />

                    <DetailField
                      label="Criado em"
                      value={
                        formatDateTime(
                          selectedWorkItem.azureCreatedAt,
                        )
                      }
                    />

                    <DetailField
                      label="Alterado em"
                      value={
                        formatDateTime(
                          selectedWorkItem.azureChangedAt,
                        )
                      }
                    />

                    <DetailField
                      label="Sincronizado em"
                      value={
                        formatDateTime(
                          selectedWorkItem.syncedAt,
                        )
                      }
                    />

                    <DetailField
                      label="Revisão"
                      value={
                        selectedWorkItem.revision
                      }
                    />
                  </Box>
                </Box>
              </Stack>
            )}
          </Box>

          {selectedWorkItem && (
            <Box
              sx={{
                px:
                  2.5,
                py:
                  1.5,
                borderTop:
                  "1px solid",
                borderColor:
                  "divider",
                bgcolor:
                  "background.paper",
              }}
            >
              <Stack
                direction={{
                  xs:
                    "column",
                  sm:
                    "row",
                }}
                spacing={1}
              >
                {selectedWorkItem.azureWebUrl && (
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={
                      <OpenInNewOutlined />
                    }
                    component="a"
                    href={
                      selectedWorkItem.azureWebUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir no Azure DevOps
                  </Button>
                )}

                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={
                    <TaskAltOutlined />
                  }
                  onClick={
                    closeDetail
                  }
                >
                  Voltar à lista
                </Button>
              </Stack>
            </Box>
          )}
        </Stack>
      </Drawer>
    </>
  );
}
