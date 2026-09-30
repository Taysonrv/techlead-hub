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
  Switch,
  TextField,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
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
import { getLocalNotificationPreferences, saveLocalNotificationPreferences, type LocalNotificationPreferences } from "../utils/notificationSound";

type ConfigurationState = {
  databaseConfigured: boolean;
  organization: string;
  project: string;
  wiki: string;
  patConfigured: boolean;
  movideskConfigured: boolean;
  movideskUrl: string;
  runtime?: string;
};

type ConfigurationForm = {
  databaseUrl: string;
  organization: string;
  project: string;
  wiki: string;
  pat: string;
  movideskToken: string;
  movideskUrl: string;
};

type ActiveSession = { id: number; clientType: string; deviceName: string | null; appVersion: string | null; ipAddress: string | null; createdAt: string; lastActivityAt: string; user: { id: number; name: string; username: string } };
type PermissionUser = { id:number; name:string; username:string; role:"ADMIN"|"COORDENADOR"|"ANALISTA"; permissions?: string[] | null };
const ROUTINE_PERMISSIONS = [
  ["dashboard","Dashboard"],["tickets","Tickets"],["my-operation","Minha Operação"],["known-problems","Problemas Conhecidos"],
  ["attention","Pontos de Atenção"],["data-quality","Pendências"],["clients","Clientes"],["analysts","Analistas"],
  ["simer-map","Mapa SIMER"],["performance","Desempenho"],["reports","Relatórios"],["corrections","Correções"],
  ["evolutions","Evoluções"],["support","Apoios"],["versions","Versões"],["knowledge","Base de Conhecimento"],
  ["services","Serviços SIMER"],["technical-leadership","Central de Liderança"],["coordination","Central da Coordenação"],["imports","Dados e Sincronizações"],
] as const;
type Diagnostics = { status: string; appVersion: string; runtime: string; nodeVersion: string; database: { status: string; latencyMs: number }; sessionPolicy: { exclusiveAcrossPlatforms: boolean; idleTimeoutMinutes: number }; checkedAt: string };
type MovideskPreview = { readOnly: boolean; sampleSize: number; requested: number; validForImport: boolean; requiredFields: string[]; coverage: Record<string, number>; issues: Array<{ row: number; id: unknown; fields: string[] }>; examples: Array<{ id: unknown; subject: unknown; createdDate: unknown; lastUpdate: unknown; status: unknown; ownerTeam: unknown; serviceFirstLevel: unknown; serviceSecondLevel: unknown }> };
type MovideskBaselineStatus = { status: "IDLE" | "RUNNING" | "SUCCESS" | "ERROR"; startedAt: string | null; finishedAt: string | null; completed: boolean; result: { mode: string; pages: number; totalRows: number; created: number; updated: number; ignored: number; errors: number } | null; error: string | null; database: { tickets: number; linkedTasks: number }; lastImport: { status: string; totalRows: number; insertedRows: number; updatedRows: number; skippedRows: number; errorRows: number; message: string | null } | null };
type MovideskCoverage = { total: number; coverage: Record<string, number>; deleted: number; withRawData: number; generatedAt: string };

