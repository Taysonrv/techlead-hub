import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { api } from "../services/api";

type SearchMessage = { id: number; content: string; createdAt: string; author: { name: string } };

export function ChatHistorySearch({ channelId, open, onClose }: {
  channelId: number; open: boolean; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setResults([]); setSearched(false); setError(""); setQuery(""); }, [channelId]);

  async function search() {
    const term = query.trim();
    if (term.length < 2 || term.length > 120) return;
    setLoading(true); setError("");
    try {
      const response = await api.get<{ messages: SearchMessage[] }>(`/chat/channels/${channelId}/search`, { params: { q: term } });
      setResults(response.data.messages);
      setSearched(true);
    } catch {
      setError("Não foi possível pesquisar o histórico desta conversa.");
    } finally { setLoading(false); }
  }

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="chat-history-search-title">
    <DialogTitle id="chat-history-search-title">Pesquisar histórico da conversa</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1}>
          <TextField size="small" fullWidth autoFocus label="Buscar mensagem" value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void search(); }}
            inputProps={{ maxLength: 120 }} />
          <Button variant="contained" disabled={loading || query.trim().length < 2} onClick={() => void search()}>Buscar</Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">Pesquisa no histórico armazenado, inclusive mensagens anteriores às últimas 100. Até 50 resultados por consulta.</Typography>
        {loading && <CircularProgress size={22} />}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && searched && !results.length && <Typography variant="body2">Nenhuma mensagem encontrada.</Typography>}
        {results.map((message) => <Box key={message.id} sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary">{message.author.name} · {new Date(message.createdAt).toLocaleString("pt-BR")}</Typography>
          <Typography variant="body2" sx={{ mt: .5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.content}</Typography>
        </Box>)}
      </Stack>
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
  </Dialog>;
}
