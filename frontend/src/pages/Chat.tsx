import { AddCommentOutlined, ForumOutlined, SendRounded, EmojiEmotionsOutlined, CelebrationOutlined, NotificationsActiveOutlined, ReplyOutlined, CloseOutlined, SearchOutlined, Circle, MoreHorizOutlined, DeleteOutlineRounded, StarOutlineRounded, VolumeOffOutlined, AttachFileRounded, DownloadRounded, CleaningServicesOutlined, GroupsOutlined, PersonOutlineRounded, InfoOutlined, OpenInNewOutlined } from "@mui/icons-material";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Popover, Skeleton, Snackbar, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, getAccessToken, getApiBaseUrl } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { playNotificationSound } from "../utils/notificationSound";


type Person = { id: number; name: string; username: string; role: string };
type Message = { id: number; content: string; createdAt: string; parentId?: number | null; author: Person };
type Channel = { id: number; name: string; type: string; description?: string | null; clientName?: string | null; unread: number; messages: Message[]; members?: Array<{ user: Person }> };
type Presence = { userId: number; status: string; effectiveStatus: "ONLINE" | "AWAY" | "BUSY" | "OFFLINE"; statusMessage?: string | null; lastSeenAt: string; name: string; username: string };
type RealtimeSnapshot = { presence: Presence[]; typing: Array<{ channelId: number; userId: number; name: string }>; latestMessage: { id: number; channelId: number; authorId: number } | null };

