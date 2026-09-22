import { AddCommentOutlined, ForumOutlined, SendRounded, ShieldOutlined, EmojiEmotionsOutlined, CelebrationOutlined, NotificationsActiveOutlined, ReplyOutlined, CloseOutlined, SearchOutlined, Circle, MoreHorizOutlined, EditOutlined, AutoAwesomeOutlined } from "@mui/icons-material";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, List, ListItemButton, ListItemText, Paper, Popover, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, getAccessToken, getApiBaseUrl } from "../services/api";
import { useAuth } from "../context/AuthContext";


type Person = { id: number; name: string; username: string; role: string };
type Message = { id: number; content: string; createdAt: string; parentId?: number | null; author: Person };
type Channel = { id: number; name: string; type: string; description?: string | null; clientName?: string | null; unread: number; messages: Message[]; members?: Array<{ user: Person }> };
type Presence = { userId: number; status: string; effectiveStatus: "ONLINE" | "AWAY" | "BUSY" | "OFFLINE"; statusMessage?: string | null; lastSeenAt: string; name: string; username: string };
type RealtimeSnapshot = { presence: Presence[]; typing: Array<{ channelId: number; userId: number; name: string }>; latestMessage: { id: number; channelId: number; authorId: number } | null };

export function Chat() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [participants, setParticipants] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
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
  const typingTimer = useRef<number | null>(null);
  const lastRealtimeMessageId = useRef<number | null>(null);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [remoteTyping, setRemoteTyping] = useState<RealtimeSnapshot["typing"]>([]);
  const [availability, setAvailability] = useState<"ONLINE" | "AWAY" | "BUSY">(() => (localStorage.getItem("techlead-chat-status") as "ONLINE" | "AWAY" | "BUSY") || "ONLINE");
  const [statusMessage, setStatusMessage] = useState(() => localStorage.getItem("techlead-chat-status-message") || "");

  const selected = useMemo(() => channels.find((channel) => channel.id === selectedId) ?? null, [channels, selectedId]);
  const selectedPeer = useMemo(() => selected?.type === "DIRECT" ? selected.members?.map((member) => member.user).find((person) => person.id !== user?.id) : null, [selected, user?.id]);
  const selectedPresence = selectedPeer ? presence.find((item) => item.userId === selectedPeer.id) : null;
  const typingNames = remoteTyping.filter((item) => item.channelId === selectedId).map((item) => item.name);
  const visibleChannels = useMemo(() => channels.filter((channel) => [channel.name, channel.description, channel.clientName].some((value) => value?.toLowerCase().includes(conversationSearch.toLowerCase()))), [channels, conversationSearch]);
  const visibleMessages = useMemo(() => messages.filter((message) => !messageSearch.trim() || message.content.toLowerCase().includes(messageSearch.toLowerCase())), [messages, messageSearch]);

  const loadChannels = useCallback(async () => {
    const response = await api.get<{ channels: Channel[] }>("/chat/channels");
    setChannels(response.data.channels);
    const requested = Number(searchParams.get("channel"));
    setSelectedId((current) =>
      current ??
      response.data.channels.find((channel) => channel.id === requested)?.id ??
      response.data.channels[0]?.id ??
      null,
    );
  }, [searchParams]);

  const loadMessages = useCallback(async (channelId: number, quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      const response = await api.get<{ messages: Message[] }>(`/chat/channels/${channelId}/messages`);
      setMessages(response.data.messages);
      setChannels((current) => current.map((channel) => channel.id === channelId ? { ...channel, unread: 0 } : channel));
      setError("");
    } catch (requestError: any) {
      if (!quiet) setError(requestError?.response?.data?.error || "Não foi possível carregar a conversa.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      loadChannels(),
      api.get<{ participants: Person[] }>("/chat/participants").then((response) => setParticipants(response.data.participants)),
    ]).catch(() => { setError("Não foi possível carregar os canais."); setLoading(false); });
  }, [loadChannels]);
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
      try {
        const audio = new Audio("data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAACAgJCQmJiQkICAgICAgA==");
        audio.volume = .32; void audio.play().catch(() => undefined);
        if (document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") new Notification("TechLead Hub", { body: "Você recebeu uma nova mensagem no chat." });
      } catch {}
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
    try {
      const response = await api.post<Channel>(`/chat/direct/${person.id}`);
      await loadChannels();
      setSelectedId(response.data.id);
      setDirectOpen(false);
    } catch (requestError: any) { setError(requestError?.response?.data?.error || "Não foi possível iniciar a conversa privada."); }
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

  return <Stack spacing={1.25} sx={{ height: "100%", maxHeight: "100%", minHeight: 0, overflow: "hidden", p: { xs: 1.25, md: 2 }, boxSizing: "border-box", background: (theme) => theme.palette.mode === "dark" ? "radial-gradient(circle at 12% 0%, rgba(24,199,122,.09), transparent 28%)" : "radial-gradient(circle at 10% 0%, rgba(24,199,122,.08), transparent 30%)" }}>
    <Paper elevation={0} sx={{ flexShrink: 0, px: { xs: 1.5, md: 2 }, py: 1.25, borderRadius: 3.5, border: "1px solid", borderColor: "divider", background: (theme) => theme.palette.mode === "dark" ? "linear-gradient(110deg,rgba(24,199,122,.10),rgba(47,111,237,.06),rgba(255,255,255,.025))" : "linear-gradient(110deg,rgba(24,199,122,.10),rgba(47,111,237,.055),rgba(255,255,255,.94))", boxShadow: "0 10px 32px rgba(15,23,42,.06)" }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1.35} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box sx={{ width: 42, height: 42, borderRadius: 2.5, display: "grid", placeItems: "center", flexShrink: 0, color: "primary.main", bgcolor: "rgba(24,199,122,.10)", border: "1px solid rgba(24,199,122,.20)" }}><ForumOutlined /></Box>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Typography variant="h5" sx={{ fontWeight: 950, lineHeight: 1, letterSpacing: "-.025em" }}>Chat interno</Typography><Chip size="small" label={{ ONLINE: "Online", AWAY: "Ausente", BUSY: "Ocupado" }[availability]} color={availability === "BUSY" ? "error" : availability === "AWAY" ? "warning" : "success"} onClick={() => { const next = availability === "ONLINE" ? "AWAY" : availability === "AWAY" ? "BUSY" : "ONLINE"; setAvailability(next); localStorage.setItem("techlead-chat-status", next); }} sx={{ fontWeight: 800 }} /></Stack>
            <Typography variant="caption" color="text.secondary">Comunicação da equipe em tempo real</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0, flex: { md: 1 }, justifyContent: "flex-end", pr: { md: 300 } }}>
          <TextField size="small" value={statusMessage} onChange={(event) => { const value = event.target.value.slice(0,160); setStatusMessage(value); localStorage.setItem("techlead-chat-status-message", value); }} placeholder="Sua mensagem pessoal..." sx={{ width: { xs: "100%", md: 310 }, "& .MuiOutlinedInput-root": { borderRadius: 999, bgcolor: "background.paper" } }} slotProps={{ input: { startAdornment: <EditOutlined sx={{ mr: .8, fontSize: 16, color: "text.secondary" }} /> } }} />
          <Tooltip title="Presença sincronizada em tempo real"><AutoAwesomeOutlined sx={{ color: "primary.main", fontSize: 19 }} /></Tooltip>
        </Stack>
      </Stack>
    </Paper>
    {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
    <Paper elevation={0} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "300px minmax(0,1fr)" }, minHeight: 0, flex: 1, overflow: "hidden", borderRadius: 4, maxHeight: "100%", height: "100%", border: "1px solid", borderColor: "divider", boxShadow: "0 16px 42px rgba(15,23,42,.08)", bgcolor: "background.paper" }}>
      <Box sx={{ borderRight: { md: "1px solid" }, borderColor: "divider", minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,.018)" : "rgba(248,250,252,.72)" }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
          <Box><Typography sx={{ fontWeight: 900 }}>Contatos</Typography><Typography variant="caption" color="text.secondary">{channels.length} conversa(s)</Typography></Box>
          <Stack direction="row"><Tooltip title="Conversa privada"><IconButton size="small" onClick={() => setDirectOpen(true)}><ForumOutlined /></IconButton></Tooltip><Tooltip title="Novo canal"><IconButton size="small" aria-label="Criar canal" onClick={() => setCreateOpen(true)}><AddCommentOutlined /></IconButton></Tooltip></Stack>
        </Stack>
        <Box sx={{ px: 1.25, pb: 1 }}><TextField size="small" fullWidth value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Localizar contato..." slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: .7, fontSize: 18, color: "text.secondary" }} /> } }} /></Box>
        <Divider />
        <List disablePadding>{visibleChannels.map((channel) => <ListItemButton key={channel.id} selected={channel.id === selectedId} onClick={() => setSelectedId(channel.id)} sx={{ py: 1.05, px: 1.25, mx: .75, my: .35, minHeight: 64, borderRadius: 2.5, "&.Mui-selected": { bgcolor: "rgba(24,199,122,.10)" }, "&.Mui-selected:hover": { bgcolor: "rgba(24,199,122,.14)" } }}>
          <Box sx={{ position: "relative", mr: 1.25, width: 40, height: 40, minWidth: 40, flex: "0 0 40px", borderRadius: 2.4, bgcolor: channel.id === selectedId ? "primary.main" : "action.hover", display: "grid", placeItems: "center", fontWeight: 900 }}>{channel.name.slice(0,1).toUpperCase()}<Circle sx={{ position: "absolute", width: 10, height: 10, right: 0, bottom: 0, color: "success.main", stroke: "background.paper", strokeWidth: 4 }} /></Box>
          <ListItemText primary={channel.name} secondary={channel.clientName || channel.description || "Canal da equipe"} slotProps={{ primary: { sx: { fontWeight: 750, fontSize: ".88rem", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis" } }, secondary: { sx: { fontSize: ".72rem", mt: .25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } } }} />
          <Stack direction="row" spacing={.4} sx={{ alignItems: "center" }}><Tooltip title={favorites.includes(channel.id) ? "Remover dos favoritos" : "Favoritar"}><IconButton size="small" onClick={(event) => { event.stopPropagation(); toggleFavorite(channel.id); }} sx={{ width: 28, height: 28, p: .5, fontSize: 16 }}>{favorites.includes(channel.id) ? "★" : "☆"}</IconButton></Tooltip>{channel.unread > 0 && <Chip size="small" color="primary" label={channel.unread} />}</Stack>
        </ListItemButton>)}</List>
        {!channels.length && !loading && <Box sx={{ p: 3, textAlign: "center" }}><Typography color="text.secondary" variant="body2">Crie o primeiro canal da equipe.</Typography></Box>}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ px: 1.5, py: 1, alignItems: "center", justifyContent: "space-between" }}><Box><Stack direction="row" spacing={.7} sx={{ alignItems: "center" }}><Typography sx={{ fontWeight: 900 }}>{selected?.name || "Selecione uma conversa"}</Typography>{selected && <Chip size="small" icon={<Circle sx={{ fontSize: "9px !important" }} />} label={selected?.type === "DIRECT" ? ({ ONLINE: "Online", AWAY: "Ausente", BUSY: "Ocupado", OFFLINE: "Offline" }[selectedPresence?.effectiveStatus ?? "OFFLINE"]) : `${selected.members?.filter((member) => presence.find((item) => item.userId === member.user.id)?.effectiveStatus !== "OFFLINE").length ?? 0} online`} color={selectedPresence?.effectiveStatus === "BUSY" ? "error" : selectedPresence?.effectiveStatus === "AWAY" ? "warning" : selectedPresence?.effectiveStatus === "ONLINE" ? "success" : "default"} variant="outlined" />}</Stack><Typography variant="caption" color="text.secondary">{selectedPresence?.statusMessage || "Mensagens instantâneas · tempo real"}</Typography></Box><Stack direction="row" spacing={.5}><TextField size="small" value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Buscar na conversa" sx={{ width: 210 }} slotProps={{ input: { startAdornment: <SearchOutlined sx={{ mr: .5, fontSize: 17, color: "text.secondary" }} /> } }} /><IconButton size="small"><MoreHorizOutlined /></IconButton></Stack></Stack>
        <Divider />
        <Box ref={messagesRef} sx={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", p: 2.5, bgcolor: "background.default" }}>
          {loading ? <Box sx={{ display: "grid", placeItems: "center", minHeight: 160 }}><CircularProgress size={28} /></Box> : visibleMessages.map((message, messageIndex) => {
            const mine = message.author.id === user?.id;
            const parent = message.parentId ? messages.find((item) => item.id === message.parentId) : null;
            const previous = visibleMessages[messageIndex - 1];
            const sameAuthor = previous?.author.id === message.author.id && (new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime()) < 5 * 60_000;
            const mentioned = Boolean(user?.username && message.content.toLowerCase().includes(`@${user.username.toLowerCase()}`));
            const renderContent = (value: string) => value.split(/(@[\\w.-]+)/g).map((part, index) => part.startsWith("@") ? <Box component="span" key={index} sx={{ fontWeight: 900, textDecoration: "underline" }}>{part}</Box> : part);
            return <Box key={message.id} sx={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", mb: sameAuthor ? .25 : 1.1, mt: sameAuthor ? 0 : .6 }}><Paper elevation={0} sx={{ maxWidth: "76%", p: 1.25, bgcolor: mine ? "primary.main" : mentioned ? "rgba(245,158,11,.10)" : "background.paper", color: mine ? "primary.contrastText" : "text.primary", border: mine ? 0 : "1px solid", borderColor: mentioned ? "warning.main" : "divider", borderRadius: mine ? "18px 18px 5px 18px" : "18px 18px 18px 5px", boxShadow: mine ? "0 8px 20px rgba(24,199,122,.12)" : "0 5px 16px rgba(15,23,42,.045)" }}><Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}><Typography variant="caption" sx={{ fontWeight: 800, opacity: .8 }}>{sameAuthor ? "" : message.author.name}</Typography><Tooltip title="Responder"><IconButton size="small" onClick={() => setReplyTo(message)} sx={{ color: "inherit", opacity: .65 }}><ReplyOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip></Stack>{parent && <Box sx={{ px: 1, py: .6, mb: .6, borderLeft: "3px solid", borderColor: mine ? "rgba(255,255,255,.55)" : "primary.main", bgcolor: mine ? "rgba(255,255,255,.12)" : "action.hover", borderRadius: 1 }}><Typography variant="caption" sx={{ fontWeight: 800 }}>{parent.author.name}</Typography><Typography variant="caption" noWrap sx={{ display: "block", maxWidth: 420 }}>{parent.content}</Typography></Box>}<Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{renderContent(message.content)}</Typography><Typography variant="caption" sx={{ display: "block", textAlign: "right", opacity: .7 }}>{new Date(message.createdAt).toLocaleString("pt-BR")}</Typography></Paper></Box>;
          })}
          <div ref={bottomRef} />
        </Box>
        <Divider />
        {typingNames.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ px: 1.6, pt: .45 }}>{typingNames.join(", ")} {typingNames.length === 1 ? "está" : "estão"} digitando...</Typography>}
        {replyTo && <Stack direction="row" sx={{ px: 1.5, py: .7, alignItems: "center", justifyContent: "space-between", bgcolor: "action.hover", borderTop: "1px solid", borderColor: "divider" }}><Box><Typography variant="caption" sx={{ fontWeight: 850 }}>Respondendo a {replyTo.author.name}</Typography><Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", maxWidth: 620 }}>{replyTo.content}</Typography></Box><IconButton size="small" onClick={() => setReplyTo(null)}><CloseOutlined fontSize="small" /></IconButton></Stack>}
        <Stack direction="row" spacing={1} sx={{ p: 1.25, alignItems: "flex-end", bgcolor: "background.paper" }}>
          <Tooltip title="Emojis"><IconButton onClick={(event) => setEmojiAnchor(event.currentTarget)} disabled={!selectedId}><EmojiEmotionsOutlined /></IconButton></Tooltip>
          <Tooltip title="Figurinhas"><IconButton onClick={() => setStickersOpen(true)} disabled={!selectedId}><CelebrationOutlined /></IconButton></Tooltip>
          <Tooltip title={soundEnabled ? "Desativar som" : "Ativar som"}><IconButton color={soundEnabled ? "primary" : "default"} onClick={() => { const next = !soundEnabled; setSoundEnabled(next); localStorage.setItem("techlead-chat-sound", next ? "on" : "off"); if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission(); }}><NotificationsActiveOutlined /></IconButton></Tooltip>
          <TextField size="small" fullWidth multiline maxRows={5} value={content} disabled={!selectedId || sending} placeholder="Escreva uma mensagem; use @usuario para mencionar..." slotProps={{ htmlInput: { maxLength: 4000 } }} onChange={(event) => { setContent(event.target.value); if (selectedId) void api.post(`/chat/channels/${selectedId}/typing`, { active: true }).catch(() => undefined); if (typingTimer.current) window.clearTimeout(typingTimer.current); typingTimer.current = window.setTimeout(() => { if (selectedId) void api.post(`/chat/channels/${selectedId}/typing`, { active: false }).catch(() => undefined); }, 1200); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
          <Button variant="contained" endIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendRounded />} disabled={!selectedId || !content.trim() || sending} onClick={() => void send()}>Enviar</Button>
        </Stack>
      </Box>
    </Paper>
    <Popover open={Boolean(emojiAnchor)} anchorEl={emojiAnchor} onClose={() => setEmojiAnchor(null)} anchorOrigin={{ vertical: "top", horizontal: "left" }} transformOrigin={{ vertical: "bottom", horizontal: "left" }}><Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 42px)", gap: .5, p: 1 }}>{emojis.map((emoji) => <IconButton key={emoji} onClick={() => { append(emoji); setEmojiAnchor(null); }} sx={{ fontSize: 22 }}>{emoji}</IconButton>)}</Box></Popover>
    <Dialog open={stickersOpen} onClose={() => setStickersOpen(false)} maxWidth="xs" fullWidth><DialogTitle>Figurinhas rápidas</DialogTitle><DialogContent><Box sx={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 1, pt: .5 }}>{stickers.map((sticker) => <Button key={sticker} variant="outlined" onClick={() => { append(sticker); setStickersOpen(false); }} sx={{ minHeight: 72, fontWeight: 850 }}>{sticker}</Button>)}</Box></DialogContent></Dialog>
    <Dialog open={directOpen} onClose={() => setDirectOpen(false)} fullWidth maxWidth="xs"><DialogTitle>Nova conversa privada</DialogTitle><DialogContent><List>{participants.filter((person) => person.id !== user?.id).map((person) => <ListItemButton key={person.id} onClick={() => void openDirect(person)} sx={{ borderRadius: 1.5 }}><Box sx={{ width: 34, height: 34, borderRadius: "50%", bgcolor: "action.hover", display: "grid", placeItems: "center", mr: 1.2, fontWeight: 900 }}>{person.name.slice(0,1)}</Box><ListItemText primary={person.name} secondary={`@${person.username} · ${person.role}`} /></ListItemButton>)}</List></DialogContent></Dialog>
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
