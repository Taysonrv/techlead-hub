import { AddCommentOutlined, ForumOutlined, SendRounded, ShieldOutlined } from "@mui/icons-material";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, List, ListItemButton, ListItemText, Paper, Stack, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/PageHeader";

type Person = { id: number; name: string; username: string; role: string };
type Message = { id: number; content: string; createdAt: string; author: Person };
type Channel = { id: number; name: string; type: string; description?: string | null; clientName?: string | null; unread: number; messages: Message[] };

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

  const selected = useMemo(() => channels.find((channel) => channel.id === selectedId) ?? null, [channels, selectedId]);

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
    const timer = window.setInterval(() => void loadMessages(selectedId, true), 5_000);
    return () => window.clearInterval(timer);
  }, [loadMessages, selectedId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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
      const response = await api.post<Message>(`/chat/channels/${selectedId}/messages`, { content: text });
      setMessages((current) => [...current, response.data]);
      setContent("");
      setError("");
    } catch (requestError: any) { setError(requestError?.response?.data?.error || "Não foi possível enviar a mensagem."); }
    finally { setSending(false); }
  }

  return <Stack spacing={2.5}>
    <PageHeader eyebrow="Colaboração" title="Chat interno" description="Converse com a equipe e mantenha o contexto operacional dentro do TechLead Hub." />
    <Alert icon={<ShieldOutlined />} severity="info">Não envie senhas, tokens, chaves privadas ou strings de conexão. O sistema bloqueia padrões de credenciais e registra somente metadados na auditoria.</Alert>
    {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
    <Paper variant="outlined" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "280px minmax(0,1fr)" }, minHeight: 620, overflow: "hidden" }}>
      <Box sx={{ borderRight: { md: "1px solid" }, borderColor: "divider" }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", p: 2 }}>
          <Typography sx={{ fontWeight: 850 }}>Conversas</Typography>
          <IconButton size="small" aria-label="Criar canal" onClick={() => setCreateOpen(true)}><AddCommentOutlined /></IconButton>
        </Stack>
        <Divider />
        <List disablePadding>{channels.map((channel) => <ListItemButton key={channel.id} selected={channel.id === selectedId} onClick={() => setSelectedId(channel.id)} sx={{ py: 1.5 }}>
          <ForumOutlined fontSize="small" sx={{ mr: 1.5, color: "text.secondary" }} />
          <ListItemText primary={channel.name} secondary={channel.clientName || channel.description || "Canal da equipe"} slotProps={{ primary: { sx: { fontWeight: 750 } } }} />
          {channel.unread > 0 && <Chip size="small" color="primary" label={channel.unread} />}
        </ListItemButton>)}</List>
        {!channels.length && !loading && <Box sx={{ p: 3, textAlign: "center" }}><Typography color="text.secondary" variant="body2">Crie o primeiro canal da equipe.</Typography></Box>}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Box sx={{ p: 2 }}><Typography sx={{ fontWeight: 850 }}>{selected?.name || "Selecione uma conversa"}</Typography><Typography variant="caption" color="text.secondary">Atualização segura a cada 5 segundos</Typography></Box>
        <Divider />
        <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, bgcolor: "background.default" }}>
          {loading ? <Box sx={{ display: "grid", placeItems: "center", minHeight: 300 }}><CircularProgress size={28} /></Box> : messages.map((message) => {
            const mine = message.author.id === user?.id;
            return <Box key={message.id} sx={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", mb: 1.5 }}><Paper elevation={0} sx={{ maxWidth: "76%", p: 1.5, bgcolor: mine ? "primary.main" : "background.paper", color: mine ? "primary.contrastText" : "text.primary", border: mine ? 0 : "1px solid", borderColor: "divider", borderRadius: 2 }}><Typography variant="caption" sx={{ fontWeight: 800, opacity: .8 }}>{message.author.name}</Typography><Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.content}</Typography><Typography variant="caption" sx={{ display: "block", textAlign: "right", opacity: .7 }}>{new Date(message.createdAt).toLocaleString("pt-BR")}</Typography></Paper></Box>;
          })}
          <div ref={bottomRef} />
        </Box>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ p: 2, alignItems: "flex-end" }}>
          <TextField fullWidth multiline maxRows={5} value={content} disabled={!selectedId || sending} placeholder="Escreva uma mensagem; use @usuario para mencionar..." slotProps={{ htmlInput: { maxLength: 4000 } }} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} />
          <Button variant="contained" endIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendRounded />} disabled={!selectedId || !content.trim() || sending} onClick={() => void send()}>Enviar</Button>
        </Stack>
      </Box>
    </Paper>
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
