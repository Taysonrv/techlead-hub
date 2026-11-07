import { Alert, Box, Button, Card, CardContent, Chip, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import { ArrowForwardOutlined, InfoOutlined } from "@mui/icons-material";

type Operational = {
  reopenRate: number | null;
  firstContactResolutionRate: number | null;
  resolutionSlaRate: number | null;
  responseSlaRate: number | null;
  flowBalance: number | null;
  criticalAging: number;
};
type Daily = { date: string; opened: number; resolved: number; reopened: number; pending: number };
type Props = {
  operational: Operational;
  daily: Daily[];
  periodLabel: string;
  onOpenOkrs: () => void;
  onInvestigateRecurrences: () => void;
  coverage?: { ticketLimitReached: boolean; taskLimitReached: boolean };
};
const fmt = (value: number | null) => value === null || !Number.isFinite(value) ? "Sem dados" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
export function LeadershipResolutionPanel({ operational, daily, periodLabel, onOpenOkrs, onInvestigateRecurrences, coverage }: Props) {
  const opened = daily.reduce((total, item) => total + item.opened, 0);
  const resolved = daily.reduce((total, item) => total + item.resolved, 0);
  const reopened = daily.reduce((total, item) => total + item.reopened, 0);
  const indicators = [
    { name: "Resolução no primeiro contato", value: operational.firstContactResolutionRate, direction: "higher", detail: "Proporção de resoluções no primeiro contato conforme classificação disponível no Movidesk.", okr: "Gestão técnica da base de conhecimento" },
    { name: "Reabertura", value: operational.reopenRate, direction: "lower", detail: "Taxa de reabertura calculada pela rotina operacional; não equivale à taxa de reincidência de causas.", okr: "Análise de causas e padrões" },
    { name: "SLA de solução", value: operational.resolutionSlaRate, direction: "higher", detail: "Percentual de resoluções com SLA mensurável cumprido.", okr: "Qualidade dos escalonamentos" },
    { name: "SLA de primeira resposta", value: operational.responseSlaRate, direction: "higher", detail: "Percentual de primeiras respostas com SLA mensurável cumprido.", okr: "Qualidade dos escalonamentos" },
  ] as const;
  return <Card variant="outlined" sx={{ mb: 2, borderRadius: 3 }}>
    <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, mb: 1.5 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>Resolutividade e qualidade do atendimento</Typography>
          <Typography variant="body2" color="text.secondary">Leitura operacional do recorte selecionado: {periodLabel}. Indicadores não representam, isoladamente, o cumprimento dos OKRs.</Typography>
        </Box>
        <Button variant="outlined" endIcon={<ArrowForwardOutlined />} onClick={onOpenOkrs}>Acompanhar OKRs</Button>
      </Stack>
      {(coverage?.ticketLimitReached || coverage?.taskLimitReached) && <Alert severity="warning" sx={{ mb: 1.5 }}>O limite de registros da consulta foi atingido. Os indicadores podem representar apenas parte da carteira; revise os filtros antes de tirar conclusões.</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,minmax(0,1fr))", xl: "repeat(4,minmax(0,1fr))" }, gap: 1.5 }}>
        {indicators.map(item => <Box key={item.name} sx={{ p: 1.6, border: "1px solid", borderColor: "divider", borderRadius: 2, minWidth: 0 }}>
          <Stack direction="row" spacing={.5} sx={{ alignItems: "center" }}>
            <Typography variant="body2" sx={{ fontWeight: 750 }}>{item.name}</Typography>
            <Tooltip title={item.detail}><InfoOutlined color="action" sx={{ fontSize: 15 }} /></Tooltip>
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 900, my: .8 }}>{fmt(item.value)}</Typography>
          <LinearProgress variant="determinate" value={item.value === null ? 0 : Math.min(100, Math.max(0, item.value))} color={item.direction === "lower" ? "warning" : "primary"} sx={{ height: 7, borderRadius: 4 }} />
          <Typography variant="caption" color="text.secondary">{item.direction === "lower" ? "Quanto menor, melhor" : "Quanto maior, melhor"}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .6 }}>Relacionamento: {item.okr}</Typography>
        </Box>)}
      </Box>
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap", mt: 2, alignItems: "center" }}>
        <Chip size="small" label={`Entradas: ${opened.toLocaleString("pt-BR")}`} />
        <Chip size="small" label={`Resoluções: ${resolved.toLocaleString("pt-BR")}`} />
        <Chip size="small" label={`Eventos de reabertura: ${reopened.toLocaleString("pt-BR")}`} />
        <Chip size="small" label={`Backlog crítico: ${operational.criticalAging.toLocaleString("pt-BR")}`} color={operational.criticalAging > 0 ? "warning" : "default"} />
        <Chip size="small" label={`Balanço do fluxo: ${fmt(operational.flowBalance)}`} variant="outlined" />
      </Stack>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, mt: 2 }}>
        <Typography variant="caption" color="text.secondary">Entradas, resoluções e reaberturas são eventos do período; não são necessariamente os mesmos tickets. As taxas usam as regras e denominadores do backend.</Typography>
        <Button size="small" onClick={onInvestigateRecurrences}>Investigar padrões e recorrências</Button>
      </Stack>
    </CardContent>
  </Card>;
}
