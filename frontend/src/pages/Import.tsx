import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
  DragEvent,
} from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

import { api } from "../services/api";

import {
  useAuth,
} from "../context/AuthContext";

import {
  SyncHistory,
} from "../components/SyncHistory";
import { PageHeader } from "../components/PageHeader";

/* =========================================================
   TIPOS - MOVIDESK
========================================================= */

type ImportResult = {
  message: string;
  batchId: string;

  totalRows: number;
  created: number;
  updated: number;
  ignored: number;
  errors: number;

  analysts: string[];
  clients: string[];
  categories: string[];
  services: string[];

  errorDetails: {
    row: number;
    message: string;
  }[];
};

/* =========================================================
   TIPOS - AZURE
========================================================= */

type AzureSyncStatus =
  | "PROCESSING"
  | "SUCCESS"
  | "PARTIAL"
  | "ERROR";

type AzureSyncRun = {
  id: number;
  batch: string;
  status: AzureSyncStatus;
  source: string | null;

  totalItems: number;
  insertedItems: number;
  updatedItems: number;
  skippedItems: number;
  errorItems: number;

  message: string | null;

  startedAt: string;
  finishedAt: string | null;
};

type AzureSyncDashboardStatus = {
  scheduler: {
    enabled: boolean;
    intervalMinutes: number;
    overlapMinutes: number;
  };

  latestRun:
    | AzureSyncRun
    | null;

  lastSuccessfulRun:
    | AzureSyncRun
    | null;

  nextEstimatedAt:
    | string
    | null;

  recentRuns:
    AzureSyncRun[];
};

const MAX_FILE_SIZE =
  25 * 1024 * 1024;

const AZURE_STATUS_REFRESH_MS =
  30_000;

