import { AssignmentLateOutlined, BlockOutlined, GroupsOutlined, PriorityHighOutlined, ScheduleOutlined, WarningAmberOutlined } from "@mui/icons-material";
import { Alert, Box, Chip, CircularProgress, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { createElement, useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";

type Data = { generatedAt: string; indicators: Record<string, number>; workload: Array<{ analyst: string; tickets: number; workItems: number; total: number }>; integrations: Record<string, { configured: boolean; connected: boolean; items: number }>; microsoft: { connected: boolean; plannerTasks: Array<{ id: string; title: string; percentComplete: number; dueDateTime?: string }>; events: Array<{ id: string; subject: string; start?: { dateTime?: string } }>; teams: Array<{ id: string; displayName: string }>; warnings: string[] } };

export function Coordination() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.get<Data>("/coordination/summary").then((response) => setData(response.data)).catch((requestError) => setError(requestError?.response?.data?.error || "Não foi possível carregar a central.")); }, []);
  const maximum = useMemo(() => Math.max(...(data?.workload.map((item) => item.total) ?? [1]), 1), [data]);
  const cards: Array<[string, number, ElementType]> = data ? [
    ["Backlog atual", data.indicators.openTickets, GroupsOutlined], ["Críticos", data.indicators.criticalTickets, PriorityHighOutlined],
    ["Sem movimento 72h", data.indicators.staleTickets, WarningAmberOutlined], ["Vencem em 7 dias", data.indicators.dueSoon, ScheduleOutlined],
    ["Itens bloqueados", data.indicators.blockedItems, BlockOutlined], ["Sem responsável", data.indicators.unassignedItems, AssignmentLateOutlined],
  ] : [];
  return <Stack spacing={2.5}>
    <PageHeader eyebrow="Gestão" title="Central de Coordenação" description="Capacidade, riscos e distribuição operacional para apoiar decisões do Tech Lead." />
    {error && <Alert severity="error">{error}</Alert>}
    {!data ? <Box sx={{ minHeight: 300, display: "grid", placeItems: "center" }}><CircularProgress /></Box> : <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", lg: "repeat(3,1fr)" }, gap: 2 }}>{cards.map(([label, value, icon]) => <Paper key={label} variant="outlined" sx={{ p: 2 }}><Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}><Box><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h4" sx={{ fontWeight: 900 }}>{String(value)}</Typography></Box>{createElement(icon)}</Stack></Paper>)}</Box>
      <Paper variant="outlined" sx={{ p: 2.5 }}><Typography variant="h6" sx={{ fontWeight: 850, mb: 2 }}>Carga consolidada por analista</Typography><Stack spacing={2}>{data.workload.map((item) => <Box key={item.analyst}><Stack direction="row" sx={{ justifyContent: "space-between", mb: .5 }}><Typography sx={{ fontWeight: 750 }}>{item.analyst}</Typography><Typography variant="body2">{item.tickets} tickets · {item.workItems} itens Azure</Typography></Stack><LinearProgress variant="determinate" value={item.total / maximum * 100} sx={{ height: 8, borderRadius: 5 }} /></Box>)}{!data.workload.length && <Typography color="text.secondary">Nenhuma carga pendente localizada.</Typography>}</Stack></Paper>
      <Paper variant="outlined" sx={{ p: 2.5 }}><Typography variant="h6" sx={{ fontWeight: 850, mb: 1.5 }}>Integrações Microsoft 365</Typography><Stack direction={{ xs: "column", sm: "row" }} spacing={1}>{Object.entries(data.integrations).map(([name, integration]) => <Chip key={name} label={`${name}: ${integration.connected ? `${integration.items} item(ns)` : integration.configured ? "conecte sua conta" : "aguardando configuração"}`} color={integration.connected ? "success" : "default"} variant="outlined" />)}</Stack>{data.microsoft.warnings.map((warning) => <Alert key={warning} severity="warning" sx={{ mt: 1.5 }}>{warning}</Alert>)}<Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>A leitura é delegada à conta conectada e respeita o acesso que o usuário já possui no Microsoft 365.</Typography></Paper>
    </>}
  </Stack>;
}
