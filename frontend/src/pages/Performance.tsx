import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
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

  /* =======================================================
     MOTOR OFICIAL DE PRAZOS
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

  const firstResponse = useMemo(() => {
    const eligible = measuredTickets;
    const completed = eligible.filter((item) => item.serviceLevel.firstResponse.completed);
    const within = completed.filter((item) => item.serviceLevel.firstResponse.withinDeadline === true);
    const overdue = eligible.filter((item) =>
      (item.serviceLevel.firstResponse.completed && item.serviceLevel.firstResponse.withinDeadline === false) ||
      (!item.serviceLevel.firstResponse.completed && item.serviceLevel.firstResponse.level === "OVERDUE")
    );
    const pending = eligible.filter((item) =>
      !item.serviceLevel.firstResponse.completed &&
      item.serviceLevel.firstResponse.level !== "OVERDUE"
    );

    return {
      eligible,
      completed,
      within,
      overdue,
      pending,
      rate: percentage(within.length, completed.length),
    };
  }, [measuredTickets]);

  const resolution = useMemo(() => {
    const eligible = measuredTickets;
    const completed = eligible.filter((item) => item.serviceLevel.resolution.completed);
    const within = completed.filter((item) => item.serviceLevel.resolution.withinDeadline === true);
    const overdue = eligible.filter((item) =>
      (item.serviceLevel.resolution.completed && item.serviceLevel.resolution.withinDeadline === false) ||
      (!item.serviceLevel.resolution.completed && item.serviceLevel.resolution.level === "OVERDUE")
    );

    return {
      eligible,
      completed,
      within,
      overdue,
      rate: percentage(within.length, completed.length),
    };
  }, [measuredTickets]);

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

  const operationHealth = useMemo(() => {
    const riskRate = percentage(
      riskGroups.overdue.length + riskGroups.critical.length,
      riskGroups.open.length
    );

    const firstScore =
      firstResponse.eligible.length > 0 ? firstResponse.rate : 100;

    const resolutionScore =
      resolution.completed.length > 0 ? resolution.rate : 100;

    const riskScore = Math.max(0, 100 - riskRate);

    const score = Math.round(
      firstScore * 0.35 + resolutionScore * 0.4 + riskScore * 0.25
    );

    return {
      score,
      label: healthLabel(score),
    };
  }, [firstResponse, resolution, riskGroups]);

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
        const measured = ownerItems.filter((item) =>
          item.serviceLevel.applicable &&
          isSupportedServiceCategory(item.ticket.category, item.ticket.cause)
        );

        const firstCompleted = measured.filter((item) => item.serviceLevel.firstResponse.completed);
        const firstWithin = firstCompleted.filter((item) => item.serviceLevel.firstResponse.withinDeadline === true);
        const resolutionCompleted = measured.filter((item) => item.serviceLevel.resolution.completed);
        const resolutionWithin = resolutionCompleted.filter((item) => item.serviceLevel.resolution.withinDeadline === true);
        const open = measured.filter((item) => isOpen(item.ticket));
        const atRisk = open.filter((item) => {
          const bucket = getDeadlineBucket(item);
          return bucket === "critical" || bucket === "overdue";
        });

        const firstRate = percentage(firstWithin.length, firstCompleted.length);
        const resolutionRate = percentage(resolutionWithin.length, resolutionCompleted.length);
        const riskPenalty = percentage(atRisk.length, open.length);

        const score = Math.round(
          (firstCompleted.length > 0 ? firstRate : 100) * 0.35 +
          (resolutionCompleted.length > 0 ? resolutionRate : 100) * 0.45 +
          Math.max(0, 100 - riskPenalty) * 0.2
        );

        return {
          owner,
          total: ownerItems.length,
          measured: measured.length,
          excluded: ownerItems.length - measured.length,
          firstResponseEligible: firstCompleted.length,
          firstResponseRate: firstRate,
          resolutionEligible: resolutionCompleted.length,
          resolutionRate,
          open: open.length,
          atRisk: atRisk.length,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [evaluatedTickets]);

  const trends = useMemo(() => {
    const groups = new Map<string, {
      date: string;
      firstEligible: number;
      firstWithin: number;
      resolutionEligible: number;
      resolutionWithin: number;
    }>();

    measuredTickets.forEach((item) => {
      const date = formatDayKey(item.ticket.createdDate);
      const current = groups.get(date) ?? {
        date,
        firstEligible: 0,
        firstWithin: 0,
        resolutionEligible: 0,
        resolutionWithin: 0,
      };

      if (item.serviceLevel.firstResponse.completed) {
        current.firstEligible += 1;
        if (item.serviceLevel.firstResponse.withinDeadline === true) {
          current.firstWithin += 1;
        }
      }

      if (item.serviceLevel.resolution.completed) {
        current.resolutionEligible += 1;
        if (item.serviceLevel.resolution.withinDeadline === true) {
          current.resolutionWithin += 1;
        }
      }

      groups.set(date, current);
    });

    return Array.from(groups.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        date: formatShortDate(item.date),
        firstResponse: percentage(item.firstWithin, item.firstEligible),
        resolution: percentage(item.resolutionWithin, item.resolutionEligible),
      }));
  }, [measuredTickets]);

  const firstResponsePie = [
    {
      name: "Dentro do prazo",
      value: firstResponse.within.length,
      color: deadlineColors.within,
    },
    {
      name: "Fora do prazo",
      value: firstResponse.overdue.length,
      color: deadlineColors.overdue,
    },
    {
      name: "Pendente",
      value: firstResponse.pending.length,
      color: deadlineColors.attention,
    },
  ].filter((item) => item.value > 0);

  const resolutionPie = [
    {
      name: "Dentro do prazo",
      value: resolution.within.length,
      color: deadlineColors.within,
    },
    {
      name: "Fora do prazo",
      value: resolution.overdue.length,
      color: deadlineColors.overdue,
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
      value: excludedTickets.length,
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
        <strong>Regra oficial aplicada:</strong> {measuredTickets.length} atendimento(s) estão
        sendo medidos neste período e {excludedTickets.length} ficaram fora da medição.
        O cálculo considera horas úteis, urgência e pausas registradas. Até a classificação
        VIP existir no banco, os atendimentos são tratados como perfil Padrão.
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
          title="Primeira resposta"
          value={`${firstResponse.rate}%`}
          description={`${firstResponse.within.length} de ${firstResponse.eligible.length} dentro do prazo`}
          accent={rateColor(firstResponse.rate)}
          onClick={() =>
            setDrilldown({
              title: "Prazo de primeira resposta",
              subtitle: "Atendimentos com prazo de primeira resposta informado",
              tickets: firstResponse.eligible.map((item) => item.ticket),
            })
          }
        />

        <PerformanceKpi
          title="Resolução"
          value={`${resolution.rate}%`}
          description={`${resolution.within.length} de ${resolution.completed.length} concluídos no prazo`}
          accent={rateColor(resolution.rate)}
          onClick={() =>
            setDrilldown({
              title: "Prazo de resolução",
              subtitle: "Atendimentos concluídos com prazo informado",
              tickets: resolution.completed.map((item) => item.ticket),
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
          onClick={() =>
            setDrilldown({
              title: "Carteira operacional",
              subtitle: "Todos os atendimentos do período selecionado",
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
          centerValue={`${firstResponse.rate}%`}
          centerLabel="cumprimento"
          data={firstResponsePie}
        />

        <DonutCard
          title="Prazo de resolução"
          subtitle="Atendimentos concluídos com prazo"
          centerValue={`${resolution.rate}%`}
          centerLabel="cumprimento"
          data={resolutionPie}
        />

        <DonutCard
          title="Risco da carteira"
          subtitle="Situação atual dos atendimentos abertos"
          centerValue={riskGroups.open.length}
          centerLabel="abertos"
          data={riskPie}
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
          <Typography sx={{ fontWeight: 800, fontSize: "1rem" }}>
            Evolução do cumprimento de prazo
          </Typography>

          <Typography variant="caption" color="text.secondary">
            Tendência diária da primeira resposta e resolução
          </Typography>

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
          <Typography sx={{ fontWeight: 800, fontSize: "1rem" }}>
            Radar de vencimento
          </Typography>

          <Typography variant="caption" color="text.secondary">
            Visão preditiva da carteira aberta
          </Typography>

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
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: "1rem" }}>
                Desempenho por analista
              </Typography>

              <Typography variant="caption" color="text.secondary">
                Cumprimento de prazo, risco da carteira e índice operacional
              </Typography>
            </Box>

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
                    <Typography sx={{ fontWeight: 700, fontSize: "0.82rem" }}>
                      {analyst.owner}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {analyst.open} aberto(s)
                    </Typography>
                  </TableCell>

                  <TableCell align="right">{analyst.total}</TableCell>

                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={analyst.measured}
                      variant="outlined"
                      sx={{
                        minWidth: 38,
                        color: aliareColors.greenDark,
                        borderColor: "rgba(24,199,122,0.30)",
                      }}
                    />
                  </TableCell>

                  <TableCell align="right">
                    <RateChip
                      value={analyst.firstResponseRate}
                      empty={analyst.firstResponseEligible === 0}
                    />
                  </TableCell>

                  <TableCell align="right">
                    <RateChip
                      value={analyst.resolutionRate}
                      empty={analyst.resolutionEligible === 0}
                    />
                  </TableCell>

                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={analyst.atRisk}
                      variant="outlined"
                      sx={{
                        minWidth: 38,
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
                    <RateChip value={analyst.score} />
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
  onClick,
}: {
  title: string;
  value: string | number;
  description: string;
  accent: string;
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
        borderRadius: 2.15,
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
          boxShadow: "0 8px 22px rgba(16,24,40,0.07)",
        },
      }}
    >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>

        <Typography
          sx={{
            mt: 0.35,
            fontSize: "1.75rem",
            lineHeight: 1,
            fontWeight: 800,
            letterSpacing: "-0.03em",
          }}
        >
          {value}
        </Typography>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 0.55 }}
        >
          {description}
        </Typography>

        <Typography
          variant="caption"
          sx={{
            display: "inline-block",
            mt: 0.7,
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
        <Typography sx={{ fontWeight: 800, fontSize: "1rem" }}>
          {title}
        </Typography>

        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>

        <Box sx={{ height: 245, mt: 1 }}>
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
                >
                  {data.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>

                <Tooltip />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11 }}
                />

                <text
                  x="50%"
                  y="46%"
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
                  y="57%"
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
}: {
  value: number;
  empty?: boolean;
}) {
  if (empty) {
    return <Chip size="small" label="—" variant="outlined" />;
  }

  const color = rateColor(value);

  return (
    <Chip
      size="small"
      label={`${value}%`}
      variant="outlined"
      sx={{
        minWidth: 56,
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