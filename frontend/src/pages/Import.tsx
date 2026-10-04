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
  enrichmentScheduler?: { enabled: boolean; batchSize: number; idleIntervalMinutes: number; continuationSeconds: number; busyRetrySeconds: number; errorCooldownSeconds: number; apiState: "BUSY" | "AVAILABLE"; apiOwner: string | null };
  apiCompliance?: {
    sources: { recent: string; historical: string };
    historicalBaselineEnabled: boolean;
    conditionalCustomFieldsPreserved: boolean;
    rateLimit: {
      limitPerMinute: number;
      configuredIntervalMs: number;
      effectiveMaxPerMinute: number;
      queueDepth: number;
      totalRequestsSinceStartup: number;
      throttledResponsesSinceStartup: number;
      retryAfterUntil: string | null;
      lastRequestAt: string | null;
    };
  };
};

/* =========================================================
   TIPOS - AZURE
========================================================= */

type ClassificationCoverage = {
  scope: { start: string; tickets: number };
  problems: { total: number; classified: number; missing: number; coveragePct: number };
  doubts: { total: number; classified: number; missing: number; coveragePct: number };
  generatedAt: string;
};

type MetadataDiagnostic = {
  readOnly: boolean;
  expectedCustomFields: { cause: number; reason: number; businessArea: number };
  tickets: Array<{
    movideskId: number;
    foundLocally: boolean;
    error?: string;
    local?: { createdDate: string; lastUpdate: string; category: string | null; client: string | null; cause: string | null; reason: string | null; businessArea: string | null; rawCustomFields: Array<{ customFieldId: number; values: string[] }> };
    remote?: { found: boolean; category: string | null; createdDate: unknown; lastUpdate: unknown; causeDetected: string | null; reasonDetected: string | null; customFields: Array<{ customFieldId: number; values: string[] }> };
    delta?: { rawHasCustomFields: boolean; remoteHasCustomFields: boolean; customFieldIdsOnlyRemote: number[] };
  }>;
};

type MetadataTimeline = {
  readOnly: boolean;
  period: { start: string; end: string; tickets: number };
  months: Array<{ month:string; tickets:number; problems:number; causes:number; doubts:number; reasons:number; businessAreas:number; causeCoveragePct:number; reasonCoveragePct:number; businessAreaCoveragePct:number }>;
  lastKnown: Record<"cause"|"reason"|"businessArea", { movideskId:number; createdDate:string; value:string|null } | null>;
  firstMissingAfterLastKnown: Record<"cause"|"reason"|"businessArea", { movideskId:number; createdDate:string; category:string|null } | null>;
  suggestedDiagnosticTickets: number[];
  note: string;
};

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
  runningProviders?: string[];
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

