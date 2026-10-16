import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Stack, TextField, Typography } from "@mui/material";
import { ContentCopyOutlined, OpenInNewOutlined, SearchOutlined } from "@mui/icons-material";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getTicketSnapshot } from "../services/ticketSnapshot";
import { api } from "../services/api";
import { PageHeader } from "../components/PageHeader";

type Ticket = {
  id?: number; movideskId: number; subject: string; client: string | null; status: string;
  service?: string | null; category?: string | null; createdDate?: string | null;
  deliveredVersion?: string | null; justification?: string | null;
};
type Fields = { problem: string; correct: string; environment: string; reproduce: string; video: string; evidence: string; links: string };
const blank: Fields = { problem: "", correct: "", environment: "", reproduce: "", video: "", evidence: "", links: "" };
const questions: Array<{ key: keyof Fields; title: string; hint: string }> = [
  { key: "problem", title: "Qual é o problema?", hint: "Comportamento observado, dados e impacto. Diferencie relato de fato validado." },
  { key: "correct", title: "Qual é a forma correta?", hint: "Regra esperada com confirmação funcional. Caso não validada, registre pendência." },
  { key: "environment", title: "Ambiente de Testes", hint: "Produção/homologação, versão, filial, documentos e identificadores relevantes." },
  { key: "reproduce", title: "Como reproduzir?", hint: "Passos confirmados para reproduzir. Não invente passos não executados." },
  { key: "video", title: "Vídeo em anexo", hint: "Identificação ou link do vídeo; informe quando não houver evidência." },
  { key: "evidence", title: "Prints e evidências importantes", hint: "Relacione prints, logs, consultas SQL e resultados, com fonte verificável." },
  { key: "links", title: "Links e referências", hint: "Tickets relacionados, mapas, BPMN, Azure e documentação relevante." },
];
const normalize = (value: string) => value.trim() || "Pendente de validação / evidência não informada.";

