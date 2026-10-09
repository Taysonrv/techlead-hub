import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Collapse,
  IconButton,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem as MuiMenuItem,
  Stack,
  Typography,
  Snackbar,
  Paper,
  TextField,
  Tooltip,
  Dialog,
  DialogContent,
  DialogTitle,
  Chip,
} from "@mui/material";

import {
  AutoFixHighOutlined,
  BugReportOutlined,
  ConfirmationNumberOutlined,
  ExpandMoreRounded,
  ExpandLessRounded,
  InfoOutlined,
  Inventory2Outlined,
  LogoutOutlined,
  ManageAccountsOutlined,
  MenuBookOutlined,
  PersonOutlined,
  SettingsOutlined,
  SupportAgentOutlined,
  PsychologyOutlined,
  ChatBubbleOutlineRounded,
  HomeOutlined,
  BusinessOutlined,
  GroupsOutlined,
  WarningAmberOutlined,
  FactCheckOutlined,
  AssessmentOutlined,
  CampaignOutlined,
  OpenInNewRounded,
  SendRounded,
  RemoveRounded,
  CloseRounded,
  OpenInFullRounded,
  Circle,
  SearchOutlined,
  ShareOutlined,
  DoneAllRounded,
} from "@mui/icons-material";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";

import type {
  MouseEvent,
  ReactNode,
} from "react";

import {
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  useAuth,
  type UserRole,
} from "../context/AuthContext";
import { UserAvatar } from "./UserAvatar";
import { BugReportDialog } from "./BugReportDialog";
import { playNotificationSound } from "../utils/notificationSound";

import {
  api,
  getAccessToken,
} from "../services/api";

import {
  aliareColors,
} from "../theme/theme";

import {
  NotificationCenter,
} from "./NotificationCenter";

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

export const drawerWidth = 256;

/* =========================================================
   TIPOS
========================================================= */

type MenuItemData = {
  label: string;
  path: string;
  icon: ReactNode;
  badge?: number;
};

type PendingUsersResponse = {
  users: Array<{
    id: number;
  }>;
};

/* =========================================================
   SIDEBAR
========================================================= */

export function Sidebar() {
  const navigate =
    useNavigate();

  const location =
    useLocation();

  const {
    user,
    logout,
    isAdmin,
  } =
    useAuth();

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [chatPopup, setChatPopup] = useState<{ channelId: number; channelName: string; authorName: string; preview: string } | null>(null);
  const chatSnapshotRef = useRef<Map<number, { unread: number; lastMessageId: number | null }>>(new Map());
  type FloatingChat = { channelId: number; channelName: string; minimized: boolean; unread: number; peerId?: number; peerName?: string; presence?: "ONLINE" | "AWAY" | "BUSY" | "OFFLINE"; typingNames: string[]; messages: Array<{ id: number; content: string; createdAt: string; author: { id: number; name: string } }> };
  const [floatingChats, setFloatingChats] = useState<FloatingChat[]>([]);
  const [floatingDrafts, setFloatingDrafts] = useState<Record<number, string>>({});
  const [floatingSearch, setFloatingSearch] = useState<Record<number, string>>({});
  const [floatingSearchOpen, setFloatingSearchOpen] = useState<Record<number, boolean>>({});
  const [shareContext, setShareContext] = useState<{ label: string; recordId?: number; title: string; client?: string | null; status?: string | null; path: string } | null>(null);
  type SharePerson = { id: number; name: string; username: string; role: string };
  type ShareChannel = { id: number; name: string; type: string; updatedAt?: string; members?: Array<{ user: SharePerson }> };
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [sharePeople, setSharePeople] = useState<SharePerson[]>([]);
  const [shareChannels, setShareChannels] = useState<ShareChannel[]>([]);
  const [sharePresence, setSharePresence] = useState<Array<{ userId: number; effectiveStatus: "ONLINE" | "AWAY" | "BUSY" | "OFFLINE" }>>([]);
  const [shareSearch, setShareSearch] = useState("");
  const [shareSendingTo, setShareSendingTo] = useState<number | null>(null);
  const [sharePickerLoading, setSharePickerLoading] = useState(false);
  const floatingPollRef = useRef<number | null>(null);
  const floatingHydratedRef = useRef(false);

  useEffect(() => {
    if (!user || floatingHydratedRef.current) return;
    floatingHydratedRef.current = true;
    try {
      // Janelas flutuantes são transitórias. Não devem reaparecer ao navegar ou recarregar.
      localStorage.removeItem(`techlead-floating-chats-${user.id}`);
      setFloatingChats([]);
    } catch { localStorage.removeItem(`techlead-floating-chats-${user.id}`); }
  }, [user]);

  useEffect(() => {
    // Não persiste mini-chats: abrir/fechar é uma decisão da sessão de navegação atual.
  }, [floatingChats, user]);

  const [
    appVersion,
    setAppVersion,
  ] =
    useState("Beta");

  const [
    loggingOut,
    setLoggingOut,
  ] =
    useState(false);

  const [
    pendingUsers,
    setPendingUsers,
  ] =
    useState(0);



  const [
    profileAnchor,
    setProfileAnchor,
  ] =
    useState<HTMLElement | null>(null);

  const [openSections, setOpenSections] = useState<Record<"cadastros" | "movimentos" | "analises" | "development" | "gestao", boolean>>(() => ({
    // O sidebar sempre inicia com os grupos de rotinas recolhidos.
    // A expansão passa a ser uma ação explícita do usuário durante a sessão.
    cadastros: false,
    movimentos: false,
    analises: false,
    development: false,
    gestao: false,
  }));

  const profileMenuOpen =
    Boolean(profileAnchor);

  // O menu inicia recolhido. A navegação não força a abertura automática
  // de uma seção; o usuário decide quais grupos deseja expandir.

  useEffect(() => {
    if (!user) { setChatUnread(0); chatSnapshotRef.current.clear(); return; }
    type GlobalChatMessage = { id: number; content: string; author: { id: number; name: string } };
    type GlobalChatChannel = { id: number; name: string; type?: string; unread?: number; updatedAt?: string; members?: Array<{ user: SharePerson }>; messages?: GlobalChatMessage[] };
    const loadChatUnread = async () => {
      try {
        const response = await api.get<{ channels: GlobalChatChannel[] }>("/chat/channels");
        const channels = Array.isArray(response.data.channels) ? response.data.channels : [];
        setShareChannels(channels as ShareChannel[]);
        setChatUnread(channels.reduce((total, channel) => total + (channel.unread ?? 0), 0));

        const previous = chatSnapshotRef.current;
        if (previous.size && location.pathname !== "/chat") {
          const incoming = channels.flatMap((channel) => {
            const latest = channel.messages?.[channel.messages.length - 1];
            const before = previous.get(channel.id);
            return before && latest && latest.author.id !== user.id && (channel.unread ?? 0) > before.unread && latest.id !== before.lastMessageId
              ? [{ channel, latest }]
              : [];
          });
          const newest = incoming[incoming.length - 1];
          if (newest) {
            setChatPopup({
              channelId: newest.channel.id,
              channelName: newest.channel.name,
              authorName: newest.latest.author.name,
              preview: newest.latest.content.startsWith("[anexo] ") ? "📎 Enviou um arquivo" : newest.latest.content,
            });
            setFloatingChats((current) => current.map((item) => item.channelId === newest.channel.id ? { ...item, unread: item.minimized ? item.unread + 1 : item.unread } : item));
            if (localStorage.getItem("techlead-chat-sound") !== "off") playNotificationSound("chat");
          }
        }
        chatSnapshotRef.current = new Map(channels.map((channel) => [channel.id, {
          unread: channel.unread ?? 0,
          lastMessageId: channel.messages?.[channel.messages.length - 1]?.id ?? null,
        }]));
      } catch { /* chat global não deve afetar a navegação */ }
    };
    void loadChatUnread();
    const timer = window.setInterval(() => void loadChatUnread(), 8_000);
    const refresh = () => void loadChatUnread();
    window.addEventListener("techlead-hub:chat-read", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("techlead-hub:chat-read", refresh); };
  }, [user?.id, location.pathname]);

  const openFloatingChat = useCallback(async (channelId: number, channelName: string) => {
    try {
      const response = await api.get<{ messages: FloatingChat["messages"] }>(`/chat/channels/${channelId}/messages`);
      setFloatingChats((current) => {
        const existing = current.find((item) => item.channelId === channelId);
        if (existing) return current.map((item) => item.channelId === channelId ? { ...item, minimized: false, unread: 0, messages: response.data.messages } : item);
        return [...current.slice(-2), { channelId, channelName, minimized: false, unread: 0, typingNames: [], messages: response.data.messages }];
      });
      window.dispatchEvent(new Event("techlead-hub:chat-read"));
    } catch { navigate(`/chat?channel=${channelId}`); }
  }, [navigate]);

  const sendFloatingMessage = useCallback(async (channelId: number) => {
    const content = floatingDrafts[channelId]?.trim();
    if (!content) return;
    try {
      const response = await api.post<FloatingChat["messages"][number]>(`/chat/channels/${channelId}/messages`, { content });
      setFloatingChats((current) => current.map((item) => item.channelId === channelId ? { ...item, messages: [...item.messages, response.data] } : item));
      setFloatingDrafts((current) => ({ ...current, [channelId]: "" }));
    } catch { navigate(`/chat?channel=${channelId}`); }
  }, [floatingDrafts, navigate]);

  useEffect(() => {
    if (!floatingChats.length) return;
    const refresh = async () => {
      let channels: Array<{ id: number; type: string; members?: Array<{ user: { id: number; name: string } }> }> = [];
      let presenceRows: Array<{ userId: number; effectiveStatus: "ONLINE" | "AWAY" | "BUSY" | "OFFLINE" }> = [];
      let typingRows: Array<{ channelId: number; userId: number; name: string }> = [];

      try {
        const [channelsResponse, realtimeResponse] = await Promise.all([
          api.get<{ channels: typeof channels }>("/chat/channels"),
          api.get<{ presence: typeof presenceRows; typing: typeof typingRows }>("/chat/realtime"),
        ]);
        channels = channelsResponse.data.channels ?? [];
        presenceRows = realtimeResponse.data.presence ?? [];
        typingRows = realtimeResponse.data.typing ?? [];
      } catch {
        // Presença é complementar; mensagens continuam sendo atualizadas.
      }

      const messagesByChannel = new Map<number, FloatingChat["messages"]>();
      await Promise.all(floatingChats.map(async (item) => {
        try {
          const response = await api.get<{ messages: FloatingChat["messages"] }>(`/chat/channels/${item.channelId}/messages`);
          messagesByChannel.set(item.channelId, response.data.messages);
        } catch {
          // Uma conversa indisponível não deve interromper as demais.
        }
      }));

      setFloatingChats((current) => current.map((chat) => {
        const channel = channels.find((candidate) => candidate.id === chat.channelId);
        const peer = channel?.type === "DIRECT" ? channel.members?.find((member) => member.user.id !== user?.id)?.user : undefined;
        const peerPresence = peer ? presenceRows.find((entry) => entry.userId === peer.id)?.effectiveStatus : undefined;
        const typingNames = typingRows.filter((entry) => entry.channelId === chat.channelId && entry.userId !== user?.id).map((entry) => entry.name);
        return {
          ...chat,
          messages: messagesByChannel.get(chat.channelId) ?? chat.messages,
          peerId: peer?.id,
          peerName: peer?.name,
          presence: peerPresence,
          typingNames,
        };
      }));
    };

    void refresh();
    floatingPollRef.current = window.setInterval(() => void refresh(), 8_000);
    return () => { if (floatingPollRef.current) window.clearInterval(floatingPollRef.current); floatingPollRef.current = null; };
  }, [floatingChats.map((item) => item.channelId).join(","), user?.id]);

  useEffect(() => {
    const receiveShare = (event: Event) => {
      const detail = (event as CustomEvent<{ label?: string; recordId?: number; title?: string; client?: string | null; status?: string | null; path?: string }>).detail;
      if (!detail?.title) return;
      const context = { label: detail.label || "Registro", recordId: detail.recordId, title: detail.title, client: detail.client, status: detail.status, path: detail.path || location.pathname + location.search };
      setShareContext(context);
      setShareSearch("");
      setSharePickerOpen(true);
      setSharePickerLoading(sharePeople.length === 0);
      void api.get<{ participants?: SharePerson[]; users?: SharePerson[] }>("/chat/participants").then((people) => {
        setSharePeople(people.data.participants || people.data.users || []);
      }).finally(() => setSharePickerLoading(false));
      void api.get<{ presence: Array<{ userId: number; effectiveStatus: "ONLINE" | "AWAY" | "BUSY" | "OFFLINE" }> }>("/chat/realtime").then((realtime) => setSharePresence(realtime.data.presence || []));
      if (!shareChannels.length) void api.get<{ channels: ShareChannel[] }>("/chat/channels").then((channels) => setShareChannels(channels.data.channels || []));
    };
    window.addEventListener("techlead-hub:share-chat", receiveShare);
    return () => window.removeEventListener("techlead-hub:share-chat", receiveShare);
  }, [location.pathname, location.search, sharePeople.length, shareChannels.length]);

  const sendSharedRecordToPerson = useCallback(async (person: SharePerson) => {
    if (!shareContext || shareSendingTo) return;
    setShareSendingTo(person.id);
    try {
      const existing = shareChannels.find((channel) => channel.type === "DIRECT" && channel.members?.some((member) => member.user.id === person.id) && channel.members?.some((member) => member.user.id === user?.id));
      const channel = existing ?? (await api.post<ShareChannel>(`/chat/direct/${person.id}`)).data;
      const content = `[hub-card]${JSON.stringify({ type: shareContext.label, id: shareContext.recordId, title: shareContext.title, client: shareContext.client || null, status: shareContext.status || null, path: shareContext.path })}`;
      await api.post(`/chat/channels/${channel.id}/messages`, { content });
      setSharePickerOpen(false);
      setShareContext(null);
      setShareChannels((current) => current.some((item) => item.id === channel.id) ? current : [channel, ...current]);
      await openFloatingChat(channel.id, channel.name || person.name);
    } catch {
      navigate(`/chat?share=${encodeURIComponent(JSON.stringify(shareContext))}`);
    } finally { setShareSendingTo(null); }
  }, [shareContext, shareSendingTo, shareChannels, user?.id, openFloatingChat, navigate]);

  const shareIntoFloatingChat = useCallback((channelId: number) => {
    if (!shareContext) return;
    const text = `[hub-card]${JSON.stringify({ type: shareContext.label, id: shareContext.recordId, title: shareContext.title, client: shareContext.client || null, status: shareContext.status || null, path: shareContext.path })}`;
    setFloatingDrafts((current) => ({ ...current, [channelId]: [current[channelId], text].filter(Boolean).join("\n") }));
    setShareContext(null);
  }, [shareContext]);

  /* =======================================================
     VERSÃO DO APLICATIVO
  ======================================================= */

  useEffect(() => {
    let mounted =
      true;

    async function loadVersion() {
      try {
        if (
          !window.techLeadHub
        ) {
          return;
        }

        const version =
          await window.techLeadHub.getVersion();

        if (mounted) {
          setAppVersion(
            `v${version}`,
          );
        }
      } catch (
        error
      ) {
        console.error(
          "Erro ao carregar versão do aplicativo:",
          error,
        );
      }
    }

    void loadVersion();

    return () => {
      mounted =
        false;
    };
  }, []);

  /* =======================================================
     USUÁRIOS PENDENTES
  ======================================================= */

  const loadPendingUsers =
    useCallback(
      async () => {
        if (!isAdmin) {
          setPendingUsers(0);
          return;
        }

        try {
          const response =
            await api.get<PendingUsersResponse>(
              "/users/pending",
            );

          setPendingUsers(
            response.data.users.length,
          );
        } catch (
          error
        ) {
          console.warn(
            "[sidebar] Não foi possível carregar usuários pendentes:",
            error,
          );
        }
      },
      [
        isAdmin,
      ],
    );

  useEffect(() => {
    void loadPendingUsers();
  }, [
    loadPendingUsers,
  ]);

  useEffect(() => {
    if (
      isAdmin &&
      location.pathname ===
        "/usuarios"
    ) {
      void loadPendingUsers();
    }
  }, [
    isAdmin,
    location.pathname,
    loadPendingUsers,
  ]);

  /* =======================================================
     ROTINAS - MESMO AGRUPAMENTO DA CENTRAL DA COORDENAÇÃO
  ======================================================= */

  const canAccess = (permission: string) =>
    user?.role === "ADMIN" ||
    (Array.isArray(user?.permissions)
      ? user.permissions.includes(permission)
      : user?.role === "COORDENADOR" ||
        ["dashboard","tickets","my-operation","known-problems","attention","data-quality","clients","simer-map","performance","reports","corrections","evolutions","support","versions","knowledge"].includes(permission));

  const registrationMenu = useMemo<MenuItemData[]>(
    () => [
      ...(canAccess("analysts") ? [{ label: "Analistas", path: "/analistas", icon: <GroupsOutlined fontSize="small" /> }] : []),
      ...(canAccess("clients") ? [{ label: "Clientes", path: "/clientes", icon: <BusinessOutlined fontSize="small" /> }] : []),
    ],
    [user?.role, user?.permissions],
  );

  const movementMenu = useMemo<MenuItemData[]>(
    () => [
      ...(canAccess("tickets") ? [{ label: "Operação", path: "/operacao/tickets", icon: <ConfirmationNumberOutlined fontSize="small" /> }] : []),
      ...(canAccess("known-problems") ? [{ label: "Problemas Conhecidos", path: "/problemas-conhecidos", icon: <CampaignOutlined fontSize="small" /> }] : []),
      ...(canAccess("attention") ? [{ label: "Pendências & Riscos", path: "/pendencias-riscos", icon: <WarningAmberOutlined fontSize="small" /> }] : []),
    ],
    [user?.role, user?.permissions],
  );

  const analysisMenu = useMemo<MenuItemData[]>(
    () => [
      ...(canAccess("dashboard") ? [{ label: "Gestão & Inteligência", path: "/gestao-inteligencia", icon: <PsychologyOutlined fontSize="small" /> }] : []),
      ...(canAccess("reports") ? [{ label: "Relatórios", path: "/relatorios", icon: <AssessmentOutlined fontSize="small" /> }] : []),
      ...(canAccess("services")
        ? [{ label: "Serviços SIMER", path: "/servicos", icon: <FactCheckOutlined fontSize="small" /> }]
        : []),

    ],
    [user?.role, user?.permissions],
  );

  const developmentMenu = useMemo<MenuItemData[]>(
    () => [
      ...(canAccess("corrections") ? [{ label: "Painel de Tasks de Correções", path: "/correcoes", icon: <BugReportOutlined fontSize="small" /> }] : []),
      ...(canAccess("evolutions") ? [{ label: "Evoluções", path: "/evolucoes", icon: <AutoFixHighOutlined fontSize="small" /> }] : []),
      ...(canAccess("support") ? [{ label: "Apoios", path: "/apoios", icon: <SupportAgentOutlined fontSize="small" /> }] : []),
      ...(canAccess("versions") ? [{ label: "Versões", path: "/versoes", icon: <Inventory2Outlined fontSize="small" /> }] : []),
    ],
    [user?.role, user?.permissions],
  );

  const managementMenu = useMemo<MenuItemData[]>(
    () => [
      ...(canAccess("knowledge") ? [{ label: "Base de Conhecimento", path: "/conhecimento", icon: <MenuBookOutlined fontSize="small" /> }] : []),
    ],
    [user?.role, user?.permissions],
  );

  /* =======================================================
     USUÁRIO
  ======================================================= */

  const userRole =
    getRoleLabel(
      user?.role,
    );

  /* =======================================================
     LOGOUT
  ======================================================= */

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    try {
      setLoggingOut(true);
      setProfileAnchor(null);

      await logout();

      navigate(
        "/login",
        {
          replace:
            true,
        },
      );
    } finally {
      setLoggingOut(false);
    }
  }

  function handleOpenProfileMenu(
    event: MouseEvent<HTMLElement>,
  ) {
    setProfileAnchor(
      event.currentTarget,
    );
  }

  function handleCloseProfileMenu() {
    setProfileAnchor(null);
  }

  function handleNavigateToProfile() {
    setProfileAnchor(null);
    navigate("/perfil");
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <>
      <Drawer
      variant="permanent"
      sx={{
        width:
          drawerWidth,

        flexShrink:
          0,

        "& .MuiDrawer-paper":
          {
            width:
              drawerWidth,

            boxSizing:
              "border-box",

            display:
              "flex",

            flexDirection:
              "column",

            background:
              "linear-gradient(180deg, #0A0A0A 0%, #101312 52%, #0A0A0A 100%)",

            color:
              "#FFFFFF",

            borderRight:
              "1px solid rgba(255,255,255,0.07)",
            boxShadow:
              "8px 0 24px rgba(0,0,0,0.08)",

            overflow:
              "hidden",
          },
      }}
    >
      {/* ===================================================
          CONTEÚDO ROLÁVEL
      =================================================== */}

      <Box
        sx={{
          flex:
            1,

          minHeight:
            0,

          overflowY:
            "auto",

          overflowX:
            "hidden",

          scrollbarWidth:
            "thin",

          scrollbarColor:
            "rgba(255,255,255,0.16) transparent",

          "&::-webkit-scrollbar":
            {
              width:
                6,
            },

          "&::-webkit-scrollbar-track":
            {
              background:
                "transparent",
            },

          "&::-webkit-scrollbar-thumb":
            {
              backgroundColor:
                "rgba(255,255,255,0.14)",

              borderRadius:
                99,
            },

          "&::-webkit-scrollbar-thumb:hover":
            {
              backgroundColor:
                "rgba(255,255,255,0.24)",
            },
        }}
      >
        {/* =================================================
            IDENTIDADE
        ================================================= */}

        <Box
          sx={{
            px:
              1.75,

            pt:
              1.75,

            pb:
              1.25,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems:
                "center",
            }}
          >
            <Box
              aria-hidden
              sx={{
                width:
                  10,

                height:
                  10,

                borderRadius:
                  "2px",

                backgroundColor:
                  aliareColors.green,

                transform:
                  "rotate(-6deg)",

                flexShrink:
                  0,
              }}
            />

            <Typography
              sx={{
                fontSize:
                  "0.76rem",

                fontWeight:
                  700,

                letterSpacing:
                  "0.14em",

                textTransform:
                  "uppercase",

                color:
                  "rgba(255,255,255,0.72)",
              }}
            >
              aliare
            </Typography>
          </Stack>

          <Box
            sx={{
              mt:
                1.1,

              p:
                1.15,

              borderRadius:
                1.6,

              backgroundColor:
                aliareColors.graphite,

              border:
                "1px solid rgba(255,255,255,0.07)",

              position:
                "relative",

              overflow:
                "hidden",

              "&::before":
                {
                  content:
                    '""',

                  position:
                    "absolute",

                  top:
                    0,

                  left:
                    0,

                  width:
                    3,

                  height:
                    "100%",

                  backgroundColor:
                    aliareColors.green,
                },
            }}
          >
            <Typography
              sx={{
                fontSize:
                  "0.67rem",

                fontWeight:
                  700,

                letterSpacing:
                  "0.075em",

                textTransform:
                  "uppercase",

                color:
                  aliareColors.green,
              }}
            >
              Suporte e Sustentação
            </Typography>

            <Typography
              sx={{
                mt:
                  0.65,

                fontSize:
                  "0.78rem",

                fontWeight:
                  600,

                color:
                  "rgba(255,255,255,0.90)",
              }}
            >
              Produto · SIMER
            </Typography>

            <Typography
              variant="caption"
              sx={{
                display:
                  "block",

                mt:
                  0.25,

                color:
                  "rgba(255,255,255,0.42)",

                fontSize:
                  "0.66rem",
              }}
            >
              Inteligência da operação
            </Typography>
          </Box>
        </Box>

        <Box sx={{ px: 1, mb: .5 }}>
          <ListItemButton component={NavLink} to="/visao-operacional" title="Visão Operacional" sx={{ minHeight: 40, px: 1.15, borderRadius: 1.5, color: "rgba(255,255,255,.72)", "&:hover": { bgcolor: "rgba(24,199,122,.08)", color: "#fff" }, "&.active": { bgcolor: "rgba(24,199,122,.13)", color: "#fff" }, "&.active .MuiListItemIcon-root": { color: aliareColors.green } }}>
            <ListItemIcon sx={{ minWidth: 34, color: "rgba(255,255,255,.44)", "& .MuiSvgIcon-root": { fontSize: 19 } }}><HomeOutlined fontSize="small" /></ListItemIcon>
            <ListItemText primary="Início" slotProps={{ primary: { sx: { fontSize: ".8rem", fontWeight: 600, lineHeight: 1.35 } } }} />
            {!window.techLeadHub?.desktop && <RoutineNewTabButton path="/visao-operacional" label="Visão Operacional" />}
          </ListItemButton>
        </Box>

        <MenuSection
          title="Cadastros"
          ariaLabel="Navegação de cadastros"
          items={registrationMenu}
          open={openSections.cadastros}
          onToggle={() => setOpenSections((current) => ({ ...current, cadastros: !current.cadastros }))}
        />

        <MenuSection
          title="Movimentos"
          ariaLabel="Navegação de movimentos"
          items={movementMenu}
          open={openSections.movimentos}
          onToggle={() => setOpenSections((current) => ({ ...current, movimentos: !current.movimentos }))}
        />

        <MenuSection
          title="Análises"
          ariaLabel="Navegação de análises"
          items={analysisMenu}
          open={openSections.analises}
          onToggle={() => setOpenSections((current) => ({ ...current, analises: !current.analises }))}
        />

        <MenuSection
          title="Desenvolvimento"
          ariaLabel="Navegação de desenvolvimento"
          items={developmentMenu}
          open={openSections.development}
          onToggle={() => setOpenSections((current) => ({ ...current, development: !current.development }))}
        />

        <MenuSection
          title="Gestão"
          ariaLabel="Navegação de gestão"
          items={managementMenu}
          open={openSections.gestao}
          onToggle={() => setOpenSections((current) => ({ ...current, gestao: !current.gestao }))}
        />

        <Box
          sx={{
            height:
              20,
          }}
        />
      </Box>

      {/* ===================================================
          RODAPÉ FIXO
      =================================================== */}

      <Box
        sx={{
          flexShrink:
            0,

          backgroundColor:
            aliareColors.black,

          borderTop:
            "1px solid rgba(255,255,255,0.07)",
          boxShadow:
            "0 -10px 28px rgba(0,0,0,.16)",
        }}
      >
        <Box
          sx={{
            px:
              2.25,

            pt:
              0.6,

            pb:
              1.45,
          }}
        >
          <Stack
            direction="row"
            sx={{
              alignItems:
                "center",

              justifyContent:
                "space-between",

              gap:
                1,
            }}
          >
            <Button size="small" startIcon={<BugReportOutlined sx={{ fontSize: 15 }} />} onClick={() => setFeedbackOpen(true)} sx={{ minHeight: 28, px: .75, color: "rgba(255,255,255,.62)", fontSize: ".68rem !important", fontWeight: 600 }}>Reportar</Button>

            <Typography
              variant="caption"
              sx={{
                color:
                  "rgba(255,255,255,0.30)",

                fontWeight:
                  500,

                fontSize:
                  "0.63rem",
              }}
            >
              Criado por Tayson
            </Typography>

            <Typography
              variant="caption"
              sx={{
                color:
                  "rgba(255,255,255,0.28)",

                fontSize:
                  "0.62rem",

                fontVariantNumeric:
                  "tabular-nums",
              }}
            >
              {appVersion}
            </Typography>
          </Stack>
        </Box>
      </Box>
      </Drawer>

      <Snackbar
        open={Boolean(chatPopup)}
        autoHideDuration={9000}
        onClose={(_, reason) => { if (reason !== "clickaway") setChatPopup(null); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 20 }}
      >
        <Paper elevation={14} sx={{ width: 350, maxWidth: "calc(100vw - 24px)", p: 1.4, borderRadius: 2.75, border: "1px solid", borderColor: "rgba(24,199,122,.38)", borderLeft: "4px solid", borderLeftColor: aliareColors.green, background: (theme) => theme.palette.mode === "dark" ? "linear-gradient(135deg,#111f2f,#11342d)" : "linear-gradient(135deg,#fff,#effff8)", boxShadow: "0 22px 58px rgba(15,23,42,.24)" }}>
          {chatPopup && <Stack direction="row" spacing={1.1} sx={{ alignItems: "flex-start" }}>
            <UserAvatar user={{ name: chatPopup.authorName } as any} size={40} sx={{ backgroundColor: aliareColors.green, color: aliareColors.black }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 900, color: aliareColors.green, letterSpacing: ".04em" }}>{chatUnread > 1 ? `${chatUnread} NOVAS MENSAGENS` : "NOVA MENSAGEM"}</Typography>
              <Typography sx={{ fontWeight: 900, lineHeight: 1.2 }} noWrap>{chatPopup.authorName}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{chatPopup.channelName}</Typography>
              <Typography variant="body2" sx={{ mt: .55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{chatPopup.preview}</Typography>
              <Button size="small" sx={{ mt: .7, px: 0, fontWeight: 850 }} onClick={() => { const popup = chatPopup; setChatPopup(null); if (location.pathname === "/chat") navigate(`/chat?channel=${popup.channelId}`); else void openFloatingChat(popup.channelId, popup.channelName); }}>Abrir conversa</Button>
            </Box>
            <IconButton size="small" aria-label="Fechar notificação" onClick={() => setChatPopup(null)}><CloseRounded fontSize="small" /></IconButton>
          </Stack>}
        </Paper>
      </Snackbar>

      {location.pathname !== "/chat" && floatingChats.length > 0 && <Box sx={{ position: "fixed", right: 18, bottom: 18, zIndex: (theme) => theme.zIndex.modal + 10, display: "flex", flexDirection: "row-reverse", alignItems: "flex-end", gap: 1.25, pointerEvents: "none" }}>
        {floatingChats.map((chat) => <Paper key={chat.channelId} elevation={16} sx={{ width: chat.minimized ? 230 : 310, height: chat.minimized ? 48 : 390, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 2.5, border: "1px solid", borderColor: "divider", boxShadow: "0 18px 48px rgba(15,23,42,.24)", pointerEvents: "auto", transition: "height .18s ease,width .18s ease" }}>
          <Stack direction="row" sx={{ minHeight: 48, px: 1.15, alignItems: "center", bgcolor: (theme) => theme.palette.mode === "dark" ? "#18232f" : "#f7faf9", color: "text.primary", borderBottom: "1px solid", borderColor: "divider" }}>
            <Box sx={{ position: "relative", width: 30, height: 30, mr: .8, borderRadius: "50%", bgcolor: "action.selected", color: "text.primary", border: "1px solid", borderColor: "divider", display: "grid", placeItems: "center", fontWeight: 900 }}>{(chat.peerName || chat.channelName).slice(0,1).toUpperCase()}{chat.peerId && <Circle sx={{ position: "absolute", right: -1, bottom: -1, fontSize: 9, color: chat.presence === "ONLINE" ? "success.main" : chat.presence === "AWAY" ? "warning.main" : chat.presence === "BUSY" ? "error.main" : "text.disabled", stroke: "background.paper", strokeWidth: 4 }} />}</Box>
            <Box onClick={() => setFloatingChats((current) => current.map((item) => item.channelId === chat.channelId ? { ...item, minimized: !item.minimized, unread: 0 } : item))} sx={{ minWidth: 0, flex: 1, cursor: "pointer" }}><Typography variant="body2" noWrap sx={{ fontWeight: 850 }}>{chat.channelName}</Typography>{chat.peerId && <Typography variant="caption" sx={{ display: "block", lineHeight: 1, opacity: .72 }}>{chat.presence === "ONLINE" ? "Online" : chat.presence === "AWAY" ? "Ausente" : chat.presence === "BUSY" ? "Ocupado" : "Offline"}</Typography>}</Box>
            {chat.unread > 0 && <Badge badgeContent={chat.unread} color="error" sx={{ mr: 1 }} />}
            <Tooltip title="Buscar nesta conversa"><IconButton size="small" color="inherit" aria-label="Buscar nesta conversa" onClick={(event) => { event.stopPropagation(); setFloatingSearchOpen((current) => ({ ...current, [chat.channelId]: !current[chat.channelId] })); }}><SearchOutlined fontSize="small" /></IconButton></Tooltip><Tooltip title="Abrir no Hub de Conversas"><IconButton size="small" color="inherit" aria-label="Abrir no Hub de Conversas" onClick={(event) => { event.stopPropagation(); navigate(`/chat?channel=${chat.channelId}`); }}><OpenInFullRounded fontSize="small" /></IconButton></Tooltip><Tooltip title={chat.minimized ? "Restaurar" : "Minimizar"}><IconButton size="small" color="inherit" aria-label={chat.minimized ? "Restaurar conversa" : "Minimizar conversa"} onClick={(event) => { event.stopPropagation(); setFloatingChats((current) => current.map((item) => item.channelId === chat.channelId ? { ...item, minimized: !item.minimized, unread: 0 } : item)); }}><RemoveRounded fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Fechar"><IconButton size="small" color="inherit" aria-label="Fechar conversa flutuante" onClick={(event) => { event.stopPropagation(); setFloatingChats((current) => current.filter((item) => item.channelId !== chat.channelId)); }}><CloseRounded fontSize="small" /></IconButton></Tooltip>
          </Stack>
          {!chat.minimized && <>
            {floatingSearchOpen[chat.channelId] && <Box sx={{ p: .75, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}><TextField autoFocus size="small" fullWidth placeholder="Buscar nesta conversa..." slotProps={{ htmlInput: { "aria-label": "Buscar nesta conversa" }, input: { startAdornment: <SearchOutlined sx={{ mr: .6, fontSize: 17, color: "text.secondary" }} /> } }} data-chat-search-a11y="true" value={floatingSearch[chat.channelId] ?? ""} onChange={(event) => setFloatingSearch((current) => ({ ...current, [chat.channelId]: event.target.value }))} slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: .6, fontSize: 17, color: "text.secondary" }} /> } }} /></Box>}
            {shareContext && <Box sx={{ px: 1, py: .65, bgcolor: "action.hover", borderBottom: "1px solid", borderColor: "divider" }}><Stack direction="row" spacing={.7} sx={{ alignItems: "center" }}><ShareOutlined sx={{ fontSize: 16, color: "primary.main" }} /><Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="caption" noWrap sx={{ display: "block", fontWeight: 900 }}>{shareContext.label}{shareContext.recordId ? ` #${shareContext.recordId}` : ""}</Typography><Typography variant="caption" noWrap sx={{ display: "block", color: "text.secondary" }}>{shareContext.title}</Typography></Box><Button size="small" onClick={() => shareIntoFloatingChat(chat.channelId)}>Inserir</Button></Stack></Box>}
            <Box sx={{ flex: 1, overflowY: "auto", p: 1, bgcolor: "background.default" }}>
              {chat.messages.filter((message) => !floatingSearch[chat.channelId]?.trim() || message.content.toLowerCase().includes(floatingSearch[chat.channelId].trim().toLowerCase())).slice(-30).map((message) => {
                const mine = message.author.id === user?.id;
                return <Box key={message.id} sx={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", mb: .65 }}><Box sx={{ maxWidth: "82%", px: 1, py: .65, borderRadius: mine ? "12px 12px 3px 12px" : "12px 12px 12px 3px", bgcolor: mine ? (theme) => theme.palette.mode === "dark" ? "rgba(24,199,122,.16)" : "rgba(24,199,122,.10)" : "background.paper", color: "text.primary", border: "1px solid", borderColor: mine ? "rgba(24,199,122,.28)" : "divider" }}><Typography variant="caption" sx={{ fontWeight: 800, opacity: .72 }}>{mine ? "Você" : message.author.name}</Typography>{message.content.startsWith("[hub-card]") ? (() => { try { const card = JSON.parse(message.content.slice(10)) as { type: string; id?: number; title: string; client?: string | null; status?: string | null; path: string }; return <Paper elevation={0} sx={{ mt: .35, p: 1, minWidth: 220, bgcolor: "background.paper", color: "text.primary", border: "1px solid", borderColor: mine ? "rgba(24,199,122,.30)" : "divider", borderRadius: 1.75 }}><Stack direction="row" spacing={.7} sx={{ alignItems: "center", mb: .5 }}><ShareOutlined sx={{ fontSize: 15 }} /><Typography variant="caption" sx={{ fontWeight: 900 }}>{card.type}{card.id ? ` #${card.id}` : ""}</Typography></Stack><Typography variant="body2" sx={{ fontWeight: 850, lineHeight: 1.3 }}>{card.title}</Typography>{card.client && <Typography variant="caption" sx={{ display: "block", mt: .35, opacity: .75 }}>Cliente: {card.client}</Typography>}{card.status && <Typography variant="caption" sx={{ display: "block", opacity: .75 }}>Status: {card.status}</Typography>}<Button size="small" variant="text" sx={{ mt: .7, px: 0, color: "primary.main" }} onClick={() => navigate(card.path)}>Abrir registro</Button></Paper>; } catch { return <Typography variant="body2">Registro compartilhado</Typography>; } })() : <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.content.startsWith("[anexo] ") ? "📎 Arquivo" : message.content}</Typography>}<Stack direction="row" spacing={.35} sx={{ mt: .25, justifyContent: "flex-end", alignItems: "center", opacity: .68 }}><Typography variant="caption" sx={{ fontSize: ".62rem" }}>{new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Typography>{mine && <DoneAllRounded sx={{ fontSize: 13 }} />}</Stack></Box></Box>;
              })}
            </Box>
            {chat.typingNames.length > 0 && <Typography variant="caption" sx={{ px: 1.1, py: .35, color: "primary.main", fontWeight: 750, bgcolor: "background.default" }}>{chat.typingNames.join(", ")} {chat.typingNames.length > 1 ? "estão digitando..." : "está digitando..."}</Typography>}
            <Stack direction="row" spacing={.65} sx={{ p: .8, borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper", position: "relative", zIndex: 2, pointerEvents: "auto", alignItems: "flex-end" }} onClick={(event) => event.stopPropagation()}>
              <TextField size="small" fullWidth multiline maxRows={3} value={floatingDrafts[chat.channelId] ?? ""} placeholder="Digite uma mensagem..." onChange={(event) => { setFloatingDrafts((current) => ({ ...current, [chat.channelId]: event.target.value })); void api.post(`/chat/channels/${chat.channelId}/typing`, { typing: Boolean(event.target.value.trim()) }).catch(() => undefined); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendFloatingMessage(chat.channelId); } }} />
              <IconButton color="primary" aria-label="Enviar mensagem" disabled={!floatingDrafts[chat.channelId]?.trim()} onMouseDown={(event) => event.preventDefault()} onClick={() => void sendFloatingMessage(chat.channelId)} sx={{ width: 36, height: 36, bgcolor: "action.hover" }}><SendRounded fontSize="small" /></IconButton>
            </Stack>
          </>}
        </Paper>)}
      </Box>}

      <Dialog open={sharePickerOpen} onClose={() => { if (!shareSendingTo) { setSharePickerOpen(false); setShareContext(null); } }} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pb: 1 }}><Typography variant="h6" sx={{ fontWeight: 900 }}>Enviar para...</Typography>{shareContext && <Typography variant="body2" color="text.secondary" noWrap>{shareContext.label}{shareContext.recordId ? ` #${shareContext.recordId}` : ""} · {shareContext.title}</Typography>}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth size="small" placeholder="Buscar pessoa..." value={shareSearch} onChange={(event) => setShareSearch(event.target.value)} sx={{ mb: 1.25 }} slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: .7, fontSize: 18, color: "text.secondary" }} /> } }} />
          {sharePickerLoading ? <Box sx={{ py: 5, display: "grid", placeItems: "center" }}><CircularProgress size={26} /></Box> : <>
            {(() => {
              const directPeerIds = shareChannels.filter((channel) => channel.type === "DIRECT").flatMap((channel) => channel.members?.map((member) => member.user.id).filter((id) => id !== user?.id) || []);
              const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
              const query = normalize(shareSearch);
              const filtered = sharePeople.filter((person) => person.id !== user?.id && [person.name, person.username, person.role].some((value) => normalize(value || "").includes(query)));
              const recent = filtered.filter((person) => directPeerIds.includes(person.id)).slice(0, 6);
              const online = filtered.filter((person) => !directPeerIds.includes(person.id) && sharePresence.some((entry) => entry.userId === person.id && entry.effectiveStatus === "ONLINE"));
              const others = filtered.filter((person) => !recent.includes(person) && !online.includes(person));
              const section = (title: string, people: SharePerson[]) => people.length ? <Box sx={{ mb: 1 }}><Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900 }}>{title}</Typography>{people.map((person) => { const status = sharePresence.find((entry) => entry.userId === person.id)?.effectiveStatus || "OFFLINE"; return <ListItemButton key={person.id} disabled={Boolean(shareSendingTo)} onClick={() => void sendSharedRecordToPerson(person)} sx={{ borderRadius: 1.5, px: 1, py: .7 }}><Box sx={{ position: "relative", width: 36, height: 36, mr: 1.1, borderRadius: "50%", bgcolor: "action.hover", display: "grid", placeItems: "center", fontWeight: 900 }}>{person.name.slice(0,1).toUpperCase()}<Circle sx={{ position: "absolute", right: -1, bottom: -1, fontSize: 9, color: status === "ONLINE" ? "success.main" : status === "AWAY" ? "warning.main" : status === "BUSY" ? "error.main" : "text.disabled" }} /></Box><ListItemText primary={person.name} secondary={`@${person.username} · ${person.role}`} />{status === "ONLINE" && <Chip size="small" label="Online" color="success" variant="outlined" />}{shareSendingTo === person.id && <CircularProgress size={18} sx={{ ml: 1 }} />}</ListItemButton>; })}</Box> : null;
              return <>{section("Recentes", recent)}{section("Online", online)}{section("Outras pessoas", others)}{filtered.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Nenhuma pessoa encontrada para “{shareSearch}”.</Typography>}</>;
            })()}
          </>}
        </DialogContent>
      </Dialog>

      <BugReportDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      {user && (
        <Box
          id="global-user-controls"
          sx={{
            position: "fixed",
            top: 14,
            right: 20,
            zIndex: (theme) => theme.zIndex.appBar,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Box id="global-calendar-slot" sx={{ display: "flex", alignItems: "center" }} />

          <IconButton
            title="Chat"
            aria-label="Abrir chat"
            onClick={() => navigate("/chat")}
            sx={{ width: 46, height: 46, bgcolor: "background.paper", border: "1px solid", borderColor: location.pathname === "/chat" ? "rgba(24,199,122,.55)" : "divider", borderRadius: 2, boxShadow: "0 2px 10px rgba(0,0,0,.06)", color: location.pathname === "/chat" ? aliareColors.green : "text.primary", "&:hover": { bgcolor: "background.paper", borderColor: "rgba(24,199,122,.45)" } }}
          >
            <Badge badgeContent={location.pathname === "/chat" ? 0 : chatUnread} color="error" max={99} overlap="circular" sx={{ "& .MuiBadge-badge": { fontSize: ".62rem", minWidth: 18, height: 18, fontWeight: 900, boxShadow: "0 0 0 2px", boxShadowColor: "background.paper" } }}><ChatBubbleOutlineRounded /></Badge>
          </IconButton>

          <NotificationCenter />

          <Button
            id="profile-menu-button"
            aria-controls={
              profileMenuOpen
                ? "profile-menu"
                : undefined
            }
            aria-haspopup="true"
            aria-expanded={
              profileMenuOpen
                ? "true"
                : undefined
            }
            onClick={handleOpenProfileMenu}
            endIcon={
              <ExpandMoreRounded
                sx={{
                  transform: profileMenuOpen
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                  transition: "transform 0.18s ease",
                }}
              />
            }
            sx={{
              minHeight: 46,
              px: 1,
              py: 0.55,
              borderRadius: 2,
              border: "1px solid",
              borderColor: profileMenuOpen
                ? "rgba(24,199,122,0.38)"
                : "divider",
              backgroundColor: "background.paper",
              boxShadow: profileMenuOpen
                ? "0 8px 28px rgba(0,0,0,0.12)"
                : "0 2px 10px rgba(0,0,0,0.06)",
              color: "text.primary",
              textTransform: "none",
              "&:hover": {
                backgroundColor: "background.paper",
                borderColor: "rgba(24,199,122,0.38)",
                boxShadow: "0 8px 28px rgba(0,0,0,0.10)",
              },
              "& .MuiButton-endIcon": {
                ml: 0.5,
              },
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center" }}
            >
              <UserAvatar user={user} size={32} sx={{ backgroundColor: aliareColors.green, color: aliareColors.black }} />

              <Box
                sx={{
                  minWidth: 0,
                  maxWidth: 160,
                  textAlign: "left",
                  display: {
                    xs: "none",
                    sm: "block",
                  },
                }}
              >
                <Typography
                  title={user.name}
                  sx={{
                    fontSize: "0.78rem",
                    fontWeight: 650,
                    lineHeight: 1.2,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {user.name}
                </Typography>

                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    mt: 0.15,
                    color: "text.secondary",
                    fontSize: "0.64rem",
                    lineHeight: 1.2,
                  }}
                >
                  {userRole}
                </Typography>
              </Box>
            </Stack>
          </Button>

          <Menu
            id="profile-menu"
            anchorEl={profileAnchor}
            open={profileMenuOpen}
            onClose={handleCloseProfileMenu}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "right",
            }}
            transformOrigin={{
              vertical: "top",
              horizontal: "right",
            }}
            slotProps={{
              list: {
                "aria-labelledby": "profile-menu-button",
                sx: { py: 0.75 },
              },
              paper: {
                elevation: 0,
                sx: {
                  mt: 0.8,
                  minWidth: 210,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  boxShadow: "0 12px 34px rgba(0,0,0,0.14)",
                },
              },
            }}
          >
            <Box sx={{ px: 1.5, py: 0.9 }}>
              <Typography
                sx={{
                  fontSize: "0.76rem",
                  fontWeight: 650,
                }}
              >
                {user.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.65rem" }}
              >
                {userRole}
              </Typography>
            </Box>

            <Divider />

            <MuiMenuItem
              onClick={handleNavigateToProfile}
              sx={{
                mx: 0.75,
                mt: 0.65,
                minHeight: 38,
                borderRadius: 1.2,
                fontSize: "0.78rem",
                fontWeight: 600,
                gap: 1.1,
              }}
            >
              <PersonOutlined sx={{ fontSize: 18 }} />
              Meu Perfil
            </MuiMenuItem>

            {isAdmin && <MuiMenuItem onClick={() => { handleCloseProfileMenu(); navigate("/usuarios"); }} sx={{ mx: .75, minHeight: 38, borderRadius: 1.2, fontSize: ".78rem", fontWeight: 600, gap: 1.1 }}>
              <Badge color="error" badgeContent={pendingUsers}><ManageAccountsOutlined sx={{ fontSize: 18 }} /></Badge> Usuários
            </MuiMenuItem>}

            {isAdmin && <MuiMenuItem onClick={() => { handleCloseProfileMenu(); navigate("/configuracoes"); }} sx={{ mx: .75, minHeight: 38, borderRadius: 1.2, fontSize: ".78rem", fontWeight: 600, gap: 1.1 }}>
              <SettingsOutlined sx={{ fontSize: 18 }} /> Configurações
            </MuiMenuItem>}

            <MuiMenuItem onClick={() => { handleCloseProfileMenu(); navigate("/sobre"); }} sx={{ mx: .75, minHeight: 38, borderRadius: 1.2, fontSize: ".78rem", fontWeight: 600, gap: 1.1 }}>
              <InfoOutlined sx={{ fontSize: 18 }} /> Sobre e atualizações
            </MuiMenuItem>

            <MuiMenuItem
              disabled={loggingOut}
              onClick={() => void handleLogout()}
              sx={{
                mx: 0.75,
                mb: 0.15,
                minHeight: 38,
                borderRadius: 1.2,
                fontSize: "0.78rem",
                fontWeight: 600,
                gap: 1.1,
                color: "text.secondary",
              }}
            >
              {loggingOut ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <LogoutOutlined sx={{ fontSize: 18 }} />
              )}
              {loggingOut ? "Saindo..." : "Sair"}
            </MuiMenuItem>
          </Menu>
        </Box>
      )}
    </>
  );
}

/* =========================================================
   SEÇÃO DE MENU
========================================================= */

function MenuSection({
  title,
  ariaLabel,
  items,
  open,
  onToggle,
}: {
  title: string;
  ariaLabel: string;
  items: MenuItemData[];
  open: boolean;
  onToggle: () => void;
}) {
  if (
    items.length === 0
  ) {
    return null;
  }

  return (
    <Box
      component="nav"
      aria-label={
        ariaLabel
      }
      sx={{
        px:
          1.1,
        mb:
          0.2,
      }}
    >
      <ListItemButton aria-expanded={open} onClick={onToggle} sx={{ minHeight: 36, px: 1.25, borderRadius: 1.5, color: open ? "rgba(255,255,255,.90)" : "rgba(255,255,255,.52)", bgcolor: open ? "rgba(255,255,255,.045)" : "transparent", "&:hover": { bgcolor: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.82)" } }}>
        <ListItemText primary={title} slotProps={{ primary: { sx: { fontSize: ".68rem", fontWeight: 650, letterSpacing: ".075em", textTransform: "uppercase" } } }} />
        {open ? <ExpandLessRounded sx={{ fontSize: 18, opacity: .7 }} /> : <ExpandMoreRounded sx={{ fontSize: 18, opacity: .7 }} />}
      </ListItemButton>

      <Collapse in={open} timeout="auto" unmountOnExit>
      <List
        disablePadding
        sx={{
          display:
            "flex",

          flexDirection:
            "column",

          gap: 0.2,
          mt: .4,
        }}
      >
        {items.map(
          (item) => (
            <MenuItem
              key={
                item.path
              }
              label={
                item.label
              }
              path={
                item.path
              }
              icon={
                item.icon
              }
              badge={
                item.badge
              }
            />
          ),
        )}
      </List>
      </Collapse>
    </Box>
  );
}


const ACCESS_TOKEN_KEY = "techlead-hub.access-token";

function openRoutineInNewTab(event: MouseEvent<HTMLElement>, path: string, label: string) {
  event.preventDefault();
  event.stopPropagation();

  const child = window.open("about:blank", "_blank");
  if (!child) return;

  const token = getAccessToken();
  try {
    if (token) child.sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    child.document.title = label;
    child.location.replace(new URL(path, window.location.origin).toString());
  } catch {
    child.close();
  }
}

function RoutineNewTabButton({ path, label }: { path: string; label: string }) {
  return (
    <IconButton
      size="small"
      aria-label={`Abrir ${label} em nova aba`}
      title={`Abrir ${label} em nova aba`}
      onClick={(event) => openRoutineInNewTab(event, path, label)}
      sx={{ ml: .25, p: .4, opacity: .58, color: "rgba(255,255,255,.40)", "&:hover": { opacity: 1, color: aliareColors.green, bgcolor: "rgba(24,199,122,.08)" } }}
    >
      <OpenInNewRounded sx={{ fontSize: 14 }} />
    </IconButton>
  );
}

/* =========================================================
   ITEM DO MENU
========================================================= */

function MenuItem({
  label,
  path,
  icon,
  badge,
}: {
  label: string;
  path: string;
  icon: ReactNode;
  badge?: number;
}) {
  const hasBadge =
    typeof badge ===
      "number" &&
    badge > 0;

  return (
    <ListItemButton
      component={
        NavLink
      }
      to={path}
      title={label}
      end={
        path === "/"
      }
      sx={{
        position:
          "relative",

        minHeight:
          42,

        px:
          1.25,

        py:
          0.6,

        borderRadius:
          1.5,

        color:
          "rgba(255,255,255,0.64)",

        transition:
          "background-color 0.15s ease, color 0.15s ease",

        "&::before":
          {
            content:
              '""',

            position:
              "absolute",

            left:
              0,

            top:
              "50%",

            width:
              3,

            height:
              0,

            borderRadius:
              "0 3px 3px 0",

            backgroundColor:
              aliareColors.green,

            transform:
              "translateY(-50%)",

            transition:
              "height 0.16s ease",
          },

        "&:hover":
          {
            backgroundColor:
              "rgba(255,255,255,0.055)",

            color:
              "#FFFFFF",
          },

        "&.active":
          {
            backgroundColor:
              "rgba(24,199,122,0.10)",

            color:
              "#FFFFFF",
          },

        "&.active::before":
          {
            height:
              24,
          },

        "&.active .MuiListItemIcon-root":
          {
            color:
              aliareColors.green,
          },

        "&:focus-visible":
          {
            outline:
              `2px solid ${aliareColors.green}`,

            outlineOffset:
              "1px",
          },
      }}
    >
      <ListItemIcon
        sx={{
          minWidth:
            34,

          color:
            "rgba(255,255,255,0.44)",

          transition:
            "color 0.15s ease",
          "& .MuiSvgIcon-root": {
            fontSize: 19,
          },
        }}
      >
        {hasBadge ? (
          <Badge
            badgeContent={
              badge
            }
            max={99}
            sx={{
              "& .MuiBadge-badge":
                {
                  minWidth:
                    16,

                  height:
                    16,

                  px:
                    0.45,

                  fontSize:
                    "0.58rem",

                  fontWeight:
                    800,

                  backgroundColor:
                    aliareColors.green,

                  color:
                    aliareColors.black,

                  border:
                    `2px solid ${aliareColors.black}`,
                },
            }}
          >
            {icon}
          </Badge>
        ) : (
          icon
        )}
      </ListItemIcon>

      <ListItemText
        primary={
          label
        }
        slotProps={{
          primary:
            {
              sx:
                {
                  fontSize:
                    "0.8rem",

                  fontWeight:
                    600,

                  lineHeight:
                    1.35,

                  letterSpacing:
                    "-0.003em",
                },
            },
        }}
      />

      {!window.techLeadHub?.desktop && <RoutineNewTabButton path={path} label={label} />}

      {hasBadge && (
        <Box
          sx={{
            minWidth:
              22,

            height:
              20,

            px:
              0.65,

            borderRadius:
              99,

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            backgroundColor:
              "rgba(24,199,122,0.12)",

            border:
              "1px solid rgba(24,199,122,0.22)",
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize:
                "0.62rem",

              lineHeight:
                1,

              fontWeight:
                800,

              color:
                aliareColors.green,

              fontVariantNumeric:
                "tabular-nums",
            }}
          >
            {badge !== undefined &&
            badge > 99
              ? "99+"
              : badge}
          </Typography>
        </Box>
      )}
    </ListItemButton>
  );
}

/* =========================================================
   PERFIL
========================================================= */

function getRoleLabel(
  role:
    UserRole |
    undefined,
) {
  if (
    role ===
    "ADMIN"
  ) {
    return "Administrador";
  }

  if (
    role ===
    "COORDENADOR"
  ) {
    return "Coordenador";
  }

  if (
    role ===
    "ANALISTA"
  ) {
    return "Analista";
  }

  return "Usuário";
}
