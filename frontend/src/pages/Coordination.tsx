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

  const cards: Array<[string, number, string]> = data
    ? [
        ["Backlog atual", data.indicators.openTickets, "Atendimentos abertos do escopo cooperativas."],
        ["Críticos", data.indicators.criticalTickets, "Atendimentos críticos em aberto."],
        ["Sem movimento 72h", data.indicators.staleTickets, "Tickets sem atualização há pelo menos 72 horas."],
        ["Vencem em 7 dias", data.indicators.dueSoon, "Itens com prazo nos próximos sete dias."],
        ["Itens bloqueados", data.indicators.blockedItems, "Tarefas Azure bloqueadas no escopo da operação."],
        ["Sem responsável", data.indicators.unassignedItems, "Tarefas sem responsável identificado."],
      ]
    : [];

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
                {cards.map(([label, value, info]) => (
                  <KpiCard
                    key={label}
                    title={label}
                    value={value}
                    subtitle={tab === "analises" ? "Análise gerencial" : "Operação atual"}
                    info={info}
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
                      <Box key={item.analyst}>
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
    </Box>
  );
}
