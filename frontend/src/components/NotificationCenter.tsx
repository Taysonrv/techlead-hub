import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  Menu,
  MenuItem,
  Stack,
  Switch,
  Typography,
  Snackbar,
  Alert,
} from "@mui/material";

import {
  CheckCircleRounded,
  Inventory2Rounded,
  NotificationsActiveRounded,
  OpenInNewOutlined,
  TaskAltRounded,
  AlternateEmailRounded,
  WarningAmberRounded,
  VideoCallRounded,
  PersonAddAltRounded,
} from "@mui/icons-material";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  useAuth,
} from "../context/AuthContext";

import {
  api,
} from "../services/api";

import {
  aliareColors,
} from "../theme/theme";
import { getLocalNotificationPreferences, saveDesktopAlertsEnabled, saveLocalNotificationPreferences, playNotificationSound, type LocalNotificationPreferences } from "../utils/notificationSound";
import { mergeNotificationItems } from "../utils/notificationItems";
import { TopBarActionButton } from "./TopBarActionButton";

type NotificationKind =
  | "APP_VERSION"
  | "SIMER_VERSION"
  | "AZURE_COMPLETED"
  | "AZURE_UPDATED"
  | "USER_ONLINE"
  | "CHAT_MENTION"
  | "OPERATION_ALERT"
  | "KNOWN_PROBLEM"
  | "MEETING_REMINDER";

type HubNotification = {
  key: string;
  kind: NotificationKind;
  title: string;
  message: string;
  occurredAt: string;
  path: string;
  meetingId?: number;
  read?: boolean;
};

type NotificationResponse = {
  notifications: HubNotification[];
  preferences: NotificationPreferences;
};

type NotificationPreferences = {
  appVersion: boolean;
  simerVersion: boolean;
  azureCompleted: boolean;
  azureUpdated: boolean;
  desktopAlerts: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  appVersion: true,
  simerVersion: true,
  azureCompleted: true,
  azureUpdated: true,
  desktopAlerts: true,
};

type DesktopUpdateState = {
  status: "idle" | "disabled" | "checking" | "available" |
    "not-available" | "downloading" | "downloaded" | "error";
  availableVersion: string | null;
};