export function Import({ embedded = false }: { embedded?: boolean }) {
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
  const [referenceSyncLoading, setReferenceSyncLoading] = useState(false);
  const [referenceSyncResult, setReferenceSyncResult] = useState<Record<string, unknown> | null>(null);
  const [referenceSyncPhase, setReferenceSyncPhase] = useState<string | null>(null);
  const [referenceNextAt, setReferenceNextAt] = useState<string | null>(null);
  const [referenceSchedule, setReferenceSchedule] = useState<{ hour:number; minute:number } | null>(null);

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
  const [classificationCoverage, setClassificationCoverage] = useState<ClassificationCoverage | null>(null);
  const [classificationBusy, setClassificationBusy] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [metadataTickets, setMetadataTickets] = useState("815474, 777071");
  const [metadataDiagnostic, setMetadataDiagnostic] = useState<MetadataDiagnostic | null>(null);
  const [metadataDiagnosticLoading, setMetadataDiagnosticLoading] = useState(false);
  const [metadataTimeline, setMetadataTimeline] = useState<MetadataTimeline | null>(null);
  const [metadataTimelineLoading, setMetadataTimelineLoading] = useState(false);

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

  const loadClassificationCoverage = useCallback(async () => {
    try {
      const response = await api.get<ClassificationCoverage>("/movidesk/classifications/coverage", { timeout: 60_000 });
      setClassificationCoverage(response.data);
    } catch {
      // Diagnóstico complementar: não bloqueia as demais sincronizações.
    }
  }, []);

  useEffect(() => {
    if (movideskStatus?.completed) void loadClassificationCoverage();
  }, [movideskStatus?.completed, loadClassificationCoverage]);

  async function consolidateClassifications() {
    try {
      setClassificationBusy(true);
      setError(null);
      const response = await api.post<{ scanned:number; causesUpdated:number; reasonsUpdated:number; remoteUpdated:number }>("/movidesk/causes/backfill", {}, { timeout: 180_000 });
      await loadClassificationCoverage();
      setResult(null);
      setError(null);
      window.dispatchEvent(new CustomEvent("techlead-hub:sync-completed"));
      setSyncNotice(`Classificações consolidadas: ${response.data.causesUpdated} causa(s), ${response.data.reasonsUpdated} motivo(s) e ${response.data.remoteUpdated} ticket(s) relidos do Movidesk.`);
    } catch (err: unknown) {
      setSyncNotice(null);
      setError(getApiErrorMessage(err, "Não foi possível consolidar Causas e Motivos. Se a API Movidesk estiver ocupada, aguarde a sincronização atual concluir."));
    } finally {
      setClassificationBusy(false);
    }
  }

  async function loadMetadataTimeline() {
    try {
      setMetadataTimelineLoading(true);
      setError(null);
      const response = await api.get<MetadataTimeline>("/movidesk/metadata/timeline", { params: { start: "2026-06-01", end: "2026-10-31" }, timeout: 60_000 });
      setMetadataTimeline(response.data);
      if (response.data.suggestedDiagnosticTickets.length) setMetadataTickets(response.data.suggestedDiagnosticTickets.join(", "));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Não foi possível analisar a cobertura temporal dos metadados."));
    } finally {
      setMetadataTimelineLoading(false);
    }
  }

  async function diagnoseMetadata() {
    try {
      setMetadataDiagnosticLoading(true);
      setMetadataDiagnostic(null);
      setError(null);
      const tickets = metadataTickets.split(",").map((value) => value.trim()).filter(Boolean).join(",");
      if (!tickets) {
        setError("Informe ao menos um número de atendimento.");
        return;
      }
      const response = await api.get<MetadataDiagnostic>("/movidesk/metadata/diagnostic", { params: { tickets }, timeout: 180_000 });
      setMetadataDiagnostic(response.data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Não foi possível comparar os metadados com o Movidesk."));
    } finally {
      setMetadataDiagnosticLoading(false);
    }
  }

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

  async function loadReferenceSyncStatus() {
    try {
      const response = await api.get<{ status:string; phase:string; result:Record<string,unknown>|null; error:string|null; scheduler?:{ enabled:boolean; hour:number; minute:number; nextEstimatedAt:string|null } }>("/movidesk/reference-sync/status", { timeout: 30_000 });
      setReferenceSyncPhase(response.data.phase);
      setReferenceNextAt(response.data.scheduler?.nextEstimatedAt ?? null);
      setReferenceSchedule(response.data.scheduler ? { hour: response.data.scheduler.hour, minute: response.data.scheduler.minute } : null);
      setReferenceSyncLoading(response.data.status === "RUNNING");
      if (response.data.result) setReferenceSyncResult(response.data.result);
      if (response.data.status === "FAILED" && response.data.error) setError(response.data.error);
    } catch { /* status é complementar; não derruba a tela */ }
  }

  useEffect(() => {
    void loadReferenceSyncStatus();
    const timer = window.setInterval(() => { void loadReferenceSyncStatus(); }, 5_000);
    return () => window.clearInterval(timer);
  }, []);

  async function syncMovideskReferenceData() {
    try {
      setReferenceSyncLoading(true);
      setReferenceSyncResult(null);
      setError(null);
      const response = await api.post<{ accepted:boolean; state:{ phase:string } }>("/movidesk/reference-sync", {}, { timeout: 30_000 });
      setReferenceSyncPhase(response.data.state.phase);
    } catch (err: unknown) {
      setReferenceSyncLoading(false);
      setError(getApiErrorMessage(err, "Não foi possível iniciar Catálogo + CSAT Movidesk."));
    }
  }

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

      {!embedded && <PageHeader eyebrow="Gestão" title="Dados e Sincronizações" description="Central operacional das integrações Movidesk e Azure DevOps, com cargas automáticas, importações manuais e histórico de processamento." />}

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
            <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,minmax(0,1fr))" }, gap: 1.25 }}>
              <IntegrationHealthCard title="Movidesk · Tickets" configured={syncHealth.providers.movidesk.configured} health={syncHealth.providers.movidesk.health} />
              <IntegrationHealthCard title="Azure DevOps" configured={syncHealth.providers.azureDevOps.configured} health={syncHealth.providers.azureDevOps.health} />
              <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2.25, bgcolor: "background.default" }}>
                <Typography variant="caption" color="text.secondary">Movidesk · Catálogo + CSAT</Typography>
                <Typography sx={{ mt: .35, fontWeight: 750 }}>{referenceSchedule ? `Diário às ${String(referenceSchedule.hour).padStart(2,"0")}:${String(referenceSchedule.minute).padStart(2,"0")}` : "Agenda diária"}</Typography>
                <Typography variant="caption" color="text.secondary">Próxima: {formatDateTime(referenceNextAt)} · horário configurado no ambiente</Typography>
              </Box>
            </Box>
            {syncHealth.running > 0 && <Alert severity="info" sx={{ mt: 1.5 }}>
              {syncHealth.running === 1 ? "1 sincronização em processamento" : `${syncHealth.running} sincronizações em processamento`}
              {syncHealth.runningProviders?.length ? ` · ${syncHealth.runningProviders.map((provider) => provider === "MOVIDESK" ? "Movidesk" : "Azure DevOps").join(" + ")}` : ""}.
            </Alert>}
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
                  ? movideskStatus.scheduler.phase === "INCREMENTAL" ? "Base inicial concluída · atualização incremental ativa" : movideskStatus.scheduler.phase === "BASELINE_RUNNING" ? "Carga inicial em execução" : "Aguardando carga inicial"
                  : "Consultando o sincronizador Movidesk..."}
              </Typography>
              {movideskStatus?.enrichmentScheduler && <Stack direction="row" spacing={.75} useFlexGap sx={{ mt: 1, flexWrap: "wrap" }}>
                <Chip size="small" variant="outlined" color={movideskStatus.enrichmentScheduler.enabled ? "success" : "default"} label={movideskStatus.enrichmentScheduler.enabled ? `Enriquecimento ativo · lote ${movideskStatus.enrichmentScheduler.batchSize}` : "Enriquecimento desativado"} />
                <Chip size="small" variant="outlined" color={movideskStatus.enrichmentScheduler.apiState === "BUSY" ? "warning" : "success"} label={movideskStatus.enrichmentScheduler.apiState === "BUSY" ? `API ocupada · ${movideskStatus.enrichmentScheduler.apiOwner ?? "rotina Movidesk"}` : "API disponível"} />
                <Chip size="small" variant="outlined" label={`Continuação ${movideskStatus.enrichmentScheduler.continuationSeconds}s · espera ${movideskStatus.enrichmentScheduler.busyRetrySeconds}s`} />
              </Stack>}
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button variant="contained" disabled={referenceSyncLoading || movideskStatus?.status === "RUNNING"} onClick={() => void syncMovideskReferenceData()}>
                {referenceSyncLoading ? `Sincronizando · ${referenceSyncPhase === "CATALOG" ? "Catálogo" : referenceSyncPhase === "QUESTIONS" ? "Perguntas CSAT" : referenceSyncPhase === "CSAT" ? "Respostas CSAT" : "Preparando"}` : "Sincronizar Catálogo + CSAT"}
              </Button>
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
              <InfoCard label="Próximo Catálogo + CSAT" value={formatDateTime(referenceNextAt)} />
            </Box>
            {movideskStatus.apiCompliance && <Box sx={{ mt: 2, p: 1.75, border: "1px solid", borderColor: "divider", borderRadius: 2.5, bgcolor: "background.default" }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1} useFlexGap sx={{ alignItems: { md: "center" }, justifyContent: "space-between", flexWrap: "wrap" }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 750 }}>Conformidade da API Movidesk</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Cobertura recente e histórica, campos adicionais condicionais e limite global de requisições.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  <Chip size="small" color="success" variant="outlined" label={`Recentes ${movideskStatus.apiCompliance.sources.recent}`} />
                  <Chip size="small" color={movideskStatus.apiCompliance.historicalBaselineEnabled ? "success" : "warning"} variant="outlined" label={`Histórico ${movideskStatus.apiCompliance.sources.historical}`} />
                  <Chip size="small" color={movideskStatus.apiCompliance.conditionalCustomFieldsPreserved ? "success" : "warning"} variant="outlined" label="Metadados preservados" />
                </Stack>
              </Stack>
              <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4,1fr)" }, gap: 1 }}>
                <InfoCard label="Limite oficial" value={`${movideskStatus.apiCompliance.rateLimit.limitPerMinute}/min`} />
                <InfoCard label="Vazão configurada" value={`${movideskStatus.apiCompliance.rateLimit.effectiveMaxPerMinute}/min`} />
                <InfoCard label="Fila API" value={String(movideskStatus.apiCompliance.rateLimit.queueDepth)} />
                <InfoCard label="429 desde o início" value={String(movideskStatus.apiCompliance.rateLimit.throttledResponsesSinceStartup)} />
              </Box>
              {movideskStatus.apiCompliance.rateLimit.retryAfterUntil && <Alert severity="warning" sx={{ mt: 1.25 }}>
                Movidesk solicitou pausa até {formatDateTime(movideskStatus.apiCompliance.rateLimit.retryAfterUntil)}. A fila global respeitará automaticamente o Retry-After.
              </Alert>}
            </Box>}
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
            {referenceSyncResult && (
              <Alert severity="success" variant="outlined" sx={{ mt: 2 }}>
                Catálogo e CSAT sincronizados. <Box component="span" sx={{ fontFamily: "monospace", fontSize: ".78rem" }}>{JSON.stringify(referenceSyncResult)}</Box>
              </Alert>
            )}
          </>}
        </CardContent>
      </Card>

      {movideskStatus?.completed && (
        <Card elevation={0} sx={{ mb: 3, border: "1px solid", borderColor: "divider", borderRadius: 3, bgcolor: "background.paper" }}>
          <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 2, md: 2.5 } } }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>Qualidade das classificações Movidesk</Typography>
                <Typography variant="body2" color="text.secondary">Causa é consolidada somente para Problema; Motivo somente para Dúvida. Escopo operacional 2026+.</Typography>
              </Box>
              <Button variant="outlined" disabled={classificationBusy} onClick={() => void consolidateClassifications()}>
                {classificationBusy ? "Consolidando..." : "Consolidar causas e motivos"}
              </Button>
            </Stack>
            {syncNotice && <Alert severity="success" onClose={() => setSyncNotice(null)} sx={{ mt: 1.5 }}>{syncNotice}</Alert>}
            {classificationCoverage ? (
              <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.25 }}>
                {([["Problema / Causa", classificationCoverage.problems], ["Dúvida / Motivo", classificationCoverage.doubts]] as const).map(([label,item]) => (
                  <Box key={label} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2.25, bgcolor: "background.default" }}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                      <Typography sx={{ fontWeight: 800 }}>{label}</Typography>
                      <Chip size="small" color={item.coveragePct >= 90 ? "success" : item.coveragePct >= 60 ? "warning" : "default"} label={`${item.coveragePct}%`} />
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{item.classified} classificado(s) · {item.missing} pendente(s) · {item.total} total</Typography>
                    <LinearProgress variant="determinate" value={item.coveragePct} sx={{ mt: 1, height: 6, borderRadius: 99 }} />
                  </Box>
                ))}
              </Box>
            ) : <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>Carregando cobertura das classificações...</Typography>}
          </CardContent>
        </Card>
      )}

      {movideskStatus?.completed && (
        <Card elevation={0} sx={{ mb: 3, border: "1px solid", borderColor: "divider", borderRadius: 3, bgcolor: "background.paper" }}>
          <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "flex-end" } }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>Diagnóstico de metadados analíticos</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>Compara Causa, Motivo e Área de negócio armazenados no Hub com os customFieldValues atuais do Movidesk. Somente leitura.</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 1.25 }}>
                  <Button variant="contained" disabled={metadataTimelineLoading} onClick={() => void loadMetadataTimeline()}>{metadataTimelineLoading ? "Analisando período..." : "Analisar jun → out/2026"}</Button>
                  {metadataTimeline && <Chip size="small" variant="outlined" label={`${metadataTimeline.period.tickets} tickets no período`} sx={{ alignSelf: "center" }} />}
                </Stack>
                {metadataTimeline && <Box sx={{ mb: 1.5, overflowX: "auto" }}>
                  <Box sx={{ minWidth: 700, display: "grid", gridTemplateColumns: "100px repeat(4,1fr)", gap: .75 }}>
                    {["Mês","Tickets","Causa","Motivo","Área"].map((label) => <Typography key={label} variant="caption" sx={{ fontWeight: 800, px: .75 }}>{label}</Typography>)}
                    {metadataTimeline.months.flatMap((row) => [
                      <Typography key={`${row.month}-m`} variant="body2" sx={{ px:.75, py:.5, fontWeight:750 }}>{row.month}</Typography>,
                      <Typography key={`${row.month}-t`} variant="body2" sx={{ px:.75, py:.5 }}>{row.tickets}</Typography>,
                      <Typography key={`${row.month}-c`} variant="body2" sx={{ px:.75, py:.5 }}>{row.causes}/{row.problems} · {row.causeCoveragePct}%</Typography>,
                      <Typography key={`${row.month}-r`} variant="body2" sx={{ px:.75, py:.5 }}>{row.reasons}/{row.doubts} · {row.reasonCoveragePct}%</Typography>,
                      <Typography key={`${row.month}-a`} variant="body2" sx={{ px:.75, py:.5 }}>{row.businessAreas}/{row.tickets} · {row.businessAreaCoveragePct}%</Typography>,
                    ])}
                  </Box>
                  <Alert severity="info" sx={{ mt:1.25 }}>
                    Últimos conhecidos — Causa: {metadataTimeline.lastKnown.cause ? `#${metadataTimeline.lastKnown.cause.movideskId} · ${new Date(metadataTimeline.lastKnown.cause.createdDate).toLocaleDateString("pt-BR")}` : "—"}; Motivo: {metadataTimeline.lastKnown.reason ? `#${metadataTimeline.lastKnown.reason.movideskId} · ${new Date(metadataTimeline.lastKnown.reason.createdDate).toLocaleDateString("pt-BR")}` : "—"}; Área: {metadataTimeline.lastKnown.businessArea ? `#${metadataTimeline.lastKnown.businessArea.movideskId} · ${new Date(metadataTimeline.lastKnown.businessArea.createdDate).toLocaleDateString("pt-BR")}` : "—"}. Os tickets sugeridos abaixo foram selecionados automaticamente para comparar a fronteira da ruptura com o Movidesk.
                  </Alert>
                </Box>}
                <TextField fullWidth size="small" label="Atendimentos" value={metadataTickets} onChange={(event) => setMetadataTickets(event.target.value)} helperText="Separe os números por vírgula. Ex.: 815474, 777071" />
              </Box>
              <Button variant="outlined" disabled={metadataDiagnosticLoading} onClick={() => void diagnoseMetadata()}>
                {metadataDiagnosticLoading ? "Diagnosticando..." : "Diagnosticar metadados"}
              </Button>
            </Stack>
            {metadataDiagnostic && <Stack spacing={1.25} sx={{ mt: 2 }}>
              {metadataDiagnostic.tickets.map((ticket) => {
                const onlyRemote = ticket.delta?.customFieldIdsOnlyRemote ?? [];
                const remoteFields = ticket.remote?.customFields ?? [];
                const localFields = ticket.local?.rawCustomFields ?? [];
                return <Box key={ticket.movideskId} sx={{ p: 1.5, border: "1px solid", borderColor: onlyRemote.length ? "warning.main" : "divider", borderRadius: 2.25, bgcolor: "background.default" }}>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography sx={{ fontWeight: 900 }}>#{ticket.movideskId}</Typography>
                    <Chip size="small" color={ticket.error ? "error" : onlyRemote.length ? "warning" : "success"} label={ticket.error ? "Falha" : onlyRemote.length ? "Divergência local × Movidesk" : "Campos oficiais consistentes"} />
                    {ticket.local?.category && <Chip size="small" variant="outlined" label={ticket.local.category} />}
                  </Stack>
                  {ticket.error ? <Alert severity="error" sx={{ mt: 1 }}>{ticket.error}</Alert> : <>
                    <Box sx={{ mt: 1.25, display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.25 }}>
                      <Box><Typography variant="caption" color="text.secondary">Hub / banco local</Typography><Typography variant="body2"><b>Causa:</b> {ticket.local?.cause ?? "—"} · <b>Motivo:</b> {ticket.local?.reason ?? "—"} · <b>Área:</b> {ticket.local?.businessArea ?? "—"}</Typography><Typography variant="caption" color="text.secondary">Campos no rawData: {localFields.length ? localFields.map((field) => `${field.customFieldId}=${field.values.join(" / ")}`).join(" · ") : "nenhum customFieldValue persistido"}</Typography></Box>
                      <Box><Typography variant="caption" color="text.secondary">Movidesk agora</Typography><Typography variant="body2"><b>Causa detectada:</b> {ticket.remote?.causeDetected ?? "—"} · <b>Motivo detectado:</b> {ticket.remote?.reasonDetected ?? "—"}</Typography><Typography variant="caption" color="text.secondary">Campos retornados: {remoteFields.length ? remoteFields.map((field) => `${field.customFieldId}=${field.values.join(" / ")}`).join(" · ") : "nenhum customFieldValue retornado"}</Typography></Box>
                    </Box>
                    {onlyRemote.length > 0 && <Alert severity="warning" sx={{ mt: 1 }}>IDs presentes no Movidesk e ausentes do rawData local: {onlyRemote.join(", ")}. Isso indica lacuna na persistência/sincronização do ticket.</Alert>}
                  </>}
                </Box>;
              })}
            </Stack>}
          </CardContent>
        </Card>
      )}

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
                {azureStatus ? "Correções, Evoluções e APOIOs · acompanhamento do último processamento" : "Carregando status do sincronizador..."}
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
                      "repeat(3, 1fr)",
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

