import { useTheme } from "@mui/material/styles";
import { ArrowBackRounded, ForumOutlined, ReplyOutlined, CloseOutlined, SearchOutlined, Circle, DeleteOutlineRounded, StarOutlineRounded, VolumeOffOutlined, GroupsOutlined, PersonOutlineRounded, BoltOutlined, AssignmentTurnedInOutlined, AlternateEmailOutlined, KeyboardArrowDownRounded } from "@mui/icons-material";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Drawer, FormControlLabel, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Popover, Skeleton, Snackbar, Stack, TextField, Typography, useMediaQuery } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { playNotificationSound } from "../utils/notificationSound";
import { IncidentActionsPanel } from "../components/IncidentActionsPanel";
import { ChatHistorySearch } from "../components/ChatHistorySearch";
import { IncidentContextSummary } from "../components/chat/IncidentContextSummary";
import { SharedFilesPanel } from "../components/chat/SharedFilesPanel";
import { ConversationListHeader } from "../components/chat/ConversationListHeader";
import { ConversationListSearch } from "../components/chat/ConversationListSearch";
import { ChannelList } from "../components/chat/ChannelList";
import { ConversationHeader } from "../components/chat/ConversationHeader";
import { MessageList } from "../components/chat/MessageList";
import { Composer } from "../components/chat/Composer";
import { normalizeChatChannels, useChannelDirectory } from "../components/chat/hooks/useChannelDirectory";
import { useMessageView } from "../components/chat/hooks/useMessageView";
import { useChatRealtime } from "../components/chat/hooks/useChatRealtime";
import { useChatPresence } from "../components/chat/hooks/useChatPresence";
import { useChatReadReceipts } from "../components/chat/hooks/useChatReadReceipts";
import { useChatTyping } from "../components/chat/hooks/useChatTyping";
import { useChatHistory } from "../components/chat/hooks/useChatHistory";


import { presenceColor } from "../components/chat/chatTypes";
import type { Person, Message, Channel, Presence, RealtimeSnapshot } from "../components/chat/chatTypes";

