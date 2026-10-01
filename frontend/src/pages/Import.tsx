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
  Collapse,
  Divider,
  FormControlLabel,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

import { api, getApiErrorMessage } from "../services/api";

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

type ImportPreview = {
  fileName: string;
  format: "JSON" | "EXCEL";
  size: number;
  hash: string;
  totalRows: number;
  columns: string[];
  duplicate: null | {
    batchId: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
  };
};

type MovideskBaselineStatus = {
  status: "IDLE" | "RUNNING" | "SUCCESS" | "ERROR";
  startedAt: string | null;
  finishedAt: string | null;
  completed: boolean;
  result: { mode: string; pages: number; totalRows: number; created: number; updated: number; ignored: number; errors: number } | null;
  error: string | null;
  progress: { nextSkip: number; pages: number; processedRows: number; created: number; updated: number; ignored: number; errors: number; resumed: boolean } | null;
  database: { tickets: number; scopedTickets?: number; linkedTasks: number }; scope?: { startDate: string; clients: string[] };
  lastImport: { status: string; totalRows: number; insertedRows: number; updatedRows: number; skippedRows: number; errorRows: number; startedAt: string; finishedAt: string | null; message: string | null } | null;
  scheduler: { enabled: boolean; intervalMinutes: number; overlapMinutes: number; pageSize: number; phase: "WAITING_BASELINE" | "BASELINE_RUNNING" | "INCREMENTAL"; nextEstimatedAt: string | null };
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

type SyncHealthState = "healthy" | "attention" | "critical" | "unknown";
type SyncCenterSummary = {
  running: number;
  health: SyncHealthState;
  checkedAt: string;
  providers: {
    movidesk: { configured: boolean; health: { state: SyncHealthState; ageMinutes: number | null; stale: boolean } };
    azureDevOps: { configured: boolean; health: { state: SyncHealthState; ageMinutes: number | null; stale: boolean } };
  };
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
  50 * 1024 * 1024;

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

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [movideskStatus, setMovideskStatus] = useState<MovideskBaselineStatus | null>(null);
  const [movideskStatusLoading, setMovideskStatusLoading] = useState(false);
  const [movideskFullStarting, setMovideskFullStarting] = useState(false);

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

  const [syncHealth, setSyncHealth] = useState<SyncCenterSummary | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);

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

          try {
            const healthResponse = await api.get<SyncCenterSummary>("/sync-center/summary");
            setSyncHealth(healthResponse.data);
          } catch (healthError) {
            console.warn("Não foi possível consultar a saúde consolidada das integrações:", healthError);
          }
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
      !fileName.endsWith(".xlsx") &&
      !fileName.endsWith(".json")
    ) {
      setError(
        "Formato inválido. Selecione uma exportação .xlsx ou um payload .json do Movidesk.",
      );

      return false;
    }

    if (
      selectedFile.size >
      MAX_FILE_SIZE
    ) {
      setError(
        "O arquivo excede o limite de 50 MB.",
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
    setPreview(null);

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

    void inspectFile(selectedFile);
  }

  async function inspectFile(selectedFile: File) {
    try {
      setPreviewLoading(true);
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await api.post<ImportPreview>(
        "/import/tickets/preview",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setPreview(response.data);
    } catch (err: unknown) {
      setFile(null);
      setError(getApiErrorMessage(err, "Não foi possível validar o arquivo antes da importação."));
    } finally {
      setPreviewLoading(false);
    }
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
    setPreview(null);
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
      if (preview?.hash) formData.append("fileHash", preview.hash);

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

  function downloadCurrentErrors() {
    if (!result?.errorDetails.length) return;
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const csv = ["Linha;Ocorrência", ...result.errorDetails.map((item) => `${escape(item.row)};${escape(item.message)}`)].join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    anchor.download = `ocorrencias-importacao-${result.batchId}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  const loadMovideskStatus = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setMovideskStatusLoading(true);
      const response = await api.get<MovideskBaselineStatus>("/movidesk/baseline/status", { timeout: 30_000 });
      setMovideskStatus(response.data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Não foi possível consultar o scheduler Movidesk."));
    } finally {
      setMovideskStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMovideskStatus(true);
    const timer = window.setInterval(() => { void loadMovideskStatus(false); }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadMovideskStatus]);

  async function startMovideskFull() {
    try {
      setMovideskFullStarting(true);
      setError(null);
      const response = await api.post<{ accepted: boolean; reason?: string; state: MovideskBaselineStatus }>("/movidesk/baseline/start", {}, { timeout: 30_000 });
      setMovideskStatus(response.data.state);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Não foi possível iniciar a carga FULL do Movidesk."));
    } finally {
      setMovideskFullStarting(false);
    }
  }

  return (
    <>
      {/* =====================================================
          CABEÇALHO
      ===================================================== */}

      <PageHeader eyebrow="Gestão" title="Dados e Sincronizações" description="Central operacional das integrações Movidesk e Azure DevOps, com cargas automáticas, importações manuais e histórico de processamento." />

      {syncHealth && (
        <Card elevation={0} sx={{ mb: 3, border: "1px solid", borderColor: syncHealth.health === "critical" ? "error.main" : syncHealth.health === "attention" ? "warning.main" : "divider", borderRadius: 2.5 }}>
          <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.01em" }}>Visão geral das integrações</Typography>
                <Typography variant="body2" color="text.secondary">Leitura consolidada de disponibilidade e atualização dos dados operacionais.</Typography>
              </Box>
              <Chip
                size="small"
                color={syncHealth.health === "critical" ? "error" : syncHealth.health === "attention" ? "warning" : "success"}
                label={syncHealth.health === "critical" ? "Ação necessária" : syncHealth.health === "attention" ? "Requer atenção" : "Integrações saudáveis"}
              />
            </Stack>
            <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))" }, gap: 1.25 }}>
              <IntegrationHealthCard title="Movidesk" configured={syncHealth.providers.movidesk.configured} health={syncHealth.providers.movidesk.health} />
              <IntegrationHealthCard title="Azure DevOps" configured={syncHealth.providers.azureDevOps.configured} health={syncHealth.providers.azureDevOps.health} />
            </Box>
            {syncHealth.running > 0 && <Alert severity="info" sx={{ mt: 1.5 }}>{syncHealth.running} sincronização(ões) em processamento neste momento.</Alert>}
          </CardContent>
        </Card>
      )}

      <SectionHeader
        title="Movidesk"
        description="Operação centralizada da API, carga FULL, sincronização incremental e importações manuais de contingência."
      />

      <Card elevation={0} sx={{ mb: 3, border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden", bgcolor: "background.paper" }}>
        {movideskStatusLoading && !movideskStatus && <LinearProgress />}
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 750, fontSize: "1rem", letterSpacing: "-0.01em" }}>API Movidesk</Typography>
                {movideskStatus && <Chip size="small" color={movideskStatus.scheduler.enabled ? "success" : "default"} label={movideskStatus.scheduler.enabled ? "Scheduler ativo" : "Scheduler desativado"} />}
                {movideskStatus?.status === "RUNNING" && <Chip size="small" color="info" label="FULL em execução" />}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>
                {movideskStatus
                  ? `Incremental a cada ${movideskStatus.scheduler.intervalMinutes} min • overlap ${movideskStatus.scheduler.overlapMinutes} min • lote ${movideskStatus.scheduler.pageSize} tickets • ${movideskStatus.scheduler.phase === "INCREMENTAL" ? "baseline concluído" : movideskStatus.scheduler.phase === "BASELINE_RUNNING" ? "baseline em execução" : "aguardando baseline FULL"}`
                  : "Consultando o sincronizador Movidesk..."}
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button variant="outlined" disabled={movideskStatusLoading} onClick={() => void loadMovideskStatus(true)}>
                {movideskStatusLoading ? "Atualizando..." : "Atualizar status"}
              </Button>
              <Button variant="contained" disabled={movideskFullStarting || movideskStatus?.status === "RUNNING" || movideskStatus?.completed} onClick={() => void startMovideskFull()}>
                {movideskFullStarting ? "Iniciando..." : movideskStatus?.status === "RUNNING" ? "FULL em execução" : movideskStatus?.completed ? "Baseline concluído" : movideskStatus?.progress?.nextSkip ? "Retomar FULL" : "Iniciar FULL"}
              </Button>
            </Stack>
          </Stack>

          {movideskStatus && <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(5,1fr)" }, gap: 1.5 }}>
              <InfoCard label="Tickets na base" value={String(movideskStatus.database.tickets)} />
              <InfoCard label="Tickets no escopo 2026" value={String(movideskStatus.database.scopedTickets ?? 0)} />
              <InfoCard label="Tickets com Task no escopo" value={String(movideskStatus.database.linkedTasks)} />
              <InfoCard label="Última execução" value={formatDateTime(movideskStatus.lastImport?.finishedAt ?? movideskStatus.lastImport?.startedAt)} />
              <InfoCard label="Próxima incremental" value={formatDateTime(movideskStatus.scheduler.nextEstimatedAt)} />
            </Box>
            {movideskStatus.progress && !movideskStatus.completed && <Box sx={{ mt: 2, p: 1.75, border: "1px solid", borderColor: movideskStatus.status === "ERROR" ? "warning.main" : "divider", borderRadius: 2.5, bgcolor: "background.default" }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 750 }}>
                  {movideskStatus.status === "RUNNING" ? "Progresso do FULL" : movideskStatus.progress.nextSkip > 0 ? "Checkpoint disponível para retomada" : "Carga FULL preparada"}
                </Typography>
                <Chip size="small" variant="outlined" label={`${movideskStatus.progress.pages} página(s) concluída(s)`} />
              </Stack>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,1fr)", md: "repeat(4,1fr)" }, gap: 1 }}>
                <InfoCard label="Processados" value={String(movideskStatus.progress.processedRows)} />
                <InfoCard label="Próximo skip" value={String(movideskStatus.progress.nextSkip)} />
                <InfoCard label="Novos" value={String(movideskStatus.progress.created)} />
                <InfoCard label="Atualizados" value={String(movideskStatus.progress.updated)} />
              </Box>
              {movideskStatus.status === "RUNNING" && <LinearProgress sx={{ mt: 1.5, borderRadius: 99 }} />}
            </Box>}
            {movideskStatus.result && <Alert severity={movideskStatus.result.errors ? "warning" : "success"} sx={{ mt: 2 }}>
              FULL: {movideskStatus.result.pages} página(s) • {movideskStatus.result.totalRows} lidos • {movideskStatus.result.created} novos • {movideskStatus.result.updated} atualizados • {movideskStatus.result.ignored} ignorados • {movideskStatus.result.errors} erros.
            </Alert>}
            {movideskStatus.error && <Alert severity="error" sx={{ mt: 2 }}>{movideskStatus.error}</Alert>}
          </>}
        </CardContent>
      </Card>

      {/* =====================================================
          MOVIDESK
      ===================================================== */}

      <SectionHeader
        title="Carga manual"
        description="Canal complementar para cargas controladas por Excel ou JSON. A sincronização via API permanece como fonte automática principal."
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
        Use a importação manual para cargas pontuais ou conferências. Tickets existentes são atualizados pelo número do atendimento e novos registros são incluídos sem substituir a rotina automática da API.
      </Alert>

      <Card
        elevation={0}
        sx={{
          border:
            "1px solid",
          borderColor:
            "divider",
          borderRadius:
            3,
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
                168,
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              textAlign:
                "center",
              border:
                "1px dashed",
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
              accept=".xlsx,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json"
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
                  Arraste o Excel ou JSON do Movidesk para cá
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
                  Formatos .xlsx e .json • Máximo 50 MB
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
                  label={previewLoading ? "Validando arquivo" : "Arquivo validado"}
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

                {preview && (
                  <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, justifyContent: "center", flexWrap: "wrap" }}>
                    <Chip size="small" variant="outlined" label={preview.format} />
                    <Chip size="small" variant="outlined" label={`${preview.totalRows.toLocaleString("pt-BR")} registros`} />
                  </Stack>
                )}

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

          {preview?.duplicate && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Este mesmo arquivo já foi processado em {new Date(preview.duplicate.startedAt).toLocaleString("pt-BR")} no lote {preview.duplicate.batchId}. Você ainda pode reprocessá-lo para atualizar os dados.
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
                loading ||
                previewLoading ||
                !preview
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
                : previewLoading
                  ? "Validando..."
                  : "Confirmar importação"}
            </Button>
          </Stack>
        </CardContent>
      </Card>


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
            3,
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
                      700,
                    fontSize:
                      "1rem",
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
                    Últimas 5 execuções registradas.
                  </Typography>

                  <Stack
                    spacing={
                      1
                    }
                  >
                    {azureStatus
                      .recentRuns
                      .slice(0, 5)
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

      <Card elevation={0} sx={{ mt: 3, mb: 2, border: "1px solid", borderColor: "divider", borderRadius: 3, bgcolor: "background.paper" }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
            <Box>
              <Typography sx={{ fontWeight: 750, fontSize: ".95rem" }}>Histórico de sincronizações</Typography>
              <Typography variant="body2" color="text.secondary">Auditoria consolidada das execuções Movidesk e Azure DevOps.</Typography>
            </Box>
            <Button size="small" variant="outlined" onClick={() => setHistoryExpanded((value) => !value)}>{historyExpanded ? "Ocultar histórico" : "Ver histórico"}</Button>
          </Stack>
          <Collapse in={historyExpanded} unmountOnExit><Box sx={{ mt: 1.5 }}><SyncHistory /></Box></Collapse>
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
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                  <Typography sx={{ fontWeight: 800 }}>Ocorrências da importação</Typography>
                  <Button size="small" variant="outlined" onClick={downloadCurrentErrors}>Baixar CSV</Button>
                </Stack>

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

      <Box sx={{ mt: 3 }}>
        <SectionHeader title="Configuração auxiliar" description="Recursos administrativos que não fazem parte do fluxo de sincronização de dados." />
        <EmailRecoveryConfiguration />
      </Box>
    </>
  );
}

/* =========================================================
   COMPONENTES
========================================================= */

function IntegrationHealthCard({ title, configured, health }: { title: string; configured: boolean; health: { state: SyncHealthState; ageMinutes: number | null; stale: boolean } }) {
  const color = !configured ? "default" : health.state === "critical" ? "error" : health.state === "attention" || health.state === "unknown" ? "warning" : "success";
  const label = !configured ? "Não configurado" : health.state === "critical" ? "Crítico" : health.state === "attention" ? "Atenção" : health.state === "unknown" ? "Sem histórico" : "Saudável";
  const age = health.ageMinutes == null ? "Sem execução registrada" : health.ageMinutes < 60 ? `Atualizado há ${health.ageMinutes} min` : health.ageMinutes < 1440 ? `Atualizado há ${Math.round(health.ageMinutes / 60)} h` : `Atualizado há ${Math.round(health.ageMinutes / 1440)} dia(s)`;
  return <Box sx={{ p: 1.75, minHeight: 78, height: "100%", border: "1px solid", borderColor: "divider", borderRadius: 2.5, bgcolor: "background.paper" }}>
    <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}><Typography sx={{ fontWeight: 800 }}>{title}</Typography><Chip size="small" color={color} variant="outlined" label={label} /></Stack>
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .6 }}>{age}</Typography>
  </Box>;
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Box sx={{ mt: 3.5, mb: 1.5 }}>
      <Typography
        sx={{
          fontWeight: 750,
          fontSize: "1.05rem",
          letterSpacing: "-0.015em",
          lineHeight: 1.25,
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
        p: 1.75,
        minHeight: 78,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2.5,
        bgcolor: "background.paper",
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 600, letterSpacing: ".01em" }}
      >
        {label}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          fontWeight:
            750,
          mt:
            0.4,
          fontSize:
            ".95rem",
          letterSpacing:
            "-0.01em",
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
  severity: _severity = "default",
}: {
  title: string;
  value: number;
  severity?:
    | "default"
    | "success"
    | "warning"
    | "error";
}) {
  const borderColor = "divider";

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
              650,
          }}
        >
          {title}
        </Typography>

        <Typography
          sx={{
            fontWeight:
              750,
            mt:
              0.5,
            fontSize:
              "1.55rem",
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
              placeholder="Hub Suporte Simer <techlead@empresa.com.br>"
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