export function Import() {
  const inputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  /* =======================================================
     MOVIDESK
  ======================================================= */

  const [file, setFile] =
    useState<File | null>(
      null,
    );

  const [dragging, setDragging] =
    useState(
      false,
    );

  const [loading, setLoading] =
    useState(
      false,
    );

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const [result, setResult] =
    useState<ImportResult | null>(
      null,
    );

  /* =======================================================
     AZURE
  ======================================================= */

  const [
    azureStatus,
    setAzureStatus,
  ] =
    useState<AzureSyncDashboardStatus | null>(
      null,
    );

  const [
    azureLoading,
    setAzureLoading,
  ] =
    useState(
      true,
    );

  const [
    azureError,
    setAzureError,
  ] =
    useState<string | null>(
      null,
    );

  const fileSize =
    useMemo(
      () => {
        if (!file) {
          return "";
        }

        return formatFileSize(
          file.size,
        );
      },
      [
        file,
      ],
    );

  /* =======================================================
     STATUS AZURE
  ======================================================= */

  const loadAzureStatus =
    useCallback(
      async (
        showLoading =
          false,
      ) => {
        try {
          if (
            showLoading
          ) {
            setAzureLoading(
              true,
            );
          }

          setAzureError(
            null,
          );

          const response =
            await api.get<AzureSyncDashboardStatus>(
              "/azure-sync/status",
            );

          setAzureStatus(
            response.data,
          );
        } catch (
          err: unknown
        ) {
          console.error(
            "Erro ao consultar status da sincronização Azure:",
            err,
          );

          setAzureError(
            getApiErrorMessage(
              err,
              "Não foi possível consultar o status da sincronização do Azure DevOps.",
            ),
          );
        } finally {
          setAzureLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      void loadAzureStatus(
        true,
      );

      const timer =
        window.setInterval(
          () => {
            void loadAzureStatus(
              false,
            );
          },
          AZURE_STATUS_REFRESH_MS,
        );

      return () => {
        window.clearInterval(
          timer,
        );
      };
    },
    [
      loadAzureStatus,
    ],
  );

  /* =======================================================
     MOVIDESK - ARQUIVO
  ======================================================= */

  function validateFile(
    selectedFile:
      File,
  ) {
    const fileName =
      selectedFile.name
        .toLowerCase();

    if (
      !fileName.endsWith(
        ".xlsx",
      )
    ) {
      setError(
        "Formato inválido. Selecione um arquivo Excel no formato .xlsx.",
      );

      return false;
    }

    if (
      selectedFile.size >
      MAX_FILE_SIZE
    ) {
      setError(
        "O arquivo excede o limite de 25 MB.",
      );

      return false;
    }

    return true;
  }

  function selectFile(
    selectedFile:
      | File
      | undefined,
  ) {
    if (
      !selectedFile
    ) {
      return;
    }

    setError(
      null,
    );

    setResult(
      null,
    );

    if (
      !validateFile(
        selectedFile,
      )
    ) {
      setFile(
        null,
      );

      return;
    }

    setFile(
      selectedFile,
    );
  }

  function handleFileChange(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    selectFile(
      event.target
        .files?.[0],
    );

    event.target.value =
      "";
  }

  function handleDragOver(
    event:
      DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    if (
      !loading
    ) {
      setDragging(
        true,
      );
    }
  }

  function handleDragLeave(
    event:
      DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    setDragging(
      false,
    );
  }

  function handleDrop(
    event:
      DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    setDragging(
      false,
    );

    if (
      loading
    ) {
      return;
    }

    selectFile(
      event.dataTransfer
        .files?.[0],
    );
  }

  function removeFile() {
    if (
      loading
    ) {
      return;
    }

    setFile(
      null,
    );

    setError(
      null,
    );

    setResult(
      null,
    );
  }

  async function importFile() {
    if (
      !file
    ) {
      setError(
        "Selecione um arquivo antes de iniciar a importação.",
      );

      return;
    }

    try {
      setLoading(
        true,
      );

      setError(
        null,
      );

      setResult(
        null,
      );

      const formData =
        new FormData();

      formData.append(
        "file",
        file,
      );

      const response =
        await api.post(
          "/import/tickets",
          formData,
          {
            headers: {
              "Content-Type":
                "multipart/form-data",
            },
            timeout:
              0,
          },
        );

      setResult(
        response.data,
      );
    } catch (
      err: unknown
    ) {
      console.error(
        "Erro ao importar dados:",
        err,
      );

      setError(
        getApiErrorMessage(
          err,
          "Não foi possível importar o arquivo.",
        ),
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  return (
    <>
      {/* =====================================================
          CABEÇALHO
      ===================================================== */}

      <PageHeader eyebrow="Gestão" title="Importar e Sincronizar Dados" description="Importe os dados do Movidesk e acompanhe a sincronização automática do Azure DevOps." />

      {/* =====================================================
          HISTÓRICO CONSOLIDADO
      ===================================================== */}

      <SyncHistory />

      <EmailRecoveryConfiguration />

      {/* =====================================================
          AZURE DEVOPS
      ===================================================== */}

      <SectionHeader
        title="Azure DevOps"
        description="Acompanhamento da sincronização automática de Correções, Evoluções e APOIOs."
      />

      <Card
        elevation={0}
        sx={{
          border:
            "1px solid",
          borderColor:
            "divider",
          borderRadius:
            2.5,
          overflow:
            "hidden",
          mb:
            3,
        }}
      >
        {azureLoading &&
          !azureStatus && (
            <LinearProgress />
          )}

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
              md:
                "row",
            }}
            spacing={
              2
            }
            sx={{
              justifyContent:
                "space-between",
              alignItems: {
                xs:
                  "stretch",
                md:
                  "center",
              },
            }}
          >
            <Box>
              <Stack
                direction="row"
                spacing={
                  1
                }
                useFlexGap
                sx={{
                  alignItems:
                    "center",
                  flexWrap:
                    "wrap",
                }}
              >
                <Typography
                  sx={{
                    fontWeight:
                      800,
                    fontSize:
                      "1.05rem",
                  }}
                >
                  Sincronização automática
                </Typography>

                {azureStatus && (
                  <Chip
                    size="small"
                    label={
                      azureStatus
                        .scheduler
                        .enabled
                        ? "Scheduler ativo"
                        : "Scheduler desativado"
                    }
                    color={
                      azureStatus
                        .scheduler
                        .enabled
                        ? "success"
                        : "default"
                    }
                  />
                )}

                {azureStatus?.latestRun && (
                  <StatusChip
                    status={
                      azureStatus
                        .latestRun
                        .status
                    }
                  />
                )}
              </Stack>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt:
                    0.75,
                }}
              >
                {azureStatus
                  ? `Incremental a cada ${azureStatus.scheduler.intervalMinutes} minuto(s) • overlap de ${azureStatus.scheduler.overlapMinutes} minuto(s)`
                  : "Carregando configuração do sincronizador..."}
              </Typography>
            </Box>

            <Button
              variant="outlined"
              disabled={
                azureLoading
              }
              onClick={() => {
                void loadAzureStatus(
                  true,
                );
              }}
              sx={{
                minWidth:
                  150,
              }}
            >
              {azureLoading
                ? "Atualizando..."
                : "Atualizar status"}
            </Button>
          </Stack>

          {azureError && (
            <Alert
              severity="error"
              sx={{
                mt:
                  2,
              }}
            >
              {azureError}
            </Alert>
          )}

          {azureStatus && (
            <>
              <Divider
                sx={{
                  my:
                    2,
                }}
              />

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
                  },
                  gap:
                    1.5,
                }}
              >
                <InfoCard
                  label="Última tentativa"
                  value={
                    formatDateTime(
                      azureStatus
                        .latestRun
                        ?.startedAt,
                    )
                  }
                />

                <InfoCard
                  label="Último sucesso"
                  value={
                    formatDateTime(
                      azureStatus
                        .lastSuccessfulRun
                        ?.finishedAt,
                    )
                  }
                />

                <InfoCard
                  label="Próxima execução estimada"
                  value={
                    formatDateTime(
                      azureStatus
                        .nextEstimatedAt,
                    )
                  }
                />

                <InfoCard
                  label="Origem da última execução"
                  value={
                    formatSource(
                      azureStatus
                        .latestRun
                        ?.source,
                    )
                  }
                />
              </Box>

              {azureStatus.latestRun ? (
                <>
                  <Divider
                    sx={{
                      my:
                        2,
                    }}
                  />

                  <Typography
                    sx={{
                      fontWeight:
                        800,
                      mb:
                        0.5,
                    }}
                  >
                    Resultado da última execução
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    Lote{" "}
                    {
                      azureStatus
                        .latestRun
                        .batch
                    }
                  </Typography>

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
                          "repeat(5, 1fr)",
                      },
                      gap:
                        1.5,
                      mt:
                        2,
                    }}
                  >
                    <ResultCard
                      title="Work Items"
                      value={
                        azureStatus
                          .latestRun
                          .totalItems
                      }
                    />

                    <ResultCard
                      title="Inseridos"
                      value={
                        azureStatus
                          .latestRun
                          .insertedItems
                      }
                      severity="success"
                    />

                    <ResultCard
                      title="Atualizados"
                      value={
                        azureStatus
                          .latestRun
                          .updatedItems
                      }
                    />

                    <ResultCard
                      title="Ignorados"
                      value={
                        azureStatus
                          .latestRun
                          .skippedItems
                      }
                      severity="warning"
                    />

                    <ResultCard
                      title="Erros"
                      value={
                        azureStatus
                          .latestRun
                          .errorItems
                      }
                      severity={
                        azureStatus
                          .latestRun
                          .errorItems >
                        0
                          ? "error"
                          : "success"
                      }
                    />
                  </Box>

                  {azureStatus
                    .latestRun
                    .status ===
                    "ERROR" && (
                    <Alert
                      severity="error"
                      sx={{
                        mt:
                          2,
                      }}
                    >
                      <Typography
                        sx={{
                          fontWeight:
                            700,
                        }}
                      >
                        Falha na última sincronização
                      </Typography>

                      <Typography
                        variant="body2"
                        sx={{
                          mt:
                            0.5,
                          wordBreak:
                            "break-word",
                        }}
                      >
                        {azureStatus
                          .latestRun
                          .message ??
                          "A sincronização foi encerrada com erro."}
                      </Typography>
                    </Alert>
                  )}

                  {azureStatus
                    .latestRun
                    .status ===
                    "PARTIAL" && (
                    <Alert
                      severity="warning"
                      sx={{
                        mt:
                          2,
                      }}
                    >
                      A sincronização foi concluída parcialmente.
                      Consulte os indicadores de erro da execução.
                    </Alert>
                  )}
                </>
              ) : (
                <Alert
                  severity="info"
                  sx={{
                    mt:
                      2,
                  }}
                >
                  Ainda não existem execuções de sincronização registradas.
                </Alert>
              )}

              {azureStatus
                .recentRuns
                .length >
                0 && (
                <>
                  <Divider
                    sx={{
                      my:
                        2,
                    }}
                  />

                  <Typography
                    sx={{
                      fontWeight:
                        800,
                    }}
                  >
                    Histórico recente
                  </Typography>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mt:
                        0.5,
                      mb:
                        1.5,
                    }}
                  >
                    Últimas 10 execuções registradas.
                  </Typography>

                  <Stack
                    spacing={
                      1
                    }
                  >
                    {azureStatus
                      .recentRuns
                      .map(
                        (
                          run,
                        ) => (
                          <Box
                            key={
                              run.id
                            }
                            sx={{
                              display:
                                "grid",
                              gridTemplateColumns: {
                                xs:
                                  "1fr",
                                md:
                                  "180px 130px 1fr auto",
                              },
                              gap:
                                1,
                              alignItems:
                                "center",
                              p:
                                1.25,
                              border:
                                "1px solid",
                              borderColor:
                                "divider",
                              borderRadius:
                                2,
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight:
                                  700,
                              }}
                            >
                              {formatDateTime(
                                run.startedAt,
                              )}
                            </Typography>

                            <Box>
                              <StatusChip
                                status={
                                  run.status
                                }
                              />
                            </Box>

                            <Typography
                              variant="body2"
                              color="text.secondary"
                            >
                              {formatSource(
                                run.source,
                              )}
                              {" • "}
                              {run.totalItems} item(ns)
                              {" • "}
                              {run.updatedItems} atualizado(s)
                            </Typography>

                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              #{run.id}
                            </Typography>
                          </Box>
                        ),
                      )}
                  </Stack>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* =====================================================
          MOVIDESK
      ===================================================== */}

      <SectionHeader
        title="Movidesk"
        description="Importação manual da exportação Excel utilizada pela base do TechLead Hub."
      />

      <Alert
        severity="info"
        sx={{
          mb:
            2,
          borderRadius:
            2,
        }}
      >
        A importação cria tickets novos e atualiza os já existentes
        pelo número do atendimento no Movidesk. Registros existentes
        não são duplicados.
      </Alert>

      <Card
        elevation={0}
        sx={{
          border:
            "1px solid",
          borderColor:
            "divider",
          borderRadius:
            2.5,
          overflow:
            "hidden",
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
            "&:last-child": {
              pb: {
                xs:
                  2,
                md:
                  2.5,
              },
            },
          }}
        >
          <Box
            onDragOver={
              handleDragOver
            }
            onDragLeave={
              handleDragLeave
            }
            onDrop={
              handleDrop
            }
            onClick={() => {
              if (
                !loading
              ) {
                inputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={
              0
            }
            onKeyDown={(event) => {
              if (
                !loading &&
                (
                  event.key ===
                    "Enter" ||
                  event.key ===
                    " "
                )
              ) {
                inputRef.current?.click();
              }
            }}
            sx={{
              minHeight:
                220,
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              textAlign:
                "center",
              border:
                "2px dashed",
              borderColor:
                dragging
                  ? "primary.main"
                  : file
                  ? "success.main"
                  : "divider",
              backgroundColor:
                dragging
                  ? "action.hover"
                  : file
                  ? "rgba(46, 125, 50, 0.03)"
                  : "background.default",
              borderRadius:
                2.5,
              cursor:
                loading
                  ? "default"
                  : "pointer",
              transition:
                "border-color 0.15s ease, background-color 0.15s ease",
            }}
          >
            <input
              ref={
                inputRef
              }
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={
                handleFileChange
              }
            />

            {!file ? (
              <Box
                sx={{
                  px:
                    2,
                }}
              >
                <Typography
                  sx={{
                    fontWeight:
                      800,
                    fontSize:
                      "1.05rem",
                  }}
                >
                  Arraste o Excel do Movidesk para cá
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt:
                      0.75,
                  }}
                >
                  ou clique para selecionar o arquivo
                </Typography>

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
                  Formato .xlsx • Máximo 25 MB
                </Typography>

                <Button
                  variant="outlined"
                  size="small"
                  disabled={
                    loading
                  }
                  sx={{
                    mt:
                      2,
                  }}
                >
                  Selecionar arquivo
                </Button>
              </Box>
            ) : (
              <Box
                sx={{
                  px:
                    2,
                }}
              >
                <Chip
                  label="Arquivo pronto"
                  color="success"
                  size="small"
                  sx={{
                    mb:
                      1.5,
                  }}
                />

                <Typography
                  sx={{
                    fontWeight:
                      800,
                  }}
                >
                  {file.name}
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt:
                      0.5,
                  }}
                >
                  {fileSize}
                </Typography>

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
                  Clique na área para selecionar outro arquivo
                </Typography>
              </Box>
            )}
          </Box>

          {loading && (
            <Box
              sx={{
                mt:
                  2,
              }}
            >
              <LinearProgress />

              <Stack
                direction="row"
                spacing={
                  1
                }
                sx={{
                  mt:
                    1,
                  alignItems:
                    "center",
                }}
              >
                <CircularProgress
                  size={
                    16
                  }
                />

                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  Processando arquivo e atualizando a base...
                </Typography>
              </Stack>
            </Box>
          )}

          {error && (
            <Alert
              severity="error"
              sx={{
                mt:
                  2,
              }}
            >
              {error}
            </Alert>
          )}

          <Stack
            direction={{
              xs:
                "column",
              sm:
                "row",
            }}
            spacing={
              1
            }
            sx={{
              mt:
                2,
              justifyContent:
                "flex-end",
            }}
          >
            {file && (
              <Button
                variant="text"
                disabled={
                  loading
                }
                onClick={(event) => {
                  event.stopPropagation();

                  removeFile();
                }}
              >
                Remover arquivo
              </Button>
            )}

            <Button
              variant="contained"
              disabled={
                !file ||
                loading
              }
              onClick={
                importFile
              }
              sx={{
                minWidth:
                  160,
              }}
            >
              {loading
                ? "Importando..."
                : "Importar dados"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {result && (
        <>
          <Alert
            severity={
              result.errors >
              0
                ? "warning"
                : "success"
            }
            sx={{
              mt:
                2,
              borderRadius:
                2,
            }}
          >
            {result.errors >
            0
              ? "Importação concluída com algumas ocorrências."
              : "Importação concluída com sucesso."}
          </Alert>

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
                  "repeat(5, 1fr)",
              },
              gap:
                1.5,
              mt:
                2,
            }}
          >
            <ResultCard
              title="Linhas"
              value={
                result.totalRows
              }
            />

            <ResultCard
              title="Novos"
              value={
                result.created
              }
              severity="success"
            />

            <ResultCard
              title="Atualizados"
              value={
                result.updated
              }
            />

            <ResultCard
              title="Ignorados"
              value={
                result.ignored
              }
              severity="warning"
            />

            <ResultCard
              title="Erros"
              value={
                result.errors
              }
              severity={
                result.errors >
                0
                  ? "error"
                  : "success"
              }
            />
          </Box>

          <Card
            elevation={0}
            sx={{
              mt:
                2,
              border:
                "1px solid",
              borderColor:
                "divider",
              borderRadius:
                2.5,
            }}
          >
            <CardContent>
              <Typography
                sx={{
                  fontWeight:
                    800,
                  mb:
                    0.5,
                }}
              >
                Dados identificados
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
              >
                Informações reconhecidas durante esta importação.
              </Typography>

              <Divider
                sx={{
                  my:
                    2,
                }}
              />

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
                  },
                  gap:
                    2,
                }}
              >
                <InfoMetric
                  label="Analistas"
                  value={
                    result
                      .analysts
                      .length
                  }
                />

                <InfoMetric
                  label="Clientes"
                  value={
                    result
                      .clients
                      .length
                  }
                />

                <InfoMetric
                  label="Categorias"
                  value={
                    result
                      .categories
                      .length
                  }
                />

                <InfoMetric
                  label="Serviços"
                  value={
                    result
                      .services
                      .length
                  }
                />
              </Box>

              <Divider
                sx={{
                  my:
                    2,
                }}
              />

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Lote da importação
              </Typography>

              <Typography
                variant="body2"
                sx={{
                  fontWeight:
                    600,
                  wordBreak:
                    "break-word",
                }}
              >
                {result.batchId}
              </Typography>
            </CardContent>
          </Card>

          {result
            .errorDetails
            .length >
            0 && (
            <Card
              elevation={0}
              sx={{
                mt:
                  2,
                border:
                  "1px solid",
                borderColor:
                  "warning.light",
                borderRadius:
                  2.5,
              }}
            >
              <CardContent>
                <Typography
                  sx={{
                    fontWeight:
                      800,
                  }}
                >
                  Ocorrências da importação
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt:
                      0.5,
                    mb:
                      2,
                  }}
                >
                  Até 100 ocorrências são exibidas nesta tela.
                </Typography>

                <Stack
                  spacing={
                    1
                  }
                >
                  {result
                    .errorDetails
                    .map(
                      (
                        detail,
                        index,
                      ) => (
                        <Alert
                          key={`${detail.row}-${index}`}
                          severity="warning"
                        >
                          Linha{" "}
                          <strong>
                            {
                              detail.row
                            }
                          </strong>
                          :{" "}
                          {
                            detail.message
                          }
                        </Alert>
                      ),
                    )}
                </Stack>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  );
}

/* =========================================================
   COMPONENTES
========================================================= */

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Box
      sx={{
        mb:
          1.25,
      }}
    >
      <Typography
        sx={{
          fontWeight:
            800,
          fontSize:
            "1.15rem",
        }}
      >
        {title}
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          mt:
            0.25,
        }}
      >
        {description}
      </Typography>
    </Box>
  );
}

function StatusChip({
  status,
}: {
  status:
    AzureSyncStatus;
}) {
  const config =
    status ===
    "SUCCESS"
      ? {
          label:
            "Sucesso",
          color:
            "success" as const,
        }
      : status ===
        "PARTIAL"
      ? {
          label:
            "Parcial",
          color:
            "warning" as const,
        }
      : status ===
        "ERROR"
      ? {
          label:
            "Erro",
          color:
            "error" as const,
        }
      : {
          label:
            "Processando",
          color:
            "info" as const,
        };

  return (
    <Chip
      size="small"
      label={
        config.label
      }
      color={
        config.color
      }
    />
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Box
      sx={{
        p:
          1.5,
        border:
          "1px solid",
        borderColor:
          "divider",
        borderRadius:
          2,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
      >
        {label}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          fontWeight:
            700,
          mt:
            0.25,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function ResultCard({
  title,
  value,
  severity = "default",
}: {
  title: string;
  value: number;
  severity?:
    | "default"
    | "success"
    | "warning"
    | "error";
}) {
  const borderColor =
    severity ===
    "success"
      ? "success.main"
      : severity ===
        "warning"
      ? "warning.main"
      : severity ===
        "error"
      ? "error.main"
      : "divider";

  return (
    <Card
      elevation={0}
      sx={{
        border:
          "1px solid",
        borderColor,
        borderRadius:
          2.5,
        height:
          "100%",
      }}
    >
      <CardContent
        sx={{
          p:
            1.75,
          "&:last-child": {
            pb:
              1.75,
          },
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontWeight:
              600,
          }}
        >
          {title}
        </Typography>

        <Typography
          sx={{
            fontWeight:
              800,
            mt:
              0.5,
            fontSize:
              "1.9rem",
            lineHeight:
              1.1,
          }}
        >
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function InfoMetric({
  label,
  value,
}: {
  label: string;
  value: number;
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
        sx={{
          fontWeight:
            800,
          fontSize:
            "1.35rem",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/* =========================================================
   CONFIGURAÇÃO DE E-MAIL PARA RECUPERAÇÃO
========================================================= */

type EmailConfigurationForm = {
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
};

const EMPTY_EMAIL_CONFIGURATION:
  EmailConfigurationForm = {
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: false,
  smtpUser: "",
  smtpPassword: "",
  smtpFrom: "",
};

function EmailRecoveryConfiguration() {
  const {
    user,
  } =
    useAuth();

  const [
    form,
    setForm,
  ] =
    useState<EmailConfigurationForm>(
      EMPTY_EMAIL_CONFIGURATION
    );

  const [
    configured,
    setConfigured,
  ] =
    useState(false);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState<string | null>(
      null
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  useEffect(
    () => {
      if (
        user?.role !== "ADMIN" ||
        !window.techLeadHub
      ) {
        setLoading(false);
        return;
      }

      void (async () => {
        try {
          const current =
            await window.techLeadHub!
              .configuration
              .get();

          setConfigured(
            current.emailConfigured
          );

          setForm({
            smtpHost:
              current.smtpHost,
            smtpPort:
              current.smtpPort ||
              "587",
            smtpSecure:
              current.smtpSecure,
            smtpUser:
              current.smtpUser,
            smtpPassword:
              "",
            smtpFrom:
              current.smtpFrom,
          });
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar a configuração de e-mail."
          );
        } finally {
          setLoading(false);
        }
      })();
    },
    [
      user?.role,
    ]
  );

  if (
    user?.role !== "ADMIN"
  ) {
    return null;
  }

  if (
    !window.techLeadHub
  ) {
    return (
      <Alert severity="info">
        A configuração segura de e-mail está disponível no aplicativo instalado.
      </Alert>
    );
  }

  function change(
    field:
      keyof EmailConfigurationForm,
    value:
      string |
      boolean
  ) {
    setForm(
      (
        current
      ) => ({
        ...current,
        [field]:
          value,
      })
    );
    setMessage(null);
    setError(null);
  }

  async function save() {
    if (saving) {
      return;
    }

    if (
      !form.smtpHost.trim() ||
      !form.smtpPort.trim() ||
      !form.smtpUser.trim() ||
      (
        !configured &&
        !form.smtpPassword
      ) ||
      !form.smtpFrom.trim()
    ) {
      setError(
        "Preencha servidor, porta, usuário, senha e remetente."
      );
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await window.techLeadHub!
        .configuration
        .save({
          databaseUrl: "",
          organization: "",
          project: "",
          wiki: "",
          pat: "",
          smtpHost:
            form.smtpHost,
          smtpPort:
            form.smtpPort,
          smtpSecure:
            String(
              form.smtpSecure
            ),
          smtpUser:
            form.smtpUser,
          smtpPassword:
            form.smtpPassword,
          smtpFrom:
            form.smtpFrom,
        });

      setMessage(
        "Configuração salva. O aplicativo será reiniciado para ativar o envio de recuperação de senha."
      );
    } catch (
      saveError
    ) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar a configuração de e-mail."
      );
      setSaving(false);
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
      }}
    >
      <CardContent>
        <Stack
          direction={{
            xs:
              "column",
            md:
              "row",
          }}
          spacing={2}
          sx={{
            justifyContent:
              "space-between",
            alignItems: {
              xs:
                "flex-start",
              md:
                "center",
            },
          }}
        >
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight:
                  800,
              }}
            >
              E-mail para recuperação de senha
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
            >
              Configuração exclusiva para administradores. A senha é protegida pelo Windows.
            </Typography>
          </Box>

          <Chip
            label={
              configured
                ? "Configurado"
                : "Não configurado"
            }
            color={
              configured
                ? "success"
                : "default"
            }
            variant="outlined"
          />
        </Stack>

        <Divider
          sx={{
            my: 2.5,
          }}
        />

        {loading ? (
          <CircularProgress
            size={24}
          />
        ) : (
          <Stack
            spacing={2}
          >
            {error && (
              <Alert severity="error">
                {error}
              </Alert>
            )}

            {message && (
              <Alert severity="success">
                {message}
              </Alert>
            )}

            <Stack
              direction={{
                xs:
                  "column",
                md:
                  "row",
              }}
              spacing={2}
            >
              <TextField
                label="Servidor SMTP"
                value={
                  form.smtpHost
                }
                onChange={(event) =>
                  change(
                    "smtpHost",
                    event.target.value
                  )
                }
                placeholder="smtp.office365.com"
                fullWidth
              />

              <TextField
                label="Porta"
                value={
                  form.smtpPort
                }
                onChange={(event) =>
                  change(
                    "smtpPort",
                    event.target.value
                  )
                }
                sx={{
                  width: {
                    xs:
                      "100%",
                    md:
                      150,
                  },
                }}
              />
            </Stack>

            <Stack
              direction={{
                xs:
                  "column",
                md:
                  "row",
              }}
              spacing={2}
            >
              <TextField
                label="Usuário do e-mail"
                value={
                  form.smtpUser
                }
                onChange={(event) =>
                  change(
                    "smtpUser",
                    event.target.value
                  )
                }
                autoComplete="username"
                fullWidth
              />

              <TextField
                label={
                  configured
                    ? "Nova senha ou senha de aplicativo (opcional)"
                    : "Senha ou senha de aplicativo"
                }
                type="password"
                value={
                  form.smtpPassword
                }
                onChange={(event) =>
                  change(
                    "smtpPassword",
                    event.target.value
                  )
                }
                autoComplete="new-password"
                fullWidth
              />
            </Stack>

            <TextField
              label="Remetente"
              value={
                form.smtpFrom
              }
              onChange={(event) =>
                change(
                  "smtpFrom",
                  event.target.value
                )
              }
              placeholder="TechLead Hub <techlead@empresa.com.br>"
              fullWidth
            />

            <FormControlLabel
              control={
                <Switch
                  checked={
                    form.smtpSecure
                  }
                  onChange={(event) =>
                    change(
                      "smtpSecure",
                      event.target.checked
                    )
                  }
                />
              }
              label="Usar TLS direto (normalmente porta 465). Para Microsoft 365 na porta 587, deixe desmarcado."
            />

            <Box>
              <Button
                variant="contained"
                disabled={
                  saving
                }
                onClick={() =>
                  void save()
                }
                sx={{
                  fontWeight:
                    750,
                }}
              >
                {saving
                  ? "Salvando..."
                  : "Salvar e ativar e-mail"}
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function formatFileSize(
  bytes:
    number,
) {
  if (
    bytes ===
    0
  ) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  const index =
    Math.min(
      Math.floor(
        Math.log(
          bytes,
        ) /
          Math.log(
            1024,
          ),
      ),
      units.length -
        1,
    );

  const value =
    bytes /
    Math.pow(
      1024,
      index,
    );

  return `${value.toFixed(
    index ===
      0
      ? 0
      : 1,
  )} ${units[index]}`;
}

function formatDateTime(
  value:
    | string
    | null
    | undefined,
): string {
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

  return date.toLocaleString(
    "pt-BR",
    {
      dateStyle:
        "short",
      timeStyle:
        "medium",
    },
  );
}

function formatSource(
  value:
    | string
    | null
    | undefined,
): string {
  switch (
    value
  ) {
    case "SCHEDULED":
      return "Automática";

    case "INCREMENTAL":
      return "Incremental";

    case "FULL":
      return "Carga completa";

    case "CONTROLLED":
      return "Carga controlada";

    case "MANUAL":
      return "Manual";

    default:
      return value ??
        "—";
  }
}

function getApiErrorMessage(
  error:
    unknown,
  fallback:
    string,
): string {
  if (
    typeof error ===
      "object" &&
    error !==
      null &&
    "response" in
      error
  ) {
    const response =
      (
        error as {
          response?: {
            data?: {
              error?: string;
              message?: string;
            };
          };
        }
      ).response;

    return (
      response?.data?.error ??
      response?.data?.message ??
      fallback
    );
  }

  return fallback;
}
