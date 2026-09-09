import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  AssessmentOutlined,
  BarChartOutlined,
  BugReportOutlined,
  BusinessOutlined,
  DownloadOutlined,
  GroupsOutlined,
  PictureAsPdfOutlined,
  QueryStatsOutlined,
  SellOutlined,
} from "@mui/icons-material";

import {
  useMemo,
  useState,
} from "react";

import axios from "axios";

import {
  api,
} from "../services/api";

import {
  aliareColors,
} from "../theme/theme";

type ReportScope =
  | "executive"
  | "analysts"
  | "sla"
  | "clients"
  | "development"
  | "versions";

type ReportFormat =
  | "xlsx"
  | "pdf";

type ReportDefinition = {
  scope: ReportScope;
  title: string;
  description: string;
  contents: string;
  icon:
    typeof AssessmentOutlined;
};

const REPORTS:
  ReportDefinition[] = [
  {
    scope:
      "executive",
    title:
      "Relatório Executivo",
    description:
      "Visão consolidada da operação para apresentação à coordenação e clientes.",
    contents:
      "Atendimentos, SLA, analistas, clientes, categorias, desenvolvimento, estados Azure e versões.",
    icon:
      AssessmentOutlined,
  },
  {
    scope:
      "analysts",
    title:
      "Analistas e Produtividade",
    description:
      "Distribuição do volume de atendimento entre os responsáveis.",
    contents:
      "Ranking de analistas, participação no volume e situação dos atendimentos.",
    icon:
      GroupsOutlined,
  },
  {
    scope:
      "sla",
    title:
      "SLA e Atendimento",
    description:
      "Cumprimento de prazo e composição da carteira de atendimentos.",
    contents:
      "Dentro e fora do prazo, não medidos, situação e categorias.",
    icon:
      QueryStatsOutlined,
  },
  {
    scope:
      "clients",
    title:
      "Clientes",
    description:
      "Concentração, volume e composição dos atendimentos por cliente.",
    contents:
      "Ranking de clientes, categorias relacionadas e situação dos tickets.",
    icon:
      BusinessOutlined,
  },
  {
    scope:
      "development",
    title:
      "Correções, Evoluções e Apoios",
    description:
      "Visão gerencial das demandas encaminhadas ao desenvolvimento.",
    contents:
      "Correções, evoluções, apoios, priorizações, bloqueios, estados e versões.",
    icon:
      BugReportOutlined,
  },
  {
    scope:
      "versions",
    title:
      "Versões",
    description:
      "Distribuição das entregas e Work Items associados às versões.",
    contents:
      "Ranking de versões, estados Azure e composição das demandas.",
    icon:
      SellOutlined,
  },
];

export function Reports() {
  const today =
    useMemo(
      () =>
        formatInputDate(
          new Date()
        ),
      []
    );

  const initialFrom =
    useMemo(
      () => {
        const date =
          new Date();
        date.setDate(
          date.getDate() -
            29
        );
        return formatInputDate(
          date
        );
      },
      []
    );

  const [
    from,
    setFrom,
  ] =
    useState(
      initialFrom
    );

  const [
    to,
    setTo,
  ] =
    useState(
      today
    );

  const [
    downloading,
    setDownloading,
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

  async function download(
    report:
      ReportDefinition,
    format:
      ReportFormat,
  ) {
    const key =
      `${report.scope}-${format}`;

    if (
      downloading
    ) {
      return;
    }

    if (
      !from ||
      !to ||
      from >
        to
    ) {
      setError(
        "Informe um período válido."
      );
      return;
    }

    setDownloading(
      key
    );
    setError(
      null
    );

    try {
      const response =
        await api.get<Blob>(
          `/reports/${report.scope}.${format}`,
          {
            params: {
              from,
              to,
            },
            responseType:
              "blob",
          }
        );

      const disposition =
        response.headers[
          "content-disposition"
        ] as
          | string
          | undefined;

      const fileName =
        extractFileName(
          disposition
        ) ||
        `techlead-hub-${report.scope}-${from}-${to}.${format}`;

      const url =
        URL.createObjectURL(
          response.data
        );

      const anchor =
        document.createElement(
          "a"
        );

      anchor.href =
        url;
      anchor.download =
        fileName;
      document.body.appendChild(
        anchor
      );
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(
        url
      );
    } catch (
      downloadError
    ) {
      setError(
        await reportErrorMessage(
          downloadError
        )
      );
    } finally {
      setDownloading(
        null
      );
    }
  }

  return (
    <Stack
      spacing={3}
    >
      <Box>
        <Typography
          variant="h4"
          sx={{
            fontWeight:
              850,
            letterSpacing:
              "-0.035em",
          }}
        >
          Relatórios Gerenciais
        </Typography>

        <Typography
          color="text.secondary"
          sx={{
            mt: 0.75,
          }}
        >
          Gere análises executivas em Excel e PDF a partir dos dados sincronizados do Movidesk e Azure DevOps.
        </Typography>
      </Box>

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
          <Typography
            variant="h6"
            sx={{
              fontWeight:
                800,
            }}
          >
            Período dos relatórios
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.5,
              mb: 2,
            }}
          >
            Tickets usam a data de abertura; Work Items usam a data de criação no Azure.
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
              label="Data inicial"
              type="date"
              value={
                from
              }
              onChange={(event) =>
                setFrom(
                  event.target.value
                )
              }
              slotProps={{
                inputLabel: {
                  shrink:
                    true,
                },
                htmlInput: {
                  max:
                    to ||
                    today,
                },
              }}
            />

            <TextField
              label="Data final"
              type="date"
              value={
                to
              }
              onChange={(event) =>
                setTo(
                  event.target.value
                )
              }
              helperText="Máximo de 366 dias."
              slotProps={{
                inputLabel: {
                  shrink:
                    true,
                },
                htmlInput: {
                  min:
                    from,
                  max:
                    today,
                },
              }}
            />
          </Stack>
        </CardContent>
      </Card>

      {error && (
        <Alert
          severity="error"
          onClose={() =>
            setError(
              null
            )
          }
        >
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display:
            "grid",
          gridTemplateColumns: {
            xs:
              "1fr",
            lg:
              "repeat(2, minmax(0, 1fr))",
          },
          gap:
            2.5,
        }}
      >
        {REPORTS.map(
          (
            report,
          ) => (
            <ReportCard
              key={
                report.scope
              }
              report={
                report
              }
              downloading={
                downloading
              }
              onDownload={
                download
              }
            />
          )
        )}
      </Box>

      <Alert
        severity="info"
        icon={
          <BarChartOutlined />
        }
      >
        Os arquivos incluem dados tabulares, indicadores, percentuais, gráficos de barras e gráficos de pizza. O Excel mantém cada eixo em uma aba própria; o PDF utiliza páginas prontas para apresentação.
      </Alert>
    </Stack>
  );
}

