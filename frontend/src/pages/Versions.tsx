import {
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
  InputAdornment,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  Stack as MuiStack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

import {
  ExpandMoreOutlined,
  InfoOutlined,
  Inventory2Outlined,
  OpenInNewOutlined,
  SearchOutlined,
  TuneOutlined,
} from "@mui/icons-material";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  ComponentProps,
  MouseEvent,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  api,
} from "../services/api";

import {
  aliareColors,
} from "../theme/theme";

function Stack(
  props:
    ComponentProps<
      typeof MuiStack
    > &
    Record<
      string,
      unknown
    >,
) {
  return (
    <MuiStack
      {...props}
    />
  );
}

type VersionSummary = {
  total: number;
  versions: number;
  withVersion: number;
  withoutVersion: number;
  corrections: number;
  evolutions: number;
  prioritized: number;
  blockedProcess: number;
  highOrCritical: number;
  unassigned: number;
  clients: number;
  coveragePercent: number;
};

type VersionRow = {
  version: string | null;
  label: string;
  hasVersion: boolean;
  total: number;
  corrections: number;
  evolutions: number;
  prioritized: number;
  blockedProcess: number;
  highOrCritical: number;
  unassigned: number;
  withMovideskTicket: number;
  concluded: number;
  active: number;
  clients: number;
  byState: Array<{
    state: string;
    total: number;
  }>;
  latestChangedAt: string | null;
  latestSyncedAt: string | null;
};

type VersionsResponse = {
  generatedAt: string;
  latestSyncedAt: string | null;
  summary: VersionSummary;
  items: VersionRow[];
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

type WorkItem = {
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
  stateChangedAt: string | null;
  syncedAt: string | null;
};

type WorkItemListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: WorkItem[];
};

type OptionalBoolean =
  | ""
  | "true"
  | "false";


type VersionSort =
  | "total-desc"
  | "version-desc"
  | "active-desc"
  | "blocked-desc"
  | "critical-desc"
  | "prioritized-desc"
  | "latest-desc"
  | "version-asc";

type VersionChannel =
  | ""
  | "lts"
  | "lte"
  | "rc"
  | "develop"
  | "undefined";

type VersionChannelKind =
  Exclude<
    VersionChannel,
    ""
  > |
  "other";

type VersionMetricFilter =
  | "all"
  | "with-version"
  | "without-version"
  | "corrections"
  | "evolutions"
  | "prioritized"
  | "blocked"
  | "critical";

type CardInfo = {
  title: string;
  summary: string;
  calculation: string;
  source: string;
  reference?: string;
  periodRule: string;
  notes?: string;
};

type DetailRequest = {
  params?: Record<string, string | number>;
};

type DetailContext = {
  title: string;
  subtitle?: string;
  version: VersionRow | null;
};

const EMPTY_SUMMARY:
  VersionSummary = {
    total: 0,
    versions: 0,
    withVersion: 0,
    withoutVersion: 0,
    corrections: 0,
    evolutions: 0,
    prioritized: 0,
    blockedProcess: 0,
    highOrCritical: 0,
    unassigned: 0,
    clients: 0,
    coveragePercent: 0,
  };

export function Versions() {
  const navigate =
    useNavigate();

  const [
    data,
    setData,
  ] =
    useState<VersionsResponse | null>(
      null,
    );

  const [
    filters,
    setFilters,
  ] =
    useState<FiltersResponse>({
      types: [],
      states: [],
      assignedTo: [],
      clients: [],
      criticalities: [],
      modules: [],
      processes: [],
      versions: [],
    });

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

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
    type,
    setType,
  ] =
    useState("");

  const [
    state,
    setState,
  ] =
    useState("");

  const [
    client,
    setClient,
  ] =
    useState("");

  const [
    criticality,
    setCriticality,
  ] =
    useState("");

  const [
    prioritized,
    setPrioritized,
  ] =
    useState<OptionalBoolean>(
      "",
    );

  const [
    blockedProcess,
    setBlockedProcess,
  ] =
    useState<OptionalBoolean>(
      "",
    );

  const [
    showMoreFilters,
    setShowMoreFilters,
  ] =
    useState(false);

  const [
    versionSort,
    setVersionSort,
  ] =
    useState<VersionSort>(
      "total-desc",
    );

  const [
    versionChannel,
    setVersionChannel,
  ] =
    useState<VersionChannel>("");

  const [
    versionPage,
    setVersionPage,
  ] =
    useState(0);

  const [
    versionsPerPage,
    setVersionsPerPage,
  ] =
    useState(25);

  const [
    activeMetricFilter,
    setActiveMetricFilter,
  ] =
    useState<VersionMetricFilter>(
      "all",
    );

  const [
    selectedVersion,
    setSelectedVersion,
  ] =
    useState<VersionRow | null>(
      null,
    );

  const [
    detailContext,
    setDetailContext,
  ] =
    useState<DetailContext | null>(
      null,
    );

  const [
    versionItems,
    setVersionItems,
  ] =
    useState<WorkItem[]>([]);

  const [
    versionItemsTotal,
    setVersionItemsTotal,
  ] =
    useState(0);

  const [
    detailLoading,
    setDetailLoading,
  ] =
    useState(false);

  const [
    detailError,
    setDetailError,
  ] =
    useState<string | null>(
      null,
    );

  const [selectedTask, setSelectedTask] = useState<(WorkItem & {
    descriptionText?: string | null;
    workaroundText?: string | null;
    technicalSolutionText?: string | null;
    azureWebUrl?: string | null;
  }) | null>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [azureStatus, setAzureStatus] = useState<{ organization: string | null; project: string | null; wiki: string | null } | null>(null);

  const advancedFilterCount =
    [
      criticality,
      prioritized,
      blockedProcess,
    ].filter(
      (value) =>
        value !== "",
    ).length;

  const hasAnyFilter =
    Boolean(
      search ||
      appliedSearch ||
      type ||
      state ||
      client ||
      criticality ||
      prioritized ||
      blockedProcess ||
      versionChannel ||
      activeMetricFilter !== "all",
    );

  const load =
    useCallback(
      async () => {
        try {
          setLoading(
            true,
          );

          setError(
            null,
          );

          const params: Record<
            string,
            string
          > = {};

          if (appliedSearch) {
            params.search =
              appliedSearch;
          }

          if (type) {
            params.type =
              type;
          }

          if (state) {
            params.state =
              state;
          }

          if (client) {
            params.client =
              client;
          }

          if (criticality) {
            params.criticality =
              criticality;
          }

          if (prioritized) {
            params.prioritized =
              prioritized;
          }

          if (blockedProcess) {
            params.blockedProcess =
              blockedProcess;
          }

          const [
            summaryResponse,
            filtersResponse,
            azureStatusResponse,
          ] =
            await Promise.all([
              api.get<VersionsResponse>(
                "/azure-work-items/versions/summary",
                {
                  params,
                },
              ),

              api.get<FiltersResponse>(
                "/azure-work-items/filters",
              ),
              api.get("/azure-devops/status"),
            ]);

          setData(
            summaryResponse.data,
          );

          setFilters(
            filtersResponse.data,
          );
          setAzureStatus(azureStatusResponse.data);
        } catch (
          currentError
        ) {
          console.error(
            "Erro ao carregar versões:",
            currentError,
          );

          setError(
            "Não foi possível carregar a visão de versões.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        appliedSearch,
        type,
        state,
        client,
        criticality,
        prioritized,
        blockedProcess,
      ],
    );

  useEffect(
    () => {
      void load();
    },
    [
      load,
    ],
  );

  const visibleVersions =
    useMemo(
      () => {
        const source =
          (
            data?.items ??
            []
          ).filter(
            (item) => {
              const matchesChannel =
                !versionChannel ||
                getVersionChannel(
                  item,
                ) === versionChannel;

              const matchesMetric =
                matchesVersionMetric(
                  item,
                  activeMetricFilter,
                );

              return (
                matchesChannel &&
                matchesMetric
              );
            },
          );

        return [
          ...source,
        ].sort(
          (
            a,
            b,
          ) => {
            if (appliedSearch) {
              return toTimestamp(b.latestChangedAt) - toTimestamp(a.latestChangedAt);
            }

            if (
              versionSort ===
              "version-desc"
            ) {
              return compareVersionsDesc(
                a,
                b,
              );
            }

            if (
              versionSort ===
              "version-asc"
            ) {
              return a.label.localeCompare(
                b.label,
                "pt-BR",
                {
                  numeric:
                    true,
                  sensitivity:
                    "base",
                },
              );
            }

            if (
              versionSort ===
              "latest-desc"
            ) {
              return (
                toTimestamp(
                  b.latestChangedAt,
                ) -
                toTimestamp(
                  a.latestChangedAt,
                )
              );
            }

            const key:
              keyof Pick<
                VersionRow,
                | "total"
                | "active"
                | "blockedProcess"
                | "highOrCritical"
                | "prioritized"
              > =
                versionSort ===
                "active-desc"
                  ? "active"
                  : versionSort ===
                    "blocked-desc"
                  ? "blockedProcess"
                  : versionSort ===
                    "critical-desc"
                  ? "highOrCritical"
                  : versionSort ===
                    "prioritized-desc"
                  ? "prioritized"
                  : "total";

            return (
              b[key] -
              a[key]
            );
          },
        );
      },
      [
        data?.items,
        appliedSearch,
        versionSort,
        versionChannel,
        activeMetricFilter,
      ],
    );

  const paginatedVersions =
    useMemo(
      () => {
        const start =
          versionPage *
          versionsPerPage;

        return visibleVersions.slice(
          start,
          start + versionsPerPage,
        );
      },
      [
        visibleVersions,
        versionPage,
        versionsPerPage,
      ],
    );

  useEffect(
    () => {
      setVersionPage(0);
    },
    [
      versionSort,
      versionChannel,
      activeMetricFilter,
    ],
  );

  useEffect(
    () => {
      const lastPage =
        Math.max(
          0,
          Math.ceil(
            visibleVersions.length /
              versionsPerPage,
          ) - 1,
        );

      if (
        versionPage >
        lastPage
      ) {
        setVersionPage(
          lastPage,
        );
      }
    },
    [
      visibleVersions.length,
      versionPage,
      versionsPerPage,
    ],
  );

  const summary =
    data?.summary ??
    EMPTY_SUMMARY;


  const coverageChartData =
    useMemo(
      () =>
        [
          {
            name:
              "Com versão",
            value:
              summary.withVersion,
            color:
              aliareColors.green,
          },
          {
            name:
              "Sem versão",
            value:
              summary.withoutVersion,
            color:
              "#F5B301",
          },
        ].filter(
          (item) =>
            item.value >
            0,
        ),
      [
        summary.withVersion,
        summary.withoutVersion,
      ],
    );

  const typeChartData =
    useMemo(
      () =>
        [
          {
            name:
              "Correções",
            value:
              summary.corrections,
            color:
              aliareColors.green,
          },
          {
            name:
              "Evoluções",
            value:
              summary.evolutions,
            color:
              "#2563EB",
          },
        ].filter(
          (item) =>
            item.value >
            0,
        ),
      [
        summary.corrections,
        summary.evolutions,
      ],
    );

  const versionVolumeChartData =
    useMemo(
      () => {
        const ordered =
          [
            ...(
              data?.items ??
              []
            ),
          ].sort(
            (
              a,
              b,
            ) =>
              b.total -
              a.total,
          );

        const top =
          ordered
            .slice(
              0,
              5,
            )
            .map(
              (
                item,
                index,
              ) => ({
                name:
                  item.label,
                value:
                  item.total,
                color:
                  [
                    aliareColors.green,
                    "#2563EB",
                    "#F59E0B",
                    "#7C3AED",
                    "#0EA5E9",
                  ][
                    index
                  ],
                version:
                  item,
              }),
            );

        const others =
          ordered
            .slice(
              5,
            )
            .reduce(
              (
                total,
                item,
              ) =>
                total +
                item.total,
              0,
            );

        if (
          others >
          0
        ) {
          top.push({
            name:
              "Outras versões",
            value:
              others,
            color:
              "#98A2B3",
            version:
              null as unknown as VersionRow,
          });
        }

        return top;
      },
      [
        data?.items,
      ],
    );

  function applySearch() {
    setAppliedSearch(
      search.trim(),
    );
  }

  function clearFilters() {
    setSearch("");
    setAppliedSearch("");
    setType("");
    setState("");
    setClient("");
    setCriticality("");
    setPrioritized("");
    setBlockedProcess("");
    setVersionChannel("");
    setVersionPage(0);
    setActiveMetricFilter("all");
  }

  function buildScopedParams(
    overrides:
      Record<
        string,
        string | number
      > = {},
  ) {
    const params:
      Record<
        string,
        string | number
      > = {
        page:
          1,
        pageSize:
          100,
        sortBy:
          "stateChangedAt",
        sortDirection:
          "desc",
      };

    if (type) {
      params.type =
        type;
    }

    if (state) {
      params.state =
        state;
    }

    if (client) {
      params.client =
        client;
    }

    if (criticality) {
      params.criticality =
        criticality;
    }

    if (prioritized) {
      params.prioritized =
        prioritized;
    }

    if (blockedProcess) {
      params.blockedProcess =
        blockedProcess;
    }

    if (appliedSearch) {
      params.search =
        appliedSearch;
    }

    Object.assign(
      params,
      overrides,
    );

    return params;
  }

  async function loadDetail(
    context:
      DetailContext,
    requests:
      DetailRequest[],
  ) {
    setSelectedVersion(
      context.version,
    );
    setSelectedTask(null);

    setDetailContext(
      context,
    );

    setVersionItems(
      [],
    );

    setVersionItemsTotal(
      0,
    );

    setDetailLoading(
      true,
    );

    setDetailError(
      null,
    );

    try {
      const responses =
        await Promise.all(
          requests.map(
            (
              request,
            ) =>
              api.get<WorkItemListResponse>(
                "/azure-work-items",
                {
                  params:
                    buildScopedParams(
                      request.params,
                    ),
                },
              ),
          ),
        );

      const unique =
        new Map<
          number,
          WorkItem
        >();

      let total =
        0;

      responses.forEach(
        (
          response,
        ) => {
          total +=
            response.data.total;

          response.data.items.forEach(
            (
              item,
            ) => {
              unique.set(
                item.id,
                item,
              );
            },
          );
        },
      );

      setVersionItems(
        Array.from(
          unique.values(),
        ),
      );

      setVersionItemsTotal(
        total,
      );
    } catch (
      currentError
    ) {
      console.error(
        "Erro ao carregar detalhamento de versões:",
        currentError,
      );

      setDetailError(
        "Não foi possível carregar as Tasks deste indicador.",
      );
    } finally {
      setDetailLoading(
        false,
      );
    }
  }

  function versionParams(
    version:
      VersionRow,
    overrides:
      Record<
        string,
        string | number
      > = {},
  ) {
    return {
      ...(
        version.version
          ? {
              deliveredVersion:
                version.version,
            }
          : {
              hasDeliveredVersion:
                "false",
            }
      ),
      ...overrides,
    };
  }

  async function openVersion(
    version:
      VersionRow,
    overrides:
      Record<
        string,
        string | number
      > = {},
    title?:
      string,
  ) {
    await loadDetail(
      {
        title:
          title ??
          version.label,
        subtitle:
          `${version.total} Task(s) • ${version.clients} cliente(s)`,
        version,
      },
      [
        {
          params:
            versionParams(
              version,
              overrides,
            ),
        },
      ],
    );
  }

  async function openSummaryDetail(
    title:
      string,
    subtitle:
      string,
    requests:
      DetailRequest[],
  ) {
    await loadDetail(
      {
        title,
        subtitle,
        version:
          null,
      },
      requests,
    );
  }

  async function handleMetricCardClick(
    metric:
      VersionMetricFilter,
    title:
      string,
    subtitle:
      string,
    requests:
      DetailRequest[],
  ) {
    setActiveMetricFilter(
      metric,
    );
    setVersionPage(0);

    if (
      metric === "corrections"
    ) {
      setType(
        "Correção Clientes",
      );
    }

    if (
      metric === "evolutions"
    ) {
      setType(
        "Evolução",
      );
    }

    if (
      metric === "prioritized"
    ) {
      setPrioritized(
        "true",
      );
    }

    if (
      metric === "blocked"
    ) {
      setBlockedProcess(
        "true",
      );
    }

    if (
      metric === "without-version"
    ) {
      setVersionChannel(
        "undefined",
      );
    }

    if (
      metric === "with-version" &&
      versionChannel === "undefined"
    ) {
      setVersionChannel("");
    }

    if (
      metric === "critical"
    ) {
      setCriticality("");
    }

    await openSummaryDetail(
      title,
      subtitle,
      requests,
    );
  }

  function closeDetail() {
    setSelectedVersion(
      null,
    );

    setDetailContext(
      null,
    );

    setVersionItems(
      [],
    );

    setVersionItemsTotal(
      0,
    );

    setDetailError(
      null,
    );
    setSelectedTask(null);
  }

  function openWorkItem(
    item:
      WorkItem,
  ) {
    const path =
      item.workItemType ===
      "Evolução"
        ? "/evolucoes"
        : "/correcoes";

    navigate(
      `${path}?task=${item.id}`,
    );
  }

  async function inspectWorkItem(item: WorkItem) {
    setSelectedTask(item);
    setTaskDetailLoading(true);
    try {
      const response = await api.get(`/azure-work-items/${item.id}`);
      setSelectedTask(response.data);
    } catch {
      setDetailError("Não foi possível carregar todos os detalhes da Task.");
    } finally {
      setTaskDetailLoading(false);
    }
  }

  function openVersionInAzure(version: string) {
    if (!azureStatus?.organization || !azureStatus.project) return;
    const url = `https://dev.azure.com/${encodeURIComponent(azureStatus.organization)}/${encodeURIComponent(azureStatus.project)}/_search?text=${encodeURIComponent(version)}&type=wiki`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openTicket(
    movideskTicket:
      number,
  ) {
    navigate(
      `/tickets?movidesk=${movideskTicket}`,
    );
  }

  if (
    loading &&
    !data
  ) {
    return (
      <Box
        sx={{
          display:
            "flex",
          justifyContent:
            "center",
          mt:
            8,
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

  return (
    <>
      <Box
        sx={{
          mb:
            2.5,
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
              Desenvolvimento
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
                xs:
                  "1.7rem",
                md:
                  "1.9rem",
                xl:
                  "2.1rem",
              },
            }}
          >
            Versões
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt:
                0.25,
            }}
          >
            Planejamento, cobertura e riscos das versões vinculadas às Tasks do Azure
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
            {summary.total} Work Item(s) no recorte •{" "}
            {summary.versions} versão(ões) identificada(s)
          </Typography>
        </Box>

        <Button
          variant="outlined"
          size="small"
          onClick={() =>
            void load()
          }
          disabled={
            loading
          }
        >
          {loading
            ? "Atualizando..."
            : "Recarregar"}
        </Button>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb:
              2,
          }}
        >
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display:
            "flex",
          flexDirection:
            "column",
        }}
      >
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
          order:
            2,
        }}
      >
        <CardContent>
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
              size="small"
              value={
                search
              }
              onChange={(
                event,
              ) =>
                setSearch(
                  event.target.value,
                )
              }
              onKeyDown={(
                event,
              ) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  applySearch();
                }
              }}
              placeholder="Buscar Task, cliente, responsável, módulo, processo ou versão"
              sx={{
                gridColumn: {
                  xs:
                    "auto",
                  md:
                    "1 / -1",
                  lg:
                    "1 / 9",
                },
              }}
              slotProps={{
                input: {
                  startAdornment:
                    (
                      <InputAdornment position="start">
                        <SearchOutlined fontSize="small" />
                      </InputAdornment>
                    ),
                },
              }}
            />

            <FormControl
              size="small"
              sx={{
                gridColumn: {
                  lg:
                    "1 / 5",
                },
                gridRow: {
                  lg:
                    2,
                },
              }}
            >
              <InputLabel>
                Tipo
              </InputLabel>

              <Select
                value={
                  type
                }
                label="Tipo"
                onChange={(
                  event,
                ) =>
                  setType(
                    event.target.value,
                  )
                }
              >
                <MenuItem value="">
                  Todos
                </MenuItem>
                <MenuItem value="Correção Clientes">
                  Correções
                </MenuItem>
                <MenuItem value="Evolução">
                  Evoluções
                </MenuItem>
              </Select>
            </FormControl>

            <FormControl
              size="small"
              sx={{
                gridColumn: {
                  lg:
                    "5 / 9",
                },
                gridRow: {
                  lg:
                    2,
                },
              }}
            >
              <InputLabel>
                Estado
              </InputLabel>

              <Select
                value={
                  state
                }
                label="Estado"
                onChange={(
                  event,
                ) =>
                  setState(
                    event.target.value,
                  )
                }
              >
                <MenuItem value="">
                  Todos
                </MenuItem>

                {filters.states.map(
                  (
                    item,
                  ) => (
                    <MenuItem
                      key={
                        item
                      }
                      value={
                        item
                      }
                    >
                      {item}
                    </MenuItem>
                  ),
                )}
              </Select>
            </FormControl>

            <Autocomplete
              size="small"
              options={
                filters.clients
              }
              value={
                client ||
                null
              }
              onChange={(
                _,
                value,
              ) =>
                setClient(
                  value ??
                  "",
                )
              }
              renderInput={(
                params,
              ) => (
                <TextField
                  {...params}
                  label="Cliente"
                />
              )}
              sx={{
                gridColumn: {
                  md:
                    "1 / -1",
                  lg:
                    "9 / 13",
                },
                gridRow: {
                  lg:
                    2,
                },
              }}
            />

            <Button
              variant="outlined"
              startIcon={
                <TuneOutlined />
              }
              endIcon={
                <ExpandMoreOutlined
                  sx={{
                    transform:
                      showMoreFilters
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                    transition:
                      "transform 0.2s ease",
                  }}
                />
              }
              onClick={() =>
                setShowMoreFilters(
                  (
                    current,
                  ) =>
                    !current,
                )
              }
              sx={{
                flexShrink:
                  0,
                whiteSpace:
                  "nowrap",
                gridColumn: {
                  lg:
                    "9 / 11",
                },
                gridRow: {
                  lg:
                    1,
                },
              }}
            >
              {advancedFilterCount >
              0
                ? `Mais filtros (${advancedFilterCount})`
                : "Mais filtros"}
            </Button>

            <Button
              size="small"
              onClick={
                applySearch
              }
              disabled={
                search.trim() ===
                appliedSearch
              }
              sx={{
                gridColumn: {
                  lg:
                    "11 / 12",
                },
                gridRow: {
                  lg:
                    1,
                },
              }}
            >
              Aplicar
            </Button>

            <Button
              size="small"
              onClick={
                clearFilters
              }
              disabled={
                !hasAnyFilter
              }
              sx={{
                gridColumn: {
                  lg:
                    "12 / 13",
                },
                gridRow: {
                  lg:
                    1,
                },
              }}
            >
              Limpar
            </Button>
          </Box>

          <Collapse
            in={
              showMoreFilters
            }
            timeout="auto"
            unmountOnExit
            sx={{
              gridColumn:
                "1 / -1",
            }}
          >
            <Divider
              sx={{
                my:
                  1.5,
              }}
            />

            <Box
              sx={{
                display:
                  "grid",
                gridTemplateColumns: {
                  xs:
                    "1fr",
                  md:
                    "repeat(3, minmax(0, 1fr))",
                },
                gap:
                  1.25,
              }}
            >
              <FormControl
                size="small"
              >
                <InputLabel>
                  Criticidade
                </InputLabel>

                <Select
                  value={
                    criticality
                  }
                  label="Criticidade"
                  onChange={(
                    event,
                  ) =>
                    setCriticality(
                      event.target.value,
                    )
                  }
                >
                  <MenuItem value="">
                    Todas
                  </MenuItem>

                  {filters.criticalities.map(
                    (
                      item,
                    ) => (
                      <MenuItem
                        key={
                          item
                        }
                        value={
                          item
                        }
                      >
                        {item}
                      </MenuItem>
                    ),
                  )}
                </Select>
              </FormControl>

              <FormControl
                size="small"
              >
                <InputLabel>
                  Priorização
                </InputLabel>

                <Select
                  value={
                    prioritized
                  }
                  label="Priorização"
                  onChange={(
                    event,
                  ) =>
                    setPrioritized(
                      event.target.value as
                        OptionalBoolean,
                    )
                  }
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
              >
                <InputLabel>
                  Bloqueio
                </InputLabel>

                <Select
                  value={
                    blockedProcess
                  }
                  label="Bloqueio"
                  onChange={(
                    event,
                  ) =>
                    setBlockedProcess(
                      event.target.value as
                        OptionalBoolean,
                    )
                  }
                >
                  <MenuItem value="">
                    Todos
                  </MenuItem>
                  <MenuItem value="true">
                    Bloqueadas
                  </MenuItem>
                  <MenuItem value="false">
                    Não bloqueadas
                  </MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small">
                <InputLabel>Canal da versão</InputLabel>
                <Select value={versionChannel} label="Canal da versão" onChange={(event) => setVersionChannel(event.target.value as VersionChannel)}>
                  <MenuItem value="">Todos os canais</MenuItem>
                  <MenuItem value="lts">LTS</MenuItem>
                  <MenuItem value="lte">LTE</MenuItem>
                  <MenuItem value="rc">RC</MenuItem>
                  <MenuItem value="develop">Develop</MenuItem>
                  <MenuItem value="undefined">Sem versão</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small">
                <InputLabel>Ordenar versões</InputLabel>
                <Select value={versionSort} label="Ordenar versões" onChange={(event) => setVersionSort(event.target.value as VersionSort)}>
                  <MenuItem value="version-desc">Versão mais recente</MenuItem>
                  <MenuItem value="latest-desc">Movimentação mais recente</MenuItem>
                  <MenuItem value="total-desc">Maior volume</MenuItem>
                  <MenuItem value="active-desc">Mais Tasks ativas</MenuItem>
                  <MenuItem value="blocked-desc">Mais bloqueadas</MenuItem>
                  <MenuItem value="critical-desc">Maior criticidade</MenuItem>
                  <MenuItem value="prioritized-desc">Mais priorizadas</MenuItem>
                  <MenuItem value="version-asc">Versão A → Z</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Collapse>
        </CardContent>
      </Card>

      <Box
        sx={{
          display:
            "grid",
          gridTemplateColumns: {
            xs:
              "1fr",
            sm:
              "repeat(2, 1fr)",
            lg:
              "repeat(4, 1fr)",
            xl:
              "repeat(5, 1fr)",
          },
          gap:
            1.5,
          mb:
            2,
          order:
            1,
        }}
      >
        <MetricCard
          title="Total de Tasks"
          active={
            activeMetricFilter ===
            "all"
          }
          value={
            summary.total
          }
          description={`${summary.versions} versão(ões) • ${summary.clients} cliente(s)`}
          info={{
            title:
              "Total de Tasks",
            summary:
              "Quantidade total de Correções e Evoluções no recorte atual da tela.",
            calculation:
              "Contagem dos Work Items após aplicar os filtros globais desta página.",
            source:
              "Azure DevOps sincronizado no TechLead Hub",
            reference:
              "AzureWorkItem.id",
            periodRule:
              "A tela de Versões não aplica período temporal; trabalha sobre o recorte definido pelos filtros da própria página.",
            notes:
              "Clique no card para abrir as Tasks que compõem o total.",
          }}
          onClick={() =>
            void handleMetricCardClick(
              "all",
              "Todas as Tasks",
              "Work Items do recorte atual",
              [
                {},
              ],
            )
          }
        />

        <MetricCard
          title="Cobertura de versão"
          active={
            activeMetricFilter ===
            "with-version"
          }
          value={`${summary.coveragePercent.toFixed(1)}%`}
          description={`${summary.withVersion} de ${summary.total} Task(s) com versão válida`}
          severity="success"
          info={{
            title:
              "Cobertura de versão",
            summary:
              "Percentual de Tasks que possuem uma versão de entrega válida informada.",
            calculation:
              "Tasks com versão ÷ total de Tasks × 100.",
            source:
              "Azure DevOps",
            reference:
              "Versão entregue / deliveredVersion",
            periodRule:
              "Respeita os filtros aplicados na tela.",
            notes:
              "A presença de uma versão não confirma, por si só, publicação ou implantação em produção.",
          }}
          onClick={() =>
            void handleMetricCardClick(
              "with-version",
              "Tasks com versão definida",
              "Work Items com versão de entrega informada",
              [
                {
                  params: {
                    hasDeliveredVersion:
                      "true",
                  },
                },
              ],
            )
          }
        />

        <MetricCard
          title="Sem versão definida"
          active={
            activeMetricFilter ===
            "without-version"
          }
          value={
            summary.withoutVersion
          }
          description="Tasks sem versão válida informada"
          severity={
            summary.withoutVersion >
            0
              ? "warning"
              : "success"
          }
          info={{
            title:
              "Sem versão definida",
            summary:
              "Tasks que ainda não possuem uma versão de entrega válida.",
            calculation:
              "Contagem dos Work Items sem deliveredVersion.",
            source:
              "Azure DevOps",
            reference:
              "deliveredVersion",
            periodRule:
              "Respeita os filtros aplicados na tela.",
            notes:
              "É um indicador útil para identificar itens concluídos ou em evolução que ainda não possuem rastreabilidade de versão.",
          }}
          onClick={() =>
            void handleMetricCardClick(
              "without-version",
              "Tasks sem versão definida",
              "Work Items sem versão válida informada",
              [
                {
                  params: {
                    hasDeliveredVersion:
                      "false",
                  },
                },
              ],
            )
          }
        />

        <MetricCard
          title="Correções"
          active={
            activeMetricFilter ===
            "corrections"
          }
          value={
            summary.corrections
          }
          description="Correções no recorte atual"
          info={{
            title:
              "Correções",
            summary:
              "Quantidade de Work Items do tipo Correção Clientes.",
            calculation:
              "Contagem dos Work Items com tipo Correção Clientes.",
            source:
              "Azure DevOps",
            reference:
              "System.WorkItemType",
            periodRule:
              "Respeita os filtros aplicados na tela.",
            notes:
              "Clique para abrir as Correções no painel lateral sem sair da tela de Versões.",
          }}
          onClick={() =>
            void handleMetricCardClick(
              "corrections",
              "Correções",
              "Correções do recorte atual",
              [
                {
                  params: {
                    type:
                      "Correção Clientes",
                  },
                },
              ],
            )
          }
        />

        <MetricCard
          title="Evoluções"
          active={
            activeMetricFilter ===
            "evolutions"
          }
          value={
            summary.evolutions
          }
          description="Evoluções no recorte atual"
          info={{
            title:
              "Evoluções",
            summary:
              "Quantidade de Work Items do tipo Evolução.",
            calculation:
              "Contagem dos Work Items com tipo Evolução.",
            source:
              "Azure DevOps",
            reference:
              "System.WorkItemType",
            periodRule:
              "Respeita os filtros aplicados na tela.",
            notes:
              "Clique para abrir as Evoluções no painel lateral.",
          }}
          onClick={() =>
            void handleMetricCardClick(
              "evolutions",
              "Evoluções",
              "Evoluções do recorte atual",
              [
                {
                  params: {
                    type:
                      "Evolução",
                  },
                },
              ],
            )
          }
        />

        <MetricCard
          title="Priorizadas"
          active={
            activeMetricFilter ===
            "prioritized"
          }
          value={
            summary.prioritized
          }
          description="Tasks marcadas como priorizadas"
          severity={
            summary.prioritized >
            0
              ? "warning"
              : "default"
          }
          info={{
            title:
              "Priorizadas",
            summary:
              "Tasks sinalizadas como priorizadas no Azure DevOps.",
            calculation:
              "Contagem dos Work Items com prioritized = true.",
            source:
              "Azure DevOps",
            reference:
              "Priorização da Task",
            periodRule:
              "Respeita os filtros aplicados na tela.",
            notes:
              "Use em conjunto com bloqueio e criticidade para definir ordem de atuação.",
          }}
          onClick={() =>
            void handleMetricCardClick(
              "prioritized",
              "Tasks priorizadas",
              "Work Items sinalizados como priorizados",
              [
                {
                  params: {
                    prioritized:
                      "true",
                  },
                },
              ],
            )
          }
        />

        <MetricCard
          title="Bloqueadas"
          active={
            activeMetricFilter ===
            "blocked"
          }
          value={
            summary.blockedProcess
          }
          description="Tasks com processo bloqueado"
          severity={
            summary.blockedProcess >
            0
              ? "error"
              : "default"
          }
          info={{
            title:
              "Bloqueadas",
            summary:
              "Tasks que possuem indicação de processo bloqueado.",
            calculation:
              "Contagem dos Work Items com blockedProcess = true.",
            source:
              "Azure DevOps",
            reference:
              "Processo bloqueado",
            periodRule:
              "Respeita os filtros aplicados na tela.",
            notes:
              "Indicador de risco operacional para acompanhamento da coordenação.",
          }}
          onClick={() =>
            void handleMetricCardClick(
              "blocked",
              "Tasks bloqueadas",
              "Work Items com processo bloqueado",
              [
                {
                  params: {
                    blockedProcess:
                      "true",
                  },
                },
              ],
            )
          }
        />

        <MetricCard
          title="Alta / Crítica"
          active={
            activeMetricFilter ===
            "critical"
          }
          value={
            summary.highOrCritical
          }
          description="Tasks com criticidade elevada"
          severity={
            summary.highOrCritical >
            0
              ? "warning"
              : "default"
          }
          info={{
            title:
              "Alta / Crítica",
            summary:
              "Tasks classificadas com criticidade Alta ou Crítica.",
            calculation:
              "Soma das Tasks com criticidade Alta e Crítica.",
            source:
              "Azure DevOps",
            reference:
              "Criticidade",
            periodRule:
              "Respeita os filtros aplicados na tela.",
            notes:
              "O detalhamento combina os dois níveis e elimina duplicidades pelo ID da Task.",
          }}
          onClick={() =>
            void handleMetricCardClick(
              "critical",
              "Tasks de alta criticidade",
              "Criticidade Alta ou Crítica",
              getHighCriticalRequests(
                filters.criticalities,
              ),
            )
          }
        />
      </Box>
      </Box>

      <Box
        sx={{
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
          mb:
            2,
        }}
      >
        <DonutCard
          title="Cobertura de versão"
          subtitle="Tasks com e sem versão de entrega"
          centerValue={`${summary.coveragePercent.toFixed(1)}%`}
          centerLabel="com versão"
          data={
            coverageChartData
          }
          info={{
            title:
              "Cobertura de versão",
            summary:
              "Compara o volume de Tasks com versão definida contra as que ainda não possuem versão.",
            calculation:
              "Distribuição do total entre com versão e sem versão.",
            source:
              "Azure DevOps",
            periodRule:
              "Respeita os filtros aplicados na tela.",
            notes:
              "Clique em uma fatia ou legenda para abrir exatamente as Tasks daquele grupo.",
          }}
          onSliceClick={(name) =>
            void openSummaryDetail(
              name,
              "Cobertura de versão",
              [
                {
                  params: {
                    hasDeliveredVersion:
                      name ===
                      "Com versão"
                        ? "true"
                        : "false",
                  },
                },
              ],
            )
          }
        />

        <DonutCard
          title="Composição por tipo"
          subtitle="Distribuição entre Correções e Evoluções"
          centerValue={
            summary.total
          }
          centerLabel="Tasks"
          data={
            typeChartData
          }
          info={{
            title:
              "Composição por tipo",
            summary:
              "Mostra como o volume de desenvolvimento está distribuído entre Correções e Evoluções.",
            calculation:
              "Participação de cada tipo sobre o total do recorte.",
            source:
              "Azure DevOps",
            periodRule:
              "Respeita os filtros aplicados na tela.",
            notes:
              "Útil para a coordenação avaliar o perfil da demanda de desenvolvimento.",
          }}
          onSliceClick={(name) =>
            void openSummaryDetail(
              name,
              `Tasks do tipo ${name}`,
              [
                {
                  params: {
                    type:
                      name ===
                      "Correções"
                        ? "Correção Clientes"
                        : "Evolução",
                  },
                },
              ],
            )
          }
        />

        <DonutCard
          title="Concentração por versão"
          subtitle="Top 5 versões por volume de Tasks"
          centerValue={
            summary.versions
          }
          centerLabel="versões"
          data={
            versionVolumeChartData
          }
          info={{
            title:
              "Concentração por versão",
            summary:
              "Mostra quais versões concentram o maior volume de Tasks no recorte.",
            calculation:
              "Top 5 versões ordenadas pelo total de Work Items; o restante é agrupado em Outras versões.",
            source:
              "Azure DevOps",
            periodRule:
              "Respeita os filtros aplicados na tela.",
            notes:
              "Clique em uma versão específica para abrir seu detalhamento. O grupo Outras versões é apenas consolidado.",
          }}
          onSliceClick={(name) => {
            const item =
              (
                data?.items ??
                []
              ).find(
                (
                  candidate,
                ) =>
                  candidate.label ===
                  name,
              );

            if (item) {
              void openVersion(
                item,
              );
            }
          }}
        />
      </Box>

      <Alert
        severity="info"
        sx={{
          mb:
            2,
          borderRadius:
            2,
        }}
      >
        “Versão” representa o valor informado na Task sincronizada do Azure.
        Esta tela não presume que a release esteja publicada, implantada ou
        disponível em produção.
      </Alert>

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
        }}
      >
        <CardContent
          sx={{
            pb:
              1.25,
          }}
        >
          <Stack
            direction="column"
            spacing={1.25}
            sx={{
              alignItems:
                "stretch",
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontWeight:
                    800,
                  fontSize:
                    "1.05rem",
                }}
              >
                Análise por versão
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Clique em uma versão para investigar as Tasks relacionadas
              </Typography>

              <Typography
                variant="caption"
                sx={{
                  display:
                    "block",
                  mt:
                    0.35,
                  color:
                    aliareColors.greenDark,
                  fontWeight:
                    700,
                }}
              >
                {visibleVersions.length} de {data?.items.length ?? 0} versão(ões) exibida(s)
              </Typography>
            </Box>

          </Stack>
        </CardContent>

        <TableContainer>
          <Table
            size="small"
          >
            <TableHead
              sx={{
                backgroundColor:
                  "#F8FAF9",
              }}
            >
              <TableRow>
                <TableCell>
                  <strong>
                    Versão
                  </strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Total</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Correções</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Evoluções</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Ativas</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Concluídas</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Priorizadas</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Bloqueadas</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Alta/Crítica</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>Clientes</strong>
                </TableCell>
                <TableCell>
                  <strong>Última movimentação</strong>
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {paginatedVersions.map(
                (
                  item,
                ) => (
                  <TableRow
                    key={
                      item.version ??
                      "__SEM_VERSAO__"
                    }
                    hover
                    onClick={() =>
                      void openVersion(
                        item,
                      )
                    }
                    sx={{
                      cursor:
                        "pointer",
                    }}
                  >
                    <TableCell>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                          alignItems:
                            "center",
                        }}
                      >
                        <Inventory2Outlined
                          sx={{
                            fontSize:
                              18,
                            color:
                              item.hasVersion
                                ? aliareColors.greenDark
                                : "warning.main",
                          }}
                        />

                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight:
                              750,
                          }}
                        >
                          {item.label}
                        </Typography>

                        {!item.hasVersion && (
                          <Chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            label="Atenção"
                          />
                        )}
                      </Stack>
                    </TableCell>

                    <TableCell align="right">
                      <ClickableNumber
                        value={
                          item.total
                        }
                        onClick={(
                          event,
                        ) => {
                          event.stopPropagation();

                          void openVersion(
                            item,
                          );
                        }}
                      />
                    </TableCell>

                    <TableCell align="right">
                      <ClickableNumber
                        value={
                          item.corrections
                        }
                        onClick={(
                          event,
                        ) => {
                          event.stopPropagation();

                          void openVersion(
                            item,
                            {
                              type:
                                "Correção Clientes",
                            },
                            `${item.label} · Correções`,
                          );
                        }}
                        color="success.main"
                      />
                    </TableCell>

                    <TableCell align="right">
                      <ClickableNumber
                        value={
                          item.evolutions
                        }
                        onClick={(
                          event,
                        ) => {
                          event.stopPropagation();

                          void openVersion(
                            item,
                            {
                              type:
                                "Evolução",
                            },
                            `${item.label} · Evoluções`,
                          );
                        }}
                        color="primary.main"
                      />
                    </TableCell>
                    <TableCell align="right">
                      {item.active}
                    </TableCell>
                    <TableCell align="right">
                      {item.concluded}
                    </TableCell>
                    <TableCell align="right">
                      <ClickableNumber
                        value={
                          item.prioritized
                        }
                        onClick={(
                          event,
                        ) => {
                          event.stopPropagation();

                          void openVersion(
                            item,
                            {
                              prioritized:
                                "true",
                            },
                            `${item.label} · Priorizadas`,
                          );
                        }}
                        color="warning.main"
                      />
                    </TableCell>

                    <TableCell align="right">
                      <RiskNumber
                        value={
                          item.blockedProcess
                        }
                        severity="error"
                        onClick={(
                          event,
                        ) => {
                          event.stopPropagation();

                          void openVersion(
                            item,
                            {
                              blockedProcess:
                                "true",
                            },
                            `${item.label} · Bloqueadas`,
                          );
                        }}
                      />
                    </TableCell>

                    <TableCell align="right">
                      <RiskNumber
                        value={
                          item.highOrCritical
                        }
                        severity="warning"
                        onClick={(
                          event,
                        ) => {
                          event.stopPropagation();

                          void loadDetail(
                            {
                              title:
                                `${item.label} · Alta/Crítica`,
                              subtitle:
                                "Tasks com criticidade elevada nesta versão",
                              version:
                                item,
                            },
                            getHighCriticalRequests(
                              filters.criticalities,
                            ).map(
                              (
                                request,
                              ) => ({
                                params: {
                                  ...versionParams(
                                    item,
                                  ),
                                  ...request.params,
                                },
                              }),
                            ),
                          );
                        }}
                      />
                    </TableCell>

                    <TableCell align="right">
                      {item.clients}
                    </TableCell>

                    <TableCell>
                      {formatDateTime(
                        item.latestChangedAt,
                      )}
                    </TableCell>
                  </TableRow>
                ),
              )}

              {visibleVersions.length ===
                0 && (
                <TableRow>
                  <TableCell
                    colSpan={
                      11
                    }
                    align="center"
                  >
                    <Box
                      sx={{
                        py:
                          4,
                      }}
                    >
                      <Typography
                        sx={{
                          fontWeight:
                            700,
                        }}
                      >
                        Nenhuma versão encontrada
                      </Typography>

                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        Altere os filtros ou a pesquisa.
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
          count={
            visibleVersions.length
          }
          page={
            versionPage
          }
          onPageChange={(
            _,
            nextPage,
          ) =>
            setVersionPage(
              nextPage,
            )
          }
          rowsPerPage={
            versionsPerPage
          }
          onRowsPerPageChange={(
            event,
          ) => {
            setVersionsPerPage(
              Number(
                event.target.value,
              ),
            );
            setVersionPage(0);
          }}
          rowsPerPageOptions={[
            10,
            25,
            50,
            100,
          ]}
          labelRowsPerPage="Versões por página"
          labelDisplayedRows={({
            from,
            to,
            count,
          }) =>
            `${from}–${to} de ${count}`
          }
          sx={{
            borderTop:
              "1px solid",
            borderColor:
              "divider",
          }}
        />
      </Card>

      <Drawer
        anchor="right"
        open={
          Boolean(
            detailContext,
          )
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
                  620,
              },
            },
          },
        }}
      >
        {detailContext && (
          <Box
            sx={{
              p:
                2.5,
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
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight:
                      800,
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      "0.07em",
                  }}
                >
                  {selectedVersion
                    ? "Versão"
                    : "Detalhamento"}
                </Typography>

                <Typography
                  variant="h6"
                  sx={{
                    mt:
                      0.25,
                    fontWeight:
                      800,
                  }}
                >
                  {detailContext.title}
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  {detailContext.subtitle ??
                    `${versionItemsTotal} Task(s) no detalhamento`}
                </Typography>
              </Box>

              <IconButton
                size="small"
                onClick={
                  closeDetail
                }
                aria-label="Fechar"
              >
                ✕
              </IconButton>
            </Stack>

            {selectedVersion && (
              <>
            {selectedVersion.version && (
              <Button
                variant="outlined"
                endIcon={<OpenInNewOutlined />}
                onClick={() => openVersionInAzure(selectedVersion.version!)}
                sx={{ mt: 2 }}
              >
                Abrir versão no Azure
              </Button>
            )}
            <Box
              sx={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(3, minmax(0, 1fr))",
                gap:
                  1,
                mt:
                  2,
              }}
            >
              <MiniMetric
                label="Correções"
                value={
                  selectedVersion.corrections
                }
              />
              <MiniMetric
                label="Evoluções"
                value={
                  selectedVersion.evolutions
                }
              />
              <MiniMetric
                label="Ativas"
                value={
                  selectedVersion.active
                }
              />
              <MiniMetric
                label="Priorizadas"
                value={
                  selectedVersion.prioritized
                }
              />
              <MiniMetric
                label="Bloqueadas"
                value={
                  selectedVersion.blockedProcess
                }
              />
              <MiniMetric
                label="Alta/Crítica"
                value={
                  selectedVersion.highOrCritical
                }
              />
            </Box>

            <Divider
              sx={{
                my:
                  2,
              }}
            />

            {selectedTask && (
              <Card elevation={0} sx={{ mb: 2, border: "1px solid", borderColor: "success.light", borderRadius: 2 }}>
                <CardContent>
                  <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                        {shortType(selectedTask.workItemType)} #{selectedTask.id}
                      </Typography>
                      <Typography sx={{ fontWeight: 850, mt: 0.35 }}>{selectedTask.title}</Typography>
                    </Box>
                    {taskDetailLoading && <CircularProgress size={20} />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {selectedTask.descriptionText || selectedTask.technicalSolutionText || "Detalhamento textual não informado no Azure."}
                  </Typography>
                  {selectedTask.deliveredVersion && <Chip size="small" label={`Versão ${selectedTask.deliveredVersion}`} sx={{ mt: 1 }} />}
                  <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: "wrap" }}>
                    <Button size="small" variant="contained" onClick={() => openWorkItem(selectedTask)}>Abrir em {shortType(selectedTask.workItemType)}</Button>
                    {selectedTask.azureWebUrl && <Button size="small" component="a" href={selectedTask.azureWebUrl} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewOutlined />}>Abrir Task no Azure</Button>}
                  </Stack>
                </CardContent>
              </Card>
            )}

            <Typography
              sx={{
                fontWeight:
                  800,
                mb:
                  1,
              }}
            >
              Estados
            </Typography>

            <Stack
              direction="row"
              spacing={0.75}
              useFlexGap
              sx={{
                flexWrap:
                  "wrap",
              }}
            >
              {selectedVersion.byState.map(
                (
                  item,
                ) => (
                  <Chip
                    key={
                      item.state
                    }
                    size="small"
                    variant="outlined"
                    label={`${item.state}: ${item.total}`}
                  />
                ),
              )}
            </Stack>

              </>
            )}

            <Divider
              sx={{
                my:
                  2,
              }}
            />

            <Stack
              direction="row"
              sx={{
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                mb:
                  1,
              }}
            >
              <Typography
                sx={{
                  fontWeight:
                    800,
                }}
              >
                Tasks relacionadas
              </Typography>

              {!detailLoading && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${versionItemsTotal} Task(s)`}
                />
              )}
            </Stack>

            {detailLoading && (
              <Box
                sx={{
                  display:
                    "flex",
                  justifyContent:
                    "center",
                  py:
                    4,
                }}
              >
                <CircularProgress
                  size={
                    28
                  }
                />
              </Box>
            )}

            {detailError && (
              <Alert
                severity="error"
                sx={{
                  mb:
                    1,
                }}
              >
                {detailError}
              </Alert>
            )}

            {!detailLoading &&
              !detailError &&
              versionItemsTotal >
                versionItems.length && (
                <Alert
                  severity="info"
                  sx={{
                    mb:
                      1.25,
                  }}
                >
                  Exibindo as primeiras {versionItems.length} de{" "}
                  {versionItemsTotal} Tasks. Use Correções ou Evoluções para
                  análises completas e paginação.
                </Alert>
              )}

            <Stack
              spacing={1}
            >
              {versionItems.map(
                (
                  item,
                ) => (
                  <Card
                    key={
                      item.id
                    }
                    elevation={0}
                    onClick={() => void inspectWorkItem(item)}
                    sx={{
                      border:
                        "1px solid",
                      borderColor:
                        "divider",
                      borderRadius:
                        1.75,
                      cursor: "pointer",
                    }}
                  >
                    <CardContent
                      sx={{
                        "&:last-child":
                          {
                            pb:
                              2,
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
                            minWidth:
                              0,
                          }}
                        >
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              fontWeight:
                                800,
                            }}
                          >
                            #{item.id} • {shortType(item.workItemType)}
                          </Typography>

                          <Typography
                            variant="body2"
                            sx={{
                              mt:
                                0.35,
                              fontWeight:
                                750,
                            }}
                          >
                            {item.title}
                          </Typography>
                        </Box>

                        {item.blockedProcess && (
                          <Chip
                            size="small"
                            color="error"
                            variant="outlined"
                            label="Bloqueada"
                          />
                        )}
                      </Stack>

                      <Stack
                        direction="row"
                        spacing={0.75}
                        useFlexGap
                        sx={{
                          mt:
                            1,
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

                        {item.criticality && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={
                              item.criticality
                            }
                          />
                        )}

                        {item.prioritized && (
                          <Chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            label="Priorizada"
                          />
                        )}
                      </Stack>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display:
                            "block",
                          mt:
                            1,
                        }}
                      >
                        Cliente: {item.client ?? "—"} • Responsável:{" "}
                        {item.assignedToName ?? "—"}
                      </Typography>

                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                          mt:
                            1.25,
                        }}
                      >
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() =>
                            void inspectWorkItem(item)
                          }
                        >
                          Ver detalhes
                        </Button>

                        {item.movideskTicket && (
                          <Button
                            size="small"
                            onClick={() =>
                              openTicket(
                                item.movideskTicket!,
                              )
                            }
                          >
                            Atendimento #{item.movideskTicket}
                          </Button>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                ),
              )}
            </Stack>
          </Box>
        )}
      </Drawer>
    </>
  );
}

function MetricCard({
  title,
  value,
  description,
  severity = "default",
  active = false,
  info,
  onClick,
}: {
  title: string;
  value: string | number;
  description: string;
  severity?:
    | "default"
    | "success"
    | "warning"
    | "error";
  active?: boolean;
  info: CardInfo;
  onClick: () => void;
}) {
  const accentColor =
    severity ===
    "error"
      ? "#EF4444"
      : severity ===
        "warning"
      ? "#F59E0B"
      : severity ===
        "success"
      ? aliareColors.green
      : aliareColors.green;

  return (
    <Card
      elevation={0}
      role="button"
      tabIndex={0}
      onClick={
        onClick
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
          onClick();
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
          active
            ? "rgba(24,199,122,0.035)"
            : "background.paper",
        boxShadow:
          active
            ? "0 6px 20px rgba(16,24,40,0.07)"
            : "none",
        transition:
          "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
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
            2,
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
              "center",
            justifyContent:
              "space-between",
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight:
                750,
            }}
          >
            {title}
          </Typography>

          <CardInfoButton
            info={
              info
            }
          />
        </Stack>

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
            lineHeight:
              1.05,
            fontWeight:
              800,
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
          }}
        >
          {description}
        </Typography>

      </CardContent>
    </Card>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <Box
      sx={{
        border:
          "1px solid",
        borderColor:
          "divider",
        borderRadius:
          1.5,
        p:
          1,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
      >
        {label}
      </Typography>

      <Typography
        sx={{
          mt:
            0.2,
          fontWeight:
            800,
          fontSize:
            "1.1rem",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function RiskNumber({
  value,
  severity,
  onClick,
}: {
  value: number;
  severity:
    | "error"
    | "warning";
  onClick?:
    (
      event:
        MouseEvent<HTMLElement>,
    ) => void;
}) {
  if (
    value <=
    0
  ) {
    return (
      <Typography
        variant="body2"
      >
        0
      </Typography>
    );
  }

  return (
    <Chip
      size="small"
      color={
        severity
      }
      variant="outlined"
      label={
        value
      }
      onClick={
        onClick
      }
      sx={{
        cursor:
          onClick
            ? "pointer"
            : "default",
      }}
    />
  );
}

function CardInfoButton({
  info,
}: {
  info:
    CardInfo;
}) {
  const [
    anchorEl,
    setAnchorEl,
  ] =
    useState<HTMLElement | null>(
      null,
    );

  return (
    <>
      <IconButton
        size="small"
        title={`Informações sobre ${info.title}`}
        aria-label={`Informações sobre ${info.title}`}
        onClick={(
          event,
        ) => {
          event.stopPropagation();

          setAnchorEl(
            event.currentTarget,
          );
        }}
        onKeyDown={(
          event,
        ) =>
          event.stopPropagation()
        }
        sx={{
          width:
            28,
          height:
            28,
          color:
            "text.secondary",
          flexShrink:
            0,
        }}
      >
        <InfoOutlined
          sx={{
            fontSize:
              17,
          }}
        />
      </IconButton>

      <Popover
        open={
          Boolean(
            anchorEl,
          )
        }
        anchorEl={
          anchorEl
        }
        onClose={() =>
          setAnchorEl(
            null,
          )
        }
        anchorOrigin={{
          vertical:
            "bottom",
          horizontal:
            "right",
        }}
        transformOrigin={{
          vertical:
            "top",
          horizontal:
            "right",
        }}
        onClick={(
          event,
        ) =>
          event.stopPropagation()
        }
        slotProps={{
          paper: {
            sx: {
              width:
                340,
              maxWidth:
                "calc(100vw - 32px)",
              p:
                2,
              borderRadius:
                2,
            },
          },
        }}
      >
        <Typography
          sx={{
            fontWeight:
              800,
          }}
        >
          {info.title}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt:
              0.75,
          }}
        >
          {info.summary}
        </Typography>

        <Divider
          sx={{
            my:
              1.5,
          }}
        />

        <InfoLine
          label="Cálculo"
          value={
            info.calculation
          }
        />

        <InfoLine
          label="Fonte"
          value={
            info.source
          }
        />

        {info.reference && (
          <InfoLine
            label="Referência"
            value={
              info.reference
            }
          />
        )}

        <InfoLine
          label="Regra do recorte"
          value={
            info.periodRule
          }
        />

        {info.notes && (
          <InfoLine
            label="Observação"
            value={
              info.notes
            }
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
  label:
    string;
  value:
    string;
}) {
  return (
    <Box
      sx={{
        mt:
          1,
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
        {label}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          mt:
            0.15,
          lineHeight:
            1.45,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function DonutCard({
  title,
  subtitle,
  centerValue,
  centerLabel,
  data,
  info,
  onSliceClick,
}: {
  title:
    string;
  subtitle:
    string;
  centerValue:
    string | number;
  centerLabel:
    string;
  data:
    Array<{
      name: string;
      value: number;
      color: string;
      version?: VersionRow | null;
    }>;
  info:
    CardInfo;
  onSliceClick?:
    (
      name:
        string,
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
      }}
    >
      <CardContent>
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
              210,
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
                  innerRadius={
                    58
                  }
                  outerRadius={
                    82
                  }
                  paddingAngle={
                    2
                  }
                  stroke="none"
                  cursor={
                    onSliceClick
                      ? "pointer"
                      : "default"
                  }
                  onClick={(
                    entry,
                  ) => {
                    const candidate =
                      entry as {
                        name?:
                          unknown;
                        payload?: {
                          name?:
                            unknown;
                        };
                      };

                    const name =
                      typeof candidate.name ===
                      "string"
                        ? candidate.name
                        : typeof candidate.payload?.name ===
                          "string"
                        ? candidate.payload.name
                        : null;

                    if (name) {
                      onSliceClick?.(
                        name,
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

                <RechartsTooltip />

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
            flexWrap:
              "wrap",
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
                  onSliceClick
                    ? "button"
                    : undefined
                }
                tabIndex={
                  onSliceClick
                    ? 0
                    : undefined
                }
                onClick={() =>
                  onSliceClick?.(
                    item.name,
                  )
                }
                onKeyDown={(
                  event,
                ) => {
                  if (
                    onSliceClick &&
                    (
                      event.key ===
                        "Enter" ||
                      event.key ===
                        " "
                    )
                  ) {
                    onSliceClick(
                      item.name,
                    );
                  }
                }}
                sx={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap:
                    0.5,
                  px:
                    0.4,
                  py:
                    0.2,
                  borderRadius:
                    1,
                  cursor:
                    onSliceClick
                      ? "pointer"
                      : "default",
                  "&:hover":
                    onSliceClick
                      ? {
                          backgroundColor:
                            "action.hover",
                        }
                      : undefined,
                }}
              >
                <Box
                  sx={{
                    width:
                      9,
                    height:
                      9,
                    borderRadius:
                      "50%",
                    backgroundColor:
                      item.color,
                  }}
                />

                <Typography
                  variant="caption"
                  sx={{
                    fontWeight:
                      650,
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
                  {item.value}
                </Typography>
              </Box>
            ),
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ClickableNumber({
  value,
  onClick,
  color =
    "text.primary",
}: {
  value:
    number;
  onClick:
    (
      event:
        MouseEvent<HTMLElement>,
    ) => void;
  color?:
    string;
}) {
  return (
    <Button
      size="small"
      variant="text"
      onClick={
        onClick
      }
      sx={{
        minWidth:
          32,
        p:
          0.25,
        fontWeight:
          800,
        color,
      }}
    >
      {value}
    </Button>
  );
}

function getHighCriticalRequests(
  criticalities:
    string[],
): DetailRequest[] {
  const high =
    criticalities.find(
      (
        item,
      ) =>
        normalizeValue(
          item,
        ) ===
        "alta",
    ) ??
    "Alta";

  const critical =
    criticalities.find(
      (
        item,
      ) =>
        normalizeValue(
          item,
        ) ===
        "critica",
    ) ??
    "Crítica";

  return [
    {
      params: {
        criticality:
          high,
      },
    },
    {
      params: {
        criticality:
          critical,
      },
    },
  ];
}

function matchesVersionMetric(
  item:
    VersionRow,
  metric:
    VersionMetricFilter,
) {
  if (
    metric === "all"
  ) {
    return true;
  }

  if (
    metric === "with-version"
  ) {
    return item.hasVersion;
  }

  if (
    metric === "without-version"
  ) {
    return !item.hasVersion;
  }

  if (
    metric === "corrections"
  ) {
    return item.corrections > 0;
  }

  if (
    metric === "evolutions"
  ) {
    return item.evolutions > 0;
  }

  if (
    metric === "prioritized"
  ) {
    return item.prioritized > 0;
  }

  if (
    metric === "blocked"
  ) {
    return item.blockedProcess > 0;
  }

  return item.highOrCritical > 0;
}

function compareVersionsDesc(
  a:
    VersionRow,
  b:
    VersionRow,
) {
  if (
    !a.hasVersion &&
    b.hasVersion
  ) {
    return 1;
  }

  if (
    a.hasVersion &&
    !b.hasVersion
  ) {
    return -1;
  }

  const aParts =
    getVersionNumberParts(
      a.version ??
        a.label,
    );

  const bParts =
    getVersionNumberParts(
      b.version ??
        b.label,
    );

  const length =
    Math.max(
      aParts.length,
      bParts.length,
    );

  for (
    let index = 0;
    index < length;
    index += 1
  ) {
    const difference =
      (bParts[index] ?? 0) -
      (aParts[index] ?? 0);

    if (
      difference !== 0
    ) {
      return difference;
    }
  }

  return b.label.localeCompare(
    a.label,
    "pt-BR",
    {
      numeric:
        true,
      sensitivity:
        "base",
    },
  );
}

function getVersionNumberParts(
  value:
    string,
) {
  return (
    value.match(
      /\d+/g,
    ) ??
    []
  ).map(Number);
}

function getVersionChannel(
  item:
    VersionRow,
): VersionChannelKind {
  if (
    !item.hasVersion ||
    !item.version
  ) {
    return "undefined";
  }

  const normalized =
    normalizeValue(
      item.version,
    );

  if (
    /(^|[-_.\s])lts($|[-_.\s])/.test(
      normalized,
    )
  ) {
    return "lts";
  }

  if (
    /(^|[-_.\s])lte($|[-_.\s])/.test(
      normalized,
    )
  ) {
    return "lte";
  }

  if (
    /(^|[-_.\s])rc($|[-_.\s])/.test(
      normalized,
    )
  ) {
    return "rc";
  }

  if (
    normalized.includes(
      "develop",
    )
  ) {
    return "develop";
  }

  return "other";
}

function normalizeValue(
  value:
    string,
) {
  return value
    .normalize(
      "NFD",
    )
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .trim()
    .toLowerCase();
}

function toTimestamp(
  value:
    string | null,
) {
  if (!value) {
    return 0;
  }

  const timestamp =
    new Date(
      value,
    ).getTime();

  return Number.isNaN(
    timestamp,
  )
    ? 0
    : timestamp;
}

function shortType(
  value:
    string,
) {
  return value ===
    "Correção Clientes"
    ? "Correção"
    : value;
}

function formatDateTime(
  value:
    string |
    null |
    undefined,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
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
    },
  ).format(
    date,
  );
}
