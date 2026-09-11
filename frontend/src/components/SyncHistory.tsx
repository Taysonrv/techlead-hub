import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  MenuItem,
  Pagination,
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
  HistoryOutlined,
  RefreshOutlined,
  SyncOutlined,
} from "@mui/icons-material";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useAuth,
} from "../context/AuthContext";

import {
  api,
} from "../services/api";

type SyncProvider =
  | ""
  | "MOVIDESK"
  | "AZURE_DEVOPS";

type SyncStatus =
  | ""
  | "PROCESSING"
  | "SUCCESS"
  | "PARTIAL"
  | "ERROR";

type SyncHistoryItem = {
  id: string;
  runId: number;
  provider:
    | "MOVIDESK"
    | "AZURE_DEVOPS";
  operation: string;
  batch: string;
  fileName: string | null;
  status: Exclude<SyncStatus, "">;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  user: {
    id: number;
    name: string;
    username: string;
  } | null;
};

type HistoryResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  items: SyncHistoryItem[];
};

const PAGE_SIZE = 10;

export function SyncHistory() {
  const {
    isAdmin,
  } =
    useAuth();

  const [provider, setProvider] =
    useState<SyncProvider>("");
  const [status, setStatus] =
    useState<SyncStatus>("");
  const [page, setPage] =
    useState(1);
  const [history, setHistory] =
    useState<HistoryResponse | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [executing, setExecuting] =
    useState<
      "incremental" |
      "full" |
      null
    >(null);
  const [error, setError] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);

  const loadHistory =
    useCallback(
      async (
        showLoading =
          true,
      ) => {
        try {
          if (showLoading) {
            setLoading(true);
          }

          setError(null);

          const response =
            await api.get<HistoryResponse>(
              "/sync-center/history",
              {
                params: {
                  page,
                  pageSize:
                    PAGE_SIZE,
                  provider:
                    provider ||
                    undefined,
                  status:
                    status ||
                    undefined,
                },
              },
            );

          setHistory(
            response.data,
          );
        } catch (
          loadError
        ) {
          console.error(
            "[sync-center]",
            loadError,
          );

          setError(
            "Não foi possível carregar o histórico consolidado.",
          );
        } finally {
          setLoading(false);
        }
      },
      [
        page,
        provider,
        status,
      ],
    );

  useEffect(() => {
    void loadHistory();
  }, [
    loadHistory,
  ]);

  useEffect(() => {
    if (
      !history?.items.some(
        (item) =>
          item.status ===
          "PROCESSING",
      )
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          void loadHistory(
            false,
          );
        },
        5000,
      );

    return () =>
      window.clearInterval(
        timer,
      );
  }, [
    history?.items,
    loadHistory,
  ]);

  async function runAzure(
    mode:
      | "incremental"
      | "full",
  ) {
    if (
      executing
    ) {
      return;
    }

    if (
      mode ===
        "full" &&
      !window.confirm(
        "A sincronização completa pode demorar. Deseja continuar?",
      )
    ) {
      return;
    }

    try {
      setExecuting(
        mode,
      );
      setError(null);
      setNotice(null);

      await api.post(
        mode ===
          "full"
          ? "/azure-devops/sync/full"
          : "/azure-devops/sync/incremental",
        mode ===
          "full"
          ? {
              full:
                true,
            }
          : {
              overlapMinutes:
                5,
            },
        {
          timeout:
            0,
        },
      );

      setNotice(
        mode ===
          "full"
          ? "Sincronização completa concluída."
          : "Sincronização incremental concluída.",
      );

      setPage(1);

      await loadHistory();
    } catch (
      runError:
        unknown
    ) {
      console.error(
        "[sync-center]",
        runError,
      );

      const apiMessage =
        typeof runError ===
          "object" &&
        runError !==
          null &&
        "response" in
          runError
          ? (
              runError as {
                response?: {
                  data?: {
                    message?: string;
                  };
                };
              }
            ).response
              ?.data
              ?.message
          : null;

      setError(
        apiMessage ??
        "Não foi possível executar a sincronização do Azure DevOps.",
      );
    } finally {
      setExecuting(
        null,
      );
    }
  }

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
        mb:
          3,
      }}
    >
      <CardContent
        sx={{
          p: {
            xs:
              2,
            md:
              2.5,
          },
        }}
      >
        <Stack
          direction={{
            xs:
              "column",
            lg:
              "row",
          }}
          spacing={2}
          sx={{
            justifyContent:
              "space-between",
            alignItems: {
              xs:
                "stretch",
              lg:
                "center",
            },
            mb:
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
              <HistoryOutlined
                color="success"
              />

              <Typography
                sx={{
                  fontWeight:
                    800,
                  fontSize:
                    "1.05rem",
                }}
              >
                Histórico consolidado
              </Typography>

              <Chip
                size="small"
                variant="outlined"
                label={
                  `${history?.total ?? 0} execução(ões)`
                }
              />
            </Stack>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt:
                  0.5,
              }}
            >
              Movidesk e Azure DevOps em uma única linha do tempo.
            </Typography>
          </Box>

          <Stack
            direction={{
              xs:
                "column",
              sm:
                "row",
            }}
            spacing={1}
          >
            {isAdmin && (
              <>
                <Button
                  variant="outlined"
                  startIcon={
                    executing ===
                      "incremental"
                      ? <CircularProgress size={16} />
                      : <SyncOutlined />
                  }
                  disabled={
                    Boolean(
                      executing,
                    )
                  }
                  onClick={() =>
                    void runAzure(
                      "incremental",
                    )
                  }
                >
                  Sincronizar alterações
                </Button>

                <Button
                  variant="outlined"
                  color="warning"
                  disabled={
                    Boolean(
                      executing,
                    )
                  }
                  onClick={() =>
                    void runAzure(
                      "full",
                    )
                  }
                >
                  Sincronização completa
                </Button>
              </>
            )}

            <Button
              variant="outlined"
              startIcon={
                <RefreshOutlined />
              }
              disabled={
                loading
              }
              onClick={() =>
                void loadHistory()
              }
            >
              Atualizar
            </Button>
          </Stack>
        </Stack>

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

        {notice && (
          <Alert
            severity="success"
            sx={{
              mb:
                2,
            }}
          >
            {notice}
          </Alert>
        )}

        <Box
          sx={{
            display:
              "grid",
            gridTemplateColumns: {
              xs:
                "1fr",
              sm:
                "repeat(2, minmax(0, 220px))",
            },
            gap:
              1.5,
            mb:
              2,
          }}
        >
          <TextField
            select
            size="small"
            label="Origem"
            value={
              provider
            }
            onChange={(
              event,
            ) => {
              setProvider(
                event.target
                  .value as
                  SyncProvider,
              );
              setPage(1);
            }}
          >
            <MenuItem value="">
              Todas
            </MenuItem>
            <MenuItem value="MOVIDESK">
              Movidesk
            </MenuItem>
            <MenuItem value="AZURE_DEVOPS">
              Azure DevOps
            </MenuItem>
          </TextField>

          <TextField
            select
            size="small"
            label="Situação"
            value={
              status
            }
            onChange={(
              event,
            ) => {
              setStatus(
                event.target
                  .value as
                  SyncStatus,
              );
              setPage(1);
            }}
          >
            <MenuItem value="">
              Todas
            </MenuItem>
            <MenuItem value="PROCESSING">
              Em execução
            </MenuItem>
            <MenuItem value="SUCCESS">
              Concluída
            </MenuItem>
            <MenuItem value="PARTIAL">
              Parcial
            </MenuItem>
            <MenuItem value="ERROR">
              Falha
            </MenuItem>
          </TextField>
        </Box>

        <TableContainer>
          <Table
            size="small"
            sx={{
              minWidth:
                1050,
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell>
                  Origem
                </TableCell>
                <TableCell>
                  Início
                </TableCell>
                <TableCell>
                  Duração
                </TableCell>
                <TableCell>
                  Situação
                </TableCell>
                <TableCell align="right">
                  Processados
                </TableCell>
                <TableCell align="right">
                  Inseridos
                </TableCell>
                <TableCell align="right">
                  Atualizados
                </TableCell>
                <TableCell align="right">
                  Ignorados
                </TableCell>
                <TableCell align="right">
                  Erros
                </TableCell>
                <TableCell>
                  Responsável
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    align="center"
                    sx={{
                      py:
                        5,
                    }}
                  >
                    <CircularProgress
                      size={28}
                    />
                  </TableCell>
                </TableRow>
              ) : history &&
                history.items.length >
                  0 ? (
                history.items.map(
                  (item) => (
                    <TableRow
                      key={
                        item.id
                      }
                      hover
                    >
                      <TableCell>
                        <Typography
                          sx={{
                            fontWeight:
                              700,
                            fontSize:
                              "0.82rem",
                          }}
                        >
                          {item.provider ===
                          "MOVIDESK"
                            ? "Movidesk"
                            : "Azure DevOps"}
                        </Typography>

                        <Typography
                          variant="caption"
                          color="text.secondary"
                        >
                          {item.fileName ??
                            formatOperation(
                              item.operation,
                            )}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        {formatDateTime(
                          item.startedAt,
                        )}
                      </TableCell>

                      <TableCell>
                        {formatDuration(
                          item.durationMs,
                        )}
                      </TableCell>

                      <TableCell>
                        <StatusChip
                          status={
                            item.status
                          }
                        />
                      </TableCell>

                      <TableCell align="right">
                        {formatNumber(
                          item.processed,
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(
                          item.inserted,
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(
                          item.updated,
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(
                          item.skipped,
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(
                          item.errors,
                        )}
                      </TableCell>
                      <TableCell>
                        {item.user
                          ?.name ??
                          item.user
                            ?.username ??
                          "Automático"}
                      </TableCell>
                    </TableRow>
                  ),
                )
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    align="center"
                    sx={{
                      py:
                        5,
                    }}
                  >
                    Nenhuma execução encontrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {Boolean(
          history &&
          history.totalPages >
            1,
        ) && (
          <Box
            sx={{
              display:
                "flex",
              justifyContent:
                "flex-end",
              mt:
                2,
            }}
          >
            <Pagination
              page={
                page
              }
              count={
                history
                  ?.totalPages ??
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
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function StatusChip({
  status,
}: {
  status:
    Exclude<
      SyncStatus,
      ""
    >;
}) {
  const definition = {
    PROCESSING: {
      label:
        "Em execução",
      color:
        "info" as const,
    },
    SUCCESS: {
      label:
        "Concluída",
      color:
        "success" as const,
    },
    PARTIAL: {
      label:
        "Parcial",
      color:
        "warning" as const,
    },
    ERROR: {
      label:
        "Falha",
      color:
        "error" as const,
    },
  }[status];

  return (
    <Chip
      size="small"
      variant="outlined"
      label={
        definition.label
      }
      color={
        definition.color
      }
    />
  );
}

function formatDateTime(
  value: string,
) {
  const date =
    new Date(
      value,
    );

  return Number.isNaN(
    date.getTime(),
  )
    ? "-"
    : new Intl.DateTimeFormat(
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

function formatDuration(
  durationMs:
    number |
    null,
) {
  if (
    durationMs ===
    null
  ) {
    return "Em andamento";
  }

  const seconds =
    Math.round(
      durationMs /
      1000,
    );

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes =
    Math.floor(
      seconds /
      60,
    );

  const remainingSeconds =
    seconds %
    60;

  return `${minutes}min ${remainingSeconds}s`;
}

function formatNumber(
  value: number,
) {
  return value.toLocaleString(
    "pt-BR",
  );
}

function formatOperation(
  value: string,
) {
  const labels:
    Record<string, string> = {
      FULL:
        "Sincronização completa",
      CONTROLLED:
        "Sincronização controlada",
      INCREMENTAL:
        "Sincronização incremental",
      SCHEDULED:
        "Sincronização automática",
      MANUAL:
        "Sincronização manual",
      "MOVÍDESK_EXCEL":
        "Importação Excel",
    };

  return labels[value] ??
    value;
}
