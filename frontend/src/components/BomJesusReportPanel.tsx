import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { api, getApiErrorMessage } from "../services/api";

type CategorySnapshot = { previousCategory: string | null; category: string; source: string; observedAt: string; sourceLastUpdate: string | null; kind: string };
type Row = { initialObservedCategory: string | null; initialObservedAt: string | null; initialSource: string | null; openingCategoryVerified: boolean; categoryHistory: CategorySnapshot[]; id: number; subject: string; createdDate: string; status: string; category: string; taskNumber: number | null; classification: string; vistra: boolean; recurrenceCount: number; ola: string; evidence: string; taskState: string; deliveredVersion: string; supportOlaBreached: boolean | null; categoryChangedAt: string | null; categoryChangeEvidence: string; vistraType: string; recurrenceEvidence: string };
type Report = { generatedAt: string; methodology: string; totals: { tickets: number; possibleBugs: number; currentImprovements: number; vistraCandidates: number; recurrenceCandidates: number; confirmedBugs: null; reclassified: number; categoryChangeEvidenceCount: number; categoryHistoryCoverage: number; categoryOpeningVerified: number; recurrenceGroups: number; olaBreaches: number; linkedCorrectionTasks: number; deliveredCorrectionTasks: number }; monthly: { month: string; tickets: number; vistra: number }[]; rows: Row[] };
export function BomJesusReportPanel() {
  const [startDate, setStartDate] = useState("2026-08-01");
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [selectedHistory, setSelectedHistory] = useState<Row | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const result = await api.get<Report>("/coordination/bom-jesus-report", { params: { startDate, endDate }, signal });
      if (!signal?.aborted) setReport(result.data);
    } catch (e) { if (!signal?.aborted) { setError(getApiErrorMessage(e, "Falha ao carregar relatório.")); setReport(null); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [startDate, endDate]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const download = async () => {
    setExporting(true); setError("");
    try {
      const response = await api.get("/coordination/bom-jesus-report.xlsx", { params: { startDate, endDate }, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a"); a.href = url; a.download = `relatorio-bom-jesus-${startDate}-${endDate}.xlsx`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(getApiErrorMessage(e, "Falha ao exportar Excel.")); }
    finally { setExporting(false); }
  };
  const rows = report?.rows.filter(x => [x.subject, String(x.id), x.category, x.classification].join(" ").toLocaleLowerCase("pt-BR").includes(filter.toLocaleLowerCase("pt-BR"))) ?? [];
  return <Card variant="outlined" sx={{ mb: 2, borderRadius: 3 }} id="diagnostico-bom-jesus"><CardContent>
    <Stack direction={{ xs: "column", md: "row" }} sx={{ justifyContent: "space-between", gap: 1, mb: 2 }}>
      <Box><Typography variant="h6">Diagnóstico gerencial — Bom Jesus</Typography><Typography variant="body2" color="text.secondary">Dados sincronizados do HUB, rastreáveis por ticket. Exportação Excel com resumo, evidências e periodicidade.</Typography></Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <TextField size="small" type="date" label="De" value={startDate} onChange={e => setStartDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="Até" value={endDate} onChange={e => setEndDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button variant="outlined" onClick={() => void load()} disabled={loading}>Atualizar</Button>
        <Button variant="contained" onClick={() => void download()} disabled={!report || exporting}>{exporting ? "Exportando..." : "Exportar Excel (.xlsx)"}</Button>
      </Stack>
    </Stack>
    <Alert severity="warning" sx={{ mb: 2 }}>As alterações de categoria são capturadas nas sincronizações. A primeira categoria observada não comprova a categoria na abertura, e a data registrada é a da observação pelo HUB. Dados anteriores à implantação não podem ser reconstruídos automaticamente. Bugs e falhas recorrentes permanecem sujeitos à validação técnica.</Alert>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {loading && <CircularProgress size={24} />}
    {report && <>
      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Chip label={`Tickets: ${report.totals.tickets}`} />
        <Chip color="info" label={`Possíveis bugs: ${report.totals.possibleBugs}`} />
        <Chip label={`Melhorias atuais: ${report.totals.currentImprovements}`} />
        <Chip color="success" label={`Tasks de correção: ${report.totals.linkedCorrectionTasks}`} />
        <Chip label={`Com versão vinculada: ${report.totals.deliveredCorrectionTasks}`} />
        <Chip color="error" label={`OLA Suporte excedido: ${report.totals.olaBreaches}`} />
        <Chip color="warning" label={`Vistra/relatórios: ${report.totals.vistraCandidates}`} />
        <Chip label={`Possíveis recorrências: ${report.totals.recurrenceCandidates}`} />
        <Chip color="info" label={`Grupos recorrentes: ${report.totals.recurrenceGroups}`} />
        <Chip color="warning" label={`Transições observadas Bug → Adequação: ${report.totals.reclassified}`} />
        <Chip label={`Históricos de categoria: ${report.totals.categoryHistoryCoverage}`} />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{report.methodology}</Typography>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Periodicidade mensal</Typography>
      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mb: 2 }}>{report.monthly.map(x => <Chip key={x.month} variant="outlined" label={`${x.month}: ${x.tickets} tickets · ${x.vistra} Vistra/relatórios`} />)}</Stack>
      <TextField size="small" label="Buscar ticket ou assunto" value={filter} onChange={e => setFilter(e.target.value)} sx={{ mb: 1, minWidth: 270 }} />
      <TableContainer sx={{ maxHeight: 430 }}><Table size="small" stickyHeader>
        <TableHead><TableRow>{["Ticket", "Assunto", "Abertura", "Categoria atual", "Primeira observada", "Histórico", "Classificação", "Vistra", "Grupo", "Task", "Estado", "Versão", "Mudança categoria", "Vistra/relatório", "OLA"].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
        <TableBody>{rows.slice(0, 200).map(x => <TableRow key={x.id} hover>
          <TableCell>{x.id}</TableCell><TableCell sx={{ minWidth: 240 }}>{x.subject}</TableCell>
          <TableCell>{x.createdDate.slice(0, 10)}</TableCell><TableCell>{x.category}</TableCell>
          <TableCell>{x.initialObservedCategory || "Não registrada"}</TableCell>
          <TableCell><Button size="small" disabled={!x.categoryHistory.length} onClick={() => setSelectedHistory(x)}>Ver ({x.categoryHistory.length})</Button></TableCell>
          <TableCell>{x.classification}</TableCell><TableCell>{x.vistra ? "Validar" : "—"}</TableCell>
          <TableCell>{x.recurrenceCount > 1 ? x.recurrenceCount : "—"}</TableCell><TableCell>{x.taskNumber ?? "—"}</TableCell><TableCell>{x.taskState || "—"}</TableCell><TableCell>{x.deliveredVersion || "—"}</TableCell><TableCell>{x.categoryChangeEvidence ? (x.categoryChangedAt?.slice(0, 10) || "Data não informada") : "Sem evidência"}</TableCell><TableCell>{x.vistraType}</TableCell><TableCell>{x.supportOlaBreached === null ? "Não calculável" : x.supportOlaBreached ? "Excedido" : "Dentro do prazo"}</TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
      {rows.length > 200 && <Typography variant="caption" color="text.secondary">Exibindo 200 de {rows.length} tickets filtrados. O Excel inclui todos os registros do período.</Typography>}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Gerado em {new Date(report.generatedAt).toLocaleString("pt-BR")} · Sem alteração dos dados originais.</Typography>
    </>}
  <Dialog open={Boolean(selectedHistory)} onClose={() => setSelectedHistory(null)} fullWidth maxWidth="md">
    <DialogTitle>Histórico observado de categorias · Ticket {selectedHistory?.id}</DialogTitle>
    <DialogContent>
      <Alert severity="info" sx={{ mb: 2 }}>Categoria na abertura: não comprovada. A data abaixo indica quando o HUB registrou cada estado, não necessariamente quando a categoria mudou no Movidesk.</Alert>
      <Typography variant="body2" sx={{ mb: 1 }}>Primeira categoria observada: <strong>{selectedHistory?.initialObservedCategory || "Sem registro"}</strong> · Fonte: {selectedHistory?.initialSource || "Não informada"}</Typography>
      <TableContainer><Table size="small"><TableHead><TableRow>{["Tipo", "De", "Para", "Observado em", "Fonte"].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
      <TableBody>{selectedHistory?.categoryHistory.map((event, index) => <TableRow key={index}>
        <TableCell>{event.kind === "BASELINE" ? "Primeira observação" : "Mudança observada"}</TableCell>
        <TableCell>{event.previousCategory ?? "—"}</TableCell><TableCell>{event.category}</TableCell>
        <TableCell>{new Date(event.observedAt).toLocaleString("pt-BR")}</TableCell><TableCell>{event.source}</TableCell>
      </TableRow>)}</TableBody></Table></TableContainer>
      <Button sx={{ mt: 2 }} variant="outlined" onClick={() => setSelectedHistory(null)}>Fechar</Button>
    </DialogContent>
  </Dialog>
  </CardContent></Card>;
}