export function AnalysisAssistant() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [ticketId, setTicketId] = useState(params.get("ticket") ?? "");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [fields, setFields] = useState<Fields>(blank);
  const [copied, setCopied] = useState(false);

  const loadTicket = async () => {
    const id = Number(ticketId.trim().replace(/^#/, ""));
    if (!Number.isSafeInteger(id) || id <= 0) { setLoadError("Informe um número válido de ticket Movidesk."); return; }
    setLoading(true); setLoadError("");
    try {
      const data = await getTicketSnapshot<Ticket>();
      const found = data.find((item) => item.movideskId === id);
      if (!found) { setTicket(null); setLoadError("Ticket não encontrado no snapshot sincronizado. Atualize os dados ou informe as evidências manualmente."); return; }
      setTicket(found);
      let timelineNotes = "";
      if (found.id) {
        try {
          const response = await api.get<{ timeline?: Array<{ date: string; title: string; description: string | null; author: string | null }> }>("/dashboard/tickets/" + found.id + "/analytics");
          timelineNotes = (response.data.timeline ?? []).filter((event) => Boolean(event.description?.trim())).slice(-6)
            .map((event) => "[" + event.date + " · " + (event.author ?? "Autor não informado") + " · " + event.title + "] " + (event.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400)).join("\n");
        } catch { timelineNotes = "Histórico não disponível para carregamento automático. Consulte o Movidesk."; }
      }
      // O preenchimento assistido é sempre conservador; não afirmar testes a partir do título.
      setFields({
        problem: "Relato registrado no atendimento: " + found.subject + ".\nDescrever impacto e comportamento com base nas evidências da interação.",
        correct: "",
        environment: [
          found.client ? "Cliente: " + found.client : null,
          found.deliveredVersion ? "Versão vinculada: " + found.deliveredVersion : null,
          found.service ? "Serviço: " + found.service : null,
          "Ambiente (produção/homologação), versão utilizada no teste e documentos: confirmar.",
        ].filter(Boolean).join("\n"),
        reproduce: "", video: "", evidence: timelineNotes, links: "",
      });
      setCopied(false);
    } catch {
      setLoadError("Não foi possível consultar os tickets nesta instância. Confira a conexão com o backend.");
    } finally { setLoading(false); }
  };
  useEffect(() => { if (params.get("ticket")) void loadTicket(); /* Executar somente no acesso inicial */ }, []);
  const result = useMemo(() => {
    const heading = ticket ? "Análise técnica — Ticket #" + ticket.movideskId + " · " + ticket.subject : "Análise técnica do atendimento";
    const sections = questions.map(({ key, title }) => "**" + title + "**\n" + normalize(fields[key]));
    return [heading, ticket ? "Cliente: " + (ticket.client ?? "Não informado") + "\nSituação: " + ticket.status : "", ...sections].filter(Boolean).join("\n\n");
  }, [fields, ticket]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
    } catch { setLoadError("A cópia automática não foi permitida. Selecione o texto abaixo para copiar."); }
  };

  return <Box sx={{ minWidth: 0, pb: 3 }}>
    <PageHeader eyebrow="SUPORTE SIMER · INVESTIGAÇÃO" title="Análise Assistida de Atendimento"
      description="Monte uma análise rastreável, pronta para copiar no atendimento ou utilizar na abertura de Task/Apoio. O sistema não inventa testes, causas nem vídeos."
      action={<Button variant="outlined" onClick={() => navigate("/visao-operacional")}>Voltar ao Dashboard</Button>} />
    <Card variant="outlined" sx={{ borderRadius: 2.5, mb: 2 }}>
      <CardContent>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
          <TextField label="Número do ticket Movidesk" value={ticketId} onChange={(event) => setTicketId(event.target.value)} size="small"
            placeholder="Ex.: 816055" sx={{ flex: 1 }} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
          <Button variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={16}/> : <SearchOutlined/>} onClick={() => void loadTicket()}>Carregar dados</Button>
          {ticket && <Button variant="outlined" startIcon={<OpenInNewOutlined />} onClick={() => navigate("/operacao/tickets?movidesk=" + ticket.movideskId)}>Abrir ticket</Button>}
        </Stack>
        {loadError && <Alert severity="warning" sx={{ mt: 1.5 }}>{loadError}</Alert>}
        <Alert severity="info" sx={{ mt: 1.5 }}>Os dados básicos vêm do snapshot sincronizado. Prints, interações, regras, logs e testes precisam ser conferidos e registrados pelo analista. Campos ausentes serão marcados como pendentes.</Alert>
      </CardContent>
    </Card>
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "minmax(0,1fr) minmax(0,1fr)" }, gap: 2 }}>
      <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
        <CardContent>
          <Typography sx={{ fontWeight: 850, mb: 1.5 }}>Evidências e validações</Typography>
          <Stack spacing={2}>
            {questions.map((question) =>
              <TextField key={question.key} label={question.title} helperText={question.hint} fullWidth multiline minRows={question.key === "problem" ? 4 : 2}
                value={fields[question.key]} onChange={(event) => { setFields((previous) => ({ ...previous, [question.key]: event.target.value })); setCopied(false); }} />
            )}
          </Stack>
        </CardContent>
      </Card>
      <Card variant="outlined" sx={{ borderRadius: 2.5, minWidth: 0 }}>
        <CardContent>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Typography sx={{ fontWeight: 850 }}>Descrição pronta para o atendimento</Typography>
            <Button variant="contained" size="small" startIcon={<ContentCopyOutlined />} onClick={() => void copy()}>{copied ? "Copiado" : "Copiar texto"}</Button>
          </Stack>
          <Divider sx={{ mb: 1.5 }} />
          <Box component="pre" sx={{ fontFamily: "inherit", fontSize: ".86rem", lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere", m: 0 }}>{result}</Box>
        </CardContent>
      </Card>
    </Box>
  </Box>;
}
