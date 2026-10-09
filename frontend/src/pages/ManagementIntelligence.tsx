import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import {
  ArrowForwardRounded,
  AutoGraphOutlined,
  DashboardOutlined,
  GroupsOutlined,
  PsychologyOutlined,
  RadarOutlined,
} from "@mui/icons-material";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { HubNavigation } from "../components/HubNavigation";
import { PageHeader } from "../components/PageHeader";
import { Intelligence } from "./Intelligence";
import { Coordination } from "./Coordination";
import { TechnicalLeadership } from "./TechnicalLeadership";

type Section = "executive" | "intelligence" | "coordination" | "leadership";

const routes: Record<Section, string> = {
  executive: "/gestao-inteligencia",
  intelligence: "/gestao-inteligencia/inteligencia",
  coordination: "/gestao-inteligencia/coordenacao",
  leadership: "/gestao-inteligencia/lideranca",
};

export function ManagementIntelligence() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  const section: Section = location.pathname.endsWith("/inteligencia")
    ? "intelligence"
    : location.pathname.endsWith("/coordenacao")
      ? "coordination"
      : location.pathname.endsWith("/lideranca")
        ? "leadership"
        : "executive";

  const cards = useMemo(
    () => [
      {
        key: "intelligence" as Section,
        title: "Inteligência operacional",
        detail:
          "Anomalias, recorrências, clusters, DNA Técnico e confiabilidade das evidências.",
        eyebrow: "Diagnóstico",
        icon: <PsychologyOutlined />,
      },
      {
        key: "coordination" as Section,
        title: "Coordenação",
        detail:
          "Carga, prioridades, SLA × OLA, CSAT, serviços e qualidade operacional.",
        eyebrow: "Execução",
        icon: <GroupsOutlined />,
      },
      {
        key: "leadership" as Section,
        title: "Liderança técnica",
        detail:
          "Radar, auditoria, gaps, recorrências e desenvolvimento técnico.",
        eyebrow: "Capacidade",
        icon: <RadarOutlined />,
      },
    ],
    [],
  );

  const navigation = (
    <HubNavigation<Section>
      value={section}
      ariaLabel="Gestão e inteligência"
      caption="GESTÃO & INTELIGÊNCIA"
      onChange={(value) => navigate(routes[value])}
      items={[
        {
          value: "executive",
          label: "Visão executiva",
          icon: <DashboardOutlined fontSize="small" />,
        },
        {
          value: "intelligence",
          label: "Inteligência",
          icon: <PsychologyOutlined fontSize="small" />,
        },
        {
          value: "coordination",
          label: "Operação & Coordenação",
          icon: <GroupsOutlined fontSize="small" />,
        },
        {
          value: "leadership",
          label: "Liderança Técnica",
          icon: <RadarOutlined fontSize="small" />,
        },
      ]}
    />
  );

  if (section === "intelligence") {
    return (
      <Box sx={{ minWidth: 0 }}>
        {navigation}
        <Intelligence />
      </Box>
    );
  }

  if (section === "coordination") {
    return (
      <Box sx={{ minWidth: 0 }}>
        {navigation}
        <Coordination />
      </Box>
    );
  }

  if (section === "leadership") {
    return (
      <Box sx={{ minWidth: 0 }}>
        {navigation}
        <TechnicalLeadership />
      </Box>
    );
  }

  return (
    <Box sx={{ minWidth: 0, pb: 4 }}>
      {navigation}

      <PageHeader
        eyebrow="Gestão 2.1"
        title="Central de Gestão & Inteligência"
        description="Uma única porta de entrada para decisão executiva, coordenação operacional e liderança técnica da carteira SIMER."
        meta="Os módulos especializados preservam seu contexto e agora compartilham a mesma navegação."
      />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={0.8}
        useFlexGap
        sx={{ mb: 1.75, flexWrap: "wrap" }}
      >
        <Chip label="Carteira SIMER" color="success" variant="outlined" />
        <Chip label="Inteligência + Coordenação + Liderança" variant="outlined" />
        <Chip label="Navegação persistente entre módulos" variant="outlined" />
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2,minmax(0,1fr))",
            xl: "repeat(3,minmax(0,1fr))",
          },
          gap: { xs: 1.25, md: 1.5 },
        }}
      >
        {cards.map((card) => (
          <Card
            key={card.key}
            elevation={0}
            role="button"
            tabIndex={0}
            aria-label={"Abrir " + card.title}
            onClick={() => navigate(routes[card.key])}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate(routes[card.key]);
              }
            }}
            sx={{
              minHeight: { xs: 180, md: 196 },
              borderColor: "divider",
              background: dark
                ? "linear-gradient(145deg,rgba(12,34,52,.96),rgba(7,24,38,.985))"
                : "linear-gradient(145deg,#FFFFFF,#F8FBFC)",
              transition:
                "transform .16s ease, border-color .16s ease, box-shadow .16s ease",
              "&:hover": {
                borderColor: dark
                  ? "rgba(24,199,122,.34)"
                  : "rgba(16,148,91,.22)",
                boxShadow: dark
                  ? "0 18px 42px rgba(0,0,0,.18)"
                  : "0 16px 34px rgba(15,23,42,.07)",
              },
            }}
          >
            <CardContent
              sx={{
                height: "100%",
                p: { xs: 1.6, md: 1.8 },
                display: "flex",
                flexDirection: "column",
                "&:last-child": { pb: { xs: 1.6, md: 1.8 } },
              }}
            >
              <Stack
                direction="row"
                sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}
              >
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: 2.25,
                    display: "grid",
                    placeItems: "center",
                    color: "primary.main",
                    border: "1px solid",
                    borderColor: dark
                      ? "rgba(24,199,122,.22)"
                      : "rgba(16,148,91,.13)",
                    bgcolor: dark
                      ? "rgba(24,199,122,.08)"
                      : "rgba(24,199,122,.055)",
                  }}
                >
                  {card.icon}
                </Box>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight: 800,
                    letterSpacing: ".075em",
                    textTransform: "uppercase",
                  }}
                >
                  {card.eyebrow}
                </Typography>
              </Stack>

              <Box sx={{ mt: 1.5, minWidth: 0 }}>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 850, letterSpacing: "-.018em" }}
                >
                  {card.title}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.7, lineHeight: 1.55, maxWidth: 520 }}
                >
                  {card.detail}
                </Typography>
              </Box>

              <Stack
                direction="row"
                spacing={0.75}
                sx={{
                  alignItems: "center",
                  mt: "auto",
                  pt: 1.6,
                  color: "text.secondary",
                }}
              >
                <AutoGraphOutlined sx={{ fontSize: 17 }} />
                <Typography variant="caption" sx={{ fontWeight: 800 }}>
                  Abrir módulo especializado
                </Typography>
                <ArrowForwardRounded
                  sx={{ ml: "auto !important", fontSize: 18, color: "primary.main" }}
                />
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