export function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [participants, setParticipants] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(() => { const value = Number(new URLSearchParams(window.location.search).get("channel")); return Number.isFinite(value) && value > 0 ? value : null; });
  const [content, setContent] = useState("");
  const notifyTyping = useChatTyping(selectedId);
  const [quickActionsAnchor, setQuickActionsAnchor] = useState<HTMLElement | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState("");
  const { availability, statusMessage, cycleAvailability } = useChatPresence(setError);
  const [createOpen, setCreateOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [stickerFx, setStickerFx] = useState<string | null>(null);
  const stickerFxTimer = useRef<number | null>(null);
  const previousUnread = useRef(0);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [conversationSearch, setConversationSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [favorites, setFavorites] = useState<number[]>(() => { try { return JSON.parse(localStorage.getItem("techlead-chat-favorites") || "[]"); } catch { return []; } });
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("techlead-chat-sound") !== "off");
  const [directOpen, setDirectOpen] = useState(false);
  const [directSearch, setDirectSearch] = useState("");
  const contextRequestStarted = useRef(false);
  const [pendingShare, setPendingShare] = useState<{ label: string; recordId?: number; title: string; client?: string | null; status?: string | null; path: string } | null>(() => {
    const raw = new URLSearchParams(window.location.search).get("share");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  });
  const [openingDirectId, setOpeningDirectId] = useState<number | null>(null);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [remoteTyping, setRemoteTyping] = useState<RealtimeSnapshot["typing"]>([]);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [conversationMenuAnchor, setConversationMenuAnchor] = useState<HTMLElement | null>(null);
  const [deleteConversationOpen, setDeleteConversationOpen] = useState(false);
  const [deletingConversation, setDeletingConversation] = useState(false);
  const [maintenanceRunning, setMaintenanceRunning] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const theme = useTheme();
  const compactContext = useMediaQuery(theme.breakpoints.down("lg"));
  const wideContext = useMediaQuery(theme.breakpoints.up("xl"));
  const [widePanelVisible, setWidePanelVisible] = useState(true);
  const [conversationInfoOpen, setConversationInfoOpen] = useState(false);
  const [incidentActionsOpen, setIncidentActionsOpen] = useState(false);
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const [teamPanelOpen, setTeamPanelOpen] = useState(true);
  const [onlineAnchor, setOnlineAnchor] = useState<HTMLElement | null>(null);
  const [incomingPopup, setIncomingPopup] = useState<{ channelId: number; channelName: string; authorName: string; preview: string } | null>(null);
  const previousChannelState = useRef<Map<number, { unread: number; lastMessageId: number | null }>>(new Map());
  const markRead = useChatReadReceipts({ selectedId, onRead: (channelId) => {
    setChannels((current) => current.map((channel) => channel.id === channelId ? { ...channel, unread: 0 } : channel));
    window.dispatchEvent(new Event("techlead-hub:chat-read"));
  } });
  const { messages, setMessages, loading, hasOlder, loadingOlder, showJumpToLatest, setShowJumpToLatest, loadMessages, loadOlder, handleMessagesScroll: handleHistoryScroll, jumpToLatest } = useChatHistory({ selectedId, messagesRef, markRead, setError });
  const handleMessagesScroll = useCallback(() => handleHistoryScroll(messageSearch), [handleHistoryScroll, messageSearch]);
  useEffect(() => {
    setReplyTo(null);
    setContent("");
    setMessageSearch("");
  }, [selectedId]);
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;

  const { selected, sidebarChannels, totalUnread } = useChannelDirectory({ channels, selectedId, conversationSearch, favorites });
  const showSidePanel = Boolean(selected) && (conversationInfoOpen || selected?.type === "CONTEXT" || (selected?.type === "TEAM" && teamPanelOpen) || (wideContext && widePanelVisible));
  const selectConversation = useCallback((channelId: number) => { setSelectedId(channelId); setMobileConversationOpen(true); }, []);
  const backToConversations = useCallback(() => { setMobileConversationOpen(false); setConversationInfoOpen(false); }, []);
  const selectedPeer = useMemo(() => selected?.type === "DIRECT" ? selected.members?.map((member) => member.user).find((person) => person.id !== user?.id) : null, [selected, user?.id]);
  const selectedPresence = selectedPeer ? presence.find((item) => item.userId === selectedPeer.id) : null;
  const typingNames = remoteTyping.filter((item) => item.channelId === selectedId).map((item) => item.name);
  const { pinState, visibleMessages, pinnedMessages, coordinationHighlights, channelPendencies } = useMessageView(messages, messageSearch);
  const selectedOnlineCount = useMemo(() => selected?.members?.filter((member) => presence.find((item) => item.userId === member.user.id)?.effectiveStatus === "ONLINE").length ?? 0, [selected, presence]);
  const participantPresence = useMemo(() => participants
    .filter((person) => person.id !== user?.id)
    .map((person) => ({
      person,
      presence: presence.find((item) => item.userId === person.id) ?? null,
    })), [participants, presence, user?.id]);
  const onlinePeople = useMemo(() => participantPresence
    .filter((item) => item.presence?.effectiveStatus === "ONLINE")
    .sort((a,b) => a.person.name.localeCompare(b.person.name, "pt-BR")), [participantPresence]);
  const connectedUnavailablePeople = useMemo(() => participantPresence
    .filter((item) => item.presence?.effectiveStatus === "AWAY" || item.presence?.effectiveStatus === "BUSY")
    .sort((a,b) => {
      const weight = (status: Presence["effectiveStatus"] | undefined) => status === "BUSY" ? 0 : 1;
      return weight(a.presence?.effectiveStatus)-weight(b.presence?.effectiveStatus) || a.person.name.localeCompare(b.person.name, "pt-BR");
    }), [participantPresence]);
  const loadChannels = useCallback(async () => {
    const response = await api.get<{ channels: Channel[] }>("/chat/channels");
    const rawChannels = Array.isArray(response.data.channels) ? response.data.channels : [];
    const { channels: nextChannels, directByPeer } = normalizeChatChannels(rawChannels, user?.id, selectedIdRef.current);
    const requestedId = Number(searchParams.get("channel"));
    const requestedChannel = rawChannels.find((channel) => channel.id === requestedId);
    let requestedTargetId: number | null = null;
    if (requestedChannel) {
      const directVisible = nextChannels.find((channel) => channel.id === requestedChannel.id);
      if (directVisible) {
        requestedTargetId = directVisible.id;
      } else if (requestedChannel.type === "DIRECT") {
        const requestedPeerId = requestedChannel.members?.map((member) => member.user.id).find((id) => id !== user?.id);
        requestedTargetId = requestedPeerId ? directByPeer.get(requestedPeerId)?.id ?? null : null;
      }
    }
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

    setSelectedId((current) =>
      requestedTargetId ??
      current ??
      nextChannels[0]?.id ??
      null,
    );
    if (requestedTargetId && searchParams.has("channel")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("channel");
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, user?.id]);

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
        setError(requestError?.response?.data?.error || "Não foi possível atualizar a lista de conversas.");
      }
      setChannelsLoading(false);
    };
    void bootstrap();
    return () => { active = false; };
  }, [loadChannels]);
  useEffect(() => {
    if (!pendingShare) return;
    setDirectOpen(true);
  }, [pendingShare]);

  useEffect(() => {
    const ticket = searchParams.get("contextTicket");
    const task = searchParams.get("contextTask");
    if ((!ticket && !task) || contextRequestStarted.current) return;
    contextRequestStarted.current = true;
    const contextType = ticket ? "TICKET" : "TASK";
    const contextId = ticket || task;
    void api.post<Channel>("/chat/context", { contextType, contextId })
      .then(async ({ data: channel }) => {
        setSelectedId(channel.id); setMobileConversationOpen(true);
        await loadChannels();
        setError("");
      })
      .catch((requestError) => {
        setError(requestError?.response?.data?.error || "Não foi possível abrir a sala de incidente.");
      })
      .finally(() => {
        const next = new URLSearchParams(searchParams);
        ["contextTicket", "contextTask", "contextTitle", "contextClient"].forEach((key) => next.delete(key));
        setSearchParams(next, { replace: true });
      });
  }, [searchParams, setSearchParams, loadChannels]);

  useEffect(() => {
    const unread = channels.reduce((sum, channel) => sum + channel.unread, 0);
    if (unread > previousUnread.current && soundEnabled) {
      playNotificationSound("chat");
      if (document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") new Notification("TechLead Hub", { body: "Você recebeu uma nova mensagem no chat." });
    }
    previousUnread.current = unread;
  }, [channels, soundEnabled]);

  useChatRealtime({
    selectedId,
    onChannelsChanged: loadChannels,
    onMessagesChanged: (channelId) => loadMessages(channelId, true),
    setPresence,
    setRemoteTyping,
  });

  async function openDirect(person: Person) {
    if (openingDirectId) return;
    const existing = channels.find((channel) =>
      channel.type === "DIRECT" &&
      channel.members?.some((member) => member.user.id === person.id) &&
      channel.members?.some((member) => member.user.id === user?.id),
    );
    if (existing) {
      setSelectedId(existing.id); setMobileConversationOpen(true);
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
      setSelectedId(response.data.id); setMobileConversationOpen(true);
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
      setSelectedId(response.data.id); setMobileConversationOpen(true);
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

  function openSharedRecord(card: { type: string; id?: number; path?: string }) {
    const id = Number(card.id);
    const type = String(card.type || "").toLocaleLowerCase("pt-BR");
    if (Number.isFinite(id) && id > 0) {
      if (type.includes("ticket") || type.includes("atendimento")) {
        navigate(`/operacao/tickets?movidesk=${id}`);
        return;
      }
      if (type.includes("apoio")) {
        navigate(`/apoios?task=${id}`);
        return;
      }
      if (type.includes("evolu")) {
        navigate(`/evolucoes?task=${id}`);
        return;
      }
      if (type.includes("corre") || type.includes("bug") || type.includes("task")) {
        navigate(card.path?.startsWith("/correcoes?reportMonth=")?card.path:`/correcoes?task=${id}`);
        return;
      }
    }
    if (card.path) navigate(card.path);
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
    if (!selectedId || !text || sendingRef.current) return;
    const channelId=selectedId;
    sendingRef.current=true;
    try {
      setSending(true);
      const response = await api.post<Message>(`/chat/channels/${selectedId}/messages`, { content: text, parentId: replyTo?.id ?? null, clientMessageId: crypto.randomUUID() });
      if (selectedIdRef.current !== channelId) return;
      setMessages((current) => current.some(item=>item.id===response.data.id)?current:[...current, response.data]);
      setShowJumpToLatest(false);
      setContent("");
      setReplyTo(null);
      setError("");
    } catch (requestError: any) { setError(requestError?.response?.data?.error || "Não foi possível enviar a mensagem."); }
    finally { sendingRef.current=false;setSending(false); }
  }

  const togglePinnedMessage = useCallback(async (messageId: number) => {
    if (!selectedId) return;
    try {
      await api.post(`/chat/channels/${selectedId}/messages`, { content: `${pinState.has(messageId) ? "[chat-unpin]" : "[chat-pin]"}${messageId}` });
      await loadMessages(selectedId, true);
    } catch { setError("Não foi possível atualizar a mensagem fixada."); }
  }, [selectedId, pinState, loadMessages]);

  const emojis = ["😀","😃","😄","😁","😆","😂","🤣","😊","😉","😍","🥰","😘","😎","🤩","🥳","🤔","🫡","😴","😅","😬","🙄","😮","😢","😭","😡","🤯","❤️","🧡","💛","💚","💙","💜","🤍","💯","✨","⭐","🔥","🎉","🎊","🚀","🎯","💡","⚡","✅","⚠️","❌","👍","👎","👏","🙌","🙏","🤝","💪","👀","👌","✌️","👋","💬","📣","📌","🛠️","💻","📊","📈","🏆","☕","🍕","😎","🤖"];
  const stickers = ["🎉 PARABÉNS!","🚀 VAMOS!","✅ RESOLVIDO","👏 BOA!","🎯 NA META","🔥 PRIORIDADE","💡 IDEIA","🤝 OBRIGADO","☕ CAFÉ?","😎 FECHOU!","🛠️ EM ANÁLISE","📣 ATENÇÃO"];
  const launchStickerFx = useCallback((sticker: string) => {
    if (stickerFxTimer.current) window.clearTimeout(stickerFxTimer.current);
    setStickerFx(sticker);
    if (soundEnabled) playNotificationSound("sticker");
    stickerFxTimer.current = window.setTimeout(() => setStickerFx(null), 2450);
  }, [soundEnabled]);
  const launchEmojiFx = useCallback((emoji: string) => {
    if (stickerFxTimer.current) window.clearTimeout(stickerFxTimer.current);
    setStickerFx(emoji);
    if (soundEnabled) playNotificationSound("sticker");
    stickerFxTimer.current = window.setTimeout(() => setStickerFx(null), 2050);
  }, [soundEnabled]);
  const sendEmoji = useCallback(async (emoji: string) => {
    if (!selectedId || sending) return;
    setEmojiAnchor(null);
    launchEmojiFx(emoji);
    setSending(true);
    try {
      const response = await api.post<Message>(`/chat/channels/${selectedId}/messages`, { content: emoji });
      setMessages((current) => [...current, response.data]);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch { setError("Não foi possível enviar o emoji."); }
    finally { setSending(false); }
  }, [selectedId, sending, launchEmojiFx]);
  const sendSticker = useCallback(async (sticker: string) => {
    if (!selectedId || sending) return;
    setStickersOpen(false);
    launchStickerFx(sticker);
    setSending(true);
    try {
      const response = await api.post<Message>(`/chat/channels/${selectedId}/messages`, { content: sticker });
      setMessages((current) => [...current, response.data]);
      if (soundEnabled) window.setTimeout(() => playNotificationSound("sent"), 180);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch { setError("Não foi possível enviar a figurinha."); }
    finally { setSending(false); }
  }, [selectedId, sending, launchStickerFx, soundEnabled]);
  const append = (value: string) => setContent((current) => current ? `${current} ${value}` : value);

  return <Stack spacing={0} sx={{ height: "100%", maxHeight: "100%", minHeight: 0, overflow: "hidden", px: { xs: .5, sm: 1, md: 1.5 }, pb: { xs: .5, md: 1.25 }, pt: { xs: .5, md: 1.25 }, boxSizing: "border-box", bgcolor: "background.default" }}>
    <Popover
      open={Boolean(onlineAnchor)}
      anchorEl={onlineAnchor}
      onClose={() => setOnlineAnchor(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{ paper: { sx: { width: 330, maxWidth: "calc(100vw - 24px)", mt: .8, borderRadius: 2.5, border: "1px solid", borderColor: "divider", boxShadow: "0 18px 48px rgba(15,23,42,.16)", overflow: "hidden" } } }}
    >
      <Box sx={{ px: 1.5, py: 1.25, bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(24,199,122,.05)" : "rgba(24,199,122,.035)" }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Box>
            <Typography sx={{ fontWeight: 900 }}>Online agora</Typography>
            <Typography variant="caption" color="text.secondary">{onlinePeople.length} pessoa(s) disponível(is)</Typography>
          </Box>
          <Chip size="small" color="success" icon={<Circle sx={{ fontSize: "9px !important" }} />} label={onlinePeople.length} sx={{ fontWeight: 900 }} />
        </Stack>
      </Box>
      <Divider />
      <Box sx={{ maxHeight: 390, overflowY: "auto", p: .75 }}>
        {onlinePeople.length ? (
          <List disablePadding>
            {onlinePeople.map(({person,presence:personPresence}) => (
              <ListItemButton
                key={person.id}
                disabled={openingDirectId === person.id}
                onClick={() => { setOnlineAnchor(null); void openDirect(person); }}
                sx={{ borderRadius: 2, mb: .35, px: 1, py: .7 }}
              >
                <Box sx={{ position: "relative", width: 34, height: 34, minWidth: 34, borderRadius: "50%", bgcolor: "action.hover", display: "grid", placeItems: "center", mr: 1.1, fontWeight: 900 }}>
                  {person.name.slice(0,1).toUpperCase()}
                  <Circle sx={{ position: "absolute", right: -1, bottom: -1, fontSize: 10, color: "success.main", stroke: "background.paper", strokeWidth: 4 }} />
                </Box>
                <ListItemText
                  primary={<Typography variant="body2" sx={{ fontWeight: 800 }}>{person.name}</Typography>}
                  secondary={<Typography variant="caption" color="text.secondary">@{person.username} · {person.role}{personPresence?.statusMessage ? ` · ${personPresence.statusMessage}` : ""}</Typography>}
                />
                {openingDirectId === person.id ? <CircularProgress size={17} /> : <Chip size="small" color="success" variant="outlined" label="Online" sx={{ height: 20, fontSize: ".64rem" }} />}
              </ListItemButton>
            ))}
          </List>
        ) : (
          <Box sx={{ px: 1.25, py: 2.4, textAlign: "center" }}>
            <Circle sx={{ fontSize: 12, color: "text.disabled", mb: .7 }} />
            <Typography variant="body2" sx={{ fontWeight: 800 }}>Ninguém disponível agora</Typography>
            <Typography variant="caption" color="text.secondary">A presença é atualizada automaticamente enquanto o Hub está aberto.</Typography>
          </Box>
        )}
        {connectedUnavailablePeople.length > 0 && <>
          <Divider sx={{ my: .8 }} />
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", px: 1, pb: .35, fontWeight: 900, fontSize: ".62rem" }}>CONECTADOS · OUTRO STATUS</Typography>
          <List disablePadding>
            {connectedUnavailablePeople.map(({person,presence:personPresence}) => (
              <ListItemButton
                key={person.id}
                disabled={openingDirectId === person.id}
                onClick={() => { setOnlineAnchor(null); void openDirect(person); }}
                sx={{ borderRadius: 2, mb: .25, px: 1, py: .6 }}
              >
                <Box sx={{ position: "relative", width: 30, height: 30, minWidth: 30, borderRadius: "50%", bgcolor: "action.hover", display: "grid", placeItems: "center", mr: 1, fontWeight: 850 }}>
                  {person.name.slice(0,1).toUpperCase()}
                  <Circle sx={{ position: "absolute", right: -1, bottom: -1, fontSize: 9, color: presenceColor(personPresence?.effectiveStatus), stroke: "background.paper", strokeWidth: 4 }} />
                </Box>
                <ListItemText
                  primary={<Typography variant="body2" sx={{ fontWeight: 750 }}>{person.name}</Typography>}
                  secondary={`@${person.username} · ${personPresence?.effectiveStatus === "BUSY" ? "ocupado" : "ausente"}`}
                  slotProps={{ secondary: { sx: { fontSize: ".69rem" } } }}
                />
              </ListItemButton>
            ))}
          </List>
        </>}
      </Box>
    </Popover>
    {selected?.type === "CONTEXT" && selectedId && <IncidentActionsPanel channelId={selectedId} open={incidentActionsOpen} onClose={() => setIncidentActionsOpen(false)} />}
    {selectedId && <ChatHistorySearch channelId={selectedId} open={historySearchOpen} onClose={() => setHistorySearchOpen(false)} />}
    {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
    <Drawer anchor="right" open={compactContext && conversationInfoOpen && Boolean(selected)} onClose={() => setConversationInfoOpen(false)}
      sx={{ display: { xs: "block", lg: "none" } }}
      slotProps={{ paper: { sx: { width: { xs: "min(92vw, 360px)", sm: 380 }, maxWidth: "100vw", p: 2, bgcolor: "background.paper" } } }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Informações da conversa</Typography>
          <IconButton aria-label="Fechar informações" onClick={() => setConversationInfoOpen(false)}><CloseOutlined /></IconButton>
        </Stack>
        <Divider />
        {selected && <>
          <Typography sx={{ fontWeight: 800 }}>{selected.name}</Typography>
          <Chip size="small" label={selected.type === "CONTEXT" ? "Sala de incidente" : selected.type === "DIRECT" ? "Conversa direta" : "Canal da equipe"} sx={{ alignSelf: "flex-start" }} />
          {selected.description && <Typography variant="body2" color="text.secondary">{selected.description}</Typography>}
          {selected.type === "CONTEXT" && <IncidentContextSummary channel={selected} onOpenActions={() => { setConversationInfoOpen(false); setIncidentActionsOpen(true); }} onSearchHistory={() => { setConversationInfoOpen(false); setHistorySearchOpen(true); }} />}
          <SharedFilesPanel channelId={selected.id} messages={messages} />
          <Typography variant="subtitle2">Participantes ({selected.members?.length ?? 0})</Typography>
          <Stack spacing={1}>{selected.members?.map((member) => <Typography variant="body2" key={member.user.id}>{member.user.name} · @{member.user.username}</Typography>)}</Stack>
          <Button variant="outlined" onClick={() => { setConversationInfoOpen(false); setHistorySearchOpen(true); }}>Pesquisar histórico</Button>
        </>}
      </Stack>
    </Drawer>
    <Paper elevation={0} sx={{
      display: "grid",
      gridTemplateColumns: {
        xs: "minmax(0, 1fr)",
        md: "276px minmax(0, 1fr)",
        lg: showSidePanel
          ? "284px minmax(0, 1fr) 276px"
          : "284px minmax(0, 1fr)",
        xl: showSidePanel
          ? "300px minmax(0, 1fr) 310px"
          : "300px minmax(0, 1fr)",
      },
      gap: 0,
      p: 0,
      minHeight: 0,
      flex: 1,
      overflow: "hidden",
      borderRadius: { xs: 2, md: 4 },
      maxHeight: "100%",
      height: "100%",
      border: "1px solid",
      borderColor: "divider",
      boxShadow: (theme) => theme.shadows[3],
      bgcolor: "background.paper",
    }}>
      <Box sx={{ position: "relative", minHeight: 0, overflow: "hidden", display: { xs: mobileConversationOpen ? "none" : "grid", md: "grid" }, gridTemplateRows: "auto auto 1px minmax(0, 1fr)", alignContent: "stretch", borderRadius: 0, bgcolor: "background.paper", borderRight: { md: "1px solid" }, borderColor: "divider" }}>
        <ConversationListHeader channelCount={channels.length} unreadCount={totalUnread} availability={availability} onChangeAvailability={cycleAvailability} canMaintain={["ADMIN", "COORDENADOR"].includes(user?.role ?? "")} maintenanceRunning={maintenanceRunning} onConsolidate={() => void consolidateDirectDuplicates()} onOpenDirect={() => setDirectOpen(true)} onCreateChannel={() => setCreateOpen(true)} />
        <ConversationListSearch value={conversationSearch} onChange={setConversationSearch} />
        <Box sx={{ mx: 1.2, height: 6 }} />
        <Box sx={{ minHeight: 0, height: "100%", overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
        <ChannelList channels={sidebarChannels} selectedId={selectedId} favorites={favorites} presence={presence} remoteTyping={remoteTyping} currentUserId={user?.id} onSelect={selectConversation} onToggleFavorite={toggleFavorite} />
        </Box>
        {channelsLoading && !channels.length ? <Stack spacing={1} sx={{ px: 1.2, py: 1 }}><Skeleton variant="rounded" height={54} /><Skeleton variant="rounded" height={54} /><Skeleton variant="rounded" height={54} /></Stack> : !channels.length && <Box sx={{ px: 2.5, py: 5, textAlign: "center" }}><Box sx={{ width: 52, height: 52, mx: "auto", mb: 1.5, borderRadius: 3, display: "grid", placeItems: "center", bgcolor: "action.hover", color: "primary.main" }}><ForumOutlined /></Box><Typography sx={{ fontWeight: 800, fontSize: ".9rem" }}>Comece uma conversa</Typography><Typography color="text.secondary" variant="body2" sx={{ mt: .65, lineHeight: 1.5 }}>Converse com alguém do time ou crie um canal para colaborar.</Typography><Button size="small" variant="contained" startIcon={<PersonOutlineRounded />} onClick={() => setDirectOpen(true)} sx={{ mt: 2, borderRadius: 5, boxShadow: "none" }}>Nova conversa</Button></Box>}
      </Box>
      <Box sx={{ display: { xs: mobileConversationOpen ? "flex" : "none", md: "flex" }, flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden", borderRadius: 0, bgcolor: "background.paper" }}>
        <Box sx={{ display: { xs: "flex", md: "none" }, alignItems: "center", gap: 1, px: 1, py: .5, borderBottom: "1px solid", borderColor: "divider" }}><IconButton aria-label="Voltar para conversas" onClick={backToConversations}><ArrowBackRounded /></IconButton><Typography variant="body2" color="text.secondary">Conversas</Typography></Box>
        <ConversationHeader selected={selected} selectedPresence={selectedPresence} presence={presence} messageSearch={messageSearch} onMessageSearch={setMessageSearch} onOpenActions={() => setIncidentActionsOpen(true)} onSearchHistory={() => setHistorySearchOpen(true)} onOpenOrigin={(contextType, contextId) => navigate(contextType === "TICKET" ? `/operacao/tickets?movidesk=${encodeURIComponent(contextId)}` : `/correcoes?task=${encodeURIComponent(contextId)}`)} teamPanelOpen={teamPanelOpen} onToggleTeamPanel={() => setTeamPanelOpen((value) => !value)} conversationInfoOpen={wideContext ? showSidePanel : conversationInfoOpen} onToggleConversationInfo={() => { if (wideContext) { setWidePanelVisible((value) => !value); setConversationInfoOpen(false); } else setConversationInfoOpen((value) => !value); }} onOpenMenu={setConversationMenuAnchor} />
        <Divider />
        <Box ref={messagesRef} onScroll={handleMessagesScroll} sx={{ position: "relative", flex: "1 1 0", height: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", p: { xs: 1.25, md: 1.75 }, scrollbarWidth: "thin", "&::-webkit-scrollbar": { width: 7 }, "&::-webkit-scrollbar-thumb": { bgcolor: "action.disabled", borderRadius: 8 }, "&::-webkit-scrollbar-track": { bgcolor: "transparent" }, bgcolor: "background.paper" }}>
          {!selected && !loading && <Stack spacing={2} sx={{ height: "100%", alignItems: "center", justifyContent: "center", textAlign: "center", px: 3 }}>
            <Box sx={{ width: 76, height: 76, borderRadius: 5, display: "grid", placeItems: "center", bgcolor: "action.hover", color: "primary.main" }}><ForumOutlined sx={{ fontSize: 36 }} /></Box>
            <Box><Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: "-.02em" }}>Sua próxima conversa começa aqui</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .75, maxWidth: 390 }}>Troque mensagens com sua equipe, compartilhe arquivos e acompanhe decisões em um só lugar.</Typography></Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", justifyContent: "center" }}>
              <Button variant="contained" onClick={() => setDirectOpen(true)} sx={{ borderRadius: 5, boxShadow: "none" }}>Iniciar conversa</Button>
              <Button variant="outlined" onClick={() => setCreateOpen(true)} sx={{ borderRadius: 5 }}>Criar canal</Button>
            </Stack>
          </Stack>}
          {selected && (loading ? <Stack spacing={1.1} sx={{ p: 1 }}><Skeleton variant="rounded" width="36%" height={48} /><Skeleton variant="rounded" width="52%" height={68} sx={{ alignSelf: "flex-end" }} /><Skeleton variant="rounded" width="28%" height={44} /></Stack> : <><Box sx={{ textAlign: "center" }}>{hasOlder && !messageSearch.trim() && <Button size="small" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Carregando..." : "Mensagens anteriores"}</Button>}</Box><MessageList visibleMessages={visibleMessages} messages={messages} currentUserId={user?.id} currentUsername={user?.username} pinnedIds={pinState} onTogglePinned={(id) => void togglePinnedMessage(id)} onReply={setReplyTo} onOpenRecord={openSharedRecord} /></>)}
          <div ref={bottomRef} />
          {showJumpToLatest && <Button variant="contained" size="small" startIcon={<KeyboardArrowDownRounded />} onClick={jumpToLatest} sx={{ position: "sticky", bottom: 10, left: "50%", transform: "translateX(-50%)", zIndex: 4, borderRadius: 99, px: 1.5, boxShadow: "0 10px 28px rgba(15,23,42,.22)", textTransform: "none" }}>Mensagens recentes</Button>}
        </Box>
        <Divider />
        {typingNames.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ px: 1.6, pt: .45 }}>{typingNames.join(", ")} {typingNames.length === 1 ? "está" : "estão"} digitando...</Typography>}
        {replyTo && <Stack direction="row" sx={{ px: 1.5, py: .7, alignItems: "center", justifyContent: "space-between", bgcolor: "action.hover", borderTop: "1px solid", borderColor: "divider" }}><Box><Typography variant="caption" sx={{ fontWeight: 850 }}>Respondendo a {replyTo.author.name}</Typography><Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", maxWidth: 620 }}>{replyTo.content}</Typography></Box><IconButton size="small" onClick={() => setReplyTo(null)}><CloseOutlined fontSize="small" /></IconButton></Stack>}
        <Composer channelId={selectedId} channelType={selected?.type} content={content} sending={sending} uploadingAttachment={uploadingAttachment} soundEnabled={soundEnabled} attachmentInputRef={attachmentInputRef} onAttach={(file) => void sendAttachment(file)} onOpenEmoji={setEmojiAnchor} onOpenStickers={() => setStickersOpen(true)} onOpenQuickActions={setQuickActionsAnchor} onToggleSound={() => { const next = !soundEnabled; setSoundEnabled(next); localStorage.setItem("techlead-chat-sound", next ? "on" : "off"); if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission(); }} onContentChange={(value) => { setContent(value); notifyTyping(value); }} onSend={() => void send()} />
      </Box>
      {showSidePanel && selected && <Box sx={{ display: { xs: "none", lg: "block" }, borderLeft: "1px solid", borderColor: "divider", borderRadius: 0, p: 1.6, overflowY: "auto", my: 0, bgcolor: "background.paper" }}>
        <Stack spacing={2}>
          <Box sx={{ pb: 1, borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 850 }}>Informações e arquivos</Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", mt: .4 }}>{selected.name}</Typography>
          </Box>
          {selected.type === "CONTEXT" && <IncidentContextSummary channel={selected} onOpenActions={() => setIncidentActionsOpen(true)} onSearchHistory={() => setHistorySearchOpen(true)} />}
          <SharedFilesPanel channelId={selected.id} messages={messages} />
          <Divider />
          {selected.type === "DIRECT" && selectedPeer ? <Stack spacing={1}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900 }}>Contato</Typography>
            <Typography variant="body2"><b>Usuário:</b> @{selectedPeer.username}</Typography>
            <Typography variant="body2"><b>Perfil:</b> {selectedPeer.role}</Typography>
            <Stack direction="row" spacing={.7} sx={{ alignItems: "center" }}><Circle sx={{ fontSize: 10, color: presenceColor(selectedPresence?.effectiveStatus) }} /><Typography variant="body2">{({ ONLINE: "Online", AWAY: "Ausente", BUSY: "Ocupado", OFFLINE: "Offline" }[selectedPresence?.effectiveStatus ?? "OFFLINE"])}</Typography></Stack>
            {selectedPresence?.statusMessage && <Typography variant="body2" color="text.secondary">{selectedPresence.statusMessage}</Typography>}
          </Stack> : <Stack spacing={1.4}>
            <Box><Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}><Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900 }}>Participantes · {selected.members?.length ?? 0}</Typography><Chip size="small" color={selectedOnlineCount ? "success" : "default"} label={`${selectedOnlineCount} online`} sx={{ height: 20, fontWeight: 800 }} /></Stack>
              <Stack spacing={.65} sx={{ mt: .5 }}>{selected.members?.map((member) => { const memberPresence = presence.find((item) => item.userId === member.user.id); return <Stack key={member.user.id} direction="row" spacing={1} sx={{ alignItems: "center" }}><Box sx={{ position: "relative", width: 30, height: 30, borderRadius: "50%", bgcolor: "action.hover", display: "grid", placeItems: "center", fontWeight: 850 }}>{member.user.name.slice(0,1)}<Circle sx={{ position: "absolute", right: -1, bottom: -1, fontSize: 9, color: presenceColor(memberPresence?.effectiveStatus), stroke: "background.paper", strokeWidth: 4 }} /></Box><Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="body2" noWrap sx={{ fontWeight: 750 }}>{member.user.name}</Typography><Typography variant="caption" color="text.secondary">@{member.user.username} · {memberPresence?.effectiveStatus === "ONLINE" ? "online" : memberPresence?.effectiveStatus === "AWAY" ? "ausente" : memberPresence?.effectiveStatus === "BUSY" ? "ocupado" : "offline"}</Typography></Box></Stack>; })}</Stack>
            </Box>
            <Divider />
            <Box><Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900 }}>Atalhos de coordenação</Typography><Stack direction="row" spacing={.6} sx={{ mt: .5, flexWrap: "wrap", gap: .5 }}><Chip size="small" icon={<AlternateEmailOutlined />} label="@Coordenação" onClick={() => append("@Coordenação ")} clickable /><Chip size="small" icon={<AlternateEmailOutlined />} label="@Suporte" onClick={() => append("@Suporte ")} clickable /><Chip size="small" icon={<BoltOutlined />} label="Prioridade" onClick={() => setContent("📌 PRIORIDADE DO TIME\nAssunto: \nResponsável: \nPrazo: \nPróximo passo: ")} clickable /><Chip size="small" icon={<AssignmentTurnedInOutlined />} label="Decisão" onClick={() => setContent("✅ ALINHAMENTO / DECISÃO\nDecisão: \nResponsável: \nPrazo: \nImpacto: ")} clickable /></Stack></Box>
            <Divider />
            <Box><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}><Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900 }}>Fixadas</Typography><Chip size="small" label={pinnedMessages.length} sx={{ height: 20 }} /></Stack>{pinnedMessages.length ? <Stack spacing={.6} sx={{ mt: .5 }}>{pinnedMessages.map((message) => <Paper key={message.id} variant="outlined" sx={{ p: .8, borderRadius: 1.5 }}><Typography variant="caption" sx={{ fontWeight: 800 }}>{message.author.name}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{message.content}</Typography></Paper>)}</Stack> : <Typography variant="caption" color="text.secondary">Fixe mensagens importantes pelo ícone de alfinete.</Typography>}</Box>
            <Divider />
            <Box><Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900 }}>Destaques operacionais</Typography>{coordinationHighlights.length ? <Stack spacing={.6} sx={{ mt: .5 }}>{coordinationHighlights.slice(0,3).map((message) => <Box key={message.id} sx={{ p: .75, borderRadius: 1.5, bgcolor: "action.hover", borderLeft: "3px solid", borderLeftColor: message.content.includes("ESCALONAMENTO") ? "error.main" : message.content.includes("DECISÃO") ? "info.main" : "warning.main" }}><Typography variant="caption" sx={{ fontWeight: 800, display: "block" }}>{message.content.split("\n")[0]}</Typography><Typography variant="caption" color="text.secondary">{message.author.name}</Typography></Box>)}</Stack> : <Typography variant="caption" color="text.secondary">Decisões, prioridades e escalonamentos aparecerão aqui.</Typography>}</Box>
            <Divider />
            <Box><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}><Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900 }}>Pendências do canal</Typography><Chip size="small" color={channelPendencies.length ? "warning" : "default"} label={channelPendencies.length} sx={{ height: 20 }} /></Stack>{channelPendencies.length ? <Stack spacing={.5} sx={{ mt: .5 }}>{channelPendencies.map((message) => <Typography key={message.id} variant="caption" sx={{ display: "block", p: .6, borderRadius: 1, bgcolor: "action.hover" }}>• {message.content.split("\n")[0].replace(/^[^A-ZÀ-Ú]*/, "")}</Typography>)}</Stack> : <Typography variant="caption" color="text.secondary">Nenhuma pendência estruturada recente.</Typography>}</Box>
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
          <Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="caption" color="primary.main" sx={{ fontWeight: 900 }}>NOVA MENSAGEM</Typography><Typography sx={{ fontWeight: 900, lineHeight: 1.2 }}>{incomingPopup.authorName}</Typography><Typography variant="caption" color="text.secondary">{incomingPopup.channelName}</Typography><Typography variant="body2" sx={{ mt: .55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{incomingPopup.preview}</Typography><Button size="small" sx={{ mt: .65, px: 0 }} onClick={() => { setSelectedId(incomingPopup.channelId); setMobileConversationOpen(true); setIncomingPopup(null); }}>Abrir conversa</Button></Box>
          <IconButton size="small" onClick={() => setIncomingPopup(null)}><CloseOutlined fontSize="small" /></IconButton>
        </Stack>
      </Paper> : undefined}
    />
    <Menu anchorEl={quickActionsAnchor} open={Boolean(quickActionsAnchor)} onClose={() => setQuickActionsAnchor(null)} slotProps={{ paper: { sx: { minWidth: 270, borderRadius: 2.5 } } }}>
      <MenuItem onClick={() => { setContent("📌 PRIORIDADE DO TIME\nAssunto: \nResponsável: \nPrazo: \nPróximo passo: "); setQuickActionsAnchor(null); }}><ListItemIcon><BoltOutlined fontSize="small" /></ListItemIcon>Registrar prioridade</MenuItem>
      <MenuItem onClick={() => { setContent("✅ ALINHAMENTO / DECISÃO\nDecisão: \nResponsável: \nPrazo: \nImpacto: "); setQuickActionsAnchor(null); }}><ListItemIcon><AssignmentTurnedInOutlined fontSize="small" /></ListItemIcon>Registrar decisão</MenuItem>
      <MenuItem onClick={() => { setContent("🚨 ESCALONAMENTO PARA COORDENAÇÃO\nContexto: \nImpacto: \nAção necessária: \nResponsável atual: "); setQuickActionsAnchor(null); }}><ListItemIcon><GroupsOutlined fontSize="small" /></ListItemIcon>Escalar para coordenação</MenuItem>
      <MenuItem onClick={() => { setContent("🧭 PASSAGEM DE TURNO\nEm andamento: \nBloqueios: \nPendências: \nPróxima ação: "); setQuickActionsAnchor(null); }}><ListItemIcon><ReplyOutlined fontSize="small" /></ListItemIcon>Passagem de turno</MenuItem>
    </Menu>
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
    <Popover open={Boolean(emojiAnchor)} anchorEl={emojiAnchor} onClose={() => setEmojiAnchor(null)} anchorOrigin={{ vertical: "top", horizontal: "left" }} transformOrigin={{ vertical: "bottom", horizontal: "left" }} slotProps={{ paper: { sx: { width: { xs: 310, sm: 390 }, maxHeight: 360, borderRadius: 3, overflow: "hidden" } } }}><Box sx={{ px: 1.4, pt: 1.2, pb: .8, borderBottom: "1px solid", borderColor: "divider" }}><Typography variant="subtitle2" sx={{ fontWeight: 900 }}>Emojis</Typography><Typography variant="caption" color="text.secondary">Clique para enviar com animação</Typography></Box><Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(7, 1fr)", sm: "repeat(9, 1fr)" }, gap: .25, p: 1, maxHeight: 285, overflowY: "auto" }}>{emojis.map((emoji, index) => <IconButton key={`${emoji}-${index}`} onClick={() => void sendEmoji(emoji)} sx={{ width: 38, height: 38, fontSize: 23, borderRadius: 2, transition: "transform .14s ease, background-color .14s ease", "&:hover": { transform: "scale(1.22) rotate(-4deg)", bgcolor: "action.hover" } }}>{emoji}</IconButton>)}</Box></Popover>
    <Dialog open={stickersOpen} onClose={() => setStickersOpen(false)} maxWidth="xs" fullWidth><DialogTitle>Figurinhas rápidas</DialogTitle><DialogContent><Box sx={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 1, pt: .5 }}>{stickers.map((sticker) => <Button key={sticker} variant="outlined" onClick={() => void sendSticker(sticker)} sx={{ minHeight: 72, fontWeight: 850, borderRadius: 2.5, transition: "transform .16s ease, box-shadow .16s ease", "&:hover": { transform: "translateY(-2px) scale(1.02)", boxShadow: "0 10px 24px rgba(15,23,42,.10)" } }}>{sticker}</Button>)}</Box></DialogContent></Dialog>
    {stickerFx && <Box aria-hidden sx={{ position: "fixed", inset: 0, zIndex: (theme) => theme.zIndex.modal + 30, pointerEvents: "none", display: "grid", placeItems: "center", perspective: "900px", "@keyframes stickerPop3d": { "0%": { opacity: 0, transform: "scale(.25) rotateX(55deg) rotateY(-35deg) translateY(50px)" }, "28%": { opacity: 1, transform: "scale(1.14) rotateX(-8deg) rotateY(10deg) translateY(-8px)" }, "55%": { transform: "scale(.98) rotateX(4deg) rotateY(-5deg) translateY(0)" }, "78%": { opacity: 1, transform: "scale(1.03) rotateX(0) rotateY(0)" }, "100%": { opacity: 0, transform: "scale(.78) translateY(-34px)" } }, "@keyframes stickerGlow": { "0%,100%": { boxShadow: "0 0 0 rgba(24,199,122,0)" }, "45%": { boxShadow: "0 28px 90px rgba(24,199,122,.28), 0 0 55px rgba(59,130,246,.18)" } } }}><Paper elevation={18} sx={{ px: 5, py: 4, minWidth: 300, textAlign: "center", borderRadius: 5, bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(15,30,48,.94)" : "rgba(255,255,255,.96)", border: "1px solid", borderColor: "divider", backdropFilter: "blur(18px)", transformStyle: "preserve-3d", animation: "stickerPop3d 2.45s cubic-bezier(.2,.8,.2,1) both, stickerGlow 2.45s ease both", "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}><Typography sx={{ fontSize: "clamp(2.6rem,7vw,5.2rem)", fontWeight: 950, letterSpacing: "-.04em", textShadow: (theme) => theme.palette.mode === "dark" ? "0 8px 24px rgba(0,0,0,.32)" : "0 8px 24px rgba(15,23,42,.12)" }}>{stickerFx}</Typography></Paper></Box>}
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



