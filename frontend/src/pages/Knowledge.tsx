import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { CloudDoneOutlined, LoginOutlined, OpenInNewOutlined, SearchOutlined } from "@mui/icons-material";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";

type Status = { configured: boolean; connected: boolean; account: string | null; sharePointSite: string | null; bpmnSite: string | null; azure: { configured: boolean; wiki: string | null; wikiAvailable: boolean } };
type Hit = { source: "azure-wiki" | "sharepoint" | "bpmn"; title: string; excerpt: string; path?: string; webUrl: string | null; modifiedAt?: string | null };

export function Knowledge() {
  const [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [items, setItems] = useState<Hit[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [connection, setConnection] = useState<{ connectionId: string; userCode: string; verificationUri: string; message: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = async () => setStatus((await api.get<Status>("/knowledge/status")).data);
  useEffect(() => { void loadStatus(); }, []);

  async function connect() {
    try {
      setMessage(null);
      const response = await api.post("/knowledge/microsoft/connect");
      setConnection(response.data);
      window.open(response.data.verificationUri, "_blank", "noopener,noreferrer");
    } catch (error: any) { setMessage(error?.response?.data?.message || "Não foi possível iniciar a conexão Microsoft."); }
  }

  async function confirmConnection() {
    if (!connection) return;
    try {
      const response = await api.post(`/knowledge/microsoft/connect/${connection.connectionId}`);
      if (response.data.connected) {
        setConnection(null);
        setMessage("Conta Microsoft conectada com sucesso.");
        await loadStatus();
      } else setMessage("A autorização ainda não foi concluída na página da Microsoft.");
    } catch (error: any) { setMessage(error?.response?.data?.message || "Não foi possível concluir a conexão."); }
  }

  async function search() {
    if (query.trim().length < 3) { setMessage("Informe ao menos 3 caracteres para pesquisar."); return; }
    try {
      setLoading(true); setMessage(null);
      const response = await api.get("/knowledge/search", { params: { q: query.trim(), source }, timeout: 60_000 });
      setItems(response.data.items ?? []); setWarnings(response.data.warnings ?? []);
    } catch (error: any) { setMessage(error?.code === "ECONNABORTED" ? "A primeira indexação da Wiki excedeu o tempo esperado. Tente novamente; as próximas consultas usam cache." : error?.response?.data?.message || error?.message || "Não foi possível pesquisar."); }
    finally { setLoading(false); }
  }

  return <Box>
    <PageHeader eyebrow="Conhecimento" title="Base de Conhecimento" description="Consulte procedimentos da Wiki Azure, documentos do SharePoint e regras publicadas nos fluxos BPMN do SIMER." />
    {message && <Alert severity={message.includes("sucesso") ? "success" : "info"} sx={{ mb: 2 }}>{message}</Alert>}
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5, mb: 2 }}><CardContent>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { md: "center" } }}>
        <TextField fullWidth label="Rotina, mensagem de erro, módulo ou assunto" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void search()} />
        <TextField select label="Fonte" value={source} onChange={(event) => setSource(event.target.value)} sx={{ minWidth: 210 }}>
          <MenuItem value="all">Todas as fontes</MenuItem><MenuItem value="sharepoint">SharePoint do time</MenuItem><MenuItem value="bpmn">Fluxos BPMN</MenuItem>
          <MenuItem value="azure-wiki">Wiki Azure</MenuItem>
        </TextField>
        <Button variant="contained" startIcon={<SearchOutlined />} onClick={() => void search()} disabled={loading} sx={{ minWidth: 130, height: 56 }}>{loading ? <CircularProgress size={20} color="inherit" /> : "Pesquisar"}</Button>
      </Stack>
      <Divider sx={{ my: 2 }} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
        <Chip color={status?.azure.wikiAvailable ? "success" : "warning"} variant="outlined" label={status?.azure.wikiAvailable ? `Wiki Azure conectada: ${status.azure.wiki}` : status?.azure.configured ? "Wiki Azure indisponível" : "Wiki Azure não configurada"} />
        <Chip icon={status?.connected ? <CloudDoneOutlined /> : undefined} color={status?.connected ? "success" : "default"} variant="outlined" label={status?.connected ? `Microsoft: ${status.account || "conectado"}` : status?.configured ? "Microsoft não conectado" : "Microsoft aguardando configuração"} />
        {status?.configured && !status.connected && <Button size="small" startIcon={<LoginOutlined />} onClick={() => void connect()}>Conectar conta Microsoft</Button>}
        {connection && <><Chip color="primary" label={`Código: ${connection.userCode}`} /><Button size="small" variant="outlined" onClick={() => void confirmConnection()}>Já autorizei</Button></>}
      </Stack>
    </CardContent></Card>
    {warnings.map((warning) => <Alert severity="warning" sx={{ mb: 1 }} key={warning}>{warning}</Alert>)}
    {!loading && !items.length && <Alert severity="info">Pesquise um assunto para localizar conteúdos relacionados. A Wiki Azure funciona independentemente da conexão Microsoft.</Alert>}
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
      {items.map((item, index) => <Card key={`${item.source}-${item.webUrl}-${index}`} elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2.5 }}><CardContent>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}><Typography sx={{ fontWeight: 850 }}>{item.title}</Typography><Chip size="small" label={item.source === "azure-wiki" ? "Wiki Azure" : item.source === "bpmn" ? "BPMN" : "SharePoint"} /></Stack>
        {item.path && <Typography variant="caption" color="text.secondary">{item.path}</Typography>}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{item.excerpt}</Typography>
        {item.webUrl && <Button component="a" href={item.webUrl} target="_blank" rel="noopener noreferrer" size="small" endIcon={<OpenInNewOutlined />} sx={{ mt: 1, px: 0 }}>Abrir conteúdo</Button>}
      </CardContent></Card>)}
    </Box>
  </Box>;
}
