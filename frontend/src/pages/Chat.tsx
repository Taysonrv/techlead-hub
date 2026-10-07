import { AddCommentOutlined, ForumOutlined, SendRounded, EmojiEmotionsOutlined, CelebrationOutlined, NotificationsActiveOutlined, ReplyOutlined, CloseOutlined, SearchOutlined, Circle, MoreHorizOutlined, DeleteOutlineRounded, StarOutlineRounded, VolumeOffOutlined, AttachFileRounded, DownloadRounded, CleaningServicesOutlined, GroupsOutlined, PersonOutlineRounded, InfoOutlined, OpenInNewOutlined, BoltOutlined, AssignmentTurnedInOutlined, PushPinOutlined, AlternateEmailOutlined, KeyboardArrowDownRounded } from "@mui/icons-material";
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
  const [quickActionsAnchor, setQuickActionsAnchor] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
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
  const [teamPanelOpen, setTeamPanelOpen] = useState(true);
  const [statusMessage] = useState(() => localStorage.getItem("techlead-chat-status-message") || "");
  const [incomingPopup, setIncomingPopup] = useState<{ channelId: number; channelName: string; authorName: string; preview: string } | null>(null);
  const previousChannelState = useRef<Map<number, { unread: number; lastMessageId: number | null }>>(new Map());
  const selectedIdRef = useRef<number | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const selected = useMemo(() => channels.find((channel) => channel.id === selectedId) ?? null, [channels, selectedId]);
  const selectedPeer = useMemo(() => selected?.type === "DIRECT" ? selected.members?.map((member) => member.user).find((person) => person.id !== user?.id) : null, [selected, user?.id]);
  const selectedPresence = selectedPeer ? presence.find((item) => item.userId === selectedPeer.id) : null;
  const typingNames = remoteTyping.filter((item) => item.channelId === selectedId).map((item) => item.name);
  const visibleChannels = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    return channels.filter((channel) => {
      if (!query) return true;
      const peerNames = channel.members?.map((member) => member.user.name).join(" ") ?? "";
      return [channel.name, channel.description, channel.clientName, peerNames]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [channels, conversationSearch]);
  const pinState = useMemo(() => {
    const ids = new Set<number>();
    messages.forEach((message) => {
      if (message.content.startsWith("[chat-pin]")) ids.add(Number(message.content.slice(10)));
      if (message.content.startsWith("[chat-unpin]")) ids.delete(Number(message.content.slice(12)));
    });
    return ids;
  }, [messages]);
  const visibleMessages = useMemo(() => messages.filter((message) => !message.content.startsWith("[chat-pin]") && !message.content.startsWith("[chat-unpin]") && (!messageSearch.trim() || message.content.toLowerCase().includes(messageSearch.toLowerCase()))), [messages, messageSearch]);
  const pinnedMessages = useMemo(() => visibleMessages.filter((message) => pinState.has(message.id)).slice(-4).reverse(), [visibleMessages, pinState]);
  const coordinationHighlights = useMemo(() => visibleMessages.filter((message) => /PRIORIDADE DO TIME|ALINHAMENTO \/ DECISÃO|ESCALONAMENTO PARA COORDENAÇÃO/.test(message.content)).slice(-5).reverse(), [visibleMessages]);
  const channelPendencies = useMemo(() => visibleMessages.filter((message) => /PRIORIDADE DO TIME|ESCALONAMENTO PARA COORDENAÇÃO|PASSAGEM DE TURNO/.test(message.content)).slice(-4).reverse(), [visibleMessages]);
  const selectedOnlineCount = useMemo(() => selected?.members?.filter((member) => presence.find((item) => item.userId === member.user.id)?.effectiveStatus === "ONLINE").length ?? 0, [selected, presence]);
  const totalUnread = useMemo(() => channels.reduce((sum, channel) => sum + channel.unread, 0), [channels]);
  const sortedVisibleChannels = useMemo(() => visibleChannels.slice().sort((a, b) => {
    const group = (channel: Channel) => favorites.includes(channel.id) ? 0 : channel.type === "DIRECT" ? 1 : 2;
    return group(a) - group(b) || b.unread - a.unread || ((b.messages?.[b.messages.length - 1]?.id ?? 0) - (a.messages?.[a.messages.length - 1]?.id ?? 0));
  }), [visibleChannels, favorites]);
  const sidebarChannels = useMemo(() => {
    if (!selected || sortedVisibleChannels.some((channel) => channel.id === selected.id)) return sortedVisibleChannels;
    return [selected, ...sortedVisibleChannels];
  }, [selected, sortedVisibleChannels]);

  const loadChannels = useCallback(async () => {
    const response = await api.get<{ channels: Channel[] }>("/chat/channels");
    const rawChannels = Array.isArray(response.data.channels) ? response.data.channels : [];
    const directByPeer = new Map<number, Channel>();
    const nonDirect: Channel[] = [];
    rawChannels.forEach((channel) => {
      if (channel.type !== "DIRECT") { nonDirect.push(channel); return; }
      const peerId = channel.members?.map((member) => member.user.id).find((id) => id !== user?.id);
      if (!peerId) { nonDirect.push(channel); return; }
      const existing = directByPeer.get(peerId);
      if (!existing) { directByPeer.set(peerId, channel); return; }
      const existingLatest = existing.messages?.[existing.messages.length - 1]?.id ?? 0;
      const currentLatest = channel.messages?.[channel.messages.length - 1]?.id ?? 0;
      if (currentLatest > existingLatest || (currentLatest === existingLatest && channel.unread > existing.unread)) directByPeer.set(peerId, channel);
    });
    let nextChannels = [...directByPeer.values(), ...nonDirect];

    // Nunca deixe a conversa atualmente aberta desaparecer da coluna lateral.
    // Em DIRECTs legados/duplicados, o canal selecionado pode não ser o canônico
    // escolhido pelo dedupe; nesse caso substituímos o representante daquele par
    // pelo canal efetivamente aberto.
    const activeId = selectedIdRef.current;
    const activeRaw = activeId ? rawChannels.find((channel) => channel.id === activeId) : undefined;
    if (activeRaw && !nextChannels.some((channel) => channel.id === activeRaw.id)) {
      if (activeRaw.type === "DIRECT") {
        const activePeerId = activeRaw.members?.map((member) => member.user.id).find((id) => id !== user?.id);
        nextChannels = nextChannels.filter((channel) => {
          if (channel.type !== "DIRECT" || !activePeerId) return true;
          const peerId = channel.members?.map((member) => member.user.id).find((id) => id !== user?.id);
          return peerId !== activePeerId;
        });
      }
      nextChannels.unshift(activeRaw);
    }
    const requestedId = Number(searchParams.get("channel"));
    const requestedChannel = rawChannels.find((channel) => channel.id === requestedId);
    if (requestedChannel && !nextChannels.some((channel) => channel.id === requestedChannel.id)) {
      const requestedPeerId = requestedChannel.members?.map((member) => member.user.id).find((id) => id !== user?.id);
      const canonical = requestedPeerId ? directByPeer.get(requestedPeerId) : undefined;
      if (canonical) setSelectedId((current) => current === requestedChannel.id ? canonical.id : current);
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
    try { sessionStorage.setItem("techlead-chat-channels", JSON.stringify(nextChannels)); } catch { /* cache opcional */ }
    const requested = Number(searchParams.get("channel"));
    setSelectedId((current) =>
      current ??
      nextChannels.find((channel) => channel.id === requested)?.id ??
      nextChannels[0]?.id ??
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
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 140;
    if (selectedId || nearBottom || !showJumpToLatest) {
      container.scrollTo({ top: container.scrollHeight, behavior: selectedId ? "auto" : "smooth" });
      setShowJumpToLatest(false);
    }
  }, [messages, selectedId]);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesRef.current;
    if (!container) return;
    setShowJumpToLatest(container.scrollHeight - container.scrollTop - container.clientHeight > 180);
  }, []);

  const jumpToLatest = useCallback(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    setShowJumpToLatest(false);
  }, []);

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
        navigate(`/correcoes?task=${id}`);
        return;
      }
    }
    if (card.path) navigate(card.path);
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

  return <Stack spacing={.9} sx={{ height: "100%", maxHeight: "100%", minHeight: 0, overflow: "hidden", px: { xs: .75, sm: 1, md: 1.15, xl: 1.35 }, pb: { xs: .75, md: 1.1 }, pt: { xs: .75, md: 1.05 }, boxSizing: "border-box", bgcolor: "background.default" }}>
    <Paper elevation={0} sx={{ flexShrink: 0, minHeight: 68, px: 1.8, py: .8, borderRadius: 4, border: "1px solid", borderColor: "divider", borderLeft: "4px solid", borderLeftColor: "primary.main", overflow: "hidden", position: "relative", background: (theme) => theme.palette.mode === "dark" ? "linear-gradient(115deg,rgba(10,43,55,.96),rgba(16,34,55,.98) 56%,rgba(19,28,43,.98))" : "linear-gradient(115deg,#f2fffa,#f7fbff 58%,#f3f7fd)", boxShadow: (theme) => theme.palette.mode === "dark" ? "0 14px 34px rgba(0,0,0,.20), inset 0 1px rgba(255,255,255,.025)" : "0 14px 34px rgba(15,23,42,.075)" }}>
      <Stack direction="row" spacing={1.35} sx={{ alignItems: "center", minWidth: 0, pr: { md: 28 } }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2.4, display: "grid", placeItems: "center", flexShrink: 0, color: "primary.main", bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(24,199,122,.08)" : "rgba(24,199,122,.07)", border: "1px solid rgba(24,199,122,.24)", boxShadow: "0 8px 22px rgba(24,199,122,.10)" }}><ForumOutlined /></Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="overline" sx={{ display: "block", mb: .15, color: "primary.main", fontSize: ".58rem", lineHeight: 1, letterSpacing: ".14em", fontWeight: 950 }}>COLABORAÇÃO</Typography>
          <Stack direction="row" spacing={.8} sx={{ alignItems: "center" }}><Typography sx={{ fontWeight: 950, fontSize: "1.08rem", lineHeight: 1.05, letterSpacing: "-.025em", whiteSpace: "nowrap" }}>Hub de Conversas</Typography><Chip size="small" label={{ ONLINE: "Online", AWAY: "Ausente", BUSY: "Ocupado" }[availability]} color={availability === "BUSY" ? "error" : availability === "AWAY" ? "warning" : "success"} onClick={() => { const next = availability === "ONLINE" ? "AWAY" : availability === "AWAY" ? "BUSY" : "ONLINE"; setAvailability(next); localStorage.setItem("techlead-chat-status", next); }} sx={{ height: 22, fontWeight: 850 }} /></Stack>
          <Stack direction="row" spacing={.8} sx={{ alignItems: "center", minWidth: 0 }}><Typography variant="caption" color="text.secondary" noWrap>Mensagens, presença e colaboração em tempo real</Typography>{statusMessage && <Typography variant="caption" color="text.secondary" noWrap sx={{ opacity: .75 }}>· {statusMessage}</Typography>}</Stack>
        </Box>
      </Stack>
    </Paper>
    {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
    <Paper elevation={0} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "244px minmax(0,1fr)", lg: "252px minmax(0,1fr)", xl: (conversationInfoOpen || (selected?.type === "TEAM" && teamPanelOpen)) ? "258px minmax(0,1fr) 292px" : "258px minmax(0,1fr)" }, gap: { xs: 0, md: .9 }, p: { xs: 0, md: .8 }, minHeight: 0, flex: 1, overflow: "hidden", borderRadius: 3.5, maxHeight: "100%", height: "100%", border: "1px solid", borderColor: "divider", boxShadow: "0 16px 42px rgba(15,23,42,.075)", bgcolor: "background.paper", backgroundImage: (theme) => theme.palette.mode === "dark" ? "linear-gradient(145deg,rgba(12,31,46,.98),rgba(11,27,42,.98))" : "linear-gradient(145deg,#ffffff,#fbfdff)" }}>
      <Box sx={{ position: "relative", minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto auto 1px minmax(0, 1fr)", alignContent: "stretch", borderRadius: { xs: 0, md: 3.25 }, bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,.022)" : "rgba(248,250,252,.76)", border: { md: "1px solid" }, borderColor: { md: "divider" }, boxShadow: (theme) => theme.palette.mode === "dark" ? "0 10px 28px rgba(0,0,0,.10), inset 0 1px rgba(255,255,255,.02)" : "0 8px 24px rgba(15,23,42,.045)" }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 1.35, py: 1, minHeight: 52 }}>
          <Box sx={{ minWidth: 0, pl: .25 }}><Stack direction="row" spacing={.7} sx={{ alignItems: "center" }}><Typography sx={{ fontWeight: 900, lineHeight: 1.2 }}>Conversas</Typography>{totalUnread > 0 && <Chip size="small" color="primary" label={totalUnread > 99 ? "99+" : totalUnread} sx={{ height: 20, fontWeight: 900 }} />}</Stack><Typography variant="caption" color="text.secondary">{channels.length} conversa(s){totalUnread ? ` · ${totalUnread} não lida(s)` : ""}</Typography></Box>
          <Stack direction="row">
            {["ADMIN","COORDENADOR"].includes(user?.role ?? "") && <Tooltip title="Consolidar conversas privadas duplicadas"><span><IconButton size="small" disabled={maintenanceRunning} onClick={() => void consolidateDirectDuplicates()}>{maintenanceRunning ? <CircularProgress size={17} /> : <CleaningServicesOutlined fontSize="small" />}</IconButton></span></Tooltip>}
            <Tooltip title="Conversa privada"><IconButton size="small" onClick={() => setDirectOpen(true)}><PersonOutlineRounded /></IconButton></Tooltip>
            <Tooltip title="Novo canal"><IconButton size="small" aria-label="Criar canal" onClick={() => setCreateOpen(true)}><AddCommentOutlined /></IconButton></Tooltip>
          </Stack>
        </Stack>
        <Box sx={{ px: 1.25, pb: 1 }}><TextField size="small" fullWidth value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Buscar conversa..." slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: .7, fontSize: 18, color: "text.secondary" }} /> } }} /></Box>
        <Box sx={{ mx: 1.2, height: 6 }} />
        <Box sx={{ minHeight: 0, height: "100%", overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
        <List disablePadding sx={{ width: "100%", py: .35 }}>
          {sidebarChannels.map((channel, index) => {
            const group = favorites.includes(channel.id) ? "Favoritos" : channel.type === "DIRECT" ? "Recentes" : "Equipes";
            const previousChannel = sidebarChannels[index - 1];
            const previousGroup = previousChannel ? (favorites.includes(previousChannel.id) ? "Favoritos" : previousChannel.type === "DIRECT" ? "Recentes" : "Equipes") : null;
            return <Box key={channel.id}>
              {group !== previousGroup && <Typography variant="overline" sx={{ display: "block", px: 1.35, pt: index ? .9 : .7, pb: .2, fontSize: ".61rem", lineHeight: 1.4, letterSpacing: ".09em", fontWeight: 900, color: "text.secondary" }}>{group}</Typography>}
              
              <ListItemButton
                key={channel.id}
                selected={channel.id === selectedId}
                onClick={() => setSelectedId(channel.id)}
                sx={{
                  py: .58,
                  px: 1,
                  mx: .7,
                  my: .28,
                  minHeight: 52,
                  borderRadius: 2.5,
                  border: "1px solid transparent",
                  transition: "background-color .18s ease, border-color .18s ease, transform .18s ease, box-shadow .18s ease",
                  "&:hover": { transform: "translateX(2px)", bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,.035)" : "rgba(15,23,42,.035)", borderColor: (theme) => theme.palette.mode === "dark" ? "rgba(148,163,184,.10)" : "rgba(148,163,184,.16)" },
                  "&.Mui-selected": { bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(39,57,72,.88)" : "rgba(239,247,244,.96)", borderColor: (theme) => theme.palette.mode === "dark" ? "rgba(24,199,122,.18)" : "rgba(24,199,122,.16)", boxShadow: "inset 3px 0 0 rgba(24,199,122,.78), 0 8px 22px rgba(15,23,42,.055)" },
                  "&.Mui-selected:hover": { bgcolor: "action.selected" },
                }}
              >
                <Box sx={{ position: "relative", mr: 1.1, width: 32, height: 32, minWidth: 32, flex: "0 0 32px", borderRadius: "50%", bgcolor: channel.id === selectedId ? (theme) => theme.palette.mode === "dark" ? "rgba(24,199,122,.14)" : "rgba(24,199,122,.09)" : "action.hover", display: "grid", placeItems: "center", fontWeight: 900, color: channel.id === selectedId ? "primary.main" : "text.primary", border: "1px solid", borderColor: channel.id === selectedId ? "rgba(24,199,122,.32)" : "divider", boxShadow: "none" }}>
                  {channel.name.slice(0,1).toUpperCase()}
                  <Circle sx={{ position: "absolute", width: 11, height: 11, right: 0, bottom: 0, color: channel.type === "DIRECT" ? presenceColor(presence.find((item) => channel.members?.some((member) => member.user.id === item.userId && member.user.id !== user?.id))?.effectiveStatus) : channel.members?.some((member) => presence.find((item) => item.userId === member.user.id)?.effectiveStatus === "ONLINE") ? "success.main" : "text.disabled", stroke: "background.paper", strokeWidth: 4 }} />
                </Box>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={.5} sx={{ alignItems: "center", minWidth: 0 }}>
                      <Box sx={{ color: "text.secondary", display: "flex", alignItems: "center" }}>{channel.type === "DIRECT" ? <PersonOutlineRounded sx={{ fontSize: 14 }} /> : <GroupsOutlined sx={{ fontSize: 14 }} />}</Box><Typography noWrap sx={{ fontWeight: channel.unread ? 900 : 780, fontSize: ".84rem", lineHeight: 1.2, letterSpacing: "-.01em", flex: 1 }}>{channel.name}</Typography>
                      {favorites.includes(channel.id) && <Typography component="span" sx={{ color: "warning.main", fontSize: ".72rem" }}>★</Typography>}
                    </Stack>
                  }
                  secondary={(() => {
                    const typing = remoteTyping.find((item) => item.channelId === channel.id && item.userId !== user?.id);
                    if (typing) return `${typing.name} está digitando...`;
                    const latest = channel.messages?.[channel.messages.length - 1];
                    if (!latest) return channel.clientName || channel.description || "Sem mensagens ainda";
                    const preview = latest.content.startsWith("[hub-card]") ? "Compartilhou um registro" : latest.content.startsWith("[anexo] ") ? "📎 Enviou um arquivo" : latest.content.replace(/\s+/g, " ");
                    return `${latest.author.id === user?.id ? "Você: " : ""}${preview}`;
                  })()}
                  slotProps={{ secondary: { sx: { fontSize: ".69rem", mt: .28, lineHeight: 1.25, fontWeight: channel.unread ? 750 : 450, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } } }}
                />
                <Stack spacing={.15} sx={{ alignItems: "flex-end", ml: .4 }}>
                  {channel.messages?.length ? <Typography variant="caption" color="text.secondary" sx={{ fontSize: ".62rem", lineHeight: 1 }}>{new Date(channel.messages[channel.messages.length - 1].createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Typography> : null}
                  <Stack direction="row" spacing={.25} sx={{ alignItems: "center" }}>
                  <Tooltip title={favorites.includes(channel.id) ? "Remover dos favoritos" : "Favoritar"}>
                    <IconButton size="small" onClick={(event) => { event.stopPropagation(); toggleFavorite(channel.id); }} sx={{ width: 28, height: 28, p: .5, fontSize: 16 }}>{favorites.includes(channel.id) ? "★" : "☆"}</IconButton>
                  </Tooltip>
                  {channel.unread > 0 && <Chip size="small" color="primary" label={channel.unread > 99 ? "99+" : channel.unread} sx={{ minWidth: 24, height: 20, fontWeight: 900 }} />}
                  </Stack>
                </Stack>
              </ListItemButton>
            </Box>;
          })}
        </List>
        </Box>
        {channelsLoading && !channels.length ? <Stack spacing={1} sx={{ px: 1.2, py: 1 }}><Skeleton variant="rounded" height={54} /><Skeleton variant="rounded" height={54} /><Skeleton variant="rounded" height={54} /></Stack> : !channels.length && <Box sx={{ px: 2, py: 4, textAlign: "center" }}><Box sx={{ width: 44, height: 44, mx: "auto", mb: 1.2, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "action.hover", color: "text.secondary" }}><ForumOutlined fontSize="small" /></Box><Typography sx={{ fontWeight: 850, fontSize: ".88rem" }}>Nenhuma conversa ainda</Typography><Typography color="text.secondary" variant="caption" sx={{ display: "block", mt: .35 }}>Inicie uma conversa privada ou crie um canal para sua equipe.</Typography><Button size="small" variant="outlined" startIcon={<PersonOutlineRounded />} onClick={() => setDirectOpen(true)} sx={{ mt: 1.4, borderRadius: 2 }}>Nova conversa</Button></Box>}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden", borderRadius: { xs: 0, md: 3.25 }, border: { md: "1px solid" }, borderColor: { md: "divider" }, bgcolor: "background.paper" }}>
        <Stack direction="row" spacing={1} sx={{ px: 1.65, py: 1.05, minHeight: 58, alignItems: "center", justifyContent: "space-between", bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,.012)" : "rgba(255,255,255,.82)" }}><Box><Stack direction="row" spacing={.7} sx={{ alignItems: "center" }}><Typography sx={{ fontWeight: 900, fontSize: { xs: ".95rem", md: "1rem" }, letterSpacing: "-.015em" }}>{selected?.name || "Selecione uma conversa"}</Typography>{selected && <Chip size="small" icon={<Circle sx={{ fontSize: "9px !important" }} />} label={selected?.type === "DIRECT" ? ({ ONLINE: "Online", AWAY: "Ausente", BUSY: "Ocupado", OFFLINE: "Offline" }[selectedPresence?.effectiveStatus ?? "OFFLINE"]) : `${selected.members?.filter((member) => presence.find((item) => item.userId === member.user.id)?.effectiveStatus !== "OFFLINE").length ?? 0} online`} color={selectedPresence?.effectiveStatus === "BUSY" ? "error" : selectedPresence?.effectiveStatus === "AWAY" ? "warning" : selectedPresence?.effectiveStatus === "ONLINE" ? "success" : "default"} variant="outlined" />}</Stack><Typography variant="caption" color="text.secondary">{selectedPresence?.statusMessage || "Mensagens instantâneas · tempo real"}</Typography></Box><Stack direction="row" spacing={.5}><TextField size="small" value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Buscar na conversa" sx={{ width: { md: 190, lg: 210 }, "& .MuiOutlinedInput-root": { borderRadius: 2.4 } }} slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: .5, fontSize: 17, color: "text.secondary" }} /> } }} />{selected?.type === "TEAM" && <Tooltip title={teamPanelOpen ? "Ocultar painel operacional" : "Abrir painel operacional"}><IconButton size="small" color={teamPanelOpen ? "primary" : "default"} onClick={() => setTeamPanelOpen((value) => !value)}><GroupsOutlined /></IconButton></Tooltip>}<Tooltip title="Informações da conversa"><span><IconButton size="small" disabled={!selected} aria-label="Informações da conversa" onClick={() => setConversationInfoOpen((current) => !current)} color={conversationInfoOpen ? "primary" : "default"}><InfoOutlined /></IconButton></span></Tooltip><IconButton size="small" aria-label="Opções da conversa" onClick={(event) => setConversationMenuAnchor(event.currentTarget)}><MoreHorizOutlined /></IconButton></Stack></Stack>
        <Divider />
        <Box ref={messagesRef} onScroll={handleMessagesScroll} sx={{ position: "relative", flex: "1 1 0", height: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", p: { xs: 1.25, md: 1.75 }, scrollbarWidth: "thin", "&::-webkit-scrollbar": { width: 7 }, "&::-webkit-scrollbar-thumb": { bgcolor: "action.disabled", borderRadius: 8 }, "&::-webkit-scrollbar-track": { bgcolor: "transparent" }, bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(7,22,34,.22)" : "#f7f9fb", backgroundImage: (theme) => theme.palette.mode === "dark" ? "radial-gradient(circle at 50% 0%, rgba(24,199,122,.025), transparent 32%), radial-gradient(circle at 100% 100%, rgba(59,130,246,.025), transparent 28%)" : "radial-gradient(circle at 50% 0%, rgba(24,199,122,.035), transparent 34%), radial-gradient(circle at 100% 100%, rgba(59,130,246,.035), transparent 30%)" }}>
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
            return <Box key={message.id}>{showDay && <Stack direction="row" spacing={1} sx={{ alignItems: "center", my: 1.4 }}><Divider sx={{ flex: 1 }} /><Chip size="small" variant="outlined" label={messageDay === new Date().toLocaleDateString("pt-BR") ? "Hoje" : messageDay} sx={{ height: 22, fontSize: ".68rem", color: "text.secondary" }} /><Divider sx={{ flex: 1 }} /></Stack>}<Box sx={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", mb: sameAuthor ? .2 : .85, mt: sameAuthor ? 0 : .4 }}><Paper elevation={0} sx={{ maxWidth: { xs: "90%", md: "56%", xl: "50%" }, p: "8px 12px", bgcolor: mine ? (theme) => theme.palette.mode === "dark" ? "rgba(51,65,85,.88)" : "#eef3f7" : mentioned ? "rgba(245,158,11,.10)" : "background.paper", color: "text.primary", border: "1px solid", borderColor: mentioned ? "warning.main" : mine ? "rgba(148,163,184,.32)" : "divider", borderRadius: mine ? "17px 17px 5px 17px" : "17px 17px 17px 5px", boxShadow: mine ? "0 6px 18px rgba(15,23,42,.07)" : "0 5px 15px rgba(15,23,42,.04)" }}><Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}><Typography variant="caption" sx={{ fontWeight: 800, opacity: .8 }}>{sameAuthor ? "" : message.author.name}</Typography><Stack direction="row" spacing={.15}><Tooltip title={pinState.has(message.id) ? "Desafixar mensagem" : "Fixar mensagem"}><IconButton size="small" onClick={() => void togglePinnedMessage(message.id)} sx={{ color: pinState.has(message.id) ? "primary.main" : "inherit", opacity: pinState.has(message.id) ? 1 : .55 }}><PushPinOutlined sx={{ fontSize: 15 }} /></IconButton></Tooltip><Tooltip title="Responder"><IconButton size="small" onClick={() => setReplyTo(message)} sx={{ color: "inherit", opacity: .65 }}><ReplyOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip></Stack></Stack>{parent && <Box sx={{ px: 1, py: .6, mb: .6, borderLeft: "3px solid", borderColor: "primary.main", bgcolor: "action.hover", borderRadius: 1 }}><Typography variant="caption" sx={{ fontWeight: 800 }}>{parent.author.name}</Typography><Typography variant="caption" noWrap sx={{ display: "block", maxWidth: 420 }}>{parent.content}</Typography></Box>}{message.content.startsWith("[hub-card]") ? (() => { try { const card = JSON.parse(message.content.slice(10)) as { type: string; id?: number; title: string; client?: string | null; status?: string | null; path: string }; return <Paper elevation={0} sx={{ minWidth: { xs: 220, sm: 310 }, maxWidth: 430, p: 1.25, bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(15,23,42,.42)" : "#ffffff", color: "text.primary", border: "1px solid", borderColor: "divider", borderRadius: 2 }}><Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}><Chip size="small" label={`${card.type}${card.id ? ` #${card.id}` : ""}`} sx={{ fontWeight: 850 }} />{card.status && <Chip size="small" variant="outlined" label={card.status} />}</Stack><Typography sx={{ mt: .8, fontWeight: 900, lineHeight: 1.3 }}>{card.title}</Typography>{card.client && <Typography variant="body2" sx={{ mt: .4, opacity: .75 }}>Cliente: {card.client}</Typography>}<Button size="small" endIcon={<OpenInNewOutlined />} sx={{ mt: .9, px: 0, color: "inherit", fontWeight: 850 }} onClick={() => openSharedRecord(card)}>Abrir registro</Button></Paper>; } catch { return <Typography>Registro compartilhado</Typography>; } })() : attachmentInfo(message.content) ? (() => { const attachment = attachmentInfo(message.content)!; return <Paper component="a" href={attachment.href} download={attachment.name} elevation={0} sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, minWidth: 210, maxWidth: 340, textDecoration: "none", color: "inherit", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 2 }}><Box sx={{ width: 34, height: 34, borderRadius: 1.5, display: "grid", placeItems: "center", bgcolor: "action.hover" }}><AttachFileRounded fontSize="small" /></Box><Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="body2" sx={{ fontWeight: 800 }} noWrap>{attachment.name}</Typography><Typography variant="caption" color="text.secondary">{Math.max(1, Math.round(attachment.size / 1024))} KB</Typography></Box><DownloadRounded fontSize="small" /></Paper>; })() : <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{renderContent(message.content)}</Typography>}<Typography variant="caption" sx={{ display: "block", textAlign: "right", opacity: .7 }}>{new Date(message.createdAt).toLocaleString("pt-BR")}</Typography></Paper></Box></Box>;
          })}
          <div ref={bottomRef} />
          {showJumpToLatest && <Button variant="contained" size="small" startIcon={<KeyboardArrowDownRounded />} onClick={jumpToLatest} sx={{ position: "sticky", bottom: 10, left: "50%", transform: "translateX(-50%)", zIndex: 4, borderRadius: 99, px: 1.5, boxShadow: "0 10px 28px rgba(15,23,42,.22)", textTransform: "none" }}>Mensagens recentes</Button>}
        </Box>
        <Divider />
        {typingNames.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ px: 1.6, pt: .45 }}>{typingNames.join(", ")} {typingNames.length === 1 ? "está" : "estão"} digitando...</Typography>}
        {replyTo && <Stack direction="row" sx={{ px: 1.5, py: .7, alignItems: "center", justifyContent: "space-between", bgcolor: "action.hover", borderTop: "1px solid", borderColor: "divider" }}><Box><Typography variant="caption" sx={{ fontWeight: 850 }}>Respondendo a {replyTo.author.name}</Typography><Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", maxWidth: 620 }}>{replyTo.content}</Typography></Box><IconButton size="small" onClick={() => setReplyTo(null)}><CloseOutlined fontSize="small" /></IconButton></Stack>}
        <Stack direction="row" spacing={.55} sx={{ mx: 1, mb: .8, mt: .55, px: .8, py: .55, alignItems: "flex-end", bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(15,32,47,.92)" : "rgba(255,255,255,.96)", border: "1px solid", borderColor: "divider", borderRadius: 3.5, boxShadow: "0 10px 28px rgba(15,23,42,.07)" }}>
          <input ref={attachmentInputRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendAttachment(file); }} /><Tooltip title="Anexar arquivo (máx. 8 MB)"><span><IconButton disabled={!selectedId || uploadingAttachment} onClick={() => attachmentInputRef.current?.click()}><AttachFileRounded /></IconButton></span></Tooltip><Tooltip title="Emojis"><IconButton onClick={(event) => setEmojiAnchor(event.currentTarget)} disabled={!selectedId}><EmojiEmotionsOutlined /></IconButton></Tooltip>
          <Tooltip title="Figurinhas"><IconButton onClick={() => setStickersOpen(true)} disabled={!selectedId}><CelebrationOutlined /></IconButton></Tooltip>
          {selected?.type === "TEAM" && <Tooltip title="Ações rápidas da equipe"><IconButton color="primary" onClick={(event) => setQuickActionsAnchor(event.currentTarget)}><BoltOutlined /></IconButton></Tooltip>}
          <Tooltip title={soundEnabled ? "Desativar som" : "Ativar som"}><IconButton color={soundEnabled ? "primary" : "default"} onClick={() => { const next = !soundEnabled; setSoundEnabled(next); localStorage.setItem("techlead-chat-sound", next ? "on" : "off"); if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission(); }}><NotificationsActiveOutlined /></IconButton></Tooltip>
          <TextField size="small" fullWidth multiline maxRows={4} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,.035)" : "#f6f8fa", pr: .5 }, "& fieldset": { borderColor: "transparent" }, "& .Mui-focused fieldset": { borderColor: "primary.main" } }}  value={content} disabled={!selectedId || sending} placeholder="Escreva uma mensagem; use @usuario para mencionar..." slotProps={{ htmlInput: { maxLength: 4000 } }} onChange={(event) => { setContent(event.target.value); if (selectedId) void api.post(`/chat/channels/${selectedId}/typing`, { active: true }).catch(() => undefined); if (typingTimer.current) window.clearTimeout(typingTimer.current); typingTimer.current = window.setTimeout(() => { if (selectedId) void api.post(`/chat/channels/${selectedId}/typing`, { active: false }).catch(() => undefined); }, 1200); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
          <Button variant="contained" endIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendRounded />} disabled={!selectedId || !content.trim() || sending} onClick={() => void send()} sx={{ minWidth: 42, width: 42, height: 38, px: 0, borderRadius: 2.5, boxShadow: "none", "&:hover": { boxShadow: "0 6px 16px rgba(24,199,122,.18)" }, "& .MuiButton-endIcon": { m: 0 } }}><Box component="span" sx={{ display: "none" }}>Enviar</Box></Button>
        </Stack>
      </Box>
      {(conversationInfoOpen || (selected?.type === "TEAM" && teamPanelOpen)) && selected && <Box sx={{ display: { xs: "none", xl: "block" }, border: "1px solid", borderColor: "divider", borderRadius: 3, p: 1.6, overflowY: "auto", my: .1, bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,.015)" : "rgba(248,250,252,.72)" }}>
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
          <Box sx={{ minWidth: 0, flex: 1 }}><Typography variant="caption" color="primary.main" sx={{ fontWeight: 900 }}>NOVA MENSAGEM</Typography><Typography sx={{ fontWeight: 900, lineHeight: 1.2 }}>{incomingPopup.authorName}</Typography><Typography variant="caption" color="text.secondary">{incomingPopup.channelName}</Typography><Typography variant="body2" sx={{ mt: .55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{incomingPopup.preview}</Typography><Button size="small" sx={{ mt: .65, px: 0 }} onClick={() => { setSelectedId(incomingPopup.channelId); setIncomingPopup(null); }}>Abrir conversa</Button></Box>
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



function presenceColor(status: Presence["effectiveStatus"] | undefined) {
  if (status === "ONLINE") return "success.main";
  if (status === "AWAY") return "warning.main";
  if (status === "BUSY") return "error.main";
  return "text.disabled";
}
