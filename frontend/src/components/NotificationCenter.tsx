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
} from "@mui/material";

import {
  CheckCircleOutlined,
  Inventory2Outlined,
  NotificationsNoneOutlined,
  OpenInNewOutlined,
  TaskAltOutlined,
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

type NotificationKind =
  | "APP_VERSION"
  | "SIMER_VERSION"
  | "AZURE_COMPLETED"
  | "AZURE_UPDATED";

type HubNotification = {
  key: string;
  kind: NotificationKind;
  title: string;
  message: string;
  occurredAt: string;
  path: string;
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
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HubNotification[]>([]);
  const [readKeys, setReadKeys] = useState<string[]>([]);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [showPreferences, setShowPreferences] = useState(false);
  const alertedKeys = useRef(new Set<string>());

  const storageKey = `techlead-hub:notifications:read:${user?.id ?? "anonymous"}`;

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
    if (!user) return;
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
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const updates = window.techLeadHub?.updates;
    if (!updates) return;

    void updates.getState().then(addDesktopUpdate).catch(() => undefined);
    return updates.onStateChange(addDesktopUpdate);
  }, [addDesktopUpdate]);

  const unread = useMemo(
    () => items.filter((item) => !readKeys.includes(item.key)),
    [items, readKeys],
  );

  useEffect(() => {
    const newest = unread[0];
    if (!newest || !preferences.desktopAlerts || Notification.permission !== "granted") return;
    if (alertedKeys.current.has(newest.key)) return;

    const age = Date.now() - new Date(newest.occurredAt).getTime();
    if (age < 10 * 60_000) {
      alertedKeys.current.add(newest.key);
      const alert = new Notification(newest.title, { body: newest.message });
      alert.onclick = () => navigate(newest.path);
    }
  }, [unread, navigate, preferences.desktopAlerts]);

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
    navigate(item.path);
  }

  function markAllRead() {
    persistReadKeys([...readKeys, ...items.map((item) => item.key)]);
    void api.post("/notifications/read", { keys: items.map((item) => item.key) });
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
          boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
          "&:hover": { backgroundColor: "background.paper" },
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
              <Icon sx={{ mt: 0.2, color: isUnread ? aliareColors.green : "text.secondary" }} />
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
    </>
  );
}
