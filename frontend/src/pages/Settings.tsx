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
  CloudDoneOutlined,
  CloudOffOutlined,
  FileUploadOutlined,
  SaveOutlined,
  StorageOutlined,
} from "@mui/icons-material";

import {
  useEffect,
  useState,
} from "react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";

type ConfigurationState = {
  databaseConfigured: boolean;
  organization: string;
  project: string;
  wiki: string;
  patConfigured: boolean;
  tenantId: string;
  clientId: string;
  sharePointSiteUrl: string;
  bpmnSiteUrl: string;
  microsoftConfigured: boolean;
  runtime?: string;
};

type ConfigurationForm = {
  databaseUrl: string;
  organization: string;
  project: string;
  wiki: string;
  pat: string;
  tenantId: string;
  clientId: string;
  sharePointSiteUrl: string;
  bpmnSiteUrl: string;
};

const EMPTY_FORM: ConfigurationForm = {
  databaseUrl: "",
  organization: "",
  project: "",
  wiki: "",
  pat: "",
  tenantId: "",
  clientId: "",
  sharePointSiteUrl: "https://siagri365.sharepoint.com/sites/cooperativas-agroindustrias-simer",
  bpmnSiteUrl: "https://siagri365.sharepoint.com/sites/FluxoBPMNSimer",
};

export function Settings() {
  const [configuration, setConfiguration] =
    useState<ConfigurationState | null>(null);
  const [form, setForm] =
    useState<ConfigurationForm>(EMPTY_FORM);
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [success, setSuccess] =
    useState<string | null>(null);

  useEffect(() => {
    void loadConfiguration();
  }, []);

  async function loadConfiguration() {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get<ConfigurationState>("/system-settings");
      const current = response.data;

      setConfiguration(current);
      setForm((previous) => ({
        ...previous,
        organization: current.organization ?? "",
        project: current.project ?? "",
        wiki: current.wiki ?? "",
        tenantId: current.tenantId ?? "",
        clientId: current.clientId ?? "",
        sharePointSiteUrl: current.sharePointSiteUrl ?? "",
        bpmnSiteUrl: current.bpmnSiteUrl ?? "",
      }));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar as configurações.",
      );
    } finally {
      setLoading(false);
    }
  }

  function updateField(
    field: keyof ConfigurationForm,
    value: string,
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function importEnvironment() {
    try {
      setError(null);
      setSuccess(null);

      if (!window.techLeadHub) {
        throw new Error(
          "A importação está disponível somente no aplicativo instalado.",
        );
      }

      const imported =
        await window.techLeadHub.configuration.importEnv();

      if (!imported) {
        return;
      }

      setForm({
        ...EMPTY_FORM,
        ...imported,
        tenantId: imported.tenantId ?? "",
        clientId: imported.clientId ?? "",
        sharePointSiteUrl: imported.sharePointSiteUrl ?? EMPTY_FORM.sharePointSiteUrl,
        bpmnSiteUrl: imported.bpmnSiteUrl ?? EMPTY_FORM.bpmnSiteUrl,
      });
      setSuccess(
        "Arquivo carregado. Revise os dados e clique em Salvar configurações.",
      );
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Não foi possível importar o arquivo.",
      );
    }
  }

  async function saveConfiguration() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await api.put<ConfigurationState & { restartRequired: boolean }>(
        "/system-settings",
        {
          organization: form.organization,
          project: form.project,
          wiki: form.wiki,
          pat: form.pat,
          tenantId: form.tenantId,
          clientId: form.clientId,
          sharePointSiteUrl: form.sharePointSiteUrl,
          bpmnSiteUrl: form.bpmnSiteUrl,
        },
      );

      let result = response.data;
      if (form.databaseUrl && window.techLeadHub) {
        result = {
          ...result,
          ...(await window.techLeadHub.configuration.save(form)),
        };
      }

      setSuccess(
        result.restartRequired
          ? "Configurações centralizadas com sucesso. Reinicie o serviço para que todos os processos apliquem as novas integrações."
          : "Configurações centralizadas com sucesso.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar as configurações.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader eyebrow="Sistema" title="Configurações" description="Configuração administrativa central. As integrações são protegidas no banco compartilhado e valem para todos os usuários Web e Desktop." />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Stack spacing={2.5}>
        {window.techLeadHub && configuration?.runtime !== "web" && <Card
          elevation={0}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2.5,
          }}
        >
          <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{
                alignItems: { xs: "flex-start", sm: "center" },
                justifyContent: "space-between",
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 800 }}>
                  Banco de dados
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Informe uma nova URL somente quando precisar trocar a conexão.
                </Typography>
              </Box>

              <Chip
                icon={
                  configuration?.databaseConfigured
                    ? <StorageOutlined />
                    : <CloudOffOutlined />
                }
                label={
                  configuration?.databaseConfigured
                    ? "Configurado"
                    : "Não configurado"
                }
                color={
                  configuration?.databaseConfigured
                    ? "success"
                    : "warning"
                }
                variant="outlined"
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            <TextField
              fullWidth
              type="password"
              label="Nova DATABASE_URL"
              value={form.databaseUrl}
              onChange={(event) =>
                updateField("databaseUrl", event.target.value)
              }
              placeholder={
                configuration?.databaseConfigured
                  ? "Deixe vazio para manter a conexão atual"
                  : "postgresql://usuario:senha@servidor:5432/banco"
              }
              autoComplete="new-password"
              helperText="A conexão atual não é exibida por segurança."
            />
          </CardContent>
        </Card>}

        <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5 }}>
          <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>Microsoft 365, SharePoint e BPMN</Typography>
                <Typography variant="body2" color="text.secondary">Credenciais públicas do aplicativo corporativo. A senha do usuário nunca é armazenada.</Typography>
              </Box>
              <Chip icon={configuration?.microsoftConfigured ? <CloudDoneOutlined /> : <CloudOffOutlined />} label={configuration?.microsoftConfigured ? "Pronto para conectar" : "Aguardando Tenant e Client ID"} color={configuration?.microsoftConfigured ? "success" : "default"} variant="outlined" />
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
              <TextField label="Tenant ID" value={form.tenantId} onChange={(event) => updateField("tenantId", event.target.value)} helperText="Diretório Microsoft Entra da Aliare." />
              <TextField label="Client ID" value={form.clientId} onChange={(event) => updateField("clientId", event.target.value)} helperText="Aplicativo desktop registrado pelo time de TI." />
              <TextField label="Site SharePoint do time" value={form.sharePointSiteUrl} onChange={(event) => updateField("sharePointSiteUrl", event.target.value)} />
              <TextField label="Site dos fluxos BPMN" value={form.bpmnSiteUrl} onChange={(event) => updateField("bpmnSiteUrl", event.target.value)} />
            </Box>
            <Alert severity="info" sx={{ mt: 2 }}>Depois de salvar e reiniciar, conecte sua conta Microsoft na Base de Conhecimento. Os resultados respeitarão as permissões do usuário autenticado.</Alert>
          </CardContent>
        </Card>

        <Card
          elevation={0}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2.5,
          }}
        >
          <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{
                alignItems: { xs: "flex-start", sm: "center" },
                justifyContent: "space-between",
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 800 }}>
                  Azure DevOps
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Configure a leitura de Correções, Evoluções e APOIOs.
                </Typography>
              </Box>

              <Chip
                icon={
                  configuration?.patConfigured
                    ? <CloudDoneOutlined />
                    : <CloudOffOutlined />
                }
                label={
                  configuration?.patConfigured
                    ? "Credencial configurada"
                    : "Não configurado"
                }
                color={
                  configuration?.patConfigured
                    ? "success"
                    : "default"
                }
                variant="outlined"
              />
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                },
                gap: 2,
              }}
            >
              <TextField
                label="Organização"
                value={form.organization}
                onChange={(event) =>
                  updateField("organization", event.target.value)
                }
              />

              <TextField
                label="Projeto"
                value={form.project}
                onChange={(event) =>
                  updateField("project", event.target.value)
                }
              />

              <TextField
                label="Wiki"
                value={form.wiki}
                onChange={(event) =>
                  updateField("wiki", event.target.value)
                }
              />

              <TextField
                type="password"
                label="Novo PAT"
                value={form.pat}
                onChange={(event) =>
                  updateField("pat", event.target.value)
                }
                autoComplete="new-password"
                placeholder={
                  configuration?.patConfigured
                    ? "Deixe vazio para manter o PAT atual"
                    : "Informe o Personal Access Token"
                }
                helperText="O PAT atual não é exibido por segurança."
              />
            </Box>
          </CardContent>
        </Card>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ justifyContent: "flex-end" }}
        >
          {window.techLeadHub && configuration?.runtime !== "web" && <Button
            variant="outlined"
            startIcon={<FileUploadOutlined />}
            disabled={saving}
            onClick={() => void importEnvironment()}
          >
            Importar .env
          </Button>}

          <Button
            variant="contained"
            startIcon={
              saving
                ? <CircularProgress size={16} color="inherit" />
                : <SaveOutlined />
            }
            disabled={saving}
            onClick={() => void saveConfiguration()}
          >
            {saving ? "Salvando..." : "Salvar configurações"}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
