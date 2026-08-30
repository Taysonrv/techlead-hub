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
import {
  CheckCircleOutlined,
  CloudDownloadOutlined,
  InfoOutlined,
  InstallDesktopOutlined,
  RefreshOutlined,
  RocketLaunchOutlined,
  UpdateOutlined,
} from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { aliareColors } from "../theme/theme";

type UpdateStatus =
  | "idle"
  | "disabled"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

type UpdateState = {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
  message: string | null;
};

type DesktopBridge = {
  desktop?: boolean;
  getVersion?: () => Promise<string>;
  updates?: {
    getState?: () => Promise<UpdateState>;
    check?: () => Promise<UpdateState>;
    download?: () => Promise<UpdateState>;
    install?: () => Promise<boolean>;
    onStateChange?: (
      listener: (state: UpdateState) => void
    ) => (() => void) | void;
  };
};

const RELEASE_VERSION = "0.1.2-beta.1";

const RELEASE_ITEMS = [
  ["Prazos oficiais do Movidesk", "Primeira resposta e solução passam a priorizar os vencimentos oficiais importados do Movidesk."],
  ["Tickets em pausa", 'Casos com "Vencimento em = Em pausa" deixam de gerar alertas incorretos de prazo vencido.'],
  ["Importação aprimorada", "Reconhecimento de Serviço (2º Nível), Vencimento em, Tempo de vida (Horas úteis), Versão Entregue Task e Número Task."],
  ["Indicadores de desempenho", "Ajustes nos indicadores históricos de primeira resposta, resolução e desempenho por analista."],
  ["Motor central de prazo", "Performance, Tickets e Pontos de Atenção passam a consumir a mesma regra centralizada."],
  ["Sobre e Atualizações", "Nova experiência para consultar versão, verificar, baixar e instalar atualizações."],
] as const;

const EMPTY_STATE: UpdateState = {
  status: "idle",
  currentVersion: "",
  availableVersion: null,
  percent: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
  message: null,
};

export function About() {
  const [appVersion, setAppVersion] = useState("Beta");
  const [updateState, setUpdateState] = useState<UpdateState>(EMPTY_STATE);
  const [actionRunning, setActionRunning] = useState(false);

  const desktopApi = useMemo(
    () => (window.techLeadHub ?? null) as DesktopBridge | null,
    []
  );

  const updaterApi = desktopApi?.updates ?? null;

  const getState = updaterApi?.getState;
  const checkAction = updaterApi?.check;
  const downloadAction = updaterApi?.download;
  const installAction = updaterApi?.install;

  const updaterAvailable = Boolean(
    desktopApi?.desktop &&
      getState &&
      checkAction &&
      downloadAction &&
      installAction
  );

  const refreshState = useCallback(async () => {
    if (!getState) return;
    try {
      const state = await getState();
      if (state) setUpdateState(state);
    } catch (error) {
      console.error("Erro ao consultar atualização:", error);
    }
  }, [getState]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!desktopApi) return;

      try {
        if (desktopApi.getVersion) {
          const version = await desktopApi.getVersion();
          if (mounted) {
            setAppVersion(version);
          }
        }

        await refreshState();
      } catch (error) {
        console.error("Erro ao carregar informações da aplicação:", error);
      }
    }

    void load();

    const unsubscribe = updaterApi?.onStateChange?.((state) => {
      if (mounted) {
        setUpdateState(state);
      }
    });

    return () => {
      mounted = false;

      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [desktopApi, updaterApi, refreshState]);

  async function runAction(action?: () => Promise<unknown>) {
    if (!action || actionRunning) return;

    try {
      setActionRunning(true);
      const result = await action();

      if (
        result &&
        typeof result === "object" &&
        "status" in result
      ) {
        setUpdateState(result as UpdateState);
      }

      await refreshState();
    } catch (error) {
      console.error("Erro na atualização:", error);
    } finally {
      setActionRunning(false);
    }
  }

  const visual = getUpdateVisual(updateState.status);
  const downloading = updateState.status === "downloading";
  const downloaded = updateState.status === "downloaded";

  return (
    <Box sx={{ width: "100%", maxWidth: 1500, mx: "auto", pb: 4 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          mb: 2.5,
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: aliareColors.black,
            }}
          >
            Sobre e Atualizações
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Informações da aplicação, versão instalada e gerenciamento de atualizações.
          </Typography>
        </Box>

        <Chip
          icon={<RocketLaunchOutlined />}
          label={`Versão ${appVersion}`}
          variant="outlined"
          sx={{
            fontWeight: 750,
            color: aliareColors.greenDark,
            borderColor: "rgba(24,199,122,0.35)",
            backgroundColor: "rgba(24,199,122,0.05)",
          }}
        />
      </Stack>

      <Card
        elevation={0}
        sx={{
          mb: 2,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2.5,
        }}
      >
        <Box sx={{ height: 4, backgroundColor: aliareColors.green }} />
        <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            sx={{
              alignItems: { xs: "flex-start", md: "center" },
              justifyContent: "space-between",
            }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 46,
                  height: 46,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  backgroundColor: aliareColors.black,
                  color: aliareColors.green,
                }}
              >
                <InfoOutlined />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>TechLead Hub</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  Support Intelligence para acompanhamento operacional do suporte SIMER.
                </Typography>
              </Box>
            </Stack>
            <Chip size="small" label="Canal Beta" variant="outlined" />
          </Stack>
        </CardContent>
      </Card>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0, 1.25fr) minmax(320px, 0.75fr)",
          },
          gap: 2,
          alignItems: "start",
        }}
      >
        <Card
          elevation={0}
          sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5 }}
        >
          <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 2 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 1.5,
                  display: "grid",
                  placeItems: "center",
                  backgroundColor: visual.background,
                  color: visual.color,
                }}
              >
                {visual.icon}
              </Box>

              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>Atualização do aplicativo</Typography>
                <Typography variant="caption" color="text.secondary">
                  GitHub Releases • atualização controlada
                </Typography>
              </Box>

              <Chip
                size="small"
                label={visual.label}
                variant="outlined"
                sx={{ color: visual.color, borderColor: visual.color, fontWeight: 700 }}
              />
            </Stack>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                gap: 1.25,
                mb: 1.75,
              }}
            >
              <VersionBox label="Versão instalada" value={appVersion} />
              <VersionBox
                label="Nova versão"
                value={updateState.availableVersion ?? "—"}
                highlight={Boolean(updateState.availableVersion)}
              />
            </Box>

            {downloading && (
              <Box sx={{ mb: 1.75 }}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", mb: 0.75 }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Progresso do download
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 800 }}>
                    {Math.round(updateState.percent)}%
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={Math.max(0, Math.min(100, updateState.percent))}
                  sx={{
                    height: 7,
                    borderRadius: 10,
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 10,
                      backgroundColor: aliareColors.green,
                    },
                  }}
                />
                {updateState.total > 0 && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 0.75 }}
                  >
                    {formatBytes(updateState.transferred)} de {formatBytes(updateState.total)}
                    {updateState.bytesPerSecond > 0
                      ? ` • ${formatBytes(updateState.bytesPerSecond)}/s`
                      : ""}
                  </Typography>
                )}
              </Box>
            )}

            <Alert severity={visual.severity} variant="outlined" sx={{ mb: 1.75 }}>
              {updateState.message ?? visual.message}
            </Alert>

            {!updaterAvailable && (
              <Alert severity="info" sx={{ mb: 1.75 }}>
                O updater fica disponível no aplicativo Electron instalado. Em desenvolvimento,
                essa integração pode permanecer desabilitada.
              </Alert>
            )}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              {updateState.status === "available" ? (
                <Button
                  variant="contained"
                  startIcon={
                    actionRunning ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <CloudDownloadOutlined />
                    )
                  }
                  disabled={actionRunning || !downloadAction}
                  onClick={() => void runAction(downloadAction)}
                  sx={{ textTransform: "none", fontWeight: 750 }}
                >
                  Baixar atualização
                </Button>
              ) : downloaded ? (
                <Button
                  variant="contained"
                  startIcon={<InstallDesktopOutlined />}
                  disabled={actionRunning || !installAction}
                  onClick={() => void runAction(installAction)}
                  sx={{ textTransform: "none", fontWeight: 750 }}
                >
                  Instalar e reiniciar
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  startIcon={
                    actionRunning || updateState.status === "checking" ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <RefreshOutlined />
                    )
                  }
                  disabled={
                    !updaterAvailable ||
                    actionRunning ||
                    updateState.status === "checking" ||
                    updateState.status === "disabled"
                  }
                  onClick={() => void runAction(checkAction)}
                  sx={{ textTransform: "none", fontWeight: 750 }}
                >
                  {updateState.status === "checking"
                    ? "Verificando..."
                    : "Verificar atualizações"}
                </Button>
              )}

              {updateState.status === "available" && (
                <Button
                  variant="text"
                  startIcon={<RefreshOutlined />}
                  disabled={actionRunning}
                  onClick={() => void runAction(checkAction)}
                  sx={{ textTransform: "none" }}
                >
                  Verificar novamente
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card
          elevation={0}
          sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5 }}
        >
          <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
            <Typography sx={{ fontWeight: 800 }}>Informações da versão</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
              Dados úteis para homologação e suporte.
            </Typography>
            <InfoRow label="Aplicação" value="TechLead Hub" />
            <Divider />
            <InfoRow label="Versão instalada" value={appVersion} />
            <Divider />
            <InfoRow label="Canal" value="Beta" />
            <Divider />
            <InfoRow label="Distribuição" value="Electron / Windows" />
            <Divider />
            <InfoRow
              label="Atualizações"
              value={updaterAvailable ? "Habilitadas" : "Somente no desktop instalado"}
            />
          </CardContent>
        </Card>
      </Box>

      <Card
        elevation={0}
        sx={{
          mt: 2,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2.5,
        }}
      >
        <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{
              alignItems: { xs: "flex-start", sm: "center" },
              justifyContent: "space-between",
              mb: 1.75,
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 800 }}>Novidades da versão</Typography>
              <Typography variant="body2" color="text.secondary">
                Principais alterações preparadas para esta publicação.
              </Typography>
            </Box>
            <Chip
              size="small"
              label={`v${RELEASE_VERSION}`}
              sx={{
                fontWeight: 800,
                backgroundColor: "rgba(24,199,122,0.08)",
                color: aliareColors.greenDark,
              }}
            />
          </Stack>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
              gap: 1.25,
            }}
          >
            {RELEASE_ITEMS.map(([title, description], index) => (
              <Box
                key={title}
                sx={{
                  p: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                  backgroundColor: "rgba(16,24,40,0.012)",
                }}
              >
                <Stack direction="row" spacing={1.25}>
                  <Box
                    sx={{
                      width: 26,
                      height: 26,
                      borderRadius: 1,
                      display: "grid",
                      placeItems: "center",
                      backgroundColor: "rgba(24,199,122,0.10)",
                      color: aliareColors.greenDark,
                      fontSize: "0.72rem",
                      fontWeight: 900,
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                      {title}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.35, lineHeight: 1.55 }}
                    >
                      {description}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export const Sobre = About;
export default About;

function VersionBox({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Box
      sx={{
        p: 1.5,
        border: "1px solid",
        borderColor: highlight ? "rgba(24,199,122,0.38)" : "divider",
        borderRadius: 2,
        backgroundColor: highlight ? "rgba(24,199,122,0.04)" : "rgba(16,24,40,0.012)",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.25,
          fontWeight: 850,
          color: highlight ? aliareColors.greenDark : "text.primary",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ py: 1.1, alignItems: "center", justifyContent: "space-between" }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: "right", fontWeight: 750 }}>
        {value}
      </Typography>
    </Stack>
  );
}

function getUpdateVisual(status: UpdateStatus) {
  if (status === "checking") {
    return {
      label: "Verificando",
      message: "Consultando novas versões disponíveis.",
      color: "#2563EB",
      background: "rgba(37,99,235,0.08)",
      severity: "info" as const,
      icon: <RefreshOutlined fontSize="small" />,
    };
  }

  if (status === "available") {
    return {
      label: "Atualização disponível",
      message: "Existe uma nova versão disponível para download.",
      color: "#B76E00",
      background: "rgba(245,158,11,0.09)",
      severity: "warning" as const,
      icon: <UpdateOutlined fontSize="small" />,
    };
  }

  if (status === "downloading") {
    return {
      label: "Baixando",
      message: "A atualização está sendo baixada.",
      color: "#2563EB",
      background: "rgba(37,99,235,0.08)",
      severity: "info" as const,
      icon: <CloudDownloadOutlined fontSize="small" />,
    };
  }

  if (status === "downloaded") {
    return {
      label: "Pronta para instalar",
      message: "Download concluído. Instale para reiniciar na nova versão.",
      color: aliareColors.greenDark,
      background: "rgba(24,199,122,0.08)",
      severity: "success" as const,
      icon: <InstallDesktopOutlined fontSize="small" />,
    };
  }

  if (status === "not-available") {
    return {
      label: "Atualizado",
      message: "Você está usando a versão mais recente disponível.",
      color: aliareColors.greenDark,
      background: "rgba(24,199,122,0.08)",
      severity: "success" as const,
      icon: <CheckCircleOutlined fontSize="small" />,
    };
  }

  if (status === "error") {
    return {
      label: "Falha",
      message: "Não foi possível concluir a operação de atualização.",
      color: "#D92D20",
      background: "rgba(217,45,32,0.07)",
      severity: "error" as const,
      icon: <UpdateOutlined fontSize="small" />,
    };
  }

  if (status === "disabled") {
    return {
      label: "Indisponível neste modo",
      message: "As atualizações ficam disponíveis na versão desktop instalada.",
      color: "#667085",
      background: "rgba(102,112,133,0.06)",
      severity: "info" as const,
      icon: <InfoOutlined fontSize="small" />,
    };
  }

  return {
    label: "Pronto",
    message: "Você pode verificar se existe uma nova versão disponível.",
    color: "#475467",
    background: "rgba(71,84,103,0.05)",
    severity: "info" as const,
    icon: <UpdateOutlined fontSize="small" />,
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
