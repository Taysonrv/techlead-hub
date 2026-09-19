import {
  BusinessOutlined,
  FactCheckOutlined,
  GroupsOutlined,
  InsightsOutlined,
  IntegrationInstructionsOutlined,
  TrendingUpOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Drawer,
  Button,
  LinearProgress,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KpiCard } from "../components/KpiCard";
import { DetailFieldGrid, DetailPanelHeader, DetailSection } from "../components/DetailPanel";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";

type Data = {
  generatedAt: string;
  indicators: Record<string, number>;
  workload: Array<{ analyst: string; tickets: number; workItems: number; total: number }>;
  integrations: Record<string, { configured: boolean; connected: boolean; items: number }>;
  scope: { coordinator: string; analysts: string[]; clients: string[] };
  microsoft: {
    connected: boolean;
    plannerTasks: Array<{ id: string; title: string; percentComplete: number; dueDateTime?: string }>;
    events: Array<{ id: string; subject: string; start?: { dateTime?: string } }>;
    teams: Array<{ id: string; displayName: string }>;
    warnings: string[];
  };
};

type MainTab = "cadastros" | "movimentos" | "analises";
type DetailKind = "backlog" | "critical" | "stale" | "dueSoon" | "blocked" | "unassigned" | "analyst";
type DetailData = {
  kind: DetailKind; analyst: string | null; total: number; truncated: boolean;
  tickets: Array<{ movideskId: number; subject: string; status: string; urgency: string | null; client: string | null; owner: string | null; lastUpdate: string | null; dueDate: string | null; taskNumber: number | null; registeredVersion: string | null; deliveredVersion: string | null }>;
  workItems: Array<{ id: number; workItemType: string; title: string; state: string; client: string | null; assignedToName: string | null; createdByName: string | null; criticality: string | null; blockedProcess: boolean | null; movideskTicket: number | null; registeredVersion: string | null; deliveredVersion: string | null; azureChangedAt: string | null; remoteUrl: string | null }>;
};

const mainTabs: Array<{ key: MainTab; label: string; icon: ElementType }> = [
  { key: "cadastros", label: "Cadastros", icon: GroupsOutlined },
  { key: "movimentos", label: "Movimentos", icon: InsightsOutlined },
  { key: "analises", label: "Análises", icon: TrendingUpOutlined },
];

const routines: Record<MainTab, Array<{ label: string; path: string; icon: ElementType; description: string }>> = {
  cadastros: [
    { label: "Analistas", path: "/analistas", icon: GroupsOutlined, description: "Equipe oficial de suporte e sustentação." },
    { label: "Clientes", path: "/clientes", icon: BusinessOutlined, description: "Clientes cooperativas do escopo SIMER." },
  ],
  movimentos: [
    { label: "Minha Operação", path: "/minha-operacao", icon: InsightsOutlined, description: "Fila operacional, tarefas e atendimentos em execução." },
    { label: "Pontos de Atenção", path: "/atencao", icon: WarningAmberOutlined, description: "Riscos, criticidades e itens que exigem atuação." },
    { label: "Pendências", path: "/qualidade-dados", icon: FactCheckOutlined, description: "Qualidade, vínculos e divergências entre fontes." },
  ],
  analises: [
    { label: "Desempenho", path: "/desempenho", icon: TrendingUpOutlined, description: "Produtividade, SLA e acompanhamento de performance." },
    { label: "Relatórios", path: "/relatorios", icon: InsightsOutlined, description: "Relatórios gerenciais e executivos." },
    { label: "Versões", path: "/versoes", icon: IntegrationInstructionsOutlined, description: "Entregas, cobertura e distribuição por versão." },
  ],
};

