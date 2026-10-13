import { KpiGrid } from "./KpiGrid";
import { KpiCard as ExecutiveKpiCard } from "./KpiCard";
import { ExportTicketsButton } from "./ExportTicketsButton";
import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Drawer, LinearProgress, Stack, Typography } from "@mui/material";
import { useFilters } from "../context/FiltersContext";
import { PeriodFilter } from "./PeriodFilter";
import { buildOperationalCohorts } from "../utils/operationalMetrics";
import { calculateTimestampSla } from "../utils/timestampSla";
import { getTicketSnapshot, getTicketSnapshotState, subscribeTicketSnapshotRefresh } from "../services/ticketSnapshot";

type Row = { id: number; movideskId: number; subject: string; client: string | null; createdDate: string; resolvedDate: string | null; closedDate: string | null; baseStatus: string; isWithSimer: boolean; dueDate: string | null };
export function ManagementOverview() {
  const { effectiveStartDate, effectiveEndDate } = useFilters();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<{ title: string; rows: Row[] } | null>(null);
  useEffect(() => {
    let active = true;
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const data = await getTicketSnapshot<Row>();
        if (active) { setRows(data); setLoaded(true); setError(getTicketSnapshotState().lastErrorAt ? "A atualização falhou. Exibindo os últimos dados disponíveis." : ""); }
      } catch { if (active) setError("Não foi possível atualizar a visão executiva."); }
      finally { busy = false; }
    };
    void load();
    const unsubscribe = subscribeTicketSnapshotRefresh(() => { void load(); });
    return () => { active = false; unsubscribe(); };
  }, []);
  const cohorts = useMemo(() => {
    const start = new Date(effectiveStartDate); start.setHours(0, 0, 0, 0);
    const end = new Date(effectiveEndDate); end.setHours(23, 59, 59, 999);
    return buildOperationalCohorts(rows, { start, end });
  }, [rows, effectiveStartDate, effectiveEndDate]);
  const sla = calculateTimestampSla(cohorts.resolved, "solution");
  const metrics = [
    { title: "Entradas no período", value: cohorts.entries.length, description: "Data de abertura no período selecionado", rows: cohorts.entries },
    { title: "Resolvidos no período", value: cohorts.resolved.length, description: "Inclui entradas de meses anteriores; status resolvido ou fechado", rows: cohorts.resolved },
    { title: "Backlog atual", value: cohorts.backlog.length, description: "Estoque ativo atual, independente do período", rows: cohorts.backlog },
    { title: "SLA de solução", value: sla.percentage === null ? "—" : `${sla.percentage}%`, description: `${sla.within} no prazo · ${sla.outside} fora · ${sla.unmeasured} sem medição`, rows: sla.measuredTickets },
  ];
  return <Box sx={{ mb: 3 }}>
    <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2, justifyContent: "space-between", alignItems: { md: "end" } }}>
      <Box><Typography variant="h6" sx={{ fontWeight: 850 }}>Pulso da operação</Typography><Typography variant="body2" color="text.secondary">Carteira e responsabilidade SIMER · fluxo, estoque e qualidade medidos separadamente</Typography></Box>
      <Box sx={{ minWidth: 0, maxWidth: "100%" }}><PeriodFilter /></Box>
    </Stack>
    {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
    {!loaded ? !error && <LinearProgress /> : <KpiGrid>
      {metrics.map((metric) => <ExecutiveKpiCard key={metric.title} title={metric.title} value={metric.value} subtitle={metric.description} info={metric.description} onClick={() => setDetail({ title: metric.title, rows: metric.rows })} />)}
    </KpiGrid>}
    <Drawer anchor="right" open={Boolean(detail)} onClose={() => setDetail(null)} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 520 }, p: 2 } } }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 2 }}><Typography variant="h6">{detail?.title}</Typography><Button onClick={() => setDetail(null)}>Fechar</Button></Stack>
      {detail && <ExportTicketsButton tickets={detail.rows} title={detail.title} />}
      {!detail?.rows.length && <Alert severity="info">Nenhum ticket no recorte.</Alert>}
      {detail?.rows.map((row) => <Box key={row.id} sx={{ py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}><Button href={`/operacao/tickets?movidesk=${row.movideskId}`} sx={{ textAlign: "left", justifyContent: "flex-start", textTransform: "none" }}>#{row.movideskId} · {row.subject}</Button><Typography variant="caption" color="text.secondary">{row.client}</Typography></Box>)}
    </Drawer>
  </Box>;
}
