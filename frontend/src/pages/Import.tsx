import {
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
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";

import { api } from "../services/api";

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

const MAX_FILE_SIZE =
  25 * 1024 * 1024;

export function Import() {
  const inputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const [file, setFile] =
    useState<File | null>(null);

  const [dragging, setDragging] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [result, setResult] =
    useState<ImportResult | null>(
      null
    );

  const fileSize = useMemo(() => {
    if (!file) {
      return "";
    }

    return formatFileSize(
      file.size
    );
  }, [file]);

  function validateFile(
    selectedFile: File
  ) {
    const fileName =
      selectedFile.name.toLowerCase();

    if (
      !fileName.endsWith(
        ".xlsx"
      )
    ) {
      setError(
        "Formato inválido. Selecione um arquivo Excel no formato .xlsx."
      );

      return false;
    }

    if (
      selectedFile.size >
      MAX_FILE_SIZE
    ) {
      setError(
        "O arquivo excede o limite de 25 MB."
      );

      return false;
    }

    return true;
  }

  function selectFile(
    selectedFile:
      | File
      | undefined
  ) {
    if (!selectedFile) {
      return;
    }

    setError(null);
    setResult(null);

    if (
      !validateFile(
        selectedFile
      )
    ) {
      setFile(null);

      return;
    }

    setFile(selectedFile);
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    selectFile(
      event.target.files?.[0]
    );

    /*
     * Permite selecionar novamente
     * o mesmo arquivo depois.
     */
    event.target.value = "";
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    if (!loading) {
      setDragging(true);
    }
  }

  function handleDragLeave(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    setDragging(false);
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    setDragging(false);

    if (loading) {
      return;
    }

    selectFile(
      event.dataTransfer.files?.[0]
    );
  }

  function removeFile() {
    if (loading) {
      return;
    }

    setFile(null);
    setError(null);
    setResult(null);
  }

  async function importFile() {
    if (!file) {
      setError(
        "Selecione um arquivo antes de iniciar a importação."
      );

      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const formData =
        new FormData();

      formData.append(
        "file",
        file
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

      timeout: 0,
    }
  );

      setResult(
        response.data
      );
    } catch (err: unknown) {
      console.error(
        "Erro ao importar dados:",
        err
      );

      let message =
        "Não foi possível importar o arquivo.";

      if (
        typeof err === "object" &&
        err !== null &&
        "response" in err
      ) {
        const response =
          (
            err as {
              response?: {
                data?: {
                  error?: string;
                };
              };
            }
          ).response;

        if (
          response?.data?.error
        ) {
          message =
            response.data.error;
        }
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* =====================================================
          CABEÇALHO
      ===================================================== */}

      <Box
        sx={{
          mb: 2.5,
        }}
      >
        <Typography
        sx={{
          fontWeight: 800,
            fontSize: {
              xs: "1.7rem",
              md: "1.9rem",
              xl: "2.1rem",
            },
          }}
        >
          Importar Dados
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 0.25,
          }}
        >
          Atualize a base do TechLead Hub utilizando uma exportação
          Excel do Movidesk.
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: "block",
            mt: 0.5,
          }}
        >
          Formato aceito: .xlsx • Limite máximo: 25 MB
        </Typography>
      </Box>

      {/* =====================================================
          INFORMAÇÃO
      ===================================================== */}

      <Alert
        severity="info"
        sx={{
          mb: 2,
          borderRadius: 2,
        }}
      >
        A importação cria tickets novos e atualiza os já existentes
        pelo número do atendimento no Movidesk. Registros existentes
        não são duplicados.
      </Alert>

      {/* =====================================================
          ÁREA DE UPLOAD
      ===================================================== */}

      <Card
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2.5,
          overflow: "hidden",
        }}
      >
        <CardContent
          sx={{
            p: {
              xs: 2,
              md: 2.5,
            },

            "&:last-child": {
              pb: {
                xs: 2,
                md: 2.5,
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
              if (!loading) {
                inputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (
                !loading &&
                (event.key ===
                  "Enter" ||
                  event.key === " ")
              ) {
                inputRef.current?.click();
              }
            }}
            sx={{
              minHeight: 220,

              display: "flex",
              alignItems: "center",
              justifyContent:
                "center",

              textAlign: "center",

              border: "2px dashed",

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

              borderRadius: 2.5,

              cursor:
                loading
                  ? "default"
                  : "pointer",

              transition:
                "border-color 0.15s ease, background-color 0.15s ease",
            }}
          >
            <input
              ref={inputRef}
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
                  px: 2,
                }}
              >
                <Typography
        sx={{
          fontWeight: 800,
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
                    mt: 0.75,
                  }}
                >
                  ou clique para selecionar o arquivo
                </Typography>

                <Button
                  variant="outlined"
                  size="small"
                  disabled={loading}
                  sx={{
                    mt: 2,
                  }}
                >
                  Selecionar arquivo
                </Button>
              </Box>
            ) : (
              <Box
                sx={{
                  px: 2,
                }}
              >
                <Chip
                  label="Arquivo pronto"
                  color="success"
                  size="small"
                  sx={{
                    mb: 1.5,
                  }}
                />

                <Typography
                sx={{ fontWeight: 800 }}
                >
                  {file.name}
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 0.5,
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
                    mt: 1,
                  }}
                >
                  Clique na área para selecionar outro arquivo
                </Typography>
              </Box>
            )}
          </Box>

          {/* =================================================
              PROGRESSO
          ================================================= */}

          {loading && (
            <Box
              sx={{
                mt: 2,
              }}
            >
              <LinearProgress />

              <Stack
                direction="row"
                spacing={1}
                sx={{
                  mt: 1,
                  alignItems:
                    "center",
                }}
              >
                <CircularProgress
                  size={16}
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

          {/* =================================================
              ERRO
          ================================================= */}

          {error && (
            <Alert
              severity="error"
              sx={{
                mt: 2,
              }}
            >
              {error}
            </Alert>
          )}

          {/* =================================================
              AÇÕES
          ================================================= */}

          <Stack
            direction={{
              xs: "column",
              sm: "row",
            }}
            spacing={1}
            sx={{
              mt: 2,

              justifyContent:
                "flex-end",
            }}
          >
            {file && (
              <Button
                variant="text"
                disabled={loading}
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
                minWidth: 160,
              }}
            >
              {loading
                ? "Importando..."
                : "Importar dados"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* =====================================================
          RESULTADO
      ===================================================== */}

      {result && (
        <>
          <Alert
            severity={
              result.errors > 0
                ? "warning"
                : "success"
            }
            sx={{
              mt: 2,
              borderRadius: 2,
            }}
          >
            {result.errors > 0
              ? "Importação concluída com algumas ocorrências."
              : "Importação concluída com sucesso."}
          </Alert>

          <Box
            sx={{
              display: "grid",

              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                lg: "repeat(5, 1fr)",
              },

              gap: 1.5,

              mt: 2,
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
                result.errors > 0
                  ? "error"
                  : "success"
              }
            />
          </Box>

          {/* =================================================
              DADOS IDENTIFICADOS
          ================================================= */}

          <Card
            elevation={0}
            sx={{
              mt: 2,

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
          fontWeight: 800,
                  mb: 0.5,
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
                  my: 2,
                }}
              />

              <Box
                sx={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    {
                      xs: "1fr",
                      sm: "repeat(2, 1fr)",
                      lg: "repeat(4, 1fr)",
                    },

                  gap: 2,
                }}
              >
                <InfoMetric
                  label="Analistas"
                  value={
                    result.analysts
                      .length
                  }
                />

                <InfoMetric
                  label="Clientes"
                  value={
                    result.clients
                      .length
                  }
                />

                <InfoMetric
                  label="Categorias"
                  value={
                    result.categories
                      .length
                  }
                />

                <InfoMetric
                  label="Serviços"
                  value={
                    result.services
                      .length
                  }
                />
              </Box>

              <Divider
                sx={{
                  my: 2,
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
          fontWeight: 600,
                  wordBreak:
                    "break-word",
                }}
              >
                {result.batchId}
              </Typography>
            </CardContent>
          </Card>

          {/* =================================================
              OCORRÊNCIAS
          ================================================= */}

          {result.errorDetails.length >
            0 && (
            <Card
              elevation={0}
              sx={{
                mt: 2,

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
                sx={{ fontWeight: 800 }}
                >
                  Ocorrências da importação
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 0.5,
                    mb: 2,
                  }}
                >
                  Até 100 ocorrências são exibidas nesta tela.
                </Typography>

                <Stack
                  spacing={1}
                >
                  {result.errorDetails.map(
                    (
                      detail,
                      index
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
                    )
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
   CARD DE RESULTADO
========================================================= */

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
    severity === "success"
      ? "success.main"
      : severity === "warning"
      ? "warning.main"
      : severity === "error"
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

        height: "100%",
      }}
    >
      <CardContent
        sx={{
          p: 1.75,

          "&:last-child": {
            pb: 1.75,
          },
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
        sx={{ fontWeight: 600 }}
        >
          {title}
        </Typography>

        <Typography
        sx={{
          fontWeight: 800,
            mt: 0.5,
            fontSize:
              "1.9rem",
            lineHeight: 1.1,
          }}
        >
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

/* =========================================================
   MÉTRICA
========================================================= */

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
          fontWeight: 800,
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
   TAMANHO DO ARQUIVO
========================================================= */

function formatFileSize(
  bytes: number
) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  const index =
    Math.floor(
      Math.log(bytes) /
        Math.log(1024)
    );

  const value =
    bytes /
    Math.pow(
      1024,
      index
    );

  return `${value.toFixed(
    index === 0
      ? 0
      : 1
  )} ${units[index]}`;
}