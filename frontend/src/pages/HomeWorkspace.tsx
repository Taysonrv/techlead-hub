import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getTicketSnapshot, subscribeTicketSnapshotRefresh } from "../services/ticketSnapshot";
import { PageHeader } from "../components/PageHeader";

type Ticket = {
  movideskId: number; subject: string; owner: string | null; status: string;
  baseStatus: string | null; urgency: string | null; dueDate: string | null;
  isWithSimer?: boolean; client: string | null;
};
const clean = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function HomeWorkspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getTicketSnapshot<Ticket>().then((items) => {
        if (active) { setTickets(items); setError(""); setLoading(false); }
      }).catch(() => {
        if (active) { setError("Não foi possível atualizar a visão operacional. As demais rotinas continuam disponíveis."); setLoading(false); }
      });
    };
    refresh();
    const unsubscribe = subscribeTicketSnapshotRefresh(refresh);
    return () => { active = false; unsubscribe(); };
  }, []);

  const open = useMemo(() => tickets.filter((ticket) =>
    ticket.isWithSimer !== false && !["closed","resolved","cancelled","canceled"].includes(clean(ticket.baseStatus))), [tickets]);
  const mine = useMemo(() => open.filter((ticket) => Boolean(user?.name) && clean(ticket.owner) === clean(user?.name)), [open, user?.name]);
  const critical = useMemo(() => open.filter((ticket) => clean(ticket.urgency).includes("critic")), [open]);
  const stopped = useMemo(() => open.filter((ticket) => clean(ticket.baseStatus) === "stopped"), [open]);
  const dueSoon = useMemo(() => open.filter((ticket) => {
    const date = ticket.dueDate ? Date.parse(ticket.dueDate) : NaN;
    return Number.isFinite(date) && date <= Date.now() + 86400000;
  }), [open]);
  const isManagement = user?.role === "ADMIN" || user?.role === "COORDENADOR";
  const priority = isManagement ? [...new Map([...critical,...dueSoon].map((item) => [item.movideskId,item])).values()] : mine;
  const metrics = [
    { name: isManagement ? "Backlog atual" : "Minha carteira aberta", value: isManagement ? open.length : mine.length, route: "/operacao/tickets" },
    { name: "Críticos", value: critical.length, route: "/pendencias-riscos" },
    { name: "Prazo vencido ou próximo", value: dueSoon.length, route: "/pendencias-riscos" },
    { name: "Parados", value: stopped.length, route: "/operacao/tickets" },
  ];

  return <Box sx={{ minWidth: 0, pb: 3 }}>
    <PageHeader eyebrow="INÍCIO · OPERAÇÃO" title="Central de Trabalho"
      description="Prioridades atuais, sua carteira e acesso direto às rotinas."
      action={<Button variant="outlined" onClick={() => navigate("/visao-operacional")}>Abrir Dashboard Executivo</Button>} />
    {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
    {loading ? <Box sx={{ display: "flex", justifyContent: "center", py: 7 }}><CircularProgress /></Box> : <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", lg: "repeat(4,minmax(0,1fr))" }, gap: 1.5, mb: 2 }}>
        {metrics.map((metric) => <Card key={metric.name} variant="outlined" sx={{ cursor: "pointer", borderRadius: 2.5, "&:hover": { borderColor: "primary.main", boxShadow: 2 } }}
          onClick={() => navigate(metric.route)}>
          <CardContent>
            <Typography variant="caption" color="text.secondary">{metric.name}</Typography>
            <Typography sx={{ fontWeight: 850, fontSize: "1.8rem", fontVariantNumeric: "tabular-nums" }}>{metric.value}</Typography>
          </CardContent>
        </Card>)}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.7fr) minmax(300px,.8fr)" }, gap: 2 }}>
        <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
          <CardContent>
            <Typography sx={{ fontWeight: 800 }}>O que precisa da sua atenção</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{isManagement ? "Atendimentos críticos ou com prazo próximo" : "Seus atendimentos em aberto"}</Typography>
            {priority.length === 0 ? <Alert severity="success">Nenhuma prioridade identificada no snapshot atual.</Alert> :
              <Stack spacing={1}>{priority.slice(0,8).map((ticket) =>
                <Box key={ticket.movideskId} role="button" tabIndex={0}
                  onClick={() => navigate("/operacao/tickets?movidesk=" + ticket.movideskId)}
                  onKeyDown={(event) => { if (event.key === "Enter") navigate("/operacao/tickets?movidesk=" + ticket.movideskId); }}
                  sx={{ p: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 1.5, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography sx={{ color: "primary.main", fontWeight: 800 }}>#{ticket.movideskId}</Typography>
                    <Typography variant="body2" sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.subject}</Typography>
                    <Typography variant="caption" color="text.secondary">{ticket.status}</Typography>
                  </Stack>
                </Box>)}</Stack>}
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
          <CardContent>
            <Typography sx={{ fontWeight: 800, mb: 1.5 }}>Acesso rápido</Typography>
            <Stack spacing={1}>
              <Button variant="outlined" sx={{ justifyContent: "flex-start" }} onClick={() => navigate("/operacao/minha-operacao")}>Minha Operação</Button>
              <Button variant="outlined" sx={{ justifyContent: "flex-start" }} onClick={() => navigate("/visao-operacional/desempenho")}>Desempenho & SLA</Button>
              <Button variant="outlined" sx={{ justifyContent: "flex-start" }} onClick={() => navigate("/chat")}>Chat</Button>
              <Button variant="outlined" sx={{ justifyContent: "flex-start" }} onClick={() => navigate("/visao-operacional")}>Dashboard Executivo</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>Dados do snapshot Movidesk. As regras detalhadas permanecem nas telas analíticas.</Typography>
          </CardContent>
        </Card>
      </Box>
    </>}
  </Box>;
}
