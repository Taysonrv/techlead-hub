import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Popover,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import {
  InfoOutlined,
} from "@mui/icons-material";

import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "../services/api";
import { useFilters } from "../context/FiltersContext";
import { PeriodFilter } from "../components/PeriodFilter";

import {
  aliareColors,
} from "../theme/theme";

import {
  deadlineColors,
  semanticChartColors,
} from "../theme/chartPalette";

import {
  calculateServiceLevel,
  formatServiceMinutes,
  type DeadlineLevel,
  type ServiceLevelResult,
} from "../utils/serviceLevel";
import { calculateOfficialSla } from "../utils/officialSla";

type Ticket = {
  id: number;
  movideskId: number;
  protocol: string | null;
  subject: string;
  client: string | null;
  contact: string | null;
  owner: string | null;
  team: string | null;
  category: string | null;
  cause: string | null;
  urgency: string | null;
  status: string;
  baseStatus: string | null;
  justification: string | null;
  service: string | null;
  department: string | null;
  createdDate: string;
  dueDate: string | null;
  firstResponseDueDate: string | null;
  firstResponseDate: string | null;
  resolvedDate: string | null;
  closedDate: string | null;
  lifetimeMinutes: number | null;
  stoppedMinutes: number | null;
  taskNumber: number | null;
  taskStatus: string | null;
  deliveredVersion: string | null;
  responseSlaIndicator?: string | null;
  solutionSlaIndicator?: string | null;
};

type DeadlineBucket =
  | "within"
  | "attention"
  | "critical"
  | "overdue"
  | "withoutDeadline"
  | "notApplicable";

type EvaluatedTicket = {
  ticket: Ticket;
  serviceLevel: ServiceLevelResult;
};

type DrilldownState = {
  title: string;
  subtitle?: string;
  tickets: Ticket[];
};

type CardInfo = {
  title: string;
  summary: string;
  calculation: string;
  source: string;
  reference?: string;
  periodRule: string;
  notes?: string;
};

type AnalystPerformance = {
  owner: string;
  total: number;
  measured: number;
  excluded: number;
  firstResponseEligible: number;
  firstResponseRate: number;
  resolutionEligible: number;
  resolutionRate: number;
  open: number;
  atRisk: number;
  score: number;

  tickets: Ticket[];
  measuredTickets: Ticket[];
  firstResponseTickets: Ticket[];
  resolutionTickets: Ticket[];
  riskTickets: Ticket[];
};

export function Performance() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);

  const {
    effectiveStartDate,
    effectiveEndDate,
  } = useFilters();

  useEffect(() => {
    async function loadTickets() {
      try {
        setLoading(true);
        setError(null);

        const response = await api.get<Ticket[]>("/dashboard/tickets");
        setTickets(response.data);
      } catch (requestError) {
        console.error("Erro ao carregar desempenho:", requestError);
        setError("Não foi possível carregar os indicadores de desempenho.");
      } finally {
        setLoading(false);
      }
    }

    void loadTickets();
  }, []);

  const periodTickets = useMemo(() => {
    const start = startOfDay(effectiveStartDate);
    const end = endOfDay(effectiveEndDate);

    return tickets.filter((ticket) => {
      const created = new Date(ticket.createdDate);
      return created >= start && created <= end;
    });
  }, [tickets, effectiveStartDate, effectiveEndDate]);

  const officialResponseSla = useMemo(
    () => calculateOfficialSla(periodTickets, "response"),
    [periodTickets],
  );

  const officialSolutionSla = useMemo(
    () => calculateOfficialSla(periodTickets, "solution"),
    [periodTickets],
  );

  /* =======================================================
     MOTOR OPERACIONAL DE PRAZOS

     Usado para risco e priorização do backlog. O realizado
     oficial de SLA vem dos indicadores importados acima.
  ======================================================= */

  const evaluatedTickets = useMemo<EvaluatedTicket[]>(() => {
    return periodTickets.map((ticket) => ({
      ticket,
      serviceLevel: calculateServiceLevel({
        urgency: ticket.urgency,
        category: ticket.category,
        cause: ticket.cause,
        subject: ticket.subject,
        createdDate: ticket.createdDate,
        dueDate: ticket.dueDate,
        baseStatus: ticket.baseStatus,
        firstResponseDate: ticket.firstResponseDate,
        firstResponseDueDate: ticket.firstResponseDueDate,
        resolvedDate: ticket.resolvedDate,
        closedDate: ticket.closedDate,
        stoppedMinutes: ticket.stoppedMinutes,
        // Até o perfil VIP existir no banco, usamos STANDARD.
        profile: "STANDARD",
      }),
    }));
  }, [periodTickets]);

  const measuredTickets = useMemo(() => {
    return evaluatedTickets.filter((item) =>
      item.serviceLevel.applicable &&
      isSupportedServiceCategory(item.ticket.category, item.ticket.cause)
    );
  }, [evaluatedTickets]);

  const excludedTickets = useMemo(() => {
    return evaluatedTickets.filter((item) =>
      !item.serviceLevel.applicable ||
      !isSupportedServiceCategory(item.ticket.category, item.ticket.cause)
    );
  }, [evaluatedTickets]);

  const riskGroups = useMemo(() => {
    const open = measuredTickets.filter((item) => isOpen(item.ticket));

    const groups: Record<DeadlineBucket, EvaluatedTicket[]> = {
      within: [],
      attention: [],
      critical: [],
      overdue: [],
      withoutDeadline: [],
      notApplicable: [],
    };

    open.forEach((item) => {
      groups[getDeadlineBucket(item)].push(item);
    });

    return { open, ...groups };
  }, [measuredTickets]);

  const excludedOpenTickets =
    useMemo(
      () =>
        excludedTickets.filter(
          (item) =>
            isOpen(
              item.ticket,
            ),
        ),
      [
        excludedTickets,
      ],
    );

  const allOpenTickets =
    useMemo(
      () => [
        ...riskGroups.open.map(
          (item) =>
            item.ticket,
        ),
        ...excludedOpenTickets.map(
          (item) =>
            item.ticket,
        ),
      ],
      [
        riskGroups.open,
        excludedOpenTickets,
      ],
    );

  const operationHealth = useMemo(() => {
    const riskRate = percentage(
      riskGroups.overdue.length + riskGroups.critical.length,
      riskGroups.open.length
    );

    const firstScore =
      officialResponseSla.measured > 0
        ? officialResponseSla.percentage ?? 0
        : 100;

    const resolutionScore =
      officialSolutionSla.measured > 0
        ? officialSolutionSla.percentage ?? 0
        : 100;

    const riskScore = Math.max(0, 100 - riskRate);

    const score = Math.round(
      firstScore * 0.35 + resolutionScore * 0.4 + riskScore * 0.25
    );

    return {
      score,
      label: healthLabel(score),
    };
  }, [officialResponseSla, officialSolutionSla, riskGroups]);

  const analysts = useMemo<AnalystPerformance[]>(() => {
    const map = new Map<string, EvaluatedTicket[]>();

    evaluatedTickets.forEach((item) => {
      const key = item.ticket.owner ?? "Sem responsável";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    });

    return Array.from(map.entries())
      .map(([owner, ownerItems]) => {
        const operationallyMeasured = ownerItems.filter((item) =>
          item.serviceLevel.applicable &&
          isSupportedServiceCategory(item.ticket.category, item.ticket.cause)
        );

        const ownerTickets = ownerItems.map((item) => item.ticket);
        const responseOfficial = calculateOfficialSla(ownerTickets, "response");
        const solutionOfficial = calculateOfficialSla(ownerTickets, "solution");
        const officialMeasuredIds = new Set([
          ...responseOfficial.measuredTickets,
          ...solutionOfficial.measuredTickets,
        ].map((ticket) => ticket.id));

        const open =
          operationallyMeasured.filter(
            (item) =>
              isOpen(
                item.ticket,
              ),
          );

        const atRisk =
          open.filter(
            (item) => {
              const bucket =
                getDeadlineBucket(
                  item,
                );

              return (
                bucket === "critical" ||
                bucket === "overdue"
              );
            },
          );

        const firstEvaluated = responseOfficial.measured;
        const resolutionEvaluated = solutionOfficial.measured;
        const firstRate = responseOfficial.percentage ?? 0;
        const resolutionRate = solutionOfficial.percentage ?? 0;

        const riskPenalty =
          percentage(
            atRisk.length,
            open.length,
          );

        const score =
          Math.round(
            (
              firstEvaluated > 0
                ? firstRate
                : 100
            ) *
              0.35 +
            (
              resolutionEvaluated > 0
                ? resolutionRate
                : 100
            ) *
              0.45 +
            Math.max(
              0,
              100 -
                riskPenalty,
            ) *
              0.2,
          );

        return {
          owner,
          total: ownerItems.length,
          measured: officialMeasuredIds.size,
          excluded: ownerItems.length - officialMeasuredIds.size,
          firstResponseEligible: firstEvaluated,
          firstResponseRate: firstRate,
          resolutionEligible: resolutionEvaluated,
          resolutionRate,
          open: open.length,
          atRisk: atRisk.length,
          score,

          tickets: ownerItems.map((item) => item.ticket),
          measuredTickets: ownerTickets.filter((ticket) => officialMeasuredIds.has(ticket.id)),
          firstResponseTickets: responseOfficial.measuredTickets,
          resolutionTickets: solutionOfficial.measuredTickets,
          riskTickets: atRisk.map((item) => item.ticket),
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [evaluatedTickets]);

  const trends = useMemo(() => {
    const groups = new Map<string, Ticket[]>();
    periodTickets.forEach((ticket) => {
      const date = formatDayKey(ticket.createdDate);
      groups.set(date, [...(groups.get(date) ?? []), ticket]);
    });

    return Array.from(groups.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, dayTickets]) => ({
        date: formatShortDate(date),
        firstResponse: calculateOfficialSla(dayTickets, "response").percentage ?? 0,
        resolution: calculateOfficialSla(dayTickets, "solution").percentage ?? 0,
      }));
  }, [periodTickets]);

  const firstResponsePie = [
    {
      name: "Dentro do prazo",
      value: officialResponseSla.within,
      color: deadlineColors.within,
    },
    {
      name: "Fora do prazo",
      value: officialResponseSla.outside,
      color: deadlineColors.overdue,
    },
    {
      name: "Sem medição",
      value: officialResponseSla.unmeasured,
      color: deadlineColors.attention,
    },
  ].filter((item) => item.value > 0);

  const resolutionPie = [
    {
      name: "Dentro do prazo",
      value: officialSolutionSla.within,
      color: deadlineColors.within,
    },
    {
      name: "Fora do prazo",
      value: officialSolutionSla.outside,
      color: deadlineColors.overdue,
    },
    {
      name: "Sem medição",
      value: officialSolutionSla.unmeasured,
      color: deadlineColors.attention,
    },
  ].filter((item) => item.value > 0);

  const riskPie = [
    {
      name: "Normal",
      value: riskGroups.within.length,
      color: deadlineColors.within,
    },
    {
      name: "Atenção",
      value: riskGroups.attention.length,
      color: deadlineColors.attention,
    },
    {
      name: "Crítico",
      value: riskGroups.critical.length,
      color: deadlineColors.critical,
    },
    {
      name: "Vencido",
      value: riskGroups.overdue.length,
      color: deadlineColors.overdue,
    },
    {
      name: "Fora da medição",
      value: excludedOpenTickets.length,
      color: semanticChartColors.neutral,
    },
  ].filter((item) => item.value > 0);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
        <CircularProgress sx={{ color: aliareColors.green }} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <>
      <Box
        sx={{
          mb: 2.25,
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "stretch", lg: "center" },
          gap: 2,
        }}
      >
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box
              sx={{
                width: 30,
                height: 3,
                borderRadius: 99,
                backgroundColor: aliareColors.green,
              }}
            />

            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: aliareColors.greenDark,
              }}
            >
              Qualidade operacional
            </Typography>
          </Stack>

          <Typography
            sx={{
              mt: 0.8,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              fontSize: { xs: "1.7rem", md: "1.9rem", xl: "2.1rem" },
            }}
          >
            Desempenho do Atendimento
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Prazos, risco operacional e desempenho da equipe em uma visão única
          </Typography>
        </Box>

        <PeriodFilter />
      </Box>

      <Alert
        severity="info"
        variant="outlined"
        sx={{ mb: 1.5, borderRadius: 2 }}
      >
        <strong>SLA do suporte:</strong> utiliza exclusivamente os indicadores oficiais
        importados do Movidesk e os tickets abertos no período selecionado. Atendimentos
        sem medição e as categorias Adequação e Solicitação de Serviço não entram no denominador.
        Os prazos calculados em horas úteis são exibidos separadamente como risco operacional.
      </Alert>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0,1fr))",
            xl: "repeat(4, minmax(0,1fr))",
          },
          gap: 1.25,
          mb: 1.75,
        }}
      >
        <PerformanceKpi
          title="SLA suporte · 1ª resposta"
          value={formatOfficialRate(officialResponseSla.percentage)}
          description={`${officialResponseSla.within} dentro • ${officialResponseSla.outside} fora • ${officialResponseSla.unmeasured} sem medição`}
          accent={rateColor(officialResponseSla.percentage ?? 0)}
          info={{
            title: "Primeira resposta",
            summary:
              "Percentual oficial de primeiras respostas dentro do prazo entre os atendimentos medidos pelo Movidesk.",
            calculation:
              "Dentro do prazo ÷ (dentro do prazo + fora do prazo) × 100.",
            source: "Indicador oficial do Movidesk",
            reference:
              "responseSlaIndicator",
            periodRule:
              "Considera os tickets abertos dentro do período selecionado e elegíveis para medição.",
            notes:
              "Registros sem indicador oficial não entram no denominador.",
          }}
          onClick={() =>
            setDrilldown({
              title: "Prazo de primeira resposta",
              subtitle: "Atendimentos elegíveis para primeira resposta",
              tickets: officialResponseSla.measuredTickets,
            })
          }
        />

        <PerformanceKpi
          title="SLA suporte · solução"
          value={formatOfficialRate(officialSolutionSla.percentage)}
          description={`${officialSolutionSla.within} dentro • ${officialSolutionSla.outside} fora • ${officialSolutionSla.unmeasured} sem medição`}
          accent={rateColor(officialSolutionSla.percentage ?? 0)}
          info={{
            title: "Resolução",
            summary:
              "Percentual oficial de soluções dentro do prazo entre os atendimentos medidos pelo Movidesk.",
            calculation:
              "Dentro do prazo ÷ (dentro do prazo + fora do prazo) × 100.",
            source: "Indicador oficial do Movidesk",
            reference:
              "solutionSlaIndicator",
            periodRule:
              "A população vem dos tickets abertos no período selecionado e elegíveis para medição.",
            notes:
              "Registros sem indicador oficial não entram no denominador.",
          }}
          onClick={() =>
            setDrilldown({
              title: "Prazo de resolução",
              subtitle: "Atendimentos concluídos com prazo informado",
              tickets: officialSolutionSla.measuredTickets,
            })
          }
        />

        <PerformanceKpi
          title="Em risco"
          value={riskGroups.critical.length + riskGroups.overdue.length}
          description={`${riskGroups.overdue.length} vencido(s) · ${riskGroups.critical.length} crítico(s)`}
          accent={
            riskGroups.overdue.length > 0
              ? deadlineColors.overdue
              : deadlineColors.critical
          }
          info={{
            title: "Em risco",
            summary:
              "Quantidade de atendimentos abertos classificados como críticos ou vencidos.",
            calculation:
              "Críticos + vencidos dentro da carteira aberta e medida.",
            source: "Movidesk + regra operacional do TechLead Hub",
            reference:
              "Prazo restante de primeira resposta e resolução",
            periodRule:
              "Considera a carteira medida no período selecionado.",
            notes:
              "É um indicador preditivo e operacional para priorização da coordenação.",
          }}
          onClick={() =>
            setDrilldown({
              title: "Atendimentos em risco",
              subtitle: "Tickets críticos ou já fora do prazo",
              tickets: [...riskGroups.overdue, ...riskGroups.critical].map((item) => item.ticket),
            })
          }
        />

        <PerformanceKpi
          title="Saúde da operação"
          value={`${operationHealth.score}/100`}
          description={operationHealth.label}
          accent={rateColor(operationHealth.score)}
          info={{
            title: "Saúde da operação",
            summary:
              "Índice composto que resume primeira resposta, resolução e risco atual da carteira.",
            calculation:
              "35% primeira resposta + 40% resolução + 25% componente de risco.",
            source: "TechLead Hub",
            reference:
              "Indicadores de primeira resposta, resolução e carteira crítica/vencida",
            periodRule:
              "Calculado sobre os atendimentos medidos no período selecionado.",
            notes:
              "É um índice gerencial de apoio à coordenação e não substitui o SLA oficial do Movidesk.",
          }}
          onClick={() =>
            setDrilldown({
              title: "Carteira operacional",
              subtitle: "Todos os atendimentos medidos do período selecionado",
              tickets: measuredTickets.map((item) => item.ticket),
            })
          }
        />
      </Box>

      {(riskGroups.critical.length > 0 || riskGroups.overdue.length > 0) && (
        <Alert
          severity={riskGroups.overdue.length > 0 ? "error" : "warning"}
          sx={{ mb: 1.75, borderRadius: 2 }}
        >
          <strong>Atenção operacional:</strong> existem{" "}
          <strong>{riskGroups.overdue.length}</strong> atendimento(s) vencido(s) e{" "}
          <strong>{riskGroups.critical.length}</strong> próximo(s) do limite. Este bloco
          antecipa risco antes da perda do prazo.
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", xl: "repeat(3, minmax(0,1fr))" },
          gap: 1.5,
          mb: 1.75,
        }}
      >
        <DonutCard
          title="Prazo de primeira resposta"
          subtitle="Distribuição dos atendimentos elegíveis"
          centerValue={formatOfficialRate(officialResponseSla.percentage)}
          centerLabel="cumprimento"
          data={firstResponsePie}
          info={{
            title: "Prazo de primeira resposta",
            summary:
              "Distribuição dos atendimentos elegíveis entre dentro do prazo, fora do prazo e pendentes.",
            calculation:
              "Cada fatia representa a quantidade de tickets na respectiva situação da primeira resposta.",
            source: "Movidesk + regra operacional do TechLead Hub",
            periodRule:
              "Considera os atendimentos elegíveis no período selecionado.",
            notes:
              "Clique em qualquer fatia ou item da legenda para abrir os tickets que compõem aquela cor.",
          }}
          onSliceClick={(name) => {
            if (name === "Dentro do prazo") {
              setDrilldown({
                title: "Primeira resposta dentro do prazo",
                tickets: officialResponseSla.withinTickets,
              });
            } else if (name === "Fora do prazo") {
              setDrilldown({
                title: "Primeira resposta fora do prazo",
                tickets: officialResponseSla.outsideTickets,
              });
            } else {
              setDrilldown({
                title: "Primeira resposta pendente",
                tickets: officialResponseSla.unmeasuredTickets,
              });
            }
          }}
        />

        <DonutCard
          title="Prazo de resolução"
          subtitle="Atendimentos concluídos com prazo"
          centerValue={formatOfficialRate(officialSolutionSla.percentage)}
          centerLabel="cumprimento"
          data={resolutionPie}
          info={{
            title: "Prazo de resolução",
            summary:
              "Distribuição dos atendimentos concluídos entre dentro e fora do prazo.",
            calculation:
              "Cada fatia representa a quantidade de tickets concluídos naquela condição.",
            source: "Movidesk + regra operacional do TechLead Hub",
            periodRule:
              "Considera os atendimentos concluídos e medidos no período selecionado.",
            notes:
              "Clique em uma fatia ou item da legenda para abrir os tickets correspondentes.",
          }}
          onSliceClick={(name) => {
            if (name === "Dentro do prazo") {
              setDrilldown({
                title: "Resoluções dentro do prazo",
                tickets: officialSolutionSla.withinTickets,
              });
              return;
            }

            if (name === "Fora do prazo") {
              setDrilldown({
                title: "Resoluções fora do prazo",
                tickets: officialSolutionSla.outsideTickets,
              });
              return;
            }

            setDrilldown({
              title: "Resoluções em andamento",
              subtitle: "Atendimentos ainda abertos e dentro do prazo",
              tickets: officialSolutionSla.unmeasuredTickets,
            });
          }}
        />

        <DonutCard
          title="Risco da carteira"
          subtitle="Situação atual dos atendimentos abertos"
          centerValue={allOpenTickets.length}
          centerLabel="abertos"
          data={riskPie}
          info={{
            title: "Risco da carteira",
            summary:
              "Distribuição de todos os atendimentos abertos por nível de risco de prazo, incluindo os que estão fora da medição.",
            calculation:
              "Classificação pela condição mais severa entre primeira resposta e resolução.",
            source: "Movidesk + regra operacional do TechLead Hub",
            periodRule:
              "Considera todos os atendimentos abertos do período selecionado; os fora da medição aparecem separadamente.",
            notes:
              "Clique nas cores para investigar exatamente os tickets classificados em cada situação.",
          }}
          onSliceClick={(name) => {
            const groups: Record<string, Ticket[]> = {
              Normal: riskGroups.within.map((item) => item.ticket),
              Atenção: riskGroups.attention.map((item) => item.ticket),
              Crítico: riskGroups.critical.map((item) => item.ticket),
              Vencido: riskGroups.overdue.map((item) => item.ticket),
              "Fora da medição": excludedOpenTickets.map((item) => item.ticket),
            };

            setDrilldown({
              title: `Risco da carteira: ${name}`,
              tickets: groups[name] ?? [],
            });
          }}
        />
      </Box>

      <Card
        elevation={0}
        sx={{
          mb: 1.75,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2.25,
          backgroundColor: "background.paper",
          boxShadow: "0 1px 2px rgba(16,24,40,0.035)",
        }}
      >
        <CardContent>
          <CardSectionHeader
            title="Evolução do cumprimento de prazo"
            subtitle="Tendência diária da primeira resposta e resolução"
            info={{
              title: "Evolução do cumprimento de prazo",
              summary:
                "Mostra a variação diária das taxas de primeira resposta e resolução.",
              calculation:
                "Percentual diário de tickets concluídos dentro do prazo entre os tickets concluídos medidos naquele dia.",
              source: "Movidesk + regra operacional do TechLead Hub",
              periodRule:
                "Agrupa os atendimentos medidos pela data de abertura dentro do período selecionado.",
              notes:
                "Use a tendência para identificar deterioração ou recuperação operacional ao longo do período.",
            }}
          />

          <Box sx={{ height: 300, mt: 2 }}>
            {trends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trends}
                  margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#EAECF0"
                  />

                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />

                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${value}%`}
                    tickLine={false}
                    axisLine={false}
                  />

                  <Tooltip />
                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="firstResponse"
                    name="Primeira resposta"
                    stroke={aliareColors.green}
                    strokeWidth={2.4}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 5 }}
                  />

                  <Line
                    type="monotone"
                    dataKey="resolution"
                    name="Resolução"
                    stroke="#171717"
                    strokeWidth={2.2}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Sem dados suficientes para evolução no período." />
            )}
          </Box>
        </CardContent>
      </Card>

      <Card
        elevation={0}
        sx={{
          mb: 1.75,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2.25,
          backgroundColor: "background.paper",
          boxShadow: "0 1px 2px rgba(16,24,40,0.035)",
        }}
      >
        <CardContent>
          <CardSectionHeader
            title="Radar de vencimento"
            subtitle="Visão preditiva da carteira aberta"
            info={{
              title: "Radar de vencimento",
              summary:
                "Distribui a carteira atual entre normal, atenção, crítico, vencido e fora da medição.",
              calculation:
                "Cada ticket é classificado pelo prazo mais severo entre primeira resposta e resolução.",
              source: "Movidesk + regra operacional do TechLead Hub",
              periodRule:
                "Considera a carteira aberta vinculada ao período selecionado.",
              notes:
                "Todos os blocos são clicáveis e abrem os tickets que formam o respectivo indicador.",
            }}
          />

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(2, minmax(0,1fr))",
                md: "repeat(5, minmax(0,1fr))",
              },
              gap: 1,
              mt: 1.75,
            }}
          >
            <RiskBucket
              label="Normal"
              value={riskGroups.within.length}
              color={deadlineColors.within}
              onClick={() =>
                setDrilldown({
                  title: "Dentro do prazo",
                  tickets: riskGroups.within.map((item) => item.ticket),
                })
              }
            />

            <RiskBucket
              label="Atenção"
              value={riskGroups.attention.length}
              color={deadlineColors.attention}
              onClick={() =>
                setDrilldown({
                  title: "Atendimentos em atenção",
                  tickets: riskGroups.attention.map((item) => item.ticket),
                })
              }
            />

            <RiskBucket
              label="Crítico"
              value={riskGroups.critical.length}
              color={deadlineColors.critical}
              onClick={() =>
                setDrilldown({
                  title: "Atendimentos críticos",
                  tickets: riskGroups.critical.map((item) => item.ticket),
                })
              }
            />

            <RiskBucket
              label="Vencido"
              value={riskGroups.overdue.length}
              color={deadlineColors.overdue}
              onClick={() =>
                setDrilldown({
                  title: "Atendimentos vencidos",
                  tickets: riskGroups.overdue.map((item) => item.ticket),
                })
              }
            />

            <RiskBucket
              label="Fora da medição"
              value={excludedTickets.length}
              color={semanticChartColors.neutral}
              onClick={() =>
                setDrilldown({
                  title: "Atendimentos fora da medição",
                  subtitle: "Categorias excluídas ou sem regra oficial de prazo nesta versão",
                  tickets: excludedTickets.map((item) => item.ticket),
                })
              }
            />
          </Box>
        </CardContent>
      </Card>

      <Card
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2.25,
          overflow: "hidden",
          backgroundColor: "background.paper",
          boxShadow: "0 1px 2px rgba(16,24,40,0.035)",
        }}
      >
        <CardContent
          sx={{
            py: 1.4,
            px: 2,
            "&:last-child": { pb: 1.4 },
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              gap: 1,
            }}
          >
            <CardSectionHeader
              title="Desempenho por analista"
              subtitle="Cumprimento de prazo, risco da carteira e índice operacional"
              info={{
                title: "Desempenho por analista",
                summary:
                  "Compara a carteira dos analistas por volume, medição de prazo, risco e índice de saúde.",
                calculation:
                  "Saúde = 35% primeira resposta + 45% resolução + 20% componente de risco por analista.",
                source: "Movidesk + regra operacional do TechLead Hub",
                periodRule:
                  "Considera os tickets abertos no período e atribuídos ao responsável.",
                notes:
                  "Os números e taxas são clicáveis para facilitar a análise da coordenação por analista.",
              }}
            />

            <Chip
              size="small"
              label={`${analysts.length} analista(s)`}
              variant="outlined"
              sx={{
                color: aliareColors.greenDark,
                borderColor: "rgba(24,199,122,0.30)",
                backgroundColor: "rgba(24,199,122,0.05)",
              }}
            />
          </Stack>
        </CardContent>

        <TableContainer>
          <Table size="small">
            <TableHead
              sx={{
                backgroundColor: "#F8FAF9",
                "& .MuiTableCell-root": {
                  color: "text.secondary",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  letterSpacing: "0.02em",
                  borderBottomColor: "divider",
                },
              }}
            >
              <TableRow>
                <TableCell>Analista</TableCell>
                <TableCell align="right">Tickets</TableCell>
                <TableCell align="right">Medidos</TableCell>
                <TableCell align="right">1ª resposta</TableCell>
                <TableCell align="right">Resolução</TableCell>
                <TableCell align="right">Em risco</TableCell>
                <TableCell align="right">Saúde</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {analysts.map((analyst) => (
                <TableRow
                  key={analyst.owner}
                  hover
                  sx={{ "&:hover": { backgroundColor: "#FAFBFA" } }}
                >
                  <TableCell>
                    <Box
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setDrilldown({
                          title: `Analista: ${analyst.owner}`,
                          subtitle: "Todos os tickets do analista no período",
                          tickets: analyst.tickets,
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          setDrilldown({
                            title: `Analista: ${analyst.owner}`,
                            subtitle: "Todos os tickets do analista no período",
                            tickets: analyst.tickets,
                          });
                        }
                      }}
                      sx={{ cursor: "pointer" }}
                    >
                      <Typography sx={{ fontWeight: 700, fontSize: "0.82rem", color: aliareColors.greenDark }}>
                        {analyst.owner}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {analyst.open} aberto(s)
                      </Typography>
                    </Box>
                  </TableCell>

                  <TableCell align="right">
                    <ClickableTableMetric
                      value={analyst.total}
                      onClick={() =>
                        setDrilldown({
                          title: `${analyst.owner} - Tickets`,
                          tickets: analyst.tickets,
                        })
                      }
                    />
                  </TableCell>

                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={analyst.measured}
                      variant="outlined"
                      onClick={() =>
                        setDrilldown({
                          title: `${analyst.owner} - Tickets medidos`,
                          tickets: analyst.measuredTickets,
                        })
                      }
                      sx={{
                        minWidth: 38,
                        cursor: "pointer",
                        color: aliareColors.greenDark,
                        borderColor: "rgba(24,199,122,0.30)",
                      }}
                    />
                  </TableCell>

                  <TableCell align="right">
                    <RateChip
                      value={analyst.firstResponseRate}
                      empty={analyst.firstResponseEligible === 0}
                      onClick={() =>
                        setDrilldown({
                          title: `${analyst.owner} - Primeira resposta`,
                          tickets: analyst.firstResponseTickets,
                        })
                      }
                    />
                  </TableCell>

                  <TableCell align="right">
                    <RateChip
                      value={analyst.resolutionRate}
                      empty={analyst.resolutionEligible === 0}
                      onClick={() =>
                        setDrilldown({
                          title: `${analyst.owner} - Resolução`,
                          tickets: analyst.resolutionTickets,
                        })
                      }
                    />
                  </TableCell>

                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={analyst.atRisk}
                      variant="outlined"
                      onClick={() =>
                        setDrilldown({
                          title: `${analyst.owner} - Em risco`,
                          tickets: analyst.riskTickets,
                        })
                      }
                      sx={{
                        minWidth: 38,
                        cursor: "pointer",
                        color:
                          analyst.atRisk > 0
                            ? semanticChartColors.overdue
                            : aliareColors.greenDark,
                        borderColor:
                          analyst.atRisk > 0
                            ? "rgba(229,57,53,0.35)"
                            : "rgba(24,199,122,0.30)",
                      }}
                    />
                  </TableCell>

                  <TableCell align="right">
                    <RateChip
                      value={analyst.score}
                      onClick={() =>
                        setDrilldown({
                          title: `${analyst.owner} - Carteira operacional`,
                          subtitle: `Saúde ${analyst.score}/100`,
                          tickets: analyst.measuredTickets,
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}

              {analysts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Box sx={{ py: 4 }}>
                      <Typography sx={{ fontWeight: 700 }}>
                        Sem dados de analistas no período
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Alert
        severity="info"
        variant="outlined"
        sx={{ mt: 1.75, borderRadius: 2 }}
      >
        <strong>Próxima camada:</strong> esta página já está preparada para receber
        CSAT geral, por analista e por squad. Para isso, precisamos incorporar os
        dados de avaliação do Movidesk à importação.
      </Alert>

      <Drawer
        anchor="right"
        open={Boolean(drilldown)}
        onClose={() => setDrilldown(null)}
      >
        <Box sx={{ width: { xs: 330, sm: 580 }, p: 2.5 }}>
          {drilldown && (
            <>
              <Stack
                direction="row"
                sx={{
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 2,
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontSize: "1.2rem",
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {drilldown.title}
                  </Typography>

                  <Typography variant="caption" color="text.secondary">
                    {drilldown.subtitle ?? "Atendimentos que compõem este indicador"}
                  </Typography>
                </Box>

                <Chip
                  size="small"
                  label={`${drilldown.tickets.length} ticket(s)`}
                  sx={{
                    color: aliareColors.greenDark,
                    backgroundColor: "rgba(24,199,122,0.06)",
                  }}
                />
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Stack spacing={1}>
                {drilldown.tickets.map((ticket) => (
                  <Box
                    key={ticket.id}
                    sx={{
                      p: 1.2,
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1.5,
                      backgroundColor: "#FAFBFA",
                    }}
                  >
                    <Stack
                      direction="row"
                      sx={{ justifyContent: "space-between", gap: 1 }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: "0.78rem", fontWeight: 800 }}>
                          #{ticket.movideskId}
                        </Typography>

                        <Typography
                          title={ticket.subject}
                          sx={{
                            mt: 0.25,
                            fontSize: "0.8rem",
                            fontWeight: 650,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {ticket.subject}
                        </Typography>

                        <Typography variant="caption" color="text.secondary">
                          {ticket.client ?? "Sem cliente"} · {ticket.owner ?? "Sem responsável"}
                        </Typography>

                        <Typography
                          variant="caption"
                          sx={{ display: "block", mt: 0.2, color: "text.secondary" }}
                        >
                          Solução: {formatRemainingTime(ticket)}
                        </Typography>
                      </Box>

                      <DeadlineMiniChip bucket={getDeadlineBucketFromTicket(ticket)} />
                    </Stack>
                  </Box>
                ))}

                {drilldown.tickets.length === 0 && (
                  <EmptyState text="Nenhum atendimento compõe este indicador." />
                )}
              </Stack>
            </>
          )}
        </Box>
      </Drawer>
    </>
  );
}

function PerformanceKpi({
  title,
  value,
  description,
  accent,
  info,
  onClick,
}: {
  title: string;
  value: string | number;
  description: string;
  accent: string;
  info: CardInfo;
  onClick: () => void;
}) {
  return (
    <Card
      elevation={0}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onClick();
        }
      }}
      sx={{
        position: "relative",
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2.25,
        cursor: "pointer",
        backgroundColor: "background.paper",
        transition:
          "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 3,
          backgroundColor: accent,
        },
        "&:hover": {
          transform: "translateY(-2px)",
          borderColor: accent,
          boxShadow: "0 8px 24px rgba(16,24,40,0.08)",
        },
        "&:focus-visible": {
          outline: `2px solid ${accent}`,
          outlineOffset: "2px",
        },
      }}
    >
      <CardContent
        sx={{
          p: { xs: 1.6, md: 1.8 },
          "&:last-child": { pb: { xs: 1.6, md: 1.8 } },
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontWeight: 650 }}
          >
            {title}
          </Typography>

          <CardInfoButton info={info} />
        </Stack>

        <Typography
          sx={{
            mt: 0.6,
            fontSize: { xs: "1.75rem", md: "1.95rem", xl: "2.1rem" },
            lineHeight: 1.05,
            fontWeight: 800,
            letterSpacing: "-0.025em",
          }}
        >
          {value}
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 0.75, minHeight: 18 }}
        >
          {description}
        </Typography>

        <Typography
          variant="caption"
          sx={{
            display: "inline-block",
            mt: 0.85,
            fontWeight: 700,
            color: aliareColors.greenDark,
          }}
        >
          Ver atendimentos →
        </Typography>
      </CardContent>
    </Card>
  );
}

function DonutCard({
  title,
  subtitle,
  centerValue,
  centerLabel,
  data,
  info,
  onSliceClick,
}: {
  title: string;
  subtitle: string;
  centerValue: string | number;
  centerLabel: string;
  data: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  info: CardInfo;
  onSliceClick?: (name: string) => void;
}) {
  return (
    <Card
      elevation={0}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2.25,
        backgroundColor: "background.paper",
        boxShadow: "0 1px 2px rgba(16,24,40,0.035)",
      }}
    >
      <CardContent>
        <Stack
          direction="row"
          sx={{
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: "1rem" }}>
              {title}
            </Typography>

            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          </Box>

          <CardInfoButton info={info} />
        </Stack>

        <Box sx={{ height: 205, mt: 1 }}>
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={88}
                  paddingAngle={2}
                  stroke="none"
                  cursor={onSliceClick ? "pointer" : "default"}
                  onClick={(entry) => {
                    const candidate = entry as {
                      name?: unknown;
                      payload?: { name?: unknown };
                    };

                    const name =
                      typeof candidate.name === "string"
                        ? candidate.name
                        : typeof candidate.payload?.name === "string"
                        ? candidate.payload.name
                        : null;

                    if (name) {
                      onSliceClick?.(name);
                    }
                  }}
                >
                  {data.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>

                <Tooltip />

                <text
                  x="50%"
                  y="47%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontSize: 23,
                    fontWeight: 800,
                    fill: aliareColors.text,
                  }}
                >
                  {centerValue}
                </text>

                <text
                  x="50%"
                  y="59%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontSize: 11,
                    fill: aliareColors.textSecondary,
                  }}
                >
                  {centerLabel}
                </text>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Sem dados para este indicador." />
          )}
        </Box>

        {data.length > 0 && (
          <DonutLegend
            data={data}
            onItemClick={onSliceClick}
          />
        )}
      </CardContent>
    </Card>
  );
}

function RiskBucket({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  onClick: () => void;
}) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onClick();
        }
      }}
      sx={{
        p: 1.25,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        cursor: "pointer",
        borderTop: `3px solid ${color}`,
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: "0 6px 18px rgba(16,24,40,0.06)",
        },
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>

      <Typography sx={{ mt: 0.35, fontSize: "1.45rem", fontWeight: 800, lineHeight: 1 }}>
        {value}
      </Typography>
    </Box>
  );
}

function RateChip({
  value,
  empty = false,
  onClick,
}: {
  value: number;
  empty?: boolean;
  onClick?: () => void;
}) {
  if (empty) {
    return (
      <Chip
        size="small"
        label="—"
        variant="outlined"
        onClick={onClick}
        sx={{ cursor: onClick ? "pointer" : "default" }}
      />
    );
  }

  const color = rateColor(value);

  return (
    <Chip
      size="small"
      label={`${value}%`}
      variant="outlined"
      onClick={onClick}
      sx={{
        minWidth: 56,
        cursor: onClick ? "pointer" : "default",
        color,
        borderColor: color,
        fontWeight: 700,
      }}
    />
  );
}

function DeadlineMiniChip({
  bucket,
}: {
  bucket: DeadlineBucket;
}) {
  const config = deadlineBucketConfig(bucket);

  return (
    <Chip
      size="small"
      label={config.label}
      variant="outlined"
      sx={{
        flexShrink: 0,
        color: config.color,
        borderColor: config.color,
        fontWeight: 700,
      }}
    />
  );
}

function getDeadlineBucket(item: EvaluatedTicket): DeadlineBucket {
  if (!item.serviceLevel.applicable) {
    return "notApplicable";
  }

  const firstLevel: DeadlineLevel = item.serviceLevel.firstResponse.completed
    ? "NORMAL"
    : item.serviceLevel.firstResponse.level;

  return strongestDeadlineBucket(firstLevel, item.serviceLevel.resolution.level);
}

function getDeadlineBucketFromTicket(ticket: Ticket): DeadlineBucket {
  const serviceLevel = calculateServiceLevel({
    urgency: ticket.urgency,
    category: ticket.category,
    cause: ticket.cause,
    subject: ticket.subject,
    createdDate: ticket.createdDate,
    dueDate: ticket.dueDate,
    baseStatus: ticket.baseStatus,
    firstResponseDate: ticket.firstResponseDate,
    firstResponseDueDate: ticket.firstResponseDueDate,
    resolvedDate: ticket.resolvedDate,
    closedDate: ticket.closedDate,
    stoppedMinutes: ticket.stoppedMinutes,
    profile: "STANDARD",
  });

  if (!serviceLevel.applicable || !isSupportedServiceCategory(ticket.category, ticket.cause)) {
    return "notApplicable";
  }

  const firstLevel: DeadlineLevel = serviceLevel.firstResponse.completed
    ? "NORMAL"
    : serviceLevel.firstResponse.level;

  return strongestDeadlineBucket(firstLevel, serviceLevel.resolution.level);
}

function strongestDeadlineBucket(
  first: DeadlineLevel,
  resolution: DeadlineLevel
): DeadlineBucket {
  const levels = [first, resolution];

  if (levels.includes("OVERDUE")) return "overdue";
  if (levels.includes("CRITICAL")) return "critical";
  if (levels.includes("ATTENTION")) return "attention";
  if (levels.every((level) => level === "NOT_APPLICABLE")) return "notApplicable";
  return "within";
}

function deadlineBucketConfig(bucket: DeadlineBucket) {
  if (bucket === "overdue") return { label: "Vencido", color: deadlineColors.overdue };
  if (bucket === "critical") return { label: "Crítico", color: deadlineColors.critical };
  if (bucket === "attention") return { label: "Atenção", color: deadlineColors.attention };
  if (bucket === "withoutDeadline") return { label: "Sem prazo", color: semanticChartColors.neutral };
  if (bucket === "notApplicable") return { label: "Fora da medição", color: semanticChartColors.neutral };
  return { label: "Normal", color: deadlineColors.within };
}

function isSupportedServiceCategory(category: string | null, cause: string | null) {
  const normalized = normalizeText([category, cause].filter(Boolean).join(" "));
  return (
    normalized.includes("duvida") ||
    normalized.includes("problema") ||
    normalized.includes("contorno") ||
    normalized.includes("bug")
  );
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function formatRemainingTime(ticket: Ticket) {
  const result = calculateServiceLevel({
    urgency: ticket.urgency,
    category: ticket.category,
    cause: ticket.cause,
    subject: ticket.subject,
    createdDate: ticket.createdDate,
    dueDate: ticket.dueDate,
    baseStatus: ticket.baseStatus,
    firstResponseDate: ticket.firstResponseDate,
    firstResponseDueDate: ticket.firstResponseDueDate,
    resolvedDate: ticket.resolvedDate,
    closedDate: ticket.closedDate,
    stoppedMinutes: ticket.stoppedMinutes,
    profile: "STANDARD",
  });

  if (!result.applicable || !isSupportedServiceCategory(ticket.category, ticket.cause)) {
    return "fora da medição";
  }

  if (result.resolution.completed) {
    return result.resolution.withinDeadline
      ? "concluído no prazo"
      : "concluído fora do prazo";
  }

  return formatServiceMinutes(result.resolution.remainingMinutes);
}

function rateColor(rate: number) {
  if (rate >= 95) {
    return deadlineColors.within;
  }

  if (rate >= 85) {
    return deadlineColors.attention;
  }

  if (rate >= 70) {
    return deadlineColors.critical;
  }

  return deadlineColors.overdue;
}

function formatOfficialRate(rate: number | null) {
  return rate === null
    ? "Sem medição"
    : `${rate.toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`;
}

function healthLabel(score: number) {
  if (score >= 95) {
    return "Excelente";
  }

  if (score >= 85) {
    return "Muito boa";
  }

  if (score >= 70) {
    return "Atenção";
  }

  return "Crítica";
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
}

function isOpen(ticket: Ticket) {
  return !["Resolved", "Closed", "Canceled"].includes(ticket.baseStatus ?? "");
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function formatDayKey(value: string) {
  const date = new Date(value);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatShortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function CardInfoButton({
  info,
}: {
  info: CardInfo;
}) {
  const [anchorEl, setAnchorEl] =
    useState<HTMLElement | null>(null);

  const open =
    Boolean(anchorEl);

  return (
    <>
      <IconButton
        size="small"
        aria-label={`Informações sobre ${info.title}`}
        title={`Informações sobre ${info.title}`}
        onClick={(event) => {
          event.stopPropagation();
          setAnchorEl(event.currentTarget);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
        sx={{
          width: 28,
          height: 28,
          color: "text.secondary",
          flexShrink: 0,
        }}
      >
        <InfoOutlined sx={{ fontSize: 17 }} />
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        onClick={(event) => event.stopPropagation()}
        slotProps={{
          paper: {
            sx: {
              width: 340,
              maxWidth: "calc(100vw - 32px)",
              p: 2,
              borderRadius: 2,
            },
          },
        }}
      >
        <Typography sx={{ fontWeight: 800 }}>
          {info.title}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 0.75 }}
        >
          {info.summary}
        </Typography>

        <Divider sx={{ my: 1.5 }} />

        <InfoLine
          label="Cálculo"
          value={info.calculation}
        />

        <InfoLine
          label="Fonte"
          value={info.source}
        />

        {info.reference && (
          <InfoLine
            label="Referência"
            value={info.reference}
          />
        )}

        <InfoLine
          label="Período"
          value={info.periodRule}
        />

        {info.notes && (
          <InfoLine
            label="Observação"
            value={info.notes}
          />
        )}
      </Popover>
    </>
  );
}

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Box sx={{ mt: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontWeight: 700 }}
      >
        {label}
      </Typography>

      <Typography
        variant="body2"
        sx={{ mt: 0.15, lineHeight: 1.45 }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function CardSectionHeader({
  title,
  subtitle,
  info,
}: {
  title: string;
  subtitle: string;
  info: CardInfo;
}) {
  return (
    <Stack
      direction="row"
      sx={{
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 1,
      }}
    >
      <Box>
        <Typography sx={{ fontWeight: 800, fontSize: "1rem" }}>
          {title}
        </Typography>

        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      </Box>

      <CardInfoButton info={info} />
    </Stack>
  );
}

function DonutLegend({
  data,
  onItemClick,
}: {
  data: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  onItemClick?: (name: string) => void;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{
        justifyContent: "center",
        alignItems: "center",
        flexWrap: "wrap",
        mt: 0.5,
      }}
    >
      {data.map((item) => (
        <Box
          key={item.name}
          role={onItemClick ? "button" : undefined}
          tabIndex={onItemClick ? 0 : undefined}
          onClick={() => onItemClick?.(item.name)}
          onKeyDown={(event) => {
            if (
              onItemClick &&
              (event.key === "Enter" || event.key === " ")
            ) {
              onItemClick(item.name);
            }
          }}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.55,
            cursor: onItemClick ? "pointer" : "default",
            borderRadius: 1,
            px: 0.4,
            py: 0.2,
            "&:hover": onItemClick
              ? { backgroundColor: "action.hover" }
              : undefined,
          }}
        >
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: item.color,
              flexShrink: 0,
            }}
          />

          <Typography
            variant="caption"
            sx={{ color: item.color, fontWeight: 600 }}
          >
            {item.name}
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 700 }}
          >
            {item.value}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

function ClickableTableMetric({
  value,
  onClick,
}: {
  value: number;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        p: 0,
        m: 0,
        border: 0,
        background: "transparent",
        color: "inherit",
        font: "inherit",
        fontWeight: 700,
        cursor: "pointer",
        "&:hover": {
          color: aliareColors.greenDark,
          textDecoration: "underline",
        },
      }}
    >
      {value}
    </Box>
  );
}

function EmptyState({
  text,
}: {
  text: string;
}) {
  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        px: 2,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {text}
      </Typography>
    </Box>
  );
}