function ReportCard({
  report,
  downloading,
  onDownload,
}: {
  report:
    ReportDefinition;
  downloading:
    string |
    null;
  onDownload: (
    report:
      ReportDefinition,
    format:
      ReportFormat,
  ) =>
    Promise<void>;
}) {
  const Icon =
    report.icon;

  const excelLoading =
    downloading ===
    `${report.scope}-xlsx`;

  const pdfLoading =
    downloading ===
    `${report.scope}-pdf`;

  return (
    <Card
      elevation={0}
      sx={{
        height:
          "100%",
        border:
          "1px solid",
        borderColor:
          "divider",
        borderRadius:
          2.5,
        transition:
          "border-color 160ms ease, box-shadow 160ms ease",
        "&:hover": {
          borderColor:
            aliareColors.green,
          boxShadow:
            "0 12px 30px rgba(16,24,40,0.07)",
        },
      }}
    >
      <CardContent
        sx={{
          height:
            "100%",
          display:
            "flex",
          flexDirection:
            "column",
        }}
      >
        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems:
              "flex-start",
          }}
        >
          <Box
            sx={{
              width:
                48,
              height:
                48,
              borderRadius:
                2,
              display:
                "grid",
              placeItems:
                "center",
              flexShrink:
                0,
              backgroundColor:
                "rgba(24,199,122,0.12)",
              color:
                aliareColors.greenDark,
            }}
          >
            <Icon />
          </Box>

          <Box
            sx={{
              minWidth:
                0,
              flex:
                1,
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
              <Typography
                variant="h6"
                sx={{
                  fontWeight:
                    800,
                }}
              >
                {report.title}
              </Typography>

              <Chip
                size="small"
                label="Disponível"
                color="success"
                variant="outlined"
              />
            </Stack>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 0.5,
                lineHeight:
                  1.55,
              }}
            >
              {report.description}
            </Typography>
          </Box>
        </Stack>

        <Typography
          variant="body2"
          sx={{
            mt: 2.25,
            pt: 2,
            borderTop:
              "1px solid",
            borderColor:
              "divider",
            lineHeight:
              1.6,
            flex:
              1,
          }}
        >
          {report.contents}
        </Typography>

        <Stack
          direction={{
            xs:
              "column",
            sm:
              "row",
          }}
          spacing={1.25}
          sx={{
            mt: 2.25,
          }}
        >
          <Button
            variant="contained"
            startIcon={
              excelLoading
                ? (
                    <CircularProgress
                      size={18}
                      color="inherit"
                    />
                  )
                : (
                    <DownloadOutlined />
                  )
            }
            disabled={
              Boolean(
                downloading
              )
            }
            onClick={() =>
              void onDownload(
                report,
                "xlsx"
              )
            }
            sx={{
              fontWeight:
                750,
            }}
          >
            {excelLoading
              ? "Gerando..."
              : "Baixar Excel"}
          </Button>

          <Button
            variant="outlined"
            startIcon={
              pdfLoading
                ? (
                    <CircularProgress
                      size={18}
                    />
                  )
                : (
                    <PictureAsPdfOutlined />
                  )
            }
            disabled={
              Boolean(
                downloading
              )
            }
            onClick={() =>
              void onDownload(
                report,
                "pdf"
              )
            }
            sx={{
              fontWeight:
                750,
            }}
          >
            {pdfLoading
              ? "Gerando..."
              : "Baixar PDF"}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function formatInputDate(
  value:
    Date
) {
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

function extractFileName(
  disposition:
    string |
    undefined
) {
  const match =
    disposition?.match(
      /filename="?([^";]+)"?/i
    );

  return match?.[1];
}

async function reportErrorMessage(
  error:
    unknown
) {
  if (
    axios.isAxiosError(
      error
    ) &&
    error.response?.data instanceof
      Blob
  ) {
    try {
      const content =
        JSON.parse(
          await error.response.data.text()
        ) as {
          message?:
            string;
        };

      if (
        content.message
      ) {
        return content.message;
      }
    } catch {
      // Mantém a mensagem padrão.
    }
  }

  return axios.isAxiosError(
    error
  ) &&
    typeof error.response?.data
      ?.message ===
      "string"
    ? error.response.data
        .message
    : "Não foi possível gerar o relatório. Tente novamente.";
}