const EMPTY_FORM: ConfigurationForm = {
  databaseUrl: "",
  organization: "",
  project: "",
  wiki: "",
  pat: "",
  movideskToken: "",
  movideskUrl: "https://api.movidesk.com/public/v1",
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
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [startupEnabled, setStartupEnabled] = useState(false);
  const [startupSaving, setStartupSaving] = useState(false);
  const [permissionUsers,setPermissionUsers]=useState<PermissionUser[]>([]);
  const [permissionUserId,setPermissionUserId]=useState<number | "">("");
  const [permissionSaving,setPermissionSaving]=useState(false);
  const [notificationPreferences,setNotificationPreferences]=useState<LocalNotificationPreferences>(()=>getLocalNotificationPreferences());
  const [movideskPreview, setMovideskPreview] = useState<MovideskPreview | null>(null);
  const [previewingMovidesk, setPreviewingMovidesk] = useState(false);
  const [movideskBaseline, setMovideskBaseline] = useState<MovideskBaselineStatus | null>(null);
  const [movideskCoverage, setMovideskCoverage] = useState<MovideskCoverage | null>(null);
  const [baselineBusy, setBaselineBusy] = useState(false);

  useEffect(() => {
    void loadConfiguration();
    void api.get<{users:PermissionUser[]}>("/users").then(r=>setPermissionUsers(r.data.users)).catch(()=>setPermissionUsers([]));
    if (window.techLeadHub?.platform === "win32" && window.techLeadHub.startup) void window.techLeadHub.startup.get().then((state) => setStartupEnabled(state.enabled)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!configuration?.movideskConfigured) return;
    void refreshMovideskBaseline();
  }, [configuration?.movideskConfigured]);

  useEffect(() => {
    if (movideskBaseline?.status !== "RUNNING") return;
    const timer = window.setInterval(() => { void refreshMovideskBaseline(); }, 5000);
    return () => window.clearInterval(timer);
  }, [movideskBaseline?.status]);

  async function saveUserPermissions(userId:number, permissions:string[]) {
    try {
      setPermissionSaving(true); setError(null);
      const response=await api.patch<{user:PermissionUser}>(`/users/${userId}/permissions`,{permissions});
      setPermissionUsers(current=>current.map(user=>user.id===userId?{...user,...response.data.user}:user));
      setSuccess("Permissões do usuário atualizadas.");
    } catch { setError("Não foi possível atualizar as permissões do usuário."); }
    finally { setPermissionSaving(false); }
  }
  function changeNotificationPreference(key:keyof LocalNotificationPreferences,enabled:boolean){const next={...notificationPreferences,[key]:enabled};setNotificationPreferences(next);saveLocalNotificationPreferences(next)}
  async function changeStartup(enabled: boolean) {
    if (!window.techLeadHub?.startup) return;
    try { setStartupSaving(true); setError(null); const state=await window.techLeadHub.startup.set(enabled); setStartupEnabled(state.enabled); setSuccess(state.enabled ? "Hub Suporte Simer será iniciado automaticamente com o Windows." : "Inicialização automática com o Windows desativada."); }
    catch { setError("Não foi possível alterar a inicialização com o Windows."); }
    finally { setStartupSaving(false); }
  }

  async function loadConfiguration() {
    try {
      setLoading(true);
      setError(null);

      const [response, sessionResponse, diagnosticsResponse] = await Promise.all([
        api.get<ConfigurationState>("/system-settings"),
        api.get<{ sessions: ActiveSession[] }>("/sessions"),
        api.get<Diagnostics>("/system-settings/diagnostics"),
      ]);
      const current = response.data;
      setSessions(sessionResponse.data.sessions);
      setDiagnostics(diagnosticsResponse.data);

      setConfiguration(current);
      setForm((previous) => ({
        ...previous,
        organization: current.organization ?? "",
        project: current.project ?? "",
        wiki: current.wiki ?? "",
        movideskUrl: current.movideskUrl ?? "https://api.movidesk.com/public/v1",
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

  async function revokeSession(sessionId: number) {
    try {
      await api.delete(`/sessions/${sessionId}`);
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      setSuccess("Sessão encerrada com sucesso.");
    } catch {
      setError("Não foi possível encerrar a sessão.");
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

  async function saveAndTestMovidesk() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const token = form.movideskToken.trim();
      if (!configuration?.movideskConfigured && !token) {
        throw new Error("Informe o token Movidesk antes de salvar e testar.");
      }

      const saved = await api.put<ConfigurationState & { restartRequired: boolean }>(
        "/system-settings",
        {
          movideskToken: token,
          movideskUrl: form.movideskUrl,
        },
      );
      setConfiguration((current) => ({ ...(current ?? saved.data), ...saved.data }));
      setForm((current) => ({ ...current, movideskToken: "" }));

      const response = await api.get<{ ok: boolean }>("/movidesk/test");
      if (!response.data.ok) throw new Error("O Movidesk não confirmou a conexão.");

      setSuccess("Credencial Movidesk salva e conexão validada com sucesso.");
    } catch (testError: any) {
      setError(
        testError?.response?.data?.message ??
          (testError instanceof Error ? testError.message : "Não foi possível salvar e validar o Movidesk."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function previewMovidesk() {
    try {
      setPreviewingMovidesk(true);
      setError(null);
      setSuccess(null);
      const response = await api.get<MovideskPreview>("/movidesk/preview?limit=25", { timeout: 120_000 });
      setMovideskPreview(response.data);
      setSuccess(
        response.data.validForImport
          ? `Amostra Movidesk validada: ${response.data.sampleSize} ticket(s), sem incompatibilidades obrigatórias.`
          : `Amostra analisada com ${response.data.issues.length} incompatibilidade(s). Revise antes da carga FULL.`,
      );
    } catch (previewError: any) {
      setMovideskPreview(null);
      setError(previewError?.response?.data?.message ?? (previewError instanceof Error ? previewError.message : "Não foi possível validar a amostra Movidesk."));
    } finally {
      setPreviewingMovidesk(false);
    }
  }

  async function refreshMovideskBaseline() {
    try {
      const response = await api.get<MovideskBaselineStatus>("/movidesk/baseline/status", { timeout: 30_000 });
      setMovideskBaseline(response.data);
      if (response.data.completed) {
        const coverage = await api.get<MovideskCoverage>("/movidesk/coverage", { timeout: 60_000 });
        setMovideskCoverage(coverage.data);
      }
      return response.data;
    } catch (statusError: any) {
      setError(statusError?.response?.data?.message ?? "Não foi possível consultar o baseline Movidesk.");
      return null;
    }
  }

  async function startMovideskBaseline() {
    try {
      setBaselineBusy(true); setError(null); setSuccess(null);
      const response = await api.post<{ accepted: boolean; reason?: string; state: MovideskBaselineStatus }>("/movidesk/baseline/start", {}, { timeout: 30_000 });
      setMovideskBaseline(response.data.state);
      setSuccess(response.data.accepted ? "Carga FULL iniciada em segundo plano. O progresso será atualizado automaticamente." : response.data.reason === "COMPLETED" ? "O baseline Movidesk já foi concluído." : "A carga FULL já está em execução.");
    } catch (baselineError: any) {
      setError(baselineError?.response?.data?.message ?? "Não foi possível iniciar a carga FULL.");
    } finally { setBaselineBusy(false); }
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
          movideskToken: form.movideskToken,
          movideskUrl: form.movideskUrl,
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
      <Card variant="outlined" sx={{ mb: 2 }}><CardContent>
        <Typography sx={{fontWeight:850}}>Permissões por usuário</Typography>
        <Typography variant="body2" color="text.secondary" sx={{mt:.4,mb:1.5}}>Defina exatamente quais rotinas cada usuário pode acessar. Administradores permanecem com acesso integral.</Typography>
        <FormControl fullWidth size="small" sx={{mb:1.5}}><InputLabel shrink>Usuário</InputLabel><Select label="Usuário" value={permissionUserId} onChange={e=>setPermissionUserId(Number(e.target.value))} displayEmpty><MenuItem value=""><em>Selecione um usuário</em></MenuItem>{permissionUsers.map(user=><MenuItem key={user.id} value={user.id}>{user.name} · {user.role}</MenuItem>)}</Select></FormControl>
        {permissionUserId!=="" && (()=>{const selected=permissionUsers.find(user=>user.id===permissionUserId);if(!selected)return null;if(selected.role==="ADMIN")return <Alert severity="info">Administradores possuem acesso integral a todas as rotinas.</Alert>;const explicit=Array.isArray(selected.permissions);const defaults=selected.role==="COORDENADOR"?ROUTINE_PERMISSIONS.map(([key])=>key):["dashboard","tickets","my-operation","known-problems","attention","data-quality","clients","simer-map","performance","reports","corrections","evolutions","support","versions","knowledge"];const active=explicit?selected.permissions!:defaults;return <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(2,minmax(0,1fr))"},gap:.5}}>{ROUTINE_PERMISSIONS.map(([key,label])=><Stack key={key} direction="row" sx={{alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid",borderColor:"divider",py:.55}}><Typography variant="body2">{label}</Typography><Switch size="small" disabled={permissionSaving} checked={active.includes(key)} onChange={(_,checked)=>{const next=checked?[...active,key]:active.filter(item=>item!==key);void saveUserPermissions(selected.id,next)}}/></Stack>)}</Box>})()}
      </CardContent></Card>

      <Card variant="outlined" sx={{ mb: 2 }}><CardContent>
        <Typography sx={{fontWeight:850}}>Notificações</Typography>
        <Typography variant="body2" color="text.secondary" sx={{mt:.4,mb:1.5}}>Escolha quais eventos podem gerar avisos. Estas preferências também controlam os alertas rápidos no canto inferior direito.</Typography>
        <Stack>{([["sound","Som das notificações"],["chat","Chat e menções"],["operation","Alertas operacionais e problemas conhecidos"],["appVersion","Novas versões do Hub Suporte Simer"],["simerVersion","Novas versões do SIMER"],["azureCompleted","Correções, Evoluções e APOIOs concluídos"],["azureUpdated","Alterações em Correções, Evoluções e APOIOs"]] as Array<[keyof LocalNotificationPreferences,string]>).map(([key,label])=><Stack key={key} direction="row" sx={{py:.75,alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid",borderColor:"divider"}}><Typography variant="body2">{label}</Typography><Switch size="small" checked={notificationPreferences[key]} onChange={(_,enabled)=>changeNotificationPreference(key,enabled)}/></Stack>)}</Stack>
      </CardContent></Card>


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
        <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5 }}>
          <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
            <Typography sx={{ fontWeight: 800 }}>Diagnóstico da plataforma</Typography>
            <Typography variant="body2" color="text.secondary">Versões e disponibilidade do ambiente compartilhado entre Web e Desktop.</Typography>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, 1fr)" }, gap: 1.5 }}>
              {[['Aplicação', diagnostics?.status], ['Versão', diagnostics?.appVersion], ['Ambiente', diagnostics?.runtime], ['Banco', diagnostics?.database?.status], ['Latência', diagnostics ? `${diagnostics.database.latencyMs} ms` : null]].map(([label, value]) => <Box key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ fontWeight: 750 }}>{value ?? "—"}</Typography></Box>)}
            </Box>
          </CardContent>
        </Card>

        <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5 }}>
          <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}><Box><Typography sx={{ fontWeight: 800 }}>Sessões ativas</Typography><Typography variant="body2" color="text.secondary">Um usuário não pode utilizar Web e Desktop simultaneamente. Sessões inativas expiram em cinco minutos.</Typography></Box><Chip label={`${sessions.length} ativa(s)`} color="success" variant="outlined" /></Stack>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1}>{sessions.map((session) => <Box key={session.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, p: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}><Box sx={{ minWidth: 0 }}><Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}><Typography sx={{ fontWeight: 800 }}>{session.user.name}</Typography><Chip size="small" label={session.clientType === "DESKTOP" ? "Desktop" : "Web"} /><Chip size="small" variant="outlined" label={session.appVersion || "Versão não informada"} /></Stack><Typography variant="caption" color="text.secondary">{session.deviceName || session.user.username} · atividade {new Date(session.lastActivityAt).toLocaleString("pt-BR")}</Typography></Box><Button size="small" color="error" onClick={() => void revokeSession(session.id)}>Encerrar</Button></Box>)}{!sessions.length && <Typography variant="body2" color="text.secondary">Nenhuma sessão ativa.</Typography>}</Stack>
          </CardContent>
        </Card>

        {window.techLeadHub?.platform === "win32" && window.techLeadHub.startup && <Card elevation={0} sx={{ border: "1px solid", borderColor: startupEnabled ? "rgba(24,199,122,.28)" : "divider", borderRadius: 2.5, background: startupEnabled ? "linear-gradient(120deg,rgba(24,199,122,.055),transparent)" : undefined }}>
          <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
            <Stack direction={{xs:"column",sm:"row"}} spacing={2} sx={{alignItems:{sm:"center"},justifyContent:"space-between"}}>
              <Box><Typography sx={{fontWeight:850}}>Inicialização com o Windows</Typography><Typography variant="body2" color="text.secondary">Mantenha o Hub Suporte Simer disponível desde o início da sessão para receber atualizações e avisos operacionais.</Typography></Box>
              <Stack direction="row" spacing={1} sx={{alignItems:"center"}}><Chip size="small" color={startupEnabled?"success":"default"} variant="outlined" label={startupEnabled?"Automático":"Manual"}/><Switch checked={startupEnabled} disabled={startupSaving} onChange={(_,checked)=>void changeStartup(checked)} slotProps={{input:{"aria-label":"Iniciar Hub Suporte Simer com o Windows"}}}/></Stack>
            </Stack>
          </CardContent>
        </Card>}

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

        <Card elevation={0} sx={{ border: "1px solid", borderColor: configuration?.movideskConfigured ? "rgba(24,199,122,.28)" : "divider", borderRadius: 2.5 }}>
          <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
              <Box>
                <Typography sx={{ fontWeight: 800 }}>Movidesk</Typography>
                <Typography variant="body2" color="text.secondary">Fonte operacional de tickets. Sincronização automática incremental a cada 60 minutos.</Typography>
              </Box>
              <Chip icon={configuration?.movideskConfigured ? <CloudDoneOutlined /> : <CloudOffOutlined />} label={configuration?.movideskConfigured ? "Token configurado" : "Não configurado"} color={configuration?.movideskConfigured ? "success" : "default"} variant="outlined" />
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <TextField label="Endpoint da API" value={form.movideskUrl} onChange={(event) => updateField("movideskUrl", event.target.value)} />
              <TextField type="password" label="Novo token Movidesk" value={form.movideskToken} onChange={(event) => updateField("movideskToken", event.target.value)} autoComplete="new-password" placeholder={configuration?.movideskConfigured ? "Deixe vazio para manter o token atual" : "Cole o token recebido"} helperText="O token atual nunca é exibido e fica criptografado no banco." />
            </Box>
            <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: "flex-end" }}>
              <Button variant="outlined" disabled={saving || previewingMovidesk || !configuration?.movideskConfigured || Boolean(form.movideskToken.trim())} onClick={() => void previewMovidesk()}>{previewingMovidesk ? "Validando amostra..." : "Validar amostra (25)"}</Button>
              <Button variant="contained" disabled={saving || previewingMovidesk || (!configuration?.movideskConfigured && !form.movideskToken.trim())} onClick={() => void saveAndTestMovidesk()}>{saving ? "Salvando e testando..." : form.movideskToken.trim() ? "Salvar e testar" : "Testar conexão salva"}</Button>
            </Stack>
            <Box sx={{ mt: 2, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
                <Box>
                  <Typography sx={{ fontWeight: 800 }}>Baseline Movidesk</Typography>
                  <Typography variant="body2" color="text.secondary">{movideskBaseline?.completed ? `Concluído · ${movideskBaseline.database.tickets} tickets na base` : movideskBaseline?.status === "RUNNING" ? "Carga FULL em execução em segundo plano." : "Pronto para a primeira carga completa."}</Typography>
                </Box>
                <Button variant="contained" disabled={baselineBusy || movideskBaseline?.status === "RUNNING" || movideskBaseline?.completed || !movideskPreview?.validForImport} onClick={() => void startMovideskBaseline()}>{movideskBaseline?.status === "RUNNING" ? "FULL em execução" : movideskBaseline?.completed ? "Baseline concluído" : "Iniciar carga FULL"}</Button>
              </Stack>
              {movideskBaseline?.result && <Typography variant="body2" sx={{ mt: 1 }}>Páginas: <b>{movideskBaseline.result.pages}</b> · Lidos: <b>{movideskBaseline.result.totalRows}</b> · Novos: <b>{movideskBaseline.result.created}</b> · Atualizados: <b>{movideskBaseline.result.updated}</b> · Erros: <b>{movideskBaseline.result.errors}</b></Typography>}
              {!movideskPreview?.validForImport && !movideskBaseline?.completed && <Alert severity="info" sx={{ mt: 1 }}>Valide a amostra da API para liberar a primeira carga FULL.</Alert>}
              {movideskBaseline?.error && <Alert severity="error" sx={{ mt: 1 }}>{movideskBaseline.error}</Alert>}
              {movideskCoverage && <Box sx={{ mt: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>Cobertura pós-carga · payload bruto {movideskCoverage.withRawData}/{movideskCoverage.total}</Typography>
                <Box sx={{ mt: 1, display: "grid", gridTemplateColumns: { xs: "repeat(2,1fr)", md: "repeat(4,1fr)" }, gap: 1 }}>
                  {Object.entries(movideskCoverage.coverage).map(([field,count]) => <Box key={field}><Typography variant="caption" color="text.secondary">{field}</Typography><Typography variant="body2" sx={{ fontWeight: 750 }}>{count}/{movideskCoverage.total}</Typography></Box>)}
                </Box>
              </Box>}
            </Box>
            {movideskPreview && <Box sx={{ mt: 2, p: 1.5, border: "1px solid", borderColor: movideskPreview.validForImport ? "success.main" : "warning.main", borderRadius: 1.5 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", mb: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>Pré-validação da API · somente leitura</Typography>
                <Chip size="small" color={movideskPreview.validForImport ? "success" : "warning"} label={movideskPreview.validForImport ? "Apto para importação" : "Revisão necessária"} />
              </Stack>
              <Typography variant="body2" color="text.secondary">{movideskPreview.sampleSize} ticket(s) analisados · {movideskPreview.issues.length} incompatibilidade(s) obrigatória(s) · nenhum dado gravado.</Typography>
              <Box sx={{ mt: 1.25, display: "grid", gridTemplateColumns: { xs: "repeat(2,1fr)", md: "repeat(4,1fr)" }, gap: 1 }}>
                {["owner","clients","category","serviceFirstLevel","serviceSecondLevel","status","slaAgreement","customFieldValues"].map((field) => <Box key={field}><Typography variant="caption" color="text.secondary">{field}</Typography><Typography variant="body2" sx={{ fontWeight: 750 }}>{movideskPreview.coverage[field] ?? 0}/{movideskPreview.sampleSize}</Typography></Box>)}
              </Box>
              {movideskPreview.issues.length > 0 && <Alert severity="warning" sx={{ mt: 1.5 }}>Há tickets sem {movideskPreview.requiredFields.join(", ")}. A carga FULL deve permanecer bloqueada até revisão.</Alert>}
            </Box>}
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