export function Coordination() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("aba") as MainTab | null;
  const [tab, setTab] = useState<MainTab>(
    requestedTab && mainTabs.some((item) => item.key === requestedTab) ? requestedTab : "movimentos",
  );
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTitle, setDetailTitle] = useState("");
  const [details, setDetails] = useState<DetailData | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get<Data>("/coordination/summary");
      setData(response.data);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || "Não foi possível carregar a central.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maximum = useMemo(
    () => Math.max(...(data?.workload.map((item) => item.total) ?? [1]), 1),
    [data],
  );

  const cards: Array<[DetailKind, string, number, string]> = data
    ? [
        ["backlog", "Backlog atual", data.indicators.openTickets, "Atendimentos abertos do escopo cooperativas."],
        ["critical", "Críticos", data.indicators.criticalTickets, "Atendimentos críticos em aberto."],
        ["stale", "Sem movimento 72h", data.indicators.staleTickets, "Tickets sem atualização há pelo menos 72 horas."],
        ["dueSoon", "Vencem em 7 dias", data.indicators.dueSoon, "Itens com prazo nos próximos sete dias."],
        ["blocked", "Itens bloqueados", data.indicators.blockedItems, "Tarefas Azure bloqueadas no escopo da operação."],
        ["unassigned", "Sem responsável", data.indicators.unassignedItems, "Tarefas sem responsável identificado."],
      ]
    : [];

  async function openDetails(kind: DetailKind, title: string, analyst?: string) {
    try {
      setDetailTitle(title); setDetails(null); setDetailLoading(true);
      const response = await api.get<DetailData>("/coordination/details", { params: { kind, analyst, limit: 50 } });
      setDetails(response.data);
    } catch {
      setError("Não foi possível carregar os detalhes da coordenação.");
    } finally { setDetailLoading(false); }
  }

  function changeTab(value: MainTab) {
    setTab(value);
    const next = new URLSearchParams(searchParams);
    next.set("aba", value);
    setSearchParams(next, { replace: true });
  }

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        eyebrow="Coordenação"
        title="Central da Coordenação"
        description="Gestão operacional da equipe e dos clientes cooperativas em um único ponto."
        meta={data ? `Coordenação: ${data.scope.coordinator} · ${data.scope.analysts.length} analistas · ${data.scope.clients.length} clientes cooperativas` : undefined}
      />

      <Card
        variant="outlined"
        sx={{
          overflow: "hidden",
          borderRadius: 2.25,
          backgroundColor: "background.paper",
          mb: 2,
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, value: MainTab) => changeTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 58,
            borderBottom: "1px solid",
            borderColor: "divider",
            "& .MuiTab-root": { minHeight: 58, fontWeight: 800, px: 3 },
            "& .Mui-selected": { color: `${aliareColors.info} !important` },
            "& .MuiTabs-indicator": { height: 3, backgroundColor: aliareColors.info },
          }}
        >
          {mainTabs.map((item) => (
            <Tab
              key={item.key}
              value={item.key}
              label={item.label}
              icon={createElement(item.icon, { fontSize: "small" })}
              iconPosition="start"
            />
          ))}
        </Tabs>

        <Box sx={{ px: { xs: 1.5, md: 2.25 }, py: 1.5, borderBottom: "1px solid", borderColor: "divider", bgcolor: "rgba(47,111,237,.025)" }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {routines[tab].map((routine) => (
              <Chip
                key={routine.path}
                icon={createElement(routine.icon, { fontSize: "small" })}
                label={routine.label}
                clickable
                onClick={() => navigate(routine.path)}
                variant="outlined"
                sx={{
                  height: 38,
                  px: 0.5,
                  fontWeight: 750,
                  bgcolor: "background.paper",
                  "&:hover": { borderColor: aliareColors.info, bgcolor: "rgba(47,111,237,.05)" },
                }}
              />
            ))}
          </Stack>
        </Box>

        <CardContent sx={{ p: { xs: 1.5, md: 2.25 } }}>
          <Alert
            severity="info"
            icon={<GroupsOutlined />}
            sx={{ mb: 2, bgcolor: "rgba(47,111,237,.07)", borderColor: "rgba(47,111,237,.18)" }}
          >
            A Central usa somente os analistas oficiais da equipe e os clientes cooperativas definidos no escopo operacional do TechLead Hub.
          </Alert>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {loading || !data ? (
            <Box sx={{ minHeight: 320, display: "grid", placeItems: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={2}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(3,1fr)" },
                  gap: 2,
                }}
              >
                {cards.map(([kind, label, value, info]) => (
                  <KpiCard
                    key={label}
                    title={label}
                    value={value}
                    subtitle={tab === "analises" ? "Análise gerencial" : "Operação atual"}
                    info={info}
                    onClick={() => void openDetails(kind, label)}
                    accent={
                      label === "Críticos" || label === "Sem movimento 72h"
                        ? aliareColors.error
                        : label === "Vencem em 7 dias"
                          ? aliareColors.warning
                          : aliareColors.info
                    }
                  />
                ))}
              </Box>

              <Card variant="outlined">
                <CardContent>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1}
                    sx={{ justifyContent: "space-between", alignItems: { md: "center" }, mb: 2 }}
                  >
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 850 }}>
                        Carga consolidada por analista
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Somente a equipe oficial de Suporte e Sustentação.
                      </Typography>
                    </Box>
                    <Chip label={`${data.workload.length} analista(s) com carga`} variant="outlined" />
                  </Stack>

                  <Stack spacing={2}>
                    {data.workload.map((item) => (
                      <Box key={item.analyst} role="button" tabIndex={0}
                        onClick={() => void openDetails("analyst", `Carga de ${item.analyst}`, item.analyst)}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") void openDetails("analyst", `Carga de ${item.analyst}`, item.analyst); }}
                        sx={{ p: 1, mx: -1, borderRadius: 1.5, cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" } }}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={0.5}
                          sx={{ justifyContent: "space-between", mb: 0.6 }}
                        >
                          <Typography sx={{ fontWeight: 750 }}>{item.analyst}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.tickets} tickets · {item.workItems} itens Azure
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={(item.total / maximum) * 100}
                          sx={{
                            height: 8,
                            borderRadius: 5,
                            bgcolor: "rgba(47,111,237,.08)",
                            "& .MuiLinearProgress-bar": { bgcolor: aliareColors.info },
                          }}
                        />
                      </Box>
                    ))}
                    {!data.workload.length && (
                      <Typography color="text.secondary">
                        Nenhuma carga pendente localizada para os analistas da equipe.
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 850, mb: 0.4 }}>
                    Integrações Microsoft 365
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Planner, Outlook e Teams vinculados à conta conectada.
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {Object.entries(data.integrations).map(([name, integration]) => (
                      <Chip
                        key={name}
                        label={`${name}: ${
                          integration.connected
                            ? `${integration.items} item(ns)`
                            : integration.configured
                              ? "conecte sua conta"
                              : "aguardando configuração"
                        }`}
                        color={integration.connected ? "success" : "default"}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                  {data.microsoft.warnings.map((warning) => (
                    <Alert key={warning} severity="warning" sx={{ mt: 1.5 }}>
                      {warning}
                    </Alert>
                  ))}
                </CardContent>
              </Card>
            </Stack>
          )}
        </CardContent>
      </Card>
      <Drawer anchor="right" open={Boolean(detailTitle)} onClose={() => { setDetailTitle(""); setDetails(null); }} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
        <DetailPanelHeader eyebrow="Coordenação" title={detailTitle || "Detalhes"} identifier={details ? `${details.total} item(ns) carregado(s)` : undefined} onClose={() => { setDetailTitle(""); setDetails(null); }} />
        {detailLoading ? <Box sx={{ py: 8, display: "grid", placeItems: "center" }}><CircularProgress /></Box> : details ? (
          <Stack spacing={2}>
            {details.truncated && <Alert severity="info">Exibindo os primeiros 50 registros do recorte.</Alert>}
            {details.tickets.length > 0 && <DetailSection title="Atendimentos Movidesk"><Stack spacing={1}>{details.tickets.map((ticket) => (
              <Button key={ticket.movideskId} variant="outlined" onClick={() => navigate(`/tickets?movidesk=${ticket.movideskId}`)} sx={{ justifyContent: "flex-start", textTransform: "none", textAlign: "left", p: 1.25 }}>
                <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 800 }}>#{ticket.movideskId} · {ticket.subject}</Typography><Typography variant="caption" color="text.secondary">{[ticket.status, ticket.urgency, ticket.client, ticket.owner].filter(Boolean).join(" · ")}</Typography></Box>
              </Button>
            ))}</Stack></DetailSection>}
            {details.workItems.length > 0 && <DetailSection title="Work Items Azure"><Stack spacing={1}>{details.workItems.map((item) => (
              <Button key={item.id} variant="outlined" onClick={() => navigate(item.workItemType.toLocaleLowerCase("pt-BR").includes("apoio") ? `/apoios?task=${item.id}` : item.workItemType.toLocaleLowerCase("pt-BR").includes("evolu") ? `/evolucoes?task=${item.id}` : `/correcoes?task=${item.id}`)} sx={{ justifyContent: "flex-start", textTransform: "none", textAlign: "left", p: 1.25 }}>
                <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 800 }}>#{item.id} · {item.title}</Typography><Typography variant="caption" color="text.secondary">{[item.workItemType, item.state, item.client, item.assignedToName ?? "Sem responsável"].filter(Boolean).join(" · ")}</Typography></Box>
              </Button>
            ))}</Stack></DetailSection>}
            {details.total === 0 && <Alert severity="info">Nenhum registro encontrado para este recorte.</Alert>}
            {details.analyst && <DetailSection title="Escopo do analista"><DetailFieldGrid fields={[["Analista", details.analyst], ["Total carregado", details.total]]} /></DetailSection>}
          </Stack>
        ) : null}
      </Drawer>
    </Box>
  );
}