export function NotificationCenter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [toastQueue, setToastQueue] = useState<HubNotification[]>([]);
  const toast = toastQueue[0] ?? null;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError,setLoadError] = useState("");
  const [saving,setSaving] = useState(false);
  const identityRef=useRef(userId);
  identityRef.current=userId;
  const [items, setItems] = useState<HubNotification[]>([]);
  const [readKeys, setReadKeys] = useState<string[]>([]);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [showPreferences, setShowPreferences] = useState(false);
  const [onlyUnread,setOnlyUnread] = useState(false);
  const [localPreferences, setLocalPreferences] = useState<LocalNotificationPreferences>(() => getLocalNotificationPreferences());
  const alertedKeys = useRef(new Set<string>());
  const notificationHydratedRef = useRef(false);
  const loadingRef = useRef(false);
  const meetingLoadingRef = useRef(false);
  const meetingRetryAtRef = useRef(0);

  const storageKey = `techlead-hub:notifications:read:${user?.id ?? "anonymous"}`;

  useEffect(() => {
    const syncPreferences = () => setLocalPreferences(getLocalNotificationPreferences());
    window.addEventListener("techlead-hub:notification-preferences", syncPreferences);
    window.addEventListener("storage", syncPreferences);
    return () => { window.removeEventListener("techlead-hub:notification-preferences", syncPreferences); window.removeEventListener("storage", syncPreferences); };
  }, []);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      setReadKeys(Array.isArray(stored) ? stored : []);
    } catch {
      setReadKeys([]);
    }
  }, [storageKey]);

  const persistReadKeys = useCallback((keys: string[]) => {
    let stored: string[] = [];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(parsed)) stored = parsed.filter((key): key is string => typeof key === "string");
    } catch { /* estado local opcional */ }
    const limited = [...new Set([...stored, ...keys])].slice(-500);
    setReadKeys(limited);
    try { localStorage.setItem(storageKey, JSON.stringify(limited)); } catch { /* leitura persistida no servidor */ }
  }, [storageKey]);

  const addDesktopUpdate = useCallback((state: DesktopUpdateState) => {
    if (!preferences.appVersion) return;
    if (
      state.status !== "available" &&
      state.status !== "downloaded"
    ) {
      return;
    }

    const version = state.availableVersion ?? "disponível";
    const notification: HubNotification = {
      key: `app-version:${version}`,
      kind: "APP_VERSION",
      title: "Nova versão do TechLead Hub",
      message: state.status === "downloaded"
        ? `A versão ${version} está pronta para instalar.`
        : `A versão ${version} está disponível para atualização.`,
      occurredAt: new Date().toISOString(),
      path: "/sobre",
    };

    setItems((current) => [
      notification,
      ...current.filter((item) => item.key !== notification.key),
    ]);
  }, [preferences.appVersion]);

  const load = useCallback(async () => {
    if (!userId || loadingRef.current) return;
    loadingRef.current = true;
    try {
      setLoading(true);
      const response = await api.get<NotificationResponse>("/notifications");
      if(identityRef.current!==userId) return;
      setLoadError("");
      setPreferences(response.data.preferences);
      saveDesktopAlertsEnabled(userId, response.data.preferences.desktopAlerts);
      let storedReadKeys: string[] = [];
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
        if (Array.isArray(stored)) storedReadKeys = stored.filter((key): key is string => typeof key === "string");
      } catch { /* estado local opcional */ }
      const serverReadKeys = response.data.notifications.filter((item) => item.read).map((item) => item.key);
      setReadKeys([...new Set([...storedReadKeys, ...serverReadKeys])].slice(-500));
      setItems(current=>mergeNotificationItems(current,response.data.notifications));
    } catch (error) {
      if(identityRef.current===userId) setLoadError("Não foi possível atualizar as notificações. Tente novamente.");
      console.warn("[notifications] Não foi possível carregar:", error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [userId, storageKey]);

  const loadMeetingReminders = useCallback(async () => {
    if (!userId || meetingLoadingRef.current || Date.now() < meetingRetryAtRef.current) return;
    meetingLoadingRef.current = true;
    try {
      const response = await api.get<{ notifications: HubNotification[] }>("/notifications/meetings");
      if(identityRef.current!==userId) return;
      meetingRetryAtRef.current = 0;
      const meetingItems = response.data.notifications ?? [];
      setItems((current) => {
        const otherItems = current.filter((item) => item.kind !== "MEETING_REMINDER");
        return [...meetingItems, ...otherItems]
          .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
          .slice(0, 80);
      });
    } catch (error) {
      const response = (error as { response?: { status?: number; headers?: Record<string,string>; data?: { retryAfterSeconds?: number } } }).response;
      if (response?.status === 429) {
        const headerSeconds = Number(response.headers?.["retry-after"] ?? 0);
        const payloadSeconds = Number(response.data?.retryAfterSeconds ?? 0);
        const retrySeconds = Number.isFinite(payloadSeconds) && payloadSeconds > 0
          ? payloadSeconds
          : Number.isFinite(headerSeconds) && headerSeconds > 0
            ? headerSeconds
            : 30;
        meetingRetryAtRef.current = Date.now() + Math.max(5, retrySeconds) * 1_000;
      } else {
        console.warn("[notifications] Não foi possível carregar lembretes de reunião:", error);
      }
    } finally {
      meetingLoadingRef.current = false;
    }
  }, [userId]);

  // Presença global: o usuário aparece online em qualquer tela autenticada.
  useEffect(() => {
    if (!userId) return;
    const heartbeat = () => {
      if (document.visibilityState !== "visible") return;
      void api.post("/chat/presence", { status: "ONLINE", source: "global" }).catch(() => undefined);
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 30_000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [userId]);

  useEffect(() => {
    void load();
    const interval = window.techLeadHub ? 30_000 : 60_000;
    const timer = window.setInterval(() => { if(window.techLeadHub || document.visibilityState!=="hidden") void load(); }, interval);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    void loadMeetingReminders();
    const timer = window.setInterval(() => { if(window.techLeadHub || document.visibilityState!=="hidden") void loadMeetingReminders(); }, 30_000);
    const refresh = () => { void loadMeetingReminders(); };
    window.addEventListener("techlead-hub:notifications-refresh", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("techlead-hub:notifications-refresh", refresh);
    };
  }, [loadMeetingReminders]);

  useEffect(() => {
    const updates = window.techLeadHub?.updates;
    if (!updates) return;

    void updates.getState().then(addDesktopUpdate).catch(() => undefined);
    return updates.onStateChange(addDesktopUpdate);
  }, [addDesktopUpdate]);

  const enabledForKind = useCallback((kind: NotificationKind) => kind === "USER_ONLINE" ? localPreferences.chat : kind === "CHAT_MENTION" ? localPreferences.chat : (kind === "OPERATION_ALERT" || kind === "KNOWN_PROBLEM" || kind === "MEETING_REMINDER") ? localPreferences.operation : kind === "APP_VERSION" ? localPreferences.appVersion : kind === "SIMER_VERSION" ? localPreferences.simerVersion : kind === "AZURE_COMPLETED" ? localPreferences.azureCompleted : localPreferences.azureUpdated, [localPreferences]);
  const unread = useMemo(
    () => items.filter((item) => enabledForKind(item.kind) && !readKeys.includes(item.key)),
    [items, readKeys, enabledForKind],
  );

  const openNotification = useCallback((item: HubNotification) => {
    if (!readKeys.includes(item.key)) {
      persistReadKeys([...readKeys, item.key]);
      void api.post("/notifications/read", { keys: [item.key] }).catch(() => {
        setLoadError("Não foi possível salvar a leitura da notificação.");
        void load();
      });
    }
    setAnchor(null);
    navigate(item.path);
  }, [readKeys, persistReadKeys, load, navigate]);

  // Pop-ups são avisos transitórios, não uma caixa de entrada paralela.
  // Histórico completo permanece no sino. Chaves já exibidas nesta sessão
  // sobrevivem a remounts/navegação, sem incluir conteúdos confidenciais.
  useEffect(() => {
    if (!userId || !items.length) return;
    const sessionKey = `techlead-hub:notifications:shown:${userId}`;
    if (!notificationHydratedRef.current) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(sessionKey) ?? "[]");
        if (Array.isArray(stored)) stored.filter((key): key is string => typeof key === "string").forEach((key) => alertedKeys.current.add(key));
      } catch { /* armazenamento de sessão opcional */ }
    }

    const now = Date.now();
    const unseen = unread
      .filter((item) => !alertedKeys.current.has(item.key))
      .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());
    const fresh = unseen.filter((item) => {
      const age = now - new Date(item.occurredAt).getTime();
      return Number.isFinite(age) && age >= 0 && age < 5 * 60_000;
    });
    const isUrgent = (item: HubNotification) =>
      item.kind === "CHAT_MENTION" || item.kind === "MEETING_REMINDER" ||
      item.kind === "OPERATION_ALERT";
    const hiddenDesktopBatch = document.visibilityState === "hidden" && preferences.desktopAlerts
      ? fresh.slice(0, 2)
      : [];
    const toShow = document.visibilityState === "visible"
      ? fresh.filter(isUrgent).slice(0, 2)
      : [];

    if (document.visibilityState === "hidden" && preferences.desktopAlerts) {
      hiddenDesktopBatch.forEach((item) => {
        if (window.techLeadHub?.notifications) {
          void window.techLeadHub.notifications.show({
            key: item.key,
            title: item.title,
            body: item.message,
            silent: !localPreferences.sound,
          }).then((shown) => {
            if (shown) return;
            if ("Notification" in window && Notification.permission === "granted") {
              const native = new Notification(item.title, { body: item.message, silent: !localPreferences.sound });
              native.onclick = () => window.focus();
              window.setTimeout(() => native.close(), 8_000);
            }
          }).catch(() => undefined);
          return;
        }
        if ("Notification" in window && Notification.permission === "granted") {
          const native = new Notification(item.title, { body: item.message, silent: !localPreferences.sound });
          native.onclick = () => window.focus();
          window.setTimeout(() => native.close(), 8_000);
        }
      });
    }
    const hiddenBatchKeys = new Set(hiddenDesktopBatch.map((item) => item.key));
    const freshKeys = new Set(fresh.map((item) => item.key));
    unseen.forEach((item) => {
      // Deixa os próximos itens recentes para a próxima consulta, em vez de
      // descartá-los quando mais de dois avisos chegam no mesmo intervalo.
      if (document.visibilityState === "hidden" && preferences.desktopAlerts && freshKeys.has(item.key) && !hiddenBatchKeys.has(item.key)) return;
      alertedKeys.current.add(item.key);
    });
    notificationHydratedRef.current = true;
    try { sessionStorage.setItem(sessionKey, JSON.stringify([...alertedKeys.current].slice(-500))); } catch { /* opcional */ }
    if (toShow.length) setToastQueue((current) => {
      const keys = new Set(current.map((item) => item.key));
      return [...current, ...toShow.filter((item) => !keys.has(item.key))].slice(0, 2);
    });
  }, [unread, items.length, userId, preferences.desktopAlerts, localPreferences.sound, navigate, openNotification]);

  useEffect(() => {
    if (!toast) return;
    if (document.visibilityState === "visible") {
      playNotificationSound(toast.kind === "CHAT_MENTION" ? "chat" : "system");
    }

  }, [toast]);

  useEffect(() => {
    alertedKeys.current.clear();
    notificationHydratedRef.current = false;
    setToastQueue([]);setItems([]);setAnchor(null);setLoadError("");
  }, [userId]);

  function openMenu(event: MouseEvent<HTMLElement>) {
    setAnchor(event.currentTarget);
    void load();
  }

  async function markAllRead() {
    if(saving) return;
    setSaving(true);
    const keys=unread.map(item=>item.key);
    try {
      await api.post("/notifications/read", { keys });
      if(identityRef.current===userId) { persistReadKeys([...new Set([...readKeys,...keys])]);setLoadError(""); }
    } catch { setLoadError("Não foi possível marcar as notificações como lidas."); }
    finally { setSaving(false); }
  }

  function changeLocalPreference(key: keyof LocalNotificationPreferences, checked: boolean) {
    const next = { ...localPreferences, [key]: checked };
    setLocalPreferences(next); saveLocalNotificationPreferences(next);
  }

  function changePreference(key: keyof NotificationPreferences, checked: boolean) {
    if (key === "desktopAlerts" && checked && window.techLeadHub && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().then((permission) => {
        if (permission !== "granted") {
          setLoadError("A permissão de notificações do Windows não foi concedida. Você ainda pode usar o sino dentro do Hub.");
          return;
        }
        savePreferenceChange(key, checked);
      }).catch(() => setLoadError("Não foi possível solicitar a permissão de notificações do Windows."));
      return;
    }
    if (key === "desktopAlerts" && checked && window.techLeadHub && "Notification" in window && Notification.permission !== "granted") {
      setLoadError("A permissão de notificações do Windows está bloqueada. Ajuste-a nas configurações do sistema para ativar este canal.");
      return;
    }
    savePreferenceChange(key, checked);
  }

  function savePreferenceChange(key: keyof NotificationPreferences, checked: boolean) {
    const next = { ...preferences, [key]: checked };
    setPreferences(next);
    setLoadError("");
    if (key === "desktopAlerts") saveDesktopAlertsEnabled(userId, checked);
    void api.put("/notifications/preferences", next).catch(()=>{setLoadError("Não foi possível salvar suas preferências.");void load();});
  }

  return (
    <>
      <TopBarActionButton
        title="Notificações"
        aria-label="Abrir notificações"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        active={Boolean(anchor)}
        onClick={openMenu}
      >
        <Badge badgeContent={unread.length} color="error" max={99}>
          <NotificationsActiveRounded />
        </Badge>
      </TopBarActionButton>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.8,
              width: 390,
              maxWidth: "calc(100vw - 24px)",
              maxHeight: 560,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              boxShadow: "0 12px 34px rgba(0,0,0,0.14)",
            },
          },
        }}
      >
        <Stack direction="row" sx={{ px: 2, py: 1, alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography sx={{ fontWeight: 800 }}>Notificações</Typography>
            <Typography variant="caption" color="text.secondary">
              {unread.length} não lida(s)
            </Typography>
          </Box>
          <Button size="small" onClick={markAllRead} disabled={saving || unread.length === 0}>
            Marcar lidas
          </Button>
        </Stack>
        <Stack direction="row" sx={{px:2,pb:1,alignItems:"center",justifyContent:"space-between"}}>
          <FormControlLabel control={<Switch size="small" checked={onlyUnread} onChange={(_,checked)=>setOnlyUnread(checked)}/>} label={<Typography variant="caption">Somente não lidas</Typography>}/>
          <Button size="small" disabled={loading} onClick={()=>{void load();void loadMeetingReminders();}}>Atualizar</Button>
        </Stack>
        <Divider />

        {loadError && <Alert severity="warning" sx={{mx:1,my:1}} action={<Button size="small" onClick={()=>void load()}>Repetir</Button>}>{loadError}</Alert>}
        {loading && items.length === 0 && (
          <Box sx={{ py: 4, textAlign: "center" }}><CircularProgress size={24} /></Box>
        )}

        {!loading && !loadError && items.length === 0 && (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Box sx={{ width: 52, height: 52, mx: "auto", display: "grid", placeItems: "center", borderRadius: "18px", color: "primary.main", bgcolor: "rgba(24,199,122,.10)", border: "1px solid rgba(24,199,122,.2)", boxShadow: "0 0 24px rgba(24,199,122,.10)" }}>
              <NotificationsActiveRounded sx={{ fontSize: 27 }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Nenhuma notificação no momento.
            </Typography>
          </Box>
        )}

        {!loading && onlyUnread && unread.length===0 && items.length>0 && <Typography variant="body2" color="text.secondary" sx={{p:2}}>Nenhuma notificação não lida.</Typography>}
        {items.filter(item=>enabledForKind(item.kind)&&(!onlyUnread||!readKeys.includes(item.key))).map((item) => {
          const isUnread = !readKeys.includes(item.key);
          const Icon = item.kind === "APP_VERSION"
            ? Inventory2Rounded
            : item.kind === "SIMER_VERSION"
              ? OpenInNewOutlined
              : item.kind === "MEETING_REMINDER"
                ? VideoCallRounded
              : item.kind === "USER_ONLINE"
                ? PersonAddAltRounded
              : item.kind === "CHAT_MENTION"
                ? AlternateEmailRounded
                : (item.kind === "OPERATION_ALERT" || item.kind === "KNOWN_PROBLEM")
                  ? WarningAmberRounded
              : item.kind === "AZURE_COMPLETED"
                ? CheckCircleRounded
                : TaskAltRounded;
          const iconColor = item.kind === "OPERATION_ALERT" || item.kind === "KNOWN_PROBLEM"
            ? "#f59e0b"
            : item.kind === "MEETING_REMINDER"
              ? "#7c83ff"
              : item.kind === "CHAT_MENTION" || item.kind === "USER_ONLINE"
                ? "#20c9b5"
                : item.kind === "AZURE_COMPLETED"
                  ? "#18c77a"
                  : "#48a9ff";

          return (
            <MenuItem
              key={item.key}
              onClick={() => openNotification(item)}
              sx={{
                alignItems: "flex-start",
                gap: 1.35,
                px: 1.75,
                py: 1.35,
                whiteSpace: "normal",
                backgroundColor: isUnread ? "rgba(24,199,122,0.07)" : "transparent",
                borderLeft: isUnread ? "2px solid rgba(24,199,122,.8)" : "2px solid transparent",
                transition: "background-color .16s ease, border-color .16s ease",
                "&:hover": { backgroundColor: isUnread ? "rgba(24,199,122,.12)" : "action.hover" },
              }}
            >
              <Box sx={{ mt: .05, width: 36, height: 36, flex: "0 0 36px", display: "grid", placeItems: "center", borderRadius: "12px", color: iconColor, bgcolor: `${iconColor}18`, border: `1px solid ${iconColor}38`, boxShadow: isUnread ? `0 0 18px ${iconColor}20` : "none" }}>
                <Icon sx={{ fontSize: 20 }} />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: "0.82rem", fontWeight: isUnread ? 800 : 650 }}>
                  {item.title}
                </Typography>
                <Typography sx={{ fontSize: "0.74rem", color: "text.secondary", mt: 0.25 }}>
                  {item.message}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  {new Date(item.occurredAt).toLocaleString("pt-BR")}
                </Typography>
              </Box>
              {isUnread && <Box sx={{ mt: 0.7, width: 7, height: 7, borderRadius: "50%", bgcolor: aliareColors.green }} />}
            </MenuItem>
          );
        })}

        <Divider />
        <Button
          fullWidth
          size="small"
          onClick={() => setShowPreferences((current) => !current)}
          sx={{ py: 1 }}
        >
          {showPreferences ? "Ocultar preferências" : "Preferências de notificações"}
        </Button>
        {showPreferences && (
          <Stack sx={{ px: 2, pb: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 850, color: "text.secondary", mb: .5 }}>Neste dispositivo · sons e tipos exibidos</Typography>
            {([["sound","Som das notificações"],["chat","Chat e menções"],["operation","Alertas operacionais e reuniões"]] as Array<[keyof LocalNotificationPreferences,string]>).map(([key,label]) => <FormControlLabel key={key} control={<Switch size="small" checked={localPreferences[key]} onChange={(_,checked)=>changeLocalPreference(key,checked)} />} label={label} sx={{ "& .MuiFormControlLabel-label": { fontSize: "0.76rem" } }} />)}
            <Divider sx={{ my: .75 }} />
            <Typography variant="caption" sx={{ fontWeight: 850, color: "text.secondary", mb: .5 }}>Conta Hub · sincronizado entre dispositivos</Typography>
            {([
              ["appVersion", "Versões do TechLead Hub"],
              ["simerVersion", "Versões do SIMER"],
              ["azureCompleted", "Tarefas concluídas"],
              ["azureUpdated", "Alterações em tarefas"],
              ["desktopAlerts", "Avisos do Windows (somente Desktop)"],
            ] as Array<[keyof NotificationPreferences, string]>).map(([key, label]) => (
              <FormControlLabel
                key={key}
                control={
                  <Switch
                    size="small"
                    checked={preferences[key]}
                    onChange={(_, checked) => changePreference(key, checked)}
                  />
                }
                label={label}
                sx={{ "& .MuiFormControlLabel-label": { fontSize: "0.76rem" } }}
              />
            ))}
          </Stack>
        )}
      </Menu>
      <Snackbar
        key={toast?.key ?? "notification-toast"}
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={(_, reason) => { if (reason !== "clickaway") setToastQueue((current) => current.slice(1)); }}
        anchorOrigin={{vertical:"bottom",horizontal:"right"}}
      >
        <Alert
          severity={toast?.kind === "OPERATION_ALERT" || toast?.kind === "KNOWN_PROBLEM" ? "warning" : toast?.kind === "AZURE_COMPLETED" ? "success" : "info"}
          variant="filled"
          onClose={() => setToastQueue((current) => current.slice(1))}
          onClick={() => {
            if (!toast) return;
            const item = toast;
            setToastQueue((current) => current.slice(1));
            openNotification(item);
          }}
          sx={{ cursor:"pointer",width:{xs:"calc(100vw - 32px)",sm:360},maxWidth:360,minHeight:100,maxHeight:100,boxSizing:"border-box",alignItems:"flex-start",boxShadow:"0 10px 28px rgba(0,0,0,.20)","& .MuiAlert-icon":{mt:.5},"& .MuiAlert-message":{minWidth:0,overflow:"hidden",flex:1,py:.2},"& .MuiAlert-action":{pt:0} }}
        >
          <Typography sx={{fontWeight:850,fontSize:".82rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={toast?.title}>{toast?.title}</Typography>
          <Typography sx={{fontSize:".76rem",opacity:.92,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",overflowWrap:"anywhere"}} title={toast?.message}>{toast?.message}</Typography>
          
        </Alert>
      </Snackbar>
    </>
  );
}
