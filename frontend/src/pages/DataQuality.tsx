import { Alert, Box, Card, CardContent, Chip, CircularProgress, Grid, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";

type Data = {
  summary: Record<string, number>;
  samples: Array<{ id: number; workItemType: string; title: string; state: string; client: string | null; module: string | null; assignedToName: string | null; movideskTicket: number | null; deliveredVersion: string | null }>;
};
const labels: Record<string, string> = {
  withoutTicket: "Sem ticket Movidesk", withoutClient: "Sem cliente", withoutModule: "Sem módulo",
  withoutOwner: "Sem responsável", completedWithoutVersion: "Concluídas sem versão",
  danglingTaskTickets: "Tickets com Task inexistente", duplicatedMovideskLinks: "Vínculos Movidesk duplicados",
};

export function DataQuality() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { api.get<Data>("/workspace/data-quality").then((r) => setData(r.data)).catch(() => setError(true)); }, []);
  if (error) return <Alert severity="error">Não foi possível analisar a qualidade dos dados.</Alert>;
  if (!data) return <Box sx={{ py: 12, textAlign: "center" }}><CircularProgress /></Box>;
  return <Box sx={{ pt: 5 }}>
    <Typography variant="h3" sx={{ fontWeight: 850 }}>Qualidade dos Dados</Typography>
    <Typography color="text.secondary" sx={{ mt: 0.5 }}>Inconsistências entre Movidesk, Azure DevOps e cadastros locais.</Typography>
    <Grid container spacing={2} sx={{ mt: 1 }}>{Object.entries(data.summary).map(([key, value]) => <Grid key={key} size={{ xs: 12, sm: 6, lg: 3 }}><Card variant="outlined" sx={{ borderTop: `3px solid ${value ? "#e49b0f" : aliareColors.green}` }}><CardContent><Typography variant="h4" sx={{ fontWeight: 850 }}>{value}</Typography><Typography sx={{ fontWeight: 700 }}>{labels[key] ?? key}</Typography></CardContent></Card></Grid>)}</Grid>
    <Card variant="outlined" sx={{ mt: 2 }}><CardContent><Typography variant="h6" sx={{ fontWeight: 800 }}>Amostra para saneamento</Typography><Stack spacing={1} sx={{ mt: 2 }}>{data.samples.map((item) => <Box key={item.id} sx={{ p: 1.3, border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Chip size="small" label={item.workItemType} /><Typography sx={{ fontWeight: 750 }}>#{item.id} · {item.title}</Typography></Stack><Typography variant="caption" color="text.secondary">{[item.state, item.client ?? "Sem cliente", item.module ?? "Sem módulo", item.assignedToName ?? "Sem responsável", item.movideskTicket ? `Ticket ${item.movideskTicket}` : "Sem ticket", item.deliveredVersion ?? "Sem versão"].join(" · ")}</Typography></Box>)}</Stack></CardContent></Card>
  </Box>;
}
