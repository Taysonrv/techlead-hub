import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Chip, Drawer, IconButton, Stack, Typography } from "@mui/material";
import { CloseRounded, OpenInNewRounded } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getTicketSnapshot, subscribeTicketSnapshotRefresh } from "../services/ticketSnapshot";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { aliareColors } from "../theme/theme";

type Ticket = {
  movideskId: number; subject: string; owner: string | null; status: string;
  baseStatus: string | null; urgency: string | null; dueDate: string | null;
  isWithSimer?: boolean; client: string | null; createdDate?: string | null;
  azureWorkItem?: { id: number; title: string; state: string; azureChangedAt: string | null } | null;
};
const clean = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function HomeWorkspace({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pulseSelection, setPulseSelection] = useState<"immediate" | "progress" | "stopped" | null>(null);
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
  const orderedPriority = [...priority].sort((left, right) => {
    const urgencyDelta = Number(clean(right.urgency).includes("critic")) - Number(clean(left.urgency).includes("critic"));
    if (urgencyDelta !== 0) return urgencyDelta;
    const leftDue = left.dueDate ? Date.parse(left.dueDate) : Number.POSITIVE_INFINITY;
    const rightDue = right.dueDate ? Date.parse(right.dueDate) : Number.POSITIVE_INFINITY;
    return (Number.isFinite(leftDue) ? leftDue : Number.POSITIVE_INFINITY) - (Number.isFinite(rightDue) ? rightDue : Number.POSITIVE_INFINITY);
  });
  const recentUpdates = useMemo(() => {
    const boundary = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const records: Array<{ id: string; timestamp: number; kind: "Movidesk" | "Azure"; title: string; detail: string; path: string }> = [];
    for (const ticket of tickets) {
      if (ticket.isWithSimer === false) continue;
      const opened = ticket.createdDate ? Date.parse(ticket.createdDate) : NaN;
      if (Number.isFinite(opened) && opened >= boundary) {
        records.push({ id: "ticket-" + ticket.movideskId, timestamp: opened, kind: "Movidesk", title: "Novo atendimento #" + ticket.movideskId, detail: ticket.subject, path: "/operacao/tickets?movidesk=" + ticket.movideskId });
      }
      const task = ticket.azureWorkItem;
      const changed = task?.azureChangedAt ? Date.parse(task.azureChangedAt) : NaN;
      if (task && Number.isFinite(changed) && changed >= boundary) {
        records.push({ id: "task-" + task.id, timestamp: changed, kind: "Azure", title: "Task #" + task.id + " · " + task.state, detail: task.title, path: "/operacao/tickets?movidesk=" + ticket.movideskId });
      }
    }
    return [...new Map(records.sort((a, b) => b.timestamp - a.timestamp).map((item) => [item.id, item])).values()].slice(0, 6);
  }, [tickets]);
  const pulseGroups = useMemo(() => {
    const immediate = [...new Map([...critical, ...dueSoon].map(item => [item.movideskId, item])).values()];
    const progress = open.filter(item => clean(item.baseStatus).replace(/\s+/g, "") === "inprogress" || clean(item.status).includes("andamento"));
    return [
      { key: "immediate" as const, title: "Em atenção imediata", items: immediate, tone: "error.main", description: "Críticos ou com prazo vencido / próximo" },
      { key: "progress" as const, title: "Em andamento", items: progress, tone: "info.main", description: "Atendimentos em andamento" },
      { key: "stopped" as const, title: "Aguardando / parados", items: stopped, tone: "warning.main", description: "Tickets com status operacional de parada" },
    ];
  }, [critical, dueSoon, open, stopped]);
  const activePulse = pulseGroups.find(group => group.key === pulseSelection);
  const metrics = [
    { name: isManagement ? "Backlog atual" : "Minha carteira aberta", value: isManagement ? open.length : mine.length, route: isManagement ? "/operacao/tickets" : "/operacao/minha-operacao", accent: aliareColors.warning, subtitle: isManagement ? "Tickets ativos na carteira SIMER" : "Atendimentos sob minha responsabilidade" },
    { name: "Críticos", value: critical.length, route: "/pendencias-riscos", accent: aliareColors.error, subtitle: "Urgência crítica ainda em aberto" },
    { name: "Prazo vencido ou próximo", value: dueSoon.length, route: "/pendencias-riscos", accent: aliareColors.warning, subtitle: "Vencidos ou a vencer em até 24 horas" },
    { name: "Parados", value: stopped.length, route: "/operacao/tickets", accent: aliareColors.info, subtitle: "Atendimentos em situação de parada" },
  ];

  return <Box sx={{ minWidth: 0, pb: 3 }}>
    {!embedded && <PageHeader eyebrow="INÍCIO · OPERAÇÃO" title="Central de Trabalho"
      description="Prioridades atuais, sua carteira e acesso direto às rotinas."
      action={<Button variant="outlined" onClick={() => navigate("/visao-operacional")}>Abrir Dashboard Executivo</Button>} />}
    {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
    {loading ? <Box sx={{ display: "flex", justifyContent: "center", py: 7 }}><CircularProgress /></Box> : <>
      {!embedded && <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", lg: "repeat(4,minmax(0,1fr))" }, gap: 1.5, mb: 2 }}>
        {metrics.map((metric) => (
          <KpiCard
            key={metric.name}
            title={metric.name}
            value={metric.value}
            subtitle={metric.subtitle}
            accent={metric.accent}
            info={metric.subtitle}
            onClick={() => navigate(metric.route)}
          />
        ))}
      </Box>
      </>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1.7fr) minmax(300px,.8fr)" }, gap: 2, alignItems: "start" }}>
        <Card variant="outlined" sx={{ borderRadius: 2.5, bgcolor: "background.paper", minWidth: 0 }}>
          <CardContent sx={{ p: { xs: 1.75, md: 2.25 }, "&:last-child": { pb: 2.25 } }}>
            <Typography sx={{ fontWeight: 850, letterSpacing: "-.015em" }}>O que precisa da sua atenção</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{isManagement ? "Atendimentos críticos ou com prazo próximo" : "Seus atendimentos em aberto"}</Typography>
            {priority.length === 0 ? <Alert severity="success">Nenhuma prioridade identificada no snapshot atual.</Alert> :
              <Stack spacing={1}>{orderedPriority.slice(0,8).map((ticket) =>
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
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
            <CardContent sx={{ "&:last-child": { pb: 2 } }}>
              <Typography sx={{ fontWeight: 800 }}>Pulso da operação</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Situação atual dos atendimentos SIMER
              </Typography>
              <Stack spacing={.75}>
                {pulseGroups.map((group) => (
                  <Box key={group.key} component="button" type="button" onClick={() => setPulseSelection(group.key)}
                    sx={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", gap: 1.5,
                      backgroundColor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: 1.5, px: 1.25, py: 1.1,
                      cursor: "pointer", color: "text.primary", transition: "background-color .15s,border-color .15s",
                      "&:hover": { bgcolor: "action.hover", borderColor: "primary.main" },
                      "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>{group.title}</Typography>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography sx={{ fontWeight: 850, fontVariantNumeric: "tabular-nums", color: group.tone }}>{group.items.length}</Typography>
                      <OpenInNewRounded sx={{ fontSize: 15, color: "text.secondary" }} />
                    </Stack>
                  </Box>
                ))}
              </Stack>
              <Button size="small" sx={{ mt: 1.5 }} onClick={() => navigate("/pendencias-riscos")}>Analisar pendências e riscos</Button>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
            <CardContent sx={{ "&:last-child": { pb: 2 } }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                <Box>
                  <Typography sx={{ fontWeight: 800 }}>Atualizações recentes</Typography>
                  <Typography variant="caption" color="text.secondary">Movidesk e Tasks Azure · últimos 7 dias</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">{Math.min(recentUpdates.length, embedded ? 2 : 6)} exibida(s)</Typography>
              </Stack>
              {recentUpdates.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Nenhuma atualização recente disponível nos dados sincronizados.</Typography>
              ) : (
                <Stack spacing={.75}>
                  {recentUpdates.slice(0, embedded ? 2 : 6).map((item) => (
                    <Box key={item.id} role="button" tabIndex={0}
                      onClick={() => navigate(item.path)}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(item.path); } }}
                      sx={{ cursor: "pointer", border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1, "&:hover": { bgcolor: "action.hover", borderColor: "primary.main" } }}>
                      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 800, color: item.kind === "Azure" ? "info.main" : "success.main" }}>{item.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{new Date(item.timestamp).toLocaleDateString("pt-BR")}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.detail}>{item.detail}</Typography>
                    </Box>
                  ))}
                </Stack>
              )}
              {!embedded && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Eventos recentes detectados no snapshot; não representam notificações lidas ou não lidas.</Typography>}
            </CardContent>
          </Card>
          {!embedded && (
          <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
            <CardContent sx={{ "&:last-child": { pb: 2 } }}>
              <Typography sx={{ fontWeight: 800, mb: 1.5 }}>Acesso rápido</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2,minmax(0,1fr))", sm: "repeat(2,minmax(0,1fr))", lg: "1fr" }, gap: 1 }}>
                <Button variant="outlined" size="small" sx={{ justifyContent: "flex-start", minWidth: 0 }} onClick={() => navigate("/operacao/minha-operacao")}>Minha Operação</Button>
                <Button variant="outlined" size="small" sx={{ justifyContent: "flex-start", minWidth: 0 }} onClick={() => navigate("/visao-operacional/desempenho")}>Desempenho & SLA</Button>
                <Button variant="outlined" size="small" sx={{ justifyContent: "flex-start", minWidth: 0 }} onClick={() => navigate("/chat")}>Chat interno</Button>
                <Button variant="outlined" size="small" sx={{ justifyContent: "flex-start", minWidth: 0 }} onClick={() => navigate("/visao-operacional")}>Dashboard Executivo</Button>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                Visão operacional: detalhes, metodologias e exportações permanecem nas telas especializadas.
              </Typography>
            </CardContent>
          </Card>
          )}
        </Stack>
      </Box>
    </>}
    <Drawer anchor="right" open={Boolean(pulseSelection)} onClose={() => setPulseSelection(null)}
      slotProps={{ paper: { sx: { width: { xs: "100%", sm: 540 }, maxWidth: "100vw", bgcolor: "background.paper", backgroundImage: "none" } } }}>
      <Box sx={{ p: { xs: 2, sm: 2.5 }, minWidth: 0 }}>
        <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 2, mb: 2 }}>
          <Box>
            <Typography variant="overline" color="text.secondary">PULSO DA OPERAÇÃO · SIMER</Typography>
            <Typography variant="h6" sx={{ fontWeight: 850 }}>{activePulse?.title ?? "Atendimentos"}</Typography>
            <Typography variant="body2" color="text.secondary">{activePulse?.description}</Typography>
          </Box>
          <IconButton onClick={() => setPulseSelection(null)} aria-label="Fechar painel"><CloseRounded /></IconButton>
        </Stack>
        <Chip size="small" label={`${activePulse?.items.length ?? 0} atendimento(s)`} sx={{ mb: 2 }} />
        <Stack spacing={1}>
          {activePulse?.items.length === 0 && <Alert severity="info">Nenhum atendimento identificado neste recorte.</Alert>}
          {activePulse?.items.map(item => (
            <Box key={item.movideskId} sx={{ border: "1px solid", borderColor: "divider", p: 1.5, borderRadius: 2 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: .5 }}>
                <Typography sx={{ fontWeight: 850, color: "primary.main" }}>#{item.movideskId}</Typography>
                <Chip size="small" variant="outlined" label={item.status} sx={{ ml: "auto", maxWidth: 165 }} />
              </Stack>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: .75 }}>{item.subject}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>{item.client || "Cliente não informado"} · {item.owner || "Sem responsável"}</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" onClick={() => { setPulseSelection(null); navigate("/operacao/tickets?movidesk=" + item.movideskId); }}>Abrir atendimento</Button>
                <Button size="small" onClick={() => { setPulseSelection(null); navigate("/analise-atendimento?ticket=" + item.movideskId); }}>Analisar</Button>
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    </Drawer>
  </Box>;
}