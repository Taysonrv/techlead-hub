import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  AssessmentOutlined,
  DownloadOutlined,
  PictureAsPdfOutlined,
  TableViewOutlined,
} from "@mui/icons-material";

import {
  useMemo,
  useState,
} from "react";

import {
  api,
} from "../services/api";

export function Reports() {
  const initialPeriod =
    useMemo(
      () => ({
        from:
          dateInput(
            addDays(
              new Date(),
              -29,
            ),
          ),
        to:
          dateInput(
            new Date(),
          ),
      }),
      [],
    );

  const [from, setFrom] =
    useState(
      initialPeriod.from,
    );
  const [to, setTo] =
    useState(
      initialPeriod.to,
    );
  const [downloading, setDownloading] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [success, setSuccess] =
    useState<string | null>(null);

  const invalidPeriod =
    !from ||
    !to ||
    from >
      to;

  async function downloadExecutiveExcel() {
    if (
      invalidPeriod ||
      downloading
    ) {
      return;
    }

    try {
      setDownloading(true);
      setError(null);
      setSuccess(null);

      const response =
        await api.get<ArrayBuffer>(
          "/reports/executive.xlsx",
          {
            params: {
              from,
              to,
            },
            responseType:
              "arraybuffer",
            timeout:
              0,
          },
        );

      const blob =
        new Blob(
          [
            response.data,
          ],
          {
            type:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        );

      const fileName =
        response.headers[
          "content-disposition"
        ]
          ?.match(
            /filename="?([^"]+)"?/i,
          )
          ?.[1] ??
        `techlead-hub-executivo-${from}-${to}.xlsx`;

      const url =
        URL.createObjectURL(
          blob,
        );

      const anchor =
        document.createElement(
          "a",
        );

      anchor.href =
        url;
      anchor.download =
        fileName;

      document.body.appendChild(
        anchor,
      );

      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(
        url,
      );

      setSuccess(
        "Relatório Executivo gerado com sucesso.",
      );
    } catch (
      downloadError:
        unknown
    ) {
      console.error(
        "[reports]",
        downloadError,
      );

      setError(
        await apiErrorMessage(
          downloadError,
        ),
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Box>
      <Box
        sx={{
          mb:
            2.5,
        }}
      >
        <Typography
          sx={{
            fontWeight:
              800,
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
          Relatórios Gerenciais
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt:
              0.25,
          }}
        >
          Gere análises executivas a partir dos dados sincronizados do Movidesk e Azure DevOps.
        </Typography>
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

      {success && (
        <Alert
          severity="success"
          sx={{
            mb:
              2,
          }}
        >
          {success}
        </Alert>
      )}

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
            2.5,
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
          <Typography
            sx={{
              fontWeight:
                800,
              mb:
                0.5,
            }}
          >
            Período do relatório
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mb:
                2,
            }}
          >
            O período utiliza a data de abertura dos tickets e a data de criação dos Work Items.
          </Typography>

          <Stack
            direction={{
              xs:
                "column",
              sm:
                "row",
            }}
            spacing={2}
          >
            <TextField
              type="date"
              label="Data inicial"
              value={
                from
              }
              onChange={(
                event,
              ) =>
                setFrom(
                  event.target
                    .value,
                )
              }
              slotProps={{
                inputLabel: {
                  shrink:
                    true,
                },
              }}
              error={
                invalidPeriod
              }
            />

            <TextField
              type="date"
              label="Data final"
              value={
                to
              }
              onChange={(
                event,
              ) =>
                setTo(
                  event.target
                    .value,
                )
              }
              slotProps={{
                inputLabel: {
                  shrink:
                    true,
                },
              }}
              error={
                invalidPeriod
              }
              helperText={
                invalidPeriod
                  ? "Informe um período válido."
                  : "Máximo de 366 dias."
              }
            />
          </Stack>
        </CardContent>
      </Card>

      <Box
        sx={{
          display:
            "grid",
          gridTemplateColumns: {
            xs:
              "1fr",
            lg:
              "minmax(0, 1.4fr) minmax(280px, 0.6fr)",
          },
          gap:
            2.5,
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
              2.5,
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
              direction="row"
              spacing={1.5}
              sx={{
                alignItems:
                  "center",
              }}
            >
              <Box
                sx={{
                  width:
                    44,
                  height:
                    44,
                  borderRadius:
                    2,
                  display:
                    "grid",
                  placeItems:
                    "center",
                  backgroundColor:
                    "rgba(24,199,122,0.12)",
                  color:
                    "success.main",
                }}
              >
                <AssessmentOutlined />
              </Box>

              <Box
                sx={{
                  flex:
                    1,
                }}
              >
                <Typography
                  sx={{
                    fontWeight:
                      800,
                    fontSize:
                      "1.08rem",
                  }}
                >
                  Relatório Executivo
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  Visão consolidada de atendimento, SLA, clientes, analistas e desenvolvimento.
                </Typography>
              </Box>

              <Chip
                size="small"
                color="success"
                variant="outlined"
                label="Disponível"
              />
            </Stack>

            <Divider
              sx={{
                my:
                  2,
              }}
            />

            <Typography
              variant="body2"
              color="text.secondary"
            >
              O arquivo contém Resumo Executivo, Analistas, Clientes, Categorias, Estados Azure e Versões.
            </Typography>

            <Stack
              direction={{
                xs:
                  "column",
                sm:
                  "row",
              }}
              spacing={1.5}
              sx={{
                mt:
                  2,
              }}
            >
              <Button
                variant="contained"
                startIcon={
                  downloading
                    ? <CircularProgress size={16} color="inherit" />
                    : <DownloadOutlined />
                }
                disabled={
                  invalidPeriod ||
                  downloading
                }
                onClick={() =>
                  void downloadExecutiveExcel()
                }
              >
                {downloading
                  ? "Gerando..."
                  : "Baixar Excel"}
              </Button>
            </Stack>
          </CardContent>
        </Card>

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
            <Typography
              sx={{
                fontWeight:
                  800,
                mb:
                  1.5,
              }}
            >
              Próximos relatórios
            </Typography>

            <Stack
              spacing={1.25}
            >
              <Upcoming
                icon={<TableViewOutlined />}
                label="Analistas e Produtividade"
              />
              <Upcoming
                icon={<TableViewOutlined />}
                label="SLA e Atendimento"
              />
              <Upcoming
                icon={<TableViewOutlined />}
                label="Clientes"
              />
              <Upcoming
                icon={<TableViewOutlined />}
                label="Correções, Evoluções e Apoios"
              />
              <Upcoming
                icon={<PictureAsPdfOutlined />}
                label="Exportação em PDF"
              />
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

function Upcoming({
  icon,
  label,
}: {
  icon:
    React.ReactNode;
  label:
    string;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems:
          "center",
        color:
          "text.secondary",
      }}
    >
      {icon}

      <Typography
        variant="body2"
      >
        {label}
      </Typography>
    </Stack>
  );
}

function dateInput(
  date: Date,
) {
  const year =
    date.getFullYear();
  const month =
    String(
      date.getMonth() +
      1,
    ).padStart(
      2,
      "0",
    );
  const day =
    String(
      date.getDate(),
    ).padStart(
      2,
      "0",
    );

  return `${year}-${month}-${day}`;
}

function addDays(
  date: Date,
  days: number,
) {
  const result =
    new Date(
      date,
    );

  result.setDate(
    result.getDate() +
    days,
  );

  return result;
}

async function apiErrorMessage(
  error: unknown,
) {
  if (
    typeof error !==
      "object" ||
    error ===
      null ||
    !(
      "response" in
      error
    )
  ) {
    return "Não foi possível gerar o relatório Executivo.";
  }

  const response =
    (
      error as {
        response?: {
          data?: unknown;
        };
      }
    ).response;

  if (
    response?.data instanceof
      ArrayBuffer
  ) {
    try {
      const text =
        new TextDecoder()
          .decode(
            response.data,
          );

      const parsed =
        JSON.parse(
          text,
        ) as {
          message?: string;
        };

      return parsed.message ??
        "Não foi possível gerar o relatório Executivo.";
    } catch {
      return "Não foi possível gerar o relatório Executivo.";
    }
  }

  return "Não foi possível gerar o relatório Executivo.";
}