export function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [channels, setChannels] = useState<Channel[]>(() => { try { return JSON.parse(sessionStorage.getItem("techlead-chat-channels") || "[]") as Channel[]; } catch { return []; } });
  const [participants, setParticipants] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(() => { const value = Number(new URLSearchParams(window.location.search).get("channel")); return Number.isFinite(value) && value > 0 ? value : null; });
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [stickersOpen, setStickersOpen] = useState(false);
  const previousUnread = useRef(0);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [favorites, setFavorites] = useState<number[]>(() => { try { return JSON.parse(localStorage.getItem("techlead-chat-favorites") || "[]"); } catch { return []; } });
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("techlead-chat-sound") !== "off");
  const [directOpen, setDirectOpen] = useState(false);
  const [directSearch, setDirectSearch] = useState("");
  const [pendingShare, setPendingShare] = useState<{ label: string; recordId?: number; title: string; client?: string | null; status?: string | null; path: string } | null>(() => {
    const raw = new URLSearchParams(window.location.search).get("share");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  });
  const [openingDirectId, setOpeningDirectId] = useState<number | null>(null);
  const typingTimer = useRef<number | null>(null);
  const lastRealtimeMessageId = useRef<number | null>(null);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [remoteTyping, setRemoteTyping] = useState<RealtimeSnapshot["typing"]>([]);
  const [availability, setAvailability] = useState<"ONLINE" | "AWAY" | "BUSY">(() => (localStorage.getItem("techlead-chat-status") as "ONLINE" | "AWAY" | "BUSY") || "ONLINE");
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [conversationMenuAnchor, setConversationMenuAnchor] = useState<HTMLElement | null>(null);
  const [deleteConversationOpen, setDeleteConversationOpen] = useState(false);
  const [deletingConversation, setDeletingConversation] = useState(false);
  const [maintenanceRunning, setMaintenanceRunning] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [conversationInfoOpen, setConversationInfoOpen] = useState(false);
  const [statusMessage] = useState(() => localStorage.getItem("techlead-chat-status-message") || "");
  const [incomingPopup, setIncomingPopup] = useState<{ channelId: number; channelName: string; authorName: string; preview: string } | null>(null);
  const previousChannelState = useRef<Map<number, { unread: number; lastMessageId: number | null }>>(new Map());
  const selectedIdRef = useRef<number | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const selected = useMemo(() => channels.find((channel) => channel.id === selectedId) ?? null, [channels, selectedId]);
  const selectedPeer = useMemo(() => selected?.type === "DIRECT" ? selected.members?.map((member) => member.user).find((person) => person.id !== user?.id) : null, [selected, user?.id]);
  const selectedPresence = selectedPeer ? presence.find((item) => item.userId === selectedPeer.id) : null;
  const typingNames = remoteTyping.filter((item) => item.channelId === selectedId).map((item) => item.name);
  const visibleChannels = useMemo(() => channels.filter((channel) => [channel.name, channel.description, channel.clientName].some((value) => value?.toLowerCase().includes(conversationSearch.toLowerCase()))), [channels, conversationSearch]);
  const visibleMessages = useMemo(() => messages.filter((message) => !messageSearch.trim() || message.content.toLowerCase().includes(messageSearch.toLowerCase())), [messages, messageSearch]);
  const sortedVisibleChannels = useMemo(() => visibleChannels.slice().sort((a, b) => {
    const group = (channel: Channel) => favorites.includes(channel.id) ? 0 : channel.type === "DIRECT" ? 1 : 2;
    return group(a) - group(b) || b.unread - a.unread || ((b.messages?.[b.messages.length - 1]?.id ?? 0) - (a.messages?.[a.messages.length - 1]?.id ?? 0));
  }), [visibleChannels, favorites]);

  const loadChannels = useCallback(async () => {
    const response = await api.get<{ channels: Channel[] }>("/chat/channels");
    const rawChannels = Array.isArray(response.data.channels) ? response.data.channels : [];
    const directByPeer = new Map<number, Channel>();
    const nextChannels = rawChannels.filter((channel) => {
      if (channel.type !== "DIRECT") return true;
      const peerId = channel.members?.map((member) => member.user.id).find((id) => id !== user?.id);
      if (!peerId) return true;
      const existing = directByPeer.get(peerId);
      if (!existing) { directByPeer.set(peerId, channel); return true; }
      const existingLatest = existing.messages?.[existing.messages.length - 1]?.id ?? 0;
      const currentLatest = channel.messages?.[channel.messages.length - 1]?.id ?? 0;
      if (currentLatest > existingLatest || channel.unread > existing.unread) {
        const index = rawChannels.indexOf(existing);
        if (index >= 0) directByPeer.set(peerId, channel);
      }
      return false;
    });
    const previous = previousChannelState.current;
    if (previous.size) {
      const incoming = nextChannels
        .map((channel) => {
          const before = previous.get(channel.id);
          const latest = channel.messages?.[channel.messages.length - 1] ?? null;
          const isNew = Boolean(before && channel.unread > before.unread && latest && latest.id !== before.lastMessageId && latest.author.id !== user?.id);
          return isNew ? { channel, latest } : null;
        })
        .filter(Boolean) as Array<{ channel: Channel; latest: Message }>;
      const newest = incoming[incoming.length - 1];
      if (newest && newest.channel.id !== selectedIdRef.current) {
        setIncomingPopup({
          channelId: newest.channel.id,
          channelName: newest.channel.name,
          authorName: newest.latest.author.name,
          preview: newest.latest.content.startsWith("[anexo] ") ? "📎 Enviou um arquivo" : newest.latest.content,
        });
      }
    }
    previousChannelState.current = new Map(nextChannels.map((channel) => [channel.id, {
      unread: channel.unread,
      lastMessageId: channel.messages?.[channel.messages.length - 1]?.id ?? null,
    }]));
    setChannels(nextChannels);
    try { sessionStorage.setItem("techlead-chat-channels", JSON.stringify(nextChannels)); } catch { /* cache opcional */ }
    const requested = Number(searchParams.get("channel"));
    setSelectedId((current) =>
      current ??
      response.data.channels.find((channel) => channel.id === requested)?.id ??
      response.data.channels[0]?.id ??
      null,
    );
  }, [searchParams, user?.id]);

  const loadMessages = useCallback(async (channelId: number, quiet = false) => {
    try {
      if (!quiet && messages.length === 0) setLoading(true);
      const response = await api.get<{ messages: Message[] }>(`/chat/channels/${channelId}/messages`);
      setMessages(response.data.messages);
      setChannels((current) => current.map((channel) => channel.id === channelId ? { ...channel, unread: 0 } : channel));
      window.dispatchEvent(new Event("techlead-hub:chat-read"));
      setError("");
    } catch (requestError: any) {
      if (!quiet) setError(requestError?.response?.data?.error || "Não foi possível carregar a conversa.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [messages.length]);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      const [channelsResult, participantsResult] = await Promise.allSettled([
        loadChannels(),
        api.get<{ participants: Person[] }>("/chat/participants"),
      ]);
      if (!active) return;
      if (participantsResult.status === "fulfilled") setParticipants(participantsResult.value.data.participants);
      if (channelsResult.status === "rejected") {
        const requestError = channelsResult.reason as { response?: { data?: { error?: string } } };
        if (!channels.length) setError(requestError?.response?.data?.error || "Não foi possível atualizar a lista de conversas.");
      } else {
        setError("");
      }
      setChannelsLoading(false);
    };
    void bootstrap();
    return () => { active = false; };
  }, [loadChannels, channels.length]);
  useEffect(() => {
    if (!pendingShare) return;
    setDirectOpen(true);
  }, [pendingShare]);

  useEffect(() => {
    if (!selectedId) { setLoading(false); return; }
    void loadMessages(selectedId);
  }, [loadMessages, selectedId]);
  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, selectedId]);

  useEffect(() => {
    const unread = channels.reduce((sum, channel) => sum + channel.unread, 0);
    if (unread > previousUnread.current && soundEnabled) {
      playNotificationSound("chat");
      if (document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") new Notification("TechLead Hub", { body: "Você recebeu uma nova mensagem no chat." });
    }
    previousUnread.current = unread;
  }, [channels, soundEnabled]);

  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    const connect = async () => {
      while (!stopped) {
        try {
          const token = getAccessToken();
          const base = getApiBaseUrl();
          const url = new URL(`${base.replace(/\/$/, "")}/chat/events`, window.location.origin);
          const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
          if (!response.ok || !response.body) throw new Error("stream indisponível");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n"); buffer = blocks.pop() ?? "";
            for (const block of blocks) {
              const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
              if (!dataLine) continue;
              const snapshot = JSON.parse(dataLine.slice(6)) as RealtimeSnapshot;
              setPresence(snapshot.presence);
              setRemoteTyping(snapshot.typing);
              const latestId = snapshot.latestMessage?.id ?? null;
              if (lastRealtimeMessageId.current !== null && latestId !== lastRealtimeMessageId.current) {
                void loadChannels().catch(() => undefined);
                if (selectedId && snapshot.latestMessage?.channelId === selectedId) void loadMessages(selectedId, true);
              }
              lastRealtimeMessageId.current = latestId;
            }
          }
        } catch {
          if (!stopped) await new Promise((resolve) => window.setTimeout(resolve, 1800));
        }
      }
    };
    void connect();
    return () => { stopped = true; controller.abort(); };
  }, [loadChannels, loadMessages, selectedId]);

  useEffect(() => {
    const sendPresence = (status = document.visibilityState === "hidden" ? "AWAY" : availability) =>
      api.post("/chat/presence", { status, statusMessage }).catch(() => undefined);
    void sendPresence();
    const timer = window.setInterval(() => void sendPresence(), 25_000);
    const visibility = () => void sendPresence();
    document.addEventListener("visibilitychange", visibility);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [availability, statusMessage]);

  async function openDirect(person: Person) {
    if (openingDirectId) return;
    const existing = channels.find((channel) =>
      channel.type === "DIRECT" &&
      channel.members?.some((member) => member.user.id === person.id) &&
      channel.members?.some((member) => member.user.id === user?.id),
    );
    if (existing) {
      setSelectedId(existing.id);
      setDirectOpen(false);
      setError("");
      if (pendingShare) {
        try {
          const payload = `[hub-card]${JSON.stringify({ type: pendingShare.label, id: pendingShare.recordId, title: pendingShare.title, client: pendingShare.client || null, status: pendingShare.status || null, path: pendingShare.path })}`;
          const sent = await api.post<Message>(`/chat/channels/${existing.id}/messages`, { content: payload });
          setMessages((current) => [...current, sent.data]);
          setPendingShare(null);
          navigate(`/chat?channel=${existing.id}`, { replace: true });
        } catch (requestError: any) { setError(requestError?.response?.data?.error || "Não foi possível compartilhar o registro."); }
      }
      return;
    }
    try {
      setOpeningDirectId(person.id);
      const response = await api.post<Channel>(`/chat/direct/${person.id}`);
      setChannels((current) => current.some((item) => item.id === response.data.id) ? current : [response.data, ...current]);
      setSelectedId(response.data.id);
      setDirectOpen(false);
      setError("");
      if (pendingShare) {
        const payload = `[hub-card]${JSON.stringify({ type: pendingShare.label, id: pendingShare.recordId, title: pendingShare.title, client: pendingShare.client || null, status: pendingShare.status || null, path: pendingShare.path })}`;
        const sent = await api.post<Message>(`/chat/channels/${response.data.id}/messages`, { content: payload });
        setMessages([sent.data]);
        setPendingShare(null);
        navigate(`/chat?channel=${response.data.id}`, { replace: true });
      }
      void loadChannels();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || "Não foi possível iniciar a conversa privada.");
    } finally {
      setOpeningDirectId(null);
    }
  }

  const toggleFavorite = (channelId: number) => setFavorites((current) => {
    const next = current.includes(channelId) ? current.filter((id) => id !== channelId) : [...current, channelId];
    localStorage.setItem("techlead-chat-favorites", JSON.stringify(next)); return next;
  });

  async function createChannel() {
    const name = channelName.trim();
    if (!name) return;
    try {
      const response = await api.post<Channel>("/chat/channels", {
        name,
        type: "TEAM",
        description: "Canal interno da equipe",
        memberIds,
      });
      await loadChannels();
      setSelectedId(response.data.id);
      setCreateOpen(false);
      setChannelName("");
      setMemberIds([]);
    } catch (requestError: any) { setError(requestError?.response?.data?.error || "Não foi possível criar o canal."); }
  }

  async function sendAttachment(file: File) {
    if (!selectedId) return;
    if (file.size > 8 * 1024 * 1024) { setError("O anexo deve ter no máximo 8 MB."); return; }
    setUploadingAttachment(true); setError("");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? "")); reader.onerror = () => reject(new Error("Falha ao ler o arquivo.")); reader.readAsDataURL(file);
      });
      await api.post(`/chat/channels/${selectedId}/attachments`, { name: file.name, mimeType: file.type || "application/octet-stream", data });
      await loadMessages(selectedId);
    } catch (requestError: any) { setError(requestError?.response?.data?.error || "Não foi possível enviar o anexo."); }
    finally { setUploadingAttachment(false); if (attachmentInputRef.current) attachmentInputRef.current.value = ""; }
  }

  function attachmentInfo(content: string) {
    if (!content.startsWith("[anexo] ")) return null;
    const parts = content.slice(8).split("|"); if (parts.length < 4) return null;
    const [name, mimeType, size, ...base64] = parts;
    return { name, mimeType, size: Number(size), href: `data:${mimeType};base64,${base64.join("|")}` };
  }

  async function deleteConversation() {
    if (!selectedId || deletingConversation) return;
    const deletedId = selectedId;
    try {
      setDeletingConversation(true);
      setError("");
      await api.delete(`/chat/channels/${deletedId}`);
      setDeleteConversationOpen(false);
      setConversationMenuAnchor(null);
      setMessages([]);
      setFavorites((current) => {
        const next = current.filter((id) => id !== deletedId);
        localStorage.setItem("techlead-chat-favorites", JSON.stringify(next));
        return next;
      });
      setChannels((current) => {
        const next = current.filter((channel) => channel.id !== deletedId);
        setSelectedId(next[0]?.id ?? null);
        return next;
      });
      previousChannelState.current.delete(deletedId);
      window.dispatchEvent(new Event("techlead-hub:chat-read"));
      await loadChannels();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || "Não foi possível excluir a conversa.");
    } finally {
      setDeletingConversation(false);
    }
  }

  async function consolidateDirectDuplicates() {
    if (maintenanceRunning) return;
    try {
      setMaintenanceRunning(true);
      setError("");
      const response = await api.post<{ groupsConsolidated: number; duplicateChannels: number; movedMessages: number }>("/chat/maintenance/direct-duplicates");
      await loadChannels();
      setMaintenanceMessage(response.data.groupsConsolidated
        ? `Limpeza concluída: ${response.data.groupsConsolidated} grupo(s), ${response.data.duplicateChannels} conversa(s) duplicada(s) e ${response.data.movedMessages} mensagem(ns) consolidadas.`
        : "Nenhuma conversa privada duplicada foi encontrada.");
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || "Não foi possível executar a manutenção das conversas.");
    } finally {
      setMaintenanceRunning(false);
    }
  }

  async function send() {
    const text = content.trim();
    if (!selectedId || !text || sending) return;
    try {
      setSending(true);
      const response = await api.post<Message>(`/chat/channels/${selectedId}/messages`, { content: text, parentId: replyTo?.id ?? null });
      setMessages((current) => [...current, response.data]);
      setContent("");
      setReplyTo(null);
      setError("");
    } catch (requestError: any) { setError(requestError?.response?.data?.error || "Não foi possível enviar a mensagem."); }
    finally { setSending(false); }
  }

  const emojis = ["😀","😄","😂","😊","😉","😍","🤝","👏","👍","👀","🎯","🚀","🔥","✅","⚠️","💡","🙏","🎉","❤️","💬"];
  const stickers = ["🎉 PARABÉNS!","🚀 VAMOS!","✅ RESOLVIDO","👏 BOA!","🎯 NA META","🔥 PRIORIDADE","💡 IDEIA","🤝 OBRIGADO","☕ CAFÉ?","😎 FECHOU!","🛠️ EM ANÁLISE","📣 ATENÇÃO"];
  const append = (value: string) => setContent((current) => current ? `${current} ${value}` : value);

  return <Stack spacing={1} sx={{ height: "100%", maxHeight: "100%", minHeight: 0, overflow: "hidden", p: { xs: 1, md: 1.25 }, boxSizing: "border-box", bgcolor: "background.default" }}>
    <Paper elevation={0} sx={{ flexShrink: 0, minHeight: 76, px: 2, py: 1.15, borderRadius: 3.5, border: "1px solid", borderColor: "divider", borderLeft: "4px solid", borderLeftColor: "rgba(24,199,122,.72)", overflow: "hidden", background: (theme) => theme.palette.mode === "dark" ? "linear-gradient(105deg,#151b23,#182230 58%,#131922)" : "linear-gradient(105deg,#ffffff,#f7fafc 58%,#f3f7fb)", boxShadow: "0 8px 26px rgba(15,23,42,.055)" }}>
      <Stack direction="row" spacing={1.35} sx={{ alignItems: "center", minWidth: 0, pr: { md: 31 } }}>
        <Box sx={{ width: 42, height: 42, borderRadius: 2.5, display: "grid", placeItems: "center", flexShrink: 0, color: "primary.main", bgcolor: "background.paper", border: "1px solid rgba(24,199,122,.22)", boxShadow: "0 5px 16px rgba(24,199,122,.09)" }}><ForumOutlined /></Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={.8} sx={{ alignItems: "center" }}><Typography sx={{ fontWeight: 950, fontSize: "1.22rem", lineHeight: 1.05, letterSpacing: "-.025em", whiteSpace: "nowrap" }}>Central de Conversas</Typography><Chip size="small" label={{ ONLINE: "Online", AWAY: "Ausente", BUSY: "Ocupado" }[availability]} color={availability === "BUSY" ? "error" : availability === "AWAY" ? "warning" : "success"} onClick={() => { const next = availability === "ONLINE" ? "AWAY" : availability === "AWAY" ? "BUSY" : "ONLINE"; setAvailability(next); localStorage.setItem("techlead-chat-status", next); }} sx={{ height: 22, fontWeight: 850 }} /></Stack>
          <Stack direction="row" spacing={.8} sx={{ alignItems: "center", minWidth: 0 }}><Typography variant="caption" color="text.secondary" noWrap>Mensagens, presença e colaboração em tempo real</Typography>{statusMessage && <Typography variant="caption" color="text.secondary" noWrap sx={{ opacity: .75 }}>· {statusMessage}</Typography>}</Stack>
        </Box>
      </Stack>
    </Paper>
    {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
    <Paper elevation={0} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "300px minmax(0,1fr)", xl: conversationInfoOpen ? "300px minmax(0,1fr) 260px" : "300px minmax(0,1fr)" }, minHeight: 0, flex: 1, overflow: "hidden", borderRadius: 3, maxHeight: "100%", height: "100%", border: "1px solid", borderColor: "divider", boxShadow: "0 14px 38px rgba(15,23,42,.07)", bgcolor: "background.paper" }}>
      <Box sx={{ borderRight: { md: "none" }, borderColor: "divider", position: "relative", "&::after": { content: '""', position: "absolute", top: 14, bottom: 14, right: 0, width: "1px", background: "linear-gradient(180deg,transparent,rgba(148,163,184,.30) 18%,rgba(148,163,184,.20) 82%,transparent)" }, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,.018)" : "rgba(248,250,252,.72)" }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 1.75, py: 1.35, minHeight: 62 }}>
          <Box sx={{ minWidth: 0, pl: .25 }}><Typography sx={{ fontWeight: 900, lineHeight: 1.2 }}>Conversas</Typography><Typography variant="caption" color="text.secondary">{channels.length} conversa(s)</Typography></Box>
          <Stack direction="row">
            {["ADMIN","COORDENADOR"].includes(user?.role ?? "") && <Tooltip title="Consolidar conversas privadas duplicadas"><span><IconButton size="small" disabled={maintenanceRunning} onClick={() => void consolidateDirectDuplicates()}>{maintenanceRunning ? <CircularProgress size={17} /> : <CleaningServicesOutlined fontSize="small" />}</IconButton></span></Tooltip>}
            <Tooltip title="Conversa privada"><IconButton size="small" onClick={() => setDirectOpen(true)}><PersonOutlineRounded /></IconButton></Tooltip>
            <Tooltip title="Novo canal"><IconButton size="small" aria-label="Criar canal" onClick={() => setCreateOpen(true)}><AddCommentOutlined /></IconButton></Tooltip>
          </Stack>
        </Stack>
        <Box sx={{ px: 1.25, pb: 1 }}><TextField size="small" fullWidth value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Buscar conversa..." slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: .7, fontSize: 18, color: "text.secondary" }} /> } }} /></Box>
        <Divider />
        <List disablePadding>
          {sortedVisibleChannels.map((channel, index) => {
            const group = favorites.includes(channel.id) ? "Favoritos" : channel.type === "DIRECT" ? "Recentes" : "Equipes";
            const previousChannel = sortedVisibleChannels[index - 1];
            const previousGroup = previousChannel ? (favorites.includes(previousChannel.id) ? "Favoritos" : previousChannel.type === "DIRECT" ? "Recentes" : "Equipes") : null;
            return <Box key={channel.id}>
              {group !== previousGroup && <Typography variant="overline" sx={{ display: "block", px: 1.75, pt: index ? 1.2 : 1, pb: .25, fontSize: ".61rem", lineHeight: 1.4, letterSpacing: ".09em", fontWeight: 900, color: "text.secondary" }}>{group}</Typography>}
              
              <ListItemButton
                key={channel.id}
                selected={channel.id === selectedId}
                onClick={() => setSelectedId(channel.id)}
                sx={{
                  py: .72,
                  px: 1.25,
                  mx: 1,
                  my: .4,
                  minHeight: 58,
                  borderRadius: 2,
                  transition: "background-color .18s ease, transform .18s ease",
                  "&:hover": { transform: "translateX(2px)" },
                  "&.Mui-selected": { bgcolor: "action.selected", boxShadow: "inset 3px 0 0 rgba(24,199,122,.75)" },
                  "&.Mui-selected:hover": { bgcolor: "action.selected" },
                }}
              >
                <Box sx={{ position: "relative", mr: 1.1, width: 36, height: 36, minWidth: 36, flex: "0 0 36px", borderRadius: "50%", bgcolor: channel.id === selectedId ? "primary.main" : "action.hover", display: "grid", placeItems: "center", fontWeight: 900, boxShadow: channel.id === selectedId ? "0 5px 14px rgba(24,199,122,.18)" : "none" }}>
                  {channel.name.slice(0,1).toUpperCase()}
                  <Circle sx={{ position: "absolute", width: 11, height: 11, right: 0, bottom: 0, color: "success.main", stroke: "background.paper", strokeWidth: 4 }} />
                </Box>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={.5} sx={{ alignItems: "center", minWidth: 0 }}>
                      <Box sx={{ color: "text.secondary", display: "flex", alignItems: "center" }}>{channel.type === "DIRECT" ? <PersonOutlineRounded sx={{ fontSize: 14 }} /> : <GroupsOutlined sx={{ fontSize: 14 }} />}</Box><Typography noWrap sx={{ fontWeight: channel.unread ? 900 : 750, fontSize: ".88rem", flex: 1 }}>{channel.name}</Typography>
                      {favorites.includes(channel.id) && <Typography component="span" sx={{ color: "warning.main", fontSize: ".72rem" }}>★</Typography>}
                    </Stack>
                  }
                  secondary={channel.clientName || channel.description || (channel.unread ? `${channel.unread} nova(s) mensagem(ns)` : "Canal da equipe")}
                  slotProps={{ secondary: { sx: { fontSize: ".72rem", mt: .25, fontWeight: channel.unread ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } } }}
                />
                <Stack direction="row" spacing={.4} sx={{ alignItems: "center" }}>
                  <Tooltip title={favorites.includes(channel.id) ? "Remover dos favoritos" : "Favoritar"}>
                    <IconButton size="small" onClick={(event) => { event.stopPropagation(); toggleFavorite(channel.id); }} sx={{ width: 28, height: 28, p: .5, fontSize: 16 }}>{favorites.includes(channel.id) ? "★" : "☆"}</IconButton>
                  </Tooltip>
                  {channel.unread > 0 && <Chip size="small" color="primary" label={channel.unread} />}
                </Stack>
              </ListItemButton>
            </Box>;
          })}
        </List>
        {channelsLoading && !channels.length ? <Stack spacing={1} sx={{ px: 1.2, py: 1 }}><Skeleton variant="rounded" height={64} /><Skeleton variant="rounded" height={64} /><Skeleton variant="rounded" height={64} /></Stack> : !channels.length && <Box sx={{ p: 3, textAlign: "center" }}><Typography color="text.secondary" variant="body2">Crie o primeiro canal da equipe.</Typography></Box>}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ px: 1.5, py: 1, alignItems: "center", justifyContent: "space-between" }}><Box><Stack direction="row" spacing={.7} sx={{ alignItems: "center" }}><Typography sx={{ fontWeight: 900 }}>{selected?.name || "Selecione uma conversa"}</Typography>{selected && <Chip size="small" icon={<Circle sx={{ fontSize: "9px !important" }} />} label={selected?.type === "DIRECT" ? ({ ONLINE: "Online", AWAY: "Ausente", BUSY: "Ocupado", OFFLINE: "Offline" }[selectedPresence?.effectiveStatus ?? "OFFLINE"]) : `${selected.members?.filter((member) => presence.find((item) => item.userId === member.user.id)?.effectiveStatus !== "OFFLINE").length ?? 0} online`} color={selectedPresence?.effectiveStatus === "BUSY" ? "error" : selectedPresence?.effectiveStatus === "AWAY" ? "warning" : selectedPresence?.effectiveStatus === "ONLINE" ? "success" : "default"} variant="outlined" />}</Stack><Typography variant="caption" color="text.secondary">{selectedPresence?.statusMessage || "Mensagens instantâneas · tempo real"}</Typography></Box><Stack direction="row" spacing={.5}><TextField size="small" value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Buscar na conversa" sx={{ width: 210 }} slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: .5, fontSize: 17, color: "text.secondary" }} /> } }} /><Tooltip title="Informações da conversa"><span><IconButton size="small" disabled={!selected} aria-label="Informações da conversa" onClick={() => setConversationInfoOpen((current) => !current)} color={conversationInfoOpen ? "primary" : "default"}><InfoOutlined /></IconButton></span></Tooltip><IconButton size="small" aria-label="Opções da conversa" onClick={(event) => setConversationMenuAnchor(event.currentTarget)}><MoreHorizOutlined /></IconButton></Stack></Stack>
        <Divider />
        <Box ref={messagesRef} sx={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", p: { xs: 1.5, md: 2.25 }, bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,.012)" : "#f8fafb", backgroundImage: (theme) => theme.palette.mode === "dark" ? "radial-gradient(circle at 50% 0%, rgba(24,199,122,.035), transparent 36%)" : "radial-gradient(circle at 50% 0%, rgba(24,199,122,.045), transparent 38%)" }}>
          {loading ? <Stack spacing={1.1} sx={{ p: 1 }}><Skeleton variant="rounded" width="36%" height={48} /><Skeleton variant="rounded" width="52%" height={68} sx={{ alignSelf: "flex-end" }} /><Skeleton variant="rounded" width="28%" height={44} /></Stack> : visibleMessages.map((message, messageIndex) => {
            const mine = message.author.id === user?.id;
            const messageDay = new Date(message.createdAt).toLocaleDateString("pt-BR");
            const previousDay = messageIndex ? new Date(visibleMessages[messageIndex - 1].createdAt).toLocaleDateString("pt-BR") : null;
            const showDay = messageDay !== previousDay;
            const parent = message.parentId ? messages.find((item) => item.id === message.parentId) : null;
            const previous = visibleMessages[messageIndex - 1];
            const sameAuthor = previous?.author.id === message.author.id && (new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime()) < 5 * 60_000;
            const mentioned = Boolean(user?.username && message.content.toLowerCase().includes(`@${user.username.toLowerCase()}`));
            const renderContent = (value: string) => value.split(/(@[\\w.-]+)/g).map((part, index) => part.startsWith("@") ? <Box component="span" key={index} sx={{ fontWeight: 900, textDecoration: "underline" }}>{part}</Box> : part);
            return <Box key={message.id}>{showDay && <Stack direction="row" spacing={1} sx={{ alignItems: "center", my: 1.4 }}><Divider sx={{ flex: 1 }} /><Chip size="small" variant="outlined" label={messageDay === new Date().toLocaleDateString("pt-BR") ? "Hoje" : messageDay} sx={{ height: 22, fontSize: ".68rem", color: "text.secondary" }} /><Divider sx={{ flex: 1 }} /></Stack>}<Box sx={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", mb: sameAuthor ? .2 : .85, mt: sameAuthor ? 0 : .4 }}><Paper elevation={0} sx={{ maxWidth: { xs: "88%", md: "68%" }, p: "9px 12px", bgcolor: mine ? (theme) => theme.palette.mode === "dark" ? "rgba(51,65,85,.88)" : "#eef3f7" : mentioned ? "rgba(245,158,11,.10)" : "background.paper", color: "text.primary", border: "1px solid", borderColor: mentioned ? "warning.main" : mine ? "rgba(148,163,184,.32)" : "divider", borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px", boxShadow: mine ? "0 8px 20px rgba(24,199,122,.12)" : "0 5px 16px rgba(15,23,42,.045)" }}><Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}><Typography variant="caption" sx={{ fontWeight: 800, opacity: .8 }}>{sameAuthor ? "" : message.author.name}</Typography><Tooltip title="Responder"><IconButton size="small" onClick={() => setReplyTo(message)} sx={{ color: "inherit", opacity: .65 }}><ReplyOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip></Stack>{parent && <Box sx={{ px: 1, py: .6, mb: .6, borderLeft: "3px solid", borderColor: "primary.main", bgcolor: "action.hover", borderRadius: 1 }}><Typography variant="caption" sx={{ fontWeight: 800 }}>{parent.author.name}</Typography><Typography variant="caption" noWrap sx={{ display: "block", maxWidth: 420 }}>{parent.content}</Typography></Box>}{message.content.startsWith("[hub-card]") ? (() => { try { const card = JSON.parse(message.content.slice(10)) as { type: string; id?: number; title: string; client?: string | null; status?: string | null; path: string }; return <Paper elevation={0} sx={{ minWidth: { xs: 220, sm: 310 }, maxWidth: 430, p: 1.25, bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(15,23,42,.42)" : "#ffffff", color: "text.primary", border: "1px solid", borderColor: "divider", borderRadius: 2 }}><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}><Chip size="small" label={`${card.type}${card.id ? ` #${card.id}` : ""}`} sx={{ fontWeight: 850 }} />{card.status && <Chip size="small" variant="outlined" label={card.status} />}</Stack><Typography sx={{ mt: .8, fontWeight: 900, lineHeight: 1.3 }}>{card.title}</Typography>{card.client && <Typography variant="body2" sx={{ mt: .4, opacity: .75 }}>Cliente: {card.client}</Typography>}<Button size="small" endIcon={<OpenInNewOutlined />} sx={{ mt: .9, px: 0, color: "inherit", fontWeight: 850 }} onClick={() => navigate(card.path)}>Abrir registro</Button></Paper>; } catch { return <Typography>Registro compartilhado</Typography>; } })() : attachmentInfo(message.content) ? (() => { const attachment = attachmentInfo(message.content)!; return <Paper component="a" href={attachment.href} download={attachment.name} elevation={0} sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, minWidth: 210, maxWidth: 340, textDecoration: "none", color: "inherit", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 2 }}><Box sx={{ width: 34, height: 34, borderRadius: 1.5, display: "grid", placeItems: "center", bgcolor: "action.hover" }}><AttachFileRounded fontSize="small" /></Box><Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="body2" sx={{ fontWeight: 800 }} noWrap>{attachment.name}</Typography><Typography variant="caption" color="text.secondary">{Math.max(1, Math.round(attachment.size / 1024))} KB</Typography></Box><DownloadRounded fontSize="small" /></Paper>; })() : <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{renderContent(message.content)}</Typography>}<Typography variant="caption" sx={{ display: "block", textAlign: "right", opacity: .7 }}>{new Date(message.createdAt).toLocaleString("pt-BR")}</Typography></Paper></Box></Box>;
          })}
          <div ref={bottomRef} />
        </Box>
        <Divider />
        {typingNames.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ px: 1.6, pt: .45 }}>{typingNames.join(", ")} {typingNames.length === 1 ? "está" : "estão"} digitando...</Typography>}
        {replyTo && <Stack direction="row" sx={{ px: 1.5, py: .7, alignItems: "center", justifyContent: "space-between", bgcolor: "action.hover", borderTop: "1px solid", borderColor: "divider" }}><Box><Typography variant="caption" sx={{ fontWeight: 850 }}>Respondendo a {replyTo.author.name}</Typography><Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", maxWidth: 620 }}>{replyTo.content}</Typography></Box><IconButton size="small" onClick={() => setReplyTo(null)}><CloseOutlined fontSize="small" /></IconButton></Stack>}
        <Stack direction="row" spacing={.55} sx={{ px: 1.25, py: .85, alignItems: "flex-end", bgcolor: "background.paper", boxShadow: "0 -6px 18px rgba(15,23,42,.025)" }}>
          <input ref={attachmentInputRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendAttachment(file); }} /><Tooltip title="Anexar arquivo (máx. 8 MB)"><span><IconButton disabled={!selectedId || uploadingAttachment} onClick={() => attachmentInputRef.current?.click()}><AttachFileRounded /></IconButton></span></Tooltip><Tooltip title="Emojis"><IconButton onClick={(event) => setEmojiAnchor(event.currentTarget)} disabled={!selectedId}><EmojiEmotionsOutlined /></IconButton></Tooltip>
          <Tooltip title="Figurinhas"><IconButton onClick={() => setStickersOpen(true)} disabled={!selectedId}><CelebrationOutlined /></IconButton></Tooltip>
          <Tooltip title={soundEnabled ? "Desativar som" : "Ativar som"}><IconButton color={soundEnabled ? "primary" : "default"} onClick={() => { const next = !soundEnabled; setSoundEnabled(next); localStorage.setItem("techlead-chat-sound", next ? "on" : "off"); if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission(); }}><NotificationsActiveOutlined /></IconButton></Tooltip>
          <TextField size="small" fullWidth multiline maxRows={4} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,.04)" : "#f7f8fa", pr: .5 }, "& fieldset": { borderColor: "transparent" }, "& .Mui-focused fieldset": { borderColor: "primary.main" } }}  value={content} disabled={!selectedId || sending} placeholder="Escreva uma mensagem; use @usuario para mencionar..." slotProps={{ htmlInput: { maxLength: 4000 } }} onChange={(event) => { setContent(event.target.value); if (selectedId) void api.post(`/chat/channels/${selectedId}/typing`, { active: true }).catch(() => undefined); if (typingTimer.current) window.clearTimeout(typingTimer.current); typingTimer.current = window.setTimeout(() => { if (selectedId) void api.post(`/chat/channels/${selectedId}/typing`, { active: false }).catch(() => undefined); }, 1200); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
          <Button variant="contained" endIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendRounded />} disabled={!selectedId || !content.trim() || sending} onClick={() => void send()} sx={{ minWidth: 44, width: 44, height: 40, px: 0, borderRadius: 2.5, "& .MuiButton-endIcon": { m: 0 } }}><Box component="span" sx={{ display: "none" }}>Enviar</Box></Button>
        </Stack>
      </Box>
      {conversationInfoOpen && selected && <Box sx={{ display: { xs: "none", xl: "block" }, borderLeft: "1px solid", borderColor: "divider", p: 2, overflowY: "auto", bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,.015)" : "rgba(248,250,252,.72)" }}>
        <Stack spacing={2}>
          <Box sx={{ textAlign: "center", pt: 1 }}>
            <Box sx={{ width: 64, height: 64, mx: "auto", mb: 1, borderRadius: "50%", bgcolor: "primary.main", color: "primary.contrastText", display: "grid", placeItems: "center", fontSize: "1.35rem", fontWeight: 950, boxShadow: "0 10px 24px rgba(24,199,122,.18)" }}>{selected.name.slice(0,1).toUpperCase()}</Box>
            <Typography sx={{ fontWeight: 900 }}>{selected.name}</Typography>
            <Typography variant="caption" color="text.secondary">{selected.type === "DIRECT" ? "Conversa privada" : "Canal da equipe"}</Typography>
          </Box>
          <Divider />
          {selected.type === "DIRECT" && selectedPeer ? <Stack spacing={1}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900 }}>Contato</Typography>
            <Typography variant="body2"><b>Usuário:</b> @{selectedPeer.username}</Typography>
            <Typography variant="body2"><b>Perfil:</b> {selectedPeer.role}</Typography>
            <Stack direction="row" spacing={.7} sx={{ alignItems: "center" }}><Circle sx={{ fontSize: 10, color: presenceColor(selectedPresence?.effectiveStatus) }} /><Typography variant="body2">{({ ONLINE: "Online", AWAY: "Ausente", BUSY: "Ocupado", OFFLINE: "Offline" }[selectedPresence?.effectiveStatus ?? "OFFLINE"])}</Typography></Stack>
            {selectedPresence?.statusMessage && <Typography variant="body2" color="text.secondary">{selectedPresence.statusMessage}</Typography>}
          </Stack> : <Stack spacing={1}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900 }}>Participantes · {selected.members?.length ?? 0}</Typography>
            {selected.members?.map((member) => <Stack key={member.user.id} direction="row" spacing={1} sx={{ alignItems: "center" }}><Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: "action.hover", display: "grid", placeItems: "center", fontWeight: 850 }}>{member.user.name.slice(0,1)}</Box><Box sx={{ minWidth: 0 }}><Typography variant="body2" noWrap sx={{ fontWeight: 750 }}>{member.user.name}</Typography><Typography variant="caption" color="text.secondary">@{member.user.username}</Typography></Box></Stack>)}
          </Stack>}
          <Divider />
          <Button variant={favorites.includes(selected.id) ? "contained" : "outlined"} onClick={() => toggleFavorite(selected.id)} startIcon={<StarOutlineRounded />}>{favorites.includes(selected.id) ? "Favoritada" : "Adicionar aos favoritos"}</Button>
        </Stack>
      </Box>}
    </Paper>
    <Snackbar open={Boolean(maintenanceMessage)} autoHideDuration={6500} onClose={() => setMaintenanceMessage("")} message={maintenanceMessage} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    <Snackbar
      open={Boolean(incomingPopup)}
      onClose={(_, reason) => { if (reason !== "clickaway") setIncomingPopup(null); }}
      autoHideDuration={8000}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      sx={{ "& .MuiSnackbarContent-root": { p: 0, bgcolor: "transparent", boxShadow: "none" } }}
      message={incomingPopup ? <Paper elevation={10} sx={{ width: 340, maxWidth: "calc(100vw - 24px)", p: 1.35, borderRadius: 2.5, border: "1px solid", borderColor: "rgba(24,199,122,.35)", borderLeft: "4px solid", borderLeftColor: "primary.main", background: (theme) => theme.palette.mode === "dark" ? "linear-gradient(135deg,rgba(16,30,46,.98),rgba(17,48,42,.98))" : "linear-gradient(135deg,#fff,#f2fff9)", boxShadow: "0 18px 48px rgba(15,23,42,.20)" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <Box sx={{ width: 38, height: 38, borderRadius: "50%", bgcolor: "primary.main", color: "primary.contrastText", display: "grid", placeItems: "center", fontWeight: 950, flexShrink: 0 }}>{incomingPopup.authorName.slice(0,1).toUpperCase()}</Box>
          <Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="caption" color="primary.main" sx={{ fontWeight: 900 }}>NOVA MENSAGEM</Typography><Typography sx={{ fontWeight: 900, lineHeight: 1.2 }}>{incomingPopup.authorName}</Typography><Typography variant="caption" color="text.secondary">{incomingPopup.channelName}</Typography><Typography variant="body2" sx={{ mt: .55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{incomingPopup.preview}</Typography><Button size="small" sx={{ mt: .65, px: 0 }} onClick={() => { setSelectedId(incomingPopup.channelId); setIncomingPopup(null); }}>Abrir conversa</Button></Box>
          <IconButton size="small" onClick={() => setIncomingPopup(null)}><CloseOutlined fontSize="small" /></IconButton>
        </Stack>
      </Paper> : undefined}
    />
    <Menu anchorEl={conversationMenuAnchor} open={Boolean(conversationMenuAnchor)} onClose={() => setConversationMenuAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }} slotProps={{ paper: { sx: { mt: .5, minWidth: 220, borderRadius: 2.5, border: "1px solid", borderColor: "divider", boxShadow: "0 12px 30px rgba(15,23,42,.14)" } } }}>
      <MenuItem onClick={() => { if (selectedId) toggleFavorite(selectedId); setConversationMenuAnchor(null); }}><ListItemIcon><StarOutlineRounded fontSize="small" /></ListItemIcon>{selectedId && favorites.includes(selectedId) ? "Remover dos favoritos" : "Favoritar conversa"}</MenuItem>
      <MenuItem onClick={() => { setSoundEnabled(false); localStorage.setItem("techlead-chat-sound", "off"); setConversationMenuAnchor(null); }}><ListItemIcon><VolumeOffOutlined fontSize="small" /></ListItemIcon>Silenciar notificações</MenuItem>
      <Divider />
      <MenuItem disabled={!selectedId} onClick={() => { setConversationMenuAnchor(null); setDeleteConversationOpen(true); }} sx={{ color: "error.main" }}><ListItemIcon><DeleteOutlineRounded fontSize="small" color="error" /></ListItemIcon>Excluir conversa</MenuItem>
    </Menu>
    <Dialog open={deleteConversationOpen} onClose={() => setDeleteConversationOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle>Excluir conversa?</DialogTitle>
      <DialogContent><Alert severity="warning" sx={{ mb: 1.5 }}>Esta ação remove a conversa ativa da lista.</Alert><Typography variant="body2" color="text.secondary">{selected?.type === "DIRECT" ? "A conversa privada será arquivada para os participantes. O histórico não é apagado fisicamente e permanece preservado para auditoria." : "O canal da equipe será arquivado. Apenas coordenação ou administração pode realizar esta ação."}</Typography></DialogContent>
      <DialogActions><Button disabled={deletingConversation} onClick={() => setDeleteConversationOpen(false)}>Cancelar</Button><Button color="error" variant="contained" disabled={deletingConversation} startIcon={deletingConversation ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlineRounded />} onClick={() => void deleteConversation()}>{deletingConversation ? "Excluindo..." : "Excluir"}</Button></DialogActions>
    </Dialog>
    <Popover open={Boolean(emojiAnchor)} anchorEl={emojiAnchor} onClose={() => setEmojiAnchor(null)} anchorOrigin={{ vertical: "top", horizontal: "left" }} transformOrigin={{ vertical: "bottom", horizontal: "left" }}><Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 42px)", gap: .5, p: 1 }}>{emojis.map((emoji) => <IconButton key={emoji} onClick={() => { append(emoji); setEmojiAnchor(null); }} sx={{ fontSize: 22 }}>{emoji}</IconButton>)}</Box></Popover>
    <Dialog open={stickersOpen} onClose={() => setStickersOpen(false)} maxWidth="xs" fullWidth><DialogTitle>Figurinhas rápidas</DialogTitle><DialogContent><Box sx={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 1, pt: .5 }}>{stickers.map((sticker) => <Button key={sticker} variant="outlined" onClick={() => { append(sticker); setStickersOpen(false); }} sx={{ minHeight: 72, fontWeight: 850 }}>{sticker}</Button>)}</Box></DialogContent></Dialog>
    <Dialog open={directOpen} onClose={() => { setDirectOpen(false); if (pendingShare) { setPendingShare(null); navigate("/chat", { replace: true }); } }} fullWidth maxWidth="xs"><DialogTitle>{pendingShare ? "Enviar para alguém" : "Nova conversa privada"}</DialogTitle><DialogContent>{pendingShare && <Paper variant="outlined" sx={{ p: 1.2, mb: 1.25, borderColor: "primary.main", bgcolor: "rgba(24,199,122,.05)" }}><Typography variant="caption" color="primary" sx={{ fontWeight: 900 }}>{pendingShare.label}{pendingShare.recordId ? ` #${pendingShare.recordId}` : ""}</Typography><Typography variant="body2" sx={{ fontWeight: 850 }}>{pendingShare.title}</Typography><Typography variant="caption" color="text.secondary">Selecione o destinatário. O card será enviado automaticamente.</Typography></Paper>}<TextField autoFocus fullWidth size="small" placeholder="Buscar pessoa..." value={directSearch} onChange={(event) => setDirectSearch(event.target.value)} sx={{ mb: 1 }} slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: .6, fontSize: 18, color: "text.secondary" }} /> } }} /><List sx={{ maxHeight: 360, overflowY: "auto" }}>{participants.filter((person) => person.id !== user?.id && [person.name, person.username, person.role].some((value) => value.toLowerCase().includes(directSearch.toLowerCase()))).map((person) => { const existingDirect = channels.some((channel) => channel.type === "DIRECT" && channel.members?.some((member) => member.user.id === person.id) && channel.members?.some((member) => member.user.id === user?.id)); const personPresence = presence.find((item) => item.userId === person.id); return <ListItemButton key={person.id} disabled={openingDirectId === person.id} onClick={() => void openDirect(person)} sx={{ borderRadius: 1.5, mb: .35 }}><Box sx={{ position: "relative", width: 36, height: 36, borderRadius: "50%", bgcolor: "action.hover", display: "grid", placeItems: "center", mr: 1.2, fontWeight: 900 }}>{person.name.slice(0,1)}<Circle sx={{ position: "absolute", right: -1, bottom: -1, fontSize: 9, color: presenceColor(personPresence?.effectiveStatus) }} /></Box><ListItemText primary={person.name} secondary={pendingShare ? (existingDirect ? "Enviar na conversa existente" : `@${person.username} · iniciar e enviar`) : (existingDirect ? "Conversa já iniciada · clique para abrir" : `@${person.username} · ${person.role}`)} />{openingDirectId === person.id && <CircularProgress size={18} />}</ListItemButton>; })}</List></DialogContent></Dialog>
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Novo canal da equipe</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth label="Nome do canal" value={channelName} onChange={(event) => setChannelName(event.target.value)} sx={{ mt: 1, mb: 2 }} slotProps={{ htmlInput: { maxLength: 120 } }} />
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Participantes</Typography>
        <Box sx={{ maxHeight: 280, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1, px: 1 }}>
          {participants.filter((person) => person.id !== user?.id).map((person) => (
            <FormControlLabel
              key={person.id}
              control={<Checkbox checked={memberIds.includes(person.id)} onChange={(_, checked) => setMemberIds((current) => checked ? [...current, person.id] : current.filter((id) => id !== person.id))} />}
              label={`${person.name} · @${person.username}`}
              sx={{ display: "flex", mx: 0 }}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setCreateOpen(false)}>Cancelar</Button>
        <Button variant="contained" disabled={channelName.trim().length < 3} onClick={() => void createChannel()}>Criar canal</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}



function presenceColor(status: Presence["effectiveStatus"] | undefined) {
  if (status === "ONLINE") return "success.main";
  if (status === "AWAY") return "warning.main";
  if (status === "BUSY") return "error.main";
  return "text.disabled";
}
