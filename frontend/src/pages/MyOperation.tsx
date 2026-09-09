import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Grid, Stack, Typography,
} from "@mui/material";
import {
  BlockOutlined, ConfirmationNumberOutlined, PriorityHighOutlined,
  TaskAltOutlined, WorkOutlineOutlined,
} from "@mui/icons-material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";

type Data = {
  summary: { tickets: number; openWorkItems: number; concludedRecently: number; prioritized: number; blocked: number };
  tickets: Array<{ id: number; movideskId: number | null; subject: string; status: string; client: string | null }>;
  workItems: Array<{ id: number; workItemType: string; title: string; state: string; client: string | null; prioritized: boolean | null; blockedProcess: boolean | null }>;
};

export function MyOperation() {
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Data>("/workspace/my-operation")
      .then((response) => setData(response.data))
      .catch(() => setError("Não foi possível carregar sua operação."));
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Box sx={{ py: 12, textAlign: "center" }}><CircularProgress /></Box>;

  const cards = [
    ["Meus tickets", data.summary.tickets, <ConfirmationNumberOutlined />],
    ["Tarefas abertas", data.summary.openWorkItems, <WorkOutlineOutlined />],
    ["Concluídas em 30 dias", data.summary.concludedRecently, <TaskAltOutlined />],
    ["Priorizadas", data.summary.prioritized, <PriorityHighOutlined />],
    ["Bloqueadas", data.summary.blocked, <BlockOutlined />],
  ] as const;

  return (
    <Box sx={{ pt: 5 }}>
      <Typography variant="h3" sx={{ fontWeight: 850 }}>Minha Operação</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5 }}>Tickets e tarefas relacionados ao seu usuário.</Typography>

      <Grid container spacing={2} sx={{ mt: 1 }}>
        {cards.map(([label, value, icon]) => (
          <Grid key={label} size={{ xs: 12, sm: 6, lg: 2.4 }}>
            <Card variant="outlined" sx={{ borderTop: `3px solid ${aliareColors.green}`, height: "100%" }}>
              <CardContent><Stack direction="row" sx={{ justifyContent: "space-between" }}>{icon}<Typography variant="h4" sx={{ fontWeight: 850 }}>{value}</Typography></Stack><Typography sx={{ mt: 1, fontWeight: 700 }}>{label}</Typography></CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Work Items recentes</Typography>
            <Stack spacing={1} sx={{ mt: 2 }}>
              {data.workItems.map((item) => (
                <Button key={item.id} onClick={() => navigate(`${route(item.workItemType)}?task=${item.id}`)} sx={{ justifyContent: "flex-start", textTransform: "none", border: "1px solid", borderColor: "divider", p: 1.2 }}>
                  <Box sx={{ textAlign: "left", width: "100%" }}><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Chip size="small" label={item.workItemType} /><Typography sx={{ fontWeight: 750 }}>#{item.id} · {item.title}</Typography></Stack><Typography variant="caption" color="text.secondary">{item.state}{item.client ? ` · ${item.client}` : ""}</Typography></Box>
                </Button>
              ))}
            </Stack>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Tickets recentes</Typography>
            <Stack spacing={1} sx={{ mt: 2 }}>
              {data.tickets.map((ticket) => (
                <Button key={ticket.id} onClick={() => navigate(`/tickets?movidesk=${ticket.movideskId ?? ticket.id}`)} sx={{ justifyContent: "flex-start", textTransform: "none", borderBottom: "1px solid", borderColor: "divider" }}>
                  <Box sx={{ textAlign: "left" }}><Typography sx={{ fontWeight: 700 }}>#{ticket.movideskId ?? ticket.id} · {ticket.subject}</Typography><Typography variant="caption" color="text.secondary">{ticket.status}{ticket.client ? ` · ${ticket.client}` : ""}</Typography></Box>
                </Button>
              ))}
            </Stack>
          </CardContent></Card>
        </Grid>
      </Grid>
    </Box>
  );
}

function route(type: string) {
  const value = type.toLocaleLowerCase("pt-BR");
  if (value.includes("apoio")) return "/apoios";
  if (value.includes("evolu")) return "/evolucoes";
  return "/correcoes";
}
