import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Switch,
  Typography,
  Snackbar,
  Alert,
} from "@mui/material";

import {
  CheckCircleOutlined,
  Inventory2Outlined,
  NotificationsNoneOutlined,
  OpenInNewOutlined,
  TaskAltOutlined,
  AlternateEmailOutlined,
  WarningAmberOutlined,
  VideoCallOutlined,
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
  useLocation,
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
import { getLocalNotificationPreferences, saveLocalNotificationPreferences, playNotificationSound, type LocalNotificationPreferences } from "../utils/notificationSound";

type NotificationKind =
  | "APP_VERSION"
  | "SIMER_VERSION"
  | "AZURE_COMPLETED"
  | "AZURE_UPDATED"
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
  const location = useLocation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [toastQueue, setToastQueue] = useState<HubNotification[]>([]);
  const toast = toastQueue[0] ?? null;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HubNotification[]>([]);
  const [readKeys, setReadKeys] = useState<string[]>([]);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [showPreferences, setShowPreferences] = useState(false);
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
    const limited = keys.slice(-500);
    setReadKeys(limited);
    localStorage.setItem(storageKey, JSON.stringify(limited));
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
      setPreferences(response.data.preferences);
      setReadKeys(response.data.notifications.filter((item) => item.read).map((item) => item.key));
      setItems((current) => {
        const appItems = current.filter((item) => item.kind === "APP_VERSION");
        return [...appItems, ...response.data.notifications];
      });
    } catch (error) {
      console.warn("[notifications] Não foi possível carregar:", error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [userId]);

  const loadMeetingReminders = useCallback(async () => {
    if (!userId || meetingLoadingRef.current || Date.now() < meetingRetryAtRef.current) return;
    meetingLoadingRef.current = true;
    try {
      const response = await api.get<{ notifications: HubNotification[] }>("/notifications/meetings");
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

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    void loadMeetingReminders();
    const timer = window.setInterval(() => void loadMeetingReminders(), 15_000);
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

  const enabledForKind = useCallback((kind: NotificationKind) => kind === "CHAT_MENTION" ? localPreferences.chat : (kind === "OPERATION_ALERT" || kind === "KNOWN_PROBLEM" || kind === "MEETING_REMINDER") ? localPreferences.operation : kind === "APP_VERSION" ? localPreferences.appVersion : kind === "SIMER_VERSION" ? localPreferences.simerVersion : kind === "AZURE_COMPLETED" ? localPreferences.azureCompleted : localPreferences.azureUpdated, [localPreferences]);
  const unread = useMemo(
    () => items.filter((item) => enabledForKind(item.kind) && !readKeys.includes(item.key)),
    [items, readKeys, enabledForKind],
  );

  useEffect(() => {
    const now = Date.now();
    const candidates = unread
      .filter((item) => !alertedKeys.current.has(item.key))
      .filter((item) => {
        if (notificationHydratedRef.current) return true;
        const age = now - new Date(item.occurredAt).getTime();
        return item.kind === "MEETING_REMINDER" || (age >= 0 && age < 10 * 60_000);
      })
      .sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime());

    if (!notificationHydratedRef.current) {
      const candidateKeys = new Set(candidates.map((item) => item.key));
      unread.forEach((item) => {
        if (!candidateKeys.has(item.key)) alertedKeys.current.add(item.key);
      });
      notificationHydratedRef.current = true;
    }

    if (!candidates.length) return;
    candidates.forEach((item) => alertedKeys.current.add(item.key));
    setToastQueue((current) => {
      const existing = new Set(current.map((item) => item.key));
      return [...current, ...candidates.filter((item) => !existing.has(item.key))].slice(0, 30);
    });
  }, [unread]);

  const meetingPath = useCallback((meetingId: number) => {
    const params = new URLSearchParams(location.search);
    params.set("meeting", String(meetingId));
    return `${location.pathname}?${params.toString()}`;
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!toast) return;
    playNotificationSound(toast.kind === "CHAT_MENTION" ? "chat" : "system");
    if (preferences.desktopAlerts && "Notification" in window && Notification.permission === "granted") {
      const alert = new Notification(toast.title, { body: toast.message });
      alert.onclick = () => {
        window.focus();
        navigate(toast.kind === "MEETING_REMINDER" && toast.meetingId ? meetingPath(toast.meetingId) : toast.path);
        alert.close();
      };
    }
  }, [toast, navigate, preferences.desktopAlerts, meetingPath]);

  useEffect(() => {
    alertedKeys.current.clear();
    notificationHydratedRef.current = false;
    setToastQueue([]);
  }, [userId]);

  async function openMenu(event: MouseEvent<HTMLElement>) {
    setAnchor(event.currentTarget);
    if (Notification.permission === "default") {
      await Notification.requestPermission().catch(() => "denied");
    }
    void load();
  }

  function openNotification(item: HubNotification) {
    if (!readKeys.includes(item.key)) {
      persistReadKeys([...readKeys, item.key]);
      void api.post("/notifications/read", { keys: [item.key] });
    }
    setAnchor(null);
    navigate(item.kind === "MEETING_REMINDER" && item.meetingId ? meetingPath(item.meetingId) : item.path);
  }

  function markAllRead() {
    persistReadKeys([...readKeys, ...items.map((item) => item.key)]);
    void api.post("/notifications/read", { keys: items.map((item) => item.key) });
  }

  function changeLocalPreference(key: keyof LocalNotificationPreferences, checked: boolean) {
    const next = { ...localPreferences, [key]: checked };
    setLocalPreferences(next); saveLocalNotificationPreferences(next);
  }

  function changePreference(key: keyof NotificationPreferences, checked: boolean) {
    const next = { ...preferences, [key]: checked };
    setPreferences(next);
    void api.put("/notifications/preferences", next);
  }

  return (
    <>
      <IconButton
        aria-label="Abrir notificações"
        onClick={openMenu}
        sx={{
          width: 46,
          height: 46,
          border: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.paper",
          borderRadius: "50%",
          boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
          "&:hover": { backgroundColor: "background.paper", borderColor: "rgba(24,199,122,.45)" },
        }}
      >
        <Badge badgeContent={unread.length} color="error" max={99}>
          <NotificationsNoneOutlined />
        </Badge>
      </IconButton>

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
          <Button size="small" onClick={markAllRead} disabled={unread.length === 0}>
            Marcar lidas
          </Button>
        </Stack>
        <Divider />

        {loading && items.length === 0 && (
          <Box sx={{ py: 4, textAlign: "center" }}><CircularProgress size={24} /></Box>
        )}

        {!loading && items.length === 0 && (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <NotificationsNoneOutlined color="disabled" />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Nenhuma notificação no momento.
            </Typography>
          </Box>
        )}

        {items.map((item) => {
          const isUnread = !readKeys.includes(item.key);
          const Icon = item.kind === "APP_VERSION"
            ? Inventory2Outlined
            : item.kind === "SIMER_VERSION"
              ? OpenInNewOutlined
              : item.kind === "MEETING_REMINDER"
                ? VideoCallOutlined
              : item.kind === "CHAT_MENTION"
                ? AlternateEmailOutlined
                : (item.kind === "OPERATION_ALERT" || item.kind === "KNOWN_PROBLEM")
                  ? WarningAmberOutlined
              : item.kind === "AZURE_COMPLETED"
                ? CheckCircleOutlined
                : TaskAltOutlined;

          return (
            <MenuItem
              key={item.key}
              onClick={() => openNotification(item)}
              sx={{
                alignItems: "flex-start",
                gap: 1.2,
                px: 2,
                py: 1.25,
                whiteSpace: "normal",
                backgroundColor: isUnread ? "rgba(24,199,122,0.07)" : "transparent",
              }}
            >
              <Icon sx={{ mt: 0.2, color: (item.kind === "OPERATION_ALERT" || item.kind === "KNOWN_PROBLEM") ? "warning.main" : isUnread ? aliareColors.green : "text.secondary" }} />
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
            <Typography variant="caption" sx={{ fontWeight: 850, color: "text.secondary", mb: .5 }}>Canais e sons</Typography>
            {([["sound","Som das notificações"],["chat","Chat e menções"],["operation","Alertas operacionais e reuniões"]] as Array<[keyof LocalNotificationPreferences,string]>).map(([key,label]) => <FormControlLabel key={key} control={<Switch size="small" checked={localPreferences[key]} onChange={(_,checked)=>changeLocalPreference(key,checked)} />} label={label} sx={{ "& .MuiFormControlLabel-label": { fontSize: "0.76rem" } }} />)}
            <Divider sx={{ my: .75 }} />
            <Typography variant="caption" sx={{ fontWeight: 850, color: "text.secondary", mb: .5 }}>Sistema e desenvolvimento</Typography>
            {([
              ["appVersion", "Versões do TechLead Hub"],
              ["simerVersion", "Versões do SIMER"],
              ["azureCompleted", "Tarefas concluídas"],
              ["azureUpdated", "Alterações em tarefas"],
              ["desktopAlerts", "Avisos do Windows"],
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
        autoHideDuration={8000}
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
          sx={{cursor:"pointer",minWidth:{sm:360},maxWidth:{sm:480},boxShadow:"0 16px 42px rgba(0,0,0,.28)"}}
        >
          <Typography sx={{fontWeight:850,fontSize:".82rem"}}>{toast?.title}</Typography>
          <Typography sx={{fontSize:".76rem",opacity:.92}}>{toast?.message}</Typography>
          {toastQueue.length > 1 && <Typography variant="caption" sx={{display:"block",mt:.45,opacity:.78}}>{toastQueue.length-1} notificação(ões) aguardando</Typography>}
        </Alert>
      </Snackbar>
    </>
  );
}
