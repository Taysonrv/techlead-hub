import {
  GroupsOutlined,
  InfoOutlined,
  RadarOutlined,
  CloseOutlined,
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
  Divider,
  IconButton,
  LinearProgress,
  useTheme,
  Tooltip,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KpiCard } from "../components/KpiCard";
import { ExportTicketsButton } from "../components/ExportTicketsButton";
import { DetailFieldGrid, DetailPanelHeader, DetailSection } from "../components/DetailPanel";
import { detailDrawerPaperSx } from "../theme/layoutTokens";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

type Data = {
  generatedAt: string;
  indicators: Record<string, number>;
  workload: Array<{ analyst: string; tickets: number; workItems: number; total: number }>;
  serviceAnalytics: {
    totalOpenTickets: number; classifiedServices: number; specificServices: number; withoutService: number;
    genericService: number; suspectedMismatch: number; classificationRate: number; catalogSize: number; periodDays?: number;
    ranking: Array<{ service: string; count: number }>;
    genericRanking?: Array<{ service: string; count: number }>;
    moduleRanking: Array<{ module: string; count: number }>;
    clientQuality: Array<{ client: string; total: number; issues: number; rate: number }>;
    analystQuality: Array<{ analyst: string; total: number; issues: number; rate: number }>;
  };
  integrations: Record<string, { configured: boolean; connected: boolean; items: number }>;
  scope: { coordinator: string; analysts: string[]; clients: string[] };
  intelligence: {
    health: "critical" | "attention" | "stable";
    medianLoad: number;
    overloadedAnalysts: Array<{ analyst: string; tickets: number; workItems: number; total: number }>;
    priorities: Array<{ key: string; kind: DetailKind; severity: "critical" | "high" | "medium"; title: string; count: number; description: string; action: string }>;
  };
  microsoft: {
    connected: boolean;
    plannerTasks: Array<{ id: string; title: string; percentComplete: number; dueDateTime?: string }>;
    events: Array<{ id: string; subject: string; start?: { dateTime?: string } }>;
    teams: Array<{ id: string; displayName: string }>;
    warnings: string[];
  };
};

type DetailKind = "backlog" | "critical" | "stale" | "dueSoon" | "overdue" | "blocked" | "unassigned" | "analyst" | "service" | "serviceModule" | "serviceClient" | "serviceAnalyst";
type DetailData = {
  kind: DetailKind; analyst: string | null; total: number; loaded?: number; truncated: boolean;
  tickets: Array<{ movideskId: number; subject: string; status: string; urgency: string | null; client: string | null; owner: string | null; lastUpdate: string | null; dueDate: string | null; taskNumber: number | null; registeredVersion: string | null; deliveredVersion: string | null; service: string | null; serviceFirstLevel: string | null; serviceSecondLevel: string | null; serviceThirdLevel: string | null; category: string | null; cause: string | null }>;
  workItems: Array<{ id: number; workItemType: string; title: string; state: string; client: string | null; assignedToName: string | null; createdByName: string | null; criticality: string | null; blockedProcess: boolean | null; movideskTicket: number | null; registeredVersion: string | null; deliveredVersion: string | null; azureChangedAt: string | null; remoteUrl: string | null }>;
};

function MetricInfo({ title, text }: { title: string; text: string }) {
  return <Tooltip title={<Box><Typography variant="caption" sx={{fontWeight:900,display:"block",mb:.4}}>{title}</Typography><Typography variant="caption">{text}</Typography></Box>} arrow placement="top"><IconButton size="small" aria-label={`Como é calculado: ${title}`} sx={{p:.25,color:"text.secondary"}}><InfoOutlined sx={{fontSize:16}} /></IconButton></Tooltip>;
}

export function Coordination() {
  const navigate = useNavigate();
  const theme = useTheme();
  const [data, setData] = useState<Data | null>(null);
  const [slaFlow, setSlaFlow] = useState<any | null>(null);
  const [slaDrilldown, setSlaDrilldown] = useState<{title:string;ids:number[]}|null>(null);
  const [capacity, setCapacity] = useState<{ days: number; businessDays: number; hoursPerDay: number; expectedHours: number; registeredHours: number; coverageRate: number | null; analysts: Array<{ analyst: string; expectedHours: number; registeredHours: number; coverageRate: number | null }> } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailError, setDetailError] = useState("");
  const [details, setDetails] = useState<DetailData | null>(null);
  const [serviceDays, setServiceDays] = useState(0);
  const [slaDays, setSlaDays] = useState(180);
  const [slaChartMode, setSlaChartMode] = useState<"hours" | "compliance">("hours");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get<Data>("/coordination/summary", { params: { serviceDays } });
      setData(response.data);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || "Não foi possível carregar a central.");
    } finally {
      setLoading(false);
    }
  }, [serviceDays]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api.get("/coordination/productivity-capacity", { params: { days: 28 } })
      .then((response) => setCapacity(response.data))
      .catch(() => setCapacity(null));
  }, []);

  useEffect(() => {
    api.get("/coordination/sla-development", { params: { days: slaDays } })
      .then((response) => setSlaFlow(response.data))
      .catch(() => setSlaFlow(null));
  }, [slaDays]);

  const maximum = useMemo(
    () => Math.max(...(data?.workload.map((item) => item.total) ?? [1]), 1),
    [data],
  );

  const cards: Array<[DetailKind, string, number, string]> = data
    ? [
        ["backlog", "Backlog atual", data.indicators.openTickets, "Atendimentos abertos do escopo cooperativas."],
        ["critical", "Críticos", data.indicators.criticalTickets, "Atendimentos críticos em aberto."],
        ["stale", "Sem movimento 72h", data.indicators.staleTickets, "Tickets sem atualização há pelo menos 72 horas."],
        ["overdue", "Prazos vencidos", data.indicators.overdueTickets, "Atendimentos abertos com prazo já ultrapassado."],
        ["dueSoon", "Vencem em 7 dias", data.indicators.dueSoon, "Itens com prazo nos próximos sete dias."],
        ["blocked", "Itens bloqueados", data.indicators.blockedItems, "Tarefas Azure bloqueadas no escopo da operação."],
        ["unassigned", "Sem responsável", data.indicators.unassignedItems, "Tarefas sem responsável identificado."],
      ]
    : [];

  async function openDetails(kind: DetailKind, title: string, analyst?: string, serviceModule?: string, serviceClient?: string, serviceName?: string) {
    try {
      setDetailTitle(title); setDetails(null); setDetailError(""); setDetailLoading(true);
      const response = await api.get<DetailData>("/coordination/details", { params: { kind, analyst, serviceModule, serviceClient, serviceName, serviceDays, limit: 500 } });
      setDetails(response.data);
    } catch {
      setDetailError("Não foi possível carregar este recorte. Tente novamente.");
    } finally { setDetailLoading(false); }
  }


  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        eyebrow="Coordenação"
        title="Central da Coordenação"
        description="Gestão operacional da equipe e dos clientes cooperativas em um único ponto."
        meta={data ? `Coordenação: ${data.scope.coordinator} · ${data.scope.analysts.length} analistas · ${data.scope.clients.length} clientes cooperativas` : undefined}
      />

      <Card variant="outlined" sx={{ overflow: "hidden", borderRadius: 2.5, backgroundColor: "background.paper", mb: 2 }}>
        <Box sx={{ p: { xs: 1.5, md: 2 }, borderBottom: "1px solid", borderColor: "divider", background: theme.palette.mode === "dark" ? "linear-gradient(110deg,rgba(24,199,122,.055),rgba(47,111,237,.035),transparent)" : "linear-gradient(110deg,rgba(24,199,122,.045),rgba(47,111,237,.025),transparent)" }}>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={1.25} sx={{ justifyContent: "space-between", alignItems: { lg: "center" } }}>
            <Box>
              <Typography sx={{ fontWeight: 900, fontSize: "1rem" }}>Cockpit da coordenação</Typography>
              <Typography variant="body2" color="text.secondary">Prioridades, capacidade e governança em um único ponto. A navegação principal permanece no menu lateral.</Typography>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Button size="small" variant="outlined" onClick={() => navigate("/atencao")}>Riscos</Button>
              <Button size="small" variant="outlined" onClick={() => navigate("/qualidade-dados")}>Pendências</Button>
              <Button size="small" variant="outlined" onClick={() => navigate("/desempenho")}>Desempenho</Button>
              <Button size="small" variant="outlined" onClick={() => navigate("/lideranca-tecnica")}>Liderança</Button>
            </Stack>
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
          {slaFlow && <Card variant="outlined" sx={{mb:2}}>
            <CardContent>
              <Stack direction={{xs:"column",md:"row"}} spacing={1} sx={{justifyContent:"space-between",mb:1.5}}>
                <Box><Typography sx={{fontWeight:900}}>SLA × OLA · Suporte x Desenvolvimento</Typography><Typography variant="body2" color="text.secondary">Bugs com Task · atendimento → abertura da Task → conclusão no Azure. Os tempos usam somente horas úteis.</Typography></Box>
                <Stack direction="row" spacing={.6} useFlexGap sx={{flexWrap:"wrap",justifyContent:"flex-end"}}>
                  {[{v:30,l:"30 dias"},{v:90,l:"90 dias"},{v:180,l:"6 meses"},{v:365,l:"12 meses"}].map(p=><Chip key={p.v} clickable label={p.l} color={slaDays===p.v?"primary":"default"} variant={slaDays===p.v?"filled":"outlined"} onClick={()=>setSlaDays(p.v)}/>)}
                  <Chip label={`${slaFlow.summary.bugsWithTask} bugs com Task`} />
                </Stack>
              </Stack>
              <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr 1fr",lg:"repeat(6,1fr)"},gap:1}}>
                {[
                  ["Tempo médio até Task",slaFlow.summary.avgSupportMinutes,"Média de horas úteis entre a abertura do atendimento Movidesk e a criação da Task no Azure."],
                  ["Tempo médio Fábrica",slaFlow.summary.avgFactoryMinutes,"Média de horas úteis entre a criação da Task e sua conclusão no Azure. Considera somente Tasks concluídas."],
                  ["Tempo médio total",slaFlow.summary.avgTotalMinutes,"Média de horas úteis da abertura do atendimento até a conclusão da Task. Considera somente Tasks concluídas."],
                ].map(([label,value,info])=><Box key={String(label)} sx={{p:1.25,border:"1px solid",borderColor:"divider",borderRadius:2,backgroundColor:"background.paper"}}><Stack direction="row" sx={{alignItems:"center",justifyContent:"space-between"}}><Typography variant="caption" color="text.secondary">{label}</Typography><MetricInfo title={String(label)} text={String(info)}/></Stack><Typography sx={{fontWeight:900,fontSize:"1.2rem"}}>{formatMinutes(Number(value))}</Typography></Box>)}
                {[
                  ["OLA Suporte",slaFlow.summary.supportWithinOla,slaFlow.summary.bugsWithTask],
                  ["OLA Fábrica",slaFlow.summary.factoryWithinOla,slaFlow.summary.concluded],
                  ["SLA total",slaFlow.summary.totalWithinSla,slaFlow.summary.concluded],
                ].map(([label,value,total])=><Box key={String(label)} sx={{p:1.25,border:"1px solid",borderColor:"divider",borderRadius:2,backgroundColor:"background.paper"}}><Stack direction="row" sx={{alignItems:"center",justifyContent:"space-between"}}><Typography variant="caption" color="text.secondary">{label}</Typography><MetricInfo title={String(label)} text={label==="OLA Suporte"?"Percentual de Bugs cuja etapa atendimento → criação da Task ficou dentro do limite operacional da prioridade.":label==="OLA Fábrica"?"Percentual de Tasks concluídas cuja etapa criação → conclusão ficou dentro do limite da prioridade.":"Percentual de Tasks concluídas cujo tempo total atendimento → conclusão ficou dentro do SLA da prioridade."}/></Stack><Typography sx={{fontWeight:900,fontSize:"1.2rem"}}>{Number(total)?Math.round(Number(value)/Number(total)*1000)/10:0}%</Typography><Typography variant="caption" color="text.secondary">{value}/{total} no prazo</Typography></Box>)}
              </Box>
              {slaFlow.summary.bugsWithTask===0 && <Alert severity="info" sx={{mt:1.5}}>Nenhum Bug pôde ser correlacionado completamente entre Movidesk e Azure no período. Os indicadores de qualidade acima mostram se o bloqueio está no vínculo da Task, na data de criação do Azure ou na prioridade necessária para aplicar a regra P1–P4.</Alert>}
              <Stack direction={{xs:"column",md:"row"}} spacing={1} sx={{alignItems:{md:"center"},justifyContent:"space-between",mt:2,mb:.5}}>
                <Box><Stack direction="row" spacing={.5} sx={{alignItems:"center"}}><Typography sx={{fontWeight:850}}>Evolução mensal · Suporte × Fábrica</Typography><MetricInfo title="Evolução mensal" text="Agrupa os Bugs pelo mês em que a Task foi criada. Alterne entre horas consumidas e percentual dentro do prazo."/></Stack><Typography variant="body2" color="text.secondary">Compare as duas etapas do fluxo sem misturar tempo com percentual.</Typography></Box>
                <Stack direction="row" spacing={.6}><Chip clickable label="Horas consumidas" color={slaChartMode==="hours"?"primary":"default"} variant={slaChartMode==="hours"?"filled":"outlined"} onClick={()=>setSlaChartMode("hours")}/><Chip clickable label="% dentro do prazo" color={slaChartMode==="compliance"?"primary":"default"} variant={slaChartMode==="compliance"?"filled":"outlined"} onClick={()=>setSlaChartMode("compliance")}/></Stack>
              </Stack>
              <Stack direction="row" spacing={1.5} useFlexGap sx={{flexWrap:"wrap",mb:1}}><Stack direction="row" spacing={.6} sx={{alignItems:"center"}}><Box sx={{width:10,height:10,borderRadius:"50%",bgcolor:aliareColors.info}}/><Typography variant="caption"><strong>Suporte</strong> · atendimento → Task</Typography></Stack><Stack direction="row" spacing={.6} sx={{alignItems:"center"}}><Box sx={{width:10,height:10,borderRadius:"50%",bgcolor:aliareColors.green}}/><Typography variant="caption"><strong>Fábrica</strong> · Task → conclusão</Typography></Stack></Stack>
              <Box sx={{height:300,p:1,border:"1px solid",borderColor:"divider",borderRadius:2,backgroundColor:"background.paper"}}>
                <ResponsiveContainer width="100%" height="100%"><LineChart data={slaFlow.monthly??[]} margin={{left:4,right:18,top:8,bottom:4}}><CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" opacity={.28}/><XAxis dataKey="label" tick={{fill:theme.palette.text.secondary}}/><YAxis domain={slaChartMode==="compliance"?[0,100]:undefined} tick={{fill:theme.palette.text.secondary}} tickFormatter={(v)=>slaChartMode==="compliance"?`${v}%`:`${Math.round(v/60)}h`}/><ChartTooltip cursor={false} contentStyle={{backgroundColor:theme.palette.background.paper,border:`1px solid ${theme.palette.divider}`,borderRadius:10,color:theme.palette.text.primary,boxShadow:theme.shadows[8]}} labelStyle={{color:theme.palette.text.primary,fontWeight:800}} itemStyle={{color:theme.palette.text.primary}} formatter={(v:any,n:any)=>[slaChartMode==="compliance"?`${Number(v).toFixed(1)}%`:formatMinutes(Number(v)),String(n)]}/>{slaChartMode==="hours"?<><Line type="monotone" dataKey="avgSupportMinutes" name="Suporte · média" stroke={aliareColors.info} strokeWidth={3} dot={{r:3,fill:aliareColors.info}} activeDot={{r:6}}/><Line type="monotone" dataKey="avgFactoryMinutes" name="Fábrica · média" stroke={aliareColors.green} strokeWidth={3} dot={{r:3,fill:aliareColors.green}} activeDot={{r:6}}/></>:<><Line type="monotone" dataKey="supportWithinPct" name="OLA Suporte" stroke={aliareColors.info} strokeWidth={3} dot={{r:3,fill:aliareColors.info}}/><Line type="monotone" dataKey="factoryWithinPct" name="OLA Fábrica" stroke={aliareColors.green} strokeWidth={3} dot={{r:3,fill:aliareColors.green}}/><Line type="monotone" dataKey="totalWithinPct" name="SLA total" stroke={aliareColors.warning} strokeWidth={2} strokeDasharray="6 4"/></>}</LineChart></ResponsiveContainer>
              </Box>
              <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(3,1fr)"},gap:1,mt:1}}>
                {(slaFlow.monthly??[]).slice(-3).map((m:any)=><Box key={m.month} sx={{p:1.2,border:"1px solid",borderColor:"divider",borderRadius:2}}><Typography sx={{fontWeight:850}}>{m.label}</Typography><Typography variant="caption" color="text.secondary">{m.total} Bug(s) · {m.concluded} concluído(s)</Typography><Stack direction="row" spacing={.7} useFlexGap sx={{flexWrap:"wrap",mt:.8}}><Chip size="small" variant="outlined" label={`OLA Sup. ${m.supportWithinPct}%`}/><Chip size="small" variant="outlined" label={`OLA Fáb. ${m.factoryWithinPct}%`}/><Chip size="small" variant="outlined" label={`SLA ${m.totalWithinPct}%`}/></Stack></Box>)}
              </Box>
              <Typography sx={{fontWeight:850,mt:2,mb:.5}}>Consumo por prioridade</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1}}>Prioridades: Crítica (P1) · Alta (P2) · Média (P3) · Baixa (P4). Quanto menor o número, maior a urgência. Cada nível possui limites próprios de OLA/SLA; clique em um card para ver os Bugs responsáveis pelo consumo.</Typography>
              <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(2,1fr)",xl:"repeat(4,1fr)"},gap:1}}>
                {(slaFlow.byPriority??[]).map((p:any)=><Card key={p.priority} variant="outlined" sx={{cursor:p.total?"pointer":"default"}} onClick={()=>p.total&&setSlaDrilldown({title:`${p.priority} · SLA × OLA`,ids:p.rows})}><CardContent sx={{p:"12px !important"}}><Stack direction="row" sx={{justifyContent:"space-between",alignItems:"center"}}><Stack direction="row" spacing={.5} sx={{alignItems:"center"}}><Typography sx={{fontWeight:900}}>{p.priority==="P1"?"Crítica · P1":p.priority==="P2"?"Alta · P2":p.priority==="P3"?"Média · P3":"Baixa · P4"}</Typography><MetricInfo title={p.priority} text={p.priority==="P1"?"Prioridade crítica, com os menores limites de atendimento e desenvolvimento.":p.priority==="P2"?"Prioridade alta, para impactos relevantes que exigem resposta rápida.":p.priority==="P3"?"Prioridade média, para impactos moderados.":"Prioridade baixa, para impactos menores e maior janela de atendimento."}/></Stack><Chip size="small" label={p.total}/></Stack><Typography variant="caption" color="text.secondary">Suporte {formatMinutes(p.avgSupportMinutes)} · Fábrica {formatMinutes(p.avgFactoryMinutes)}</Typography><Box sx={{mt:1}}><Typography variant="caption">OLA Suporte: {p.total?Math.round(p.supportWithinOla/p.total*1000)/10:0}%</Typography><br/><Typography variant="caption">OLA Fábrica: {p.concluded?Math.round(p.factoryWithinOla/p.concluded*1000)/10:0}%</Typography><br/><Typography variant="caption">SLA total: {p.concluded?Math.round(p.totalWithinSla/p.concluded*1000)/10:0}%</Typography></Box><Chip sx={{mt:1}} size="small" variant="outlined" label={p.factoryBottleneck>p.supportBottleneck?"Maior consumo: Fábrica":"Maior consumo: Suporte"}/></CardContent></Card>)}
              </Box>
              <Typography sx={{fontWeight:850,mt:2,mb:.5}}>Consumo por analista</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1}}>Compara o tempo médio consumido no Suporte e na Fábrica por responsável. O SLA considera somente Tasks concluídas; clique na linha para detalhar os atendimentos.</Typography>
              <Box sx={{overflowX:"auto"}}><Box sx={{minWidth:760,display:"grid",gridTemplateColumns:"1.4fr .55fr .8fr .8fr .8fr .8fr",gap:1,alignItems:"center"}}>
                {["Analista","Bugs","Até Task","Fábrica","SLA","Maior consumo"].map(h=><Typography key={h} variant="caption" color="text.secondary" sx={{fontWeight:800}}>{h}</Typography>)}
                {(slaFlow.owners??[]).map((o:any)=><Box key={o.owner} sx={{display:"contents",cursor:"pointer"}} onClick={()=>setSlaDrilldown({title:`${o.owner} · SLA × OLA`,ids:o.rows})}><Typography sx={{fontWeight:750,py:.7}}>{o.owner}</Typography><Typography>{o.total}</Typography><Typography>{formatMinutes(o.avgSupportMinutes)}</Typography><Typography>{formatMinutes(o.avgFactoryMinutes)}</Typography><Typography>{o.concluded?Math.round(o.totalWithinSla/o.concluded*1000)/10:0}%</Typography><Chip size="small" variant="outlined" label={o.factoryBottleneck>o.supportBottleneck?"Fábrica":"Suporte"}/></Box>)}
              </Box></Box>
              {slaFlow.outliers&&<Card variant="outlined" sx={{mt:2,borderColor:slaFlow.outliers.critical?"error.light":"divider"}}><CardContent><Stack direction={{xs:"column",md:"row"}} spacing={1} sx={{justifyContent:"space-between",alignItems:{md:"center"}}}><Box><Stack direction="row" spacing={.5} sx={{alignItems:"center"}}><Typography sx={{fontWeight:850}}>Outliers · SLA × OLA</Typography><MetricInfo title="Outliers" text="Destaca Bugs que ultrapassaram pelo menos um limite da prioridade. Severidade representa o maior percentual excedente acima de 100%, sem inferir causa."/></Stack><Typography variant="body2" color="text.secondary">Priorize a investigação pelos maiores desvios, preservando a separação entre Suporte, Fábrica e SLA total.</Typography></Box><Stack direction="row" spacing={.7} useFlexGap sx={{flexWrap:"wrap"}}><Chip size="small" label={`${slaFlow.outliers.total} fora de algum limite`}/><Chip size="small" color={slaFlow.outliers.critical?"error":"default"} label={`${slaFlow.outliers.critical} acima de 2× do limite`}/></Stack></Stack><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr 1fr",md:"repeat(4,1fr)"},gap:1,mt:1.5}}>{[["OLA Suporte",slaFlow.outliers.support],["OLA Fábrica",slaFlow.outliers.factory],["SLA total",slaFlow.outliers.totalSla],["Críticos",slaFlow.outliers.critical]].map(([label,value])=><Box key={label} sx={{p:1.1,border:"1px solid",borderColor:"divider",borderRadius:2}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{fontWeight:900}}>{value}</Typography></Box>)}</Box><Stack spacing={.5} sx={{mt:1.5}}>{(slaFlow.outliers.top??[]).slice(0,8).map((r:any)=><Box key={r.movideskId} onClick={()=>setSlaDrilldown({title:`Outlier #${r.movideskId} · ${r.outlierStage}`,ids:[r.movideskId]})} sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"110px minmax(0,1fr) 120px 100px"},gap:1,alignItems:"center",p:1,borderRadius:1.5,cursor:"pointer","&:hover":{bgcolor:"action.hover"}}}><Chip size="small" color={r.severity>=100?"error":"warning"} label={`+${Math.round(r.severity)}%`}/><Box sx={{minWidth:0}}><Typography noWrap sx={{fontWeight:800}}>#{r.movideskId} · {r.subject}</Typography><Typography noWrap variant="caption" color="text.secondary">{r.client} · Task #{r.taskNumber}</Typography></Box><Chip size="small" variant="outlined" label={r.outlierStage}/><Typography variant="caption" color="text.secondary">{r.urgency}</Typography></Box>)}</Stack></CardContent></Card>}
              <Stack direction="row" spacing={.5} sx={{alignItems:"center",mt:2,mb:.25}}><Typography sx={{fontWeight:850}}>Tempo por Bug e Task</Typography><MetricInfo title="Tempo por Bug e Task" text="Azul representa o tempo útil do Suporte entre atendimento e Task. Verde representa o tempo útil da Fábrica entre Task e conclusão. Clique em qualquer barra para abrir o atendimento."/></Stack><Typography variant="body2" color="text.secondary" sx={{mb:1}}>Os números à esquerda são os <strong>IDs dos atendimentos Movidesk</strong>. Cada linha corresponde a um Bug vinculado a uma Task Azure. As barras comparam o tempo útil de Suporte e Fábrica; passe o mouse para ver a Task e clique na barra para abrir o detalhamento.</Typography><Stack direction="row" spacing={1.5} useFlexGap sx={{flexWrap:"wrap",my:1}}><Chip size="small" sx={{"& .MuiChip-icon":{color:`${aliareColors.info} !important`}}} icon={<Box sx={{width:9,height:9,borderRadius:"50%",bgcolor:aliareColors.info}}/>} label="Suporte · Atendimento → Task"/><Chip size="small" sx={{"& .MuiChip-icon":{color:`${aliareColors.green} !important`}}} icon={<Box sx={{width:9,height:9,borderRadius:"50%",bgcolor:aliareColors.green}}/>} label="Fábrica · Task → Conclusão"/></Stack><Box sx={{mt:1,height:Math.max(220,Math.min(420,(slaFlow.rows?.length??0)*30))}}>
                <ResponsiveContainer width="100%" height="100%"><BarChart data={(slaFlow.rows??[]).slice(0,12)} layout="vertical" margin={{left:10,right:18}}><CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" opacity={.35}/><XAxis type="number" tick={{fill:theme.palette.text.secondary}} tickFormatter={(v)=>`${Math.round(v/60)}h`}/><YAxis type="category" dataKey="movideskId" width={78} tick={{fill:theme.palette.text.secondary,fontWeight:700}}/><ChartTooltip cursor={false} contentStyle={{backgroundColor:theme.palette.background.paper,border:`1px solid ${theme.palette.divider}`,borderRadius:10,color:theme.palette.text.primary,boxShadow:theme.shadows[8]}} labelStyle={{color:theme.palette.text.primary,fontWeight:800}} itemStyle={{color:theme.palette.text.primary}} formatter={(v:any,n:any,p:any)=>[formatMinutes(Number(v)),`${String(n)} · Task #${p?.payload?.taskNumber??"—"}`]}/><Bar dataKey="supportMinutes" name="Suporte · Atendimento → Task" fill={aliareColors.info} radius={[0,5,5,0]} maxBarSize={16} cursor="pointer" onClick={(r:any)=>setSlaDrilldown({title:`Atendimento #${r.movideskId} · Task #${r.taskNumber}`,ids:[r.movideskId]})}/><Bar dataKey="factoryMinutes" name="Fábrica · Task → Conclusão" fill={aliareColors.green} radius={[0,5,5,0]} maxBarSize={16} cursor="pointer" onClick={(r:any)=>setSlaDrilldown({title:`Atendimento #${r.movideskId} · Task #${r.taskNumber}`,ids:[r.movideskId]})}/></BarChart></ResponsiveContainer>
              </Box>
              <Typography variant="caption" color="text.secondary">A medição usa horas úteis de Bug (seg–sex, 08:00–18:00). A Fábrica só é encerrada quando o Work Item está no status “Concluida”; itens ainda em desenvolvimento não entram no percentual concluído da Fábrica/SLA total.</Typography>
            </CardContent>
          </Card>}

          {loading || !data ? (
            <Box sx={{ minHeight: 320, display: "grid", placeItems: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={2}>
              <Card variant="outlined" sx={{ overflow: "hidden", borderColor: data.intelligence.health === "critical" ? "error.light" : data.intelligence.health === "attention" ? "warning.light" : "success.light" }}>
                <CardContent>
                  <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { lg: "center" }, mb: 1.5 }}>
                    <Box>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <RadarOutlined sx={{ color: data.intelligence.health === "critical" ? "error.main" : data.intelligence.health === "attention" ? "warning.main" : "success.main" }} />
                        <Typography variant="h6" sx={{ fontWeight: 900 }}>Prioridades de atuação</Typography>
                        <Chip
                          size="small"
                          label={data.intelligence.health === "critical" ? "Ação imediata" : data.intelligence.health === "attention" ? "Requer atenção" : "Operação estável"}
                          color={data.intelligence.health === "critical" ? "error" : data.intelligence.health === "attention" ? "warning" : "success"}
                          variant="outlined"
                        />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: .4 }}>
                        Leitura automática dos sinais operacionais para orientar a atuação da coordenação.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                      <Chip size="small" label={`Carga mediana: ${data.intelligence.medianLoad}`} variant="outlined" />
                      <Chip size="small" label={`${data.intelligence.overloadedAnalysts.length} analista(s) acima da faixa`} variant="outlined" />
                    </Stack>
                  </Stack>

                  {data.intelligence.priorities.length ? (
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2,minmax(0,1fr))", xl: "repeat(3,minmax(0,1fr))" }, gap: 1 }}>
                      {data.intelligence.priorities.map((priority) => (
                        <Button
                          key={priority.key}
                          onClick={() => void openDetails(priority.kind, priority.title)}
                          sx={{
                            justifyContent: "flex-start",
                            textAlign: "left",
                            textTransform: "none",
                            p: 1.25,
                            border: "1px solid",
                            borderColor: priority.severity === "critical" ? "error.light" : priority.severity === "high" ? "warning.light" : "divider",
                            borderRadius: 2,
                            bgcolor: priority.severity === "critical"
                              ? (theme.palette.mode === "dark" ? "rgba(239,68,68,.07)" : "rgba(239,68,68,.035)")
                              : "transparent",
                          }}
                        >
                          <Box sx={{ width: "100%" }}>
                            <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                              <Typography sx={{ fontWeight: 850, color: "text.primary" }}>{priority.title}</Typography>
                              <Chip size="small" label={priority.count} color={priority.severity === "critical" ? "error" : priority.severity === "high" ? "warning" : "default"} />
                            </Stack>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .6, lineHeight: 1.35 }}>{priority.description}</Typography>
                            <Typography variant="caption" sx={{ display: "block", mt: .65, color: "primary.main", fontWeight: 750 }}>{priority.action}</Typography>
                          </Box>
                        </Button>
                      ))}
                    </Box>
                  ) : <Alert severity="success">Nenhum sinal prioritário foi identificado no momento.</Alert>}

                  {data.intelligence.overloadedAnalysts.length > 0 && (
                    <Alert severity="warning" sx={{ mt: 1.25 }}>
                      Carga acima da faixa: {data.intelligence.overloadedAnalysts.map((item) => `${item.analyst} (${item.total})`).join(" · ")}. Avalie redistribuição considerando complexidade e contexto, não apenas quantidade.
                    </Alert>
                  )}
                </CardContent>
              </Card>

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
                    subtitle="Operação atual"
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

              <Card variant="outlined" sx={{ overflow: "hidden" }}>
                <CardContent>
                  <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { lg: "center" }, mb: 1.5 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 850 }}>Qualidade da classificação por Serviço</Typography>
                      <Typography variant="body2" color="text.secondary">Atendimentos abertos da carteira da squad (cliente ou analista da squad) e qualidade do Serviço informado no Movidesk.</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                      <Chip label={`${data.serviceAnalytics.classificationRate}% específicos`} color={data.serviceAnalytics.classificationRate >= 90 ? "success" : data.serviceAnalytics.classificationRate >= 75 ? "warning" : "error"} variant="outlined" />
                      <Chip label={`${data.serviceAnalytics.catalogSize} serviços conhecidos`} variant="outlined" />
                      <Chip label="Escopo: clientes ou analistas da squad" variant="outlined" />
                    </Stack>
                  </Stack>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, mb: 1.5 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>Período dos atendimentos abertos</Typography>
                      <Typography variant="body2" color="text.secondary">Aplicado aos indicadores, ranking, detalhamento e exportação.</Typography>
                    </Box>
                    <Stack direction="row" spacing={0.6} useFlexGap sx={{ flexWrap: "wrap" }}>
                      {[{ v: 30, l: "30 dias" }, { v: 90, l: "90 dias" }, { v: 180, l: "6 meses" }, { v: 365, l: "12 meses" }, { v: 0, l: "Todo período" }].map((period) => (
                        <Chip key={period.v} label={period.l} clickable color={serviceDays === period.v ? "primary" : "default"} variant={serviceDays === period.v ? "filled" : "outlined"} onClick={() => setServiceDays(period.v)} />
                      ))}
                    </Stack>
                  </Stack>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2,1fr)", xl: "repeat(4,1fr)" }, gap: 1.25, mb: 2 }}>
                    <KpiCard title="Com serviço específico" value={data.serviceAnalytics.specificServices} subtitle="Atendimentos abertos" info="Tickets com Serviço preenchido além dos níveis genéricos do SIMER." accent={aliareColors.green} />
                    <KpiCard title="Sem serviço" value={data.serviceAnalytics.withoutService} subtitle="Requer classificação" info="Atendimentos abertos sem Serviço identificado." onClick={() => navigate("/qualidade-dados?issue=withoutService")} accent={aliareColors.error} />
                    <KpiCard title="SIMER genérico" value={data.serviceAnalytics.genericService} subtitle="Requer revisão" info="Tickets classificados apenas como SIMER, sem rotina específica." onClick={() => navigate("/qualidade-dados?issue=genericSimerService")} accent={aliareColors.warning} />
                    <KpiCard title="Possível incorreto" value={data.serviceAnalytics.suspectedMismatch} subtitle="Sugestão assistiva" info="Serviço atual diverge de uma sugestão com evidência suficiente. Exige validação humana." onClick={() => navigate("/qualidade-dados?issue=suspectedServiceMismatch")} accent={aliareColors.info} />
                  </Box>
                  {data.serviceAnalytics.genericService > 0 && <Alert severity="warning" sx={{mb:1.5}}><strong>{data.serviceAnalytics.genericService}</strong> atendimento(s) estão apenas em níveis genéricos do SIMER e foram retirados do ranking abaixo para não distorcer a leitura das rotinas específicas. Use o card “SIMER genérico” para revisar esses casos.</Alert>}
                  {data.serviceAnalytics.ranking.length ? (
                    <Box sx={{ width: "100%", height: Math.max(220, Math.min(420, data.serviceAnalytics.ranking.length * 42 + 30)) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.serviceAnalytics.ranking} layout="vertical" margin={{ top: 4, right: 52, left: 8, bottom: 4 }}>
                          <CartesianGrid stroke={theme.palette.divider} strokeDasharray="4 4" horizontal={false} opacity={0.55} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="service" width={210} tick={{ fontSize: 10, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} tickFormatter={(value: string) => { const label = value.split("»").at(-1)?.trim() ?? value; return label.length > 28 ? `${label.slice(0, 27)}…` : label; }} />
                          <ChartTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, color: theme.palette.text.primary, boxShadow: "0 14px 36px rgba(0,0,0,.24)" }} wrapperStyle={{ outline: "none" }} cursor={{ fill: theme.palette.action.hover }} formatter={(value) => [value, "Atendimentos"]} labelFormatter={(value) => String(value)} />
                          <Bar dataKey="count" name="Atendimentos" fill={aliareColors.info} radius={[0, 6, 6, 0]} maxBarSize={28} label={{position:"right",fill:theme.palette.text.secondary,fontSize:11,fontWeight:800}} cursor="pointer" onClick={(_, index) => { const service = data.serviceAnalytics.ranking[index]?.service; if (service) void openDetails("service", `Serviço · ${service.split("»").at(-1)?.trim() ?? service}`, undefined, undefined, undefined, service); }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  ) : <Alert severity="info">Ainda não há Serviços suficientes no histórico sincronizado para montar o ranking.</Alert>}

                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "repeat(3,minmax(0,1fr))" }, gap: 1.5, mt: 2 }}>
                    <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                      <Typography sx={{ fontWeight: 850 }}>Módulos mais demandados</Typography>
                      <Typography variant="caption" color="text.secondary">Distribuição dos atendimentos abertos pelos módulos derivados do Serviço.</Typography>
                      <Stack spacing={.75} sx={{ mt: 1.25 }}>
                        {data.serviceAnalytics.moduleRanking.slice(0, 6).map((item) => (
                          <Button key={item.module} onClick={() => void openDetails("serviceModule", `Serviço · ${item.module}`, undefined, item.module)} sx={{ justifyContent: "space-between", textTransform: "none", color: "text.primary", px: .5 }}>
                            <Typography variant="body2" noWrap title={item.module}>{item.module}</Typography>
                            <Chip size="small" label={item.count} variant="outlined" />
                          </Button>
                        ))}
                        {!data.serviceAnalytics.moduleRanking.length && <Typography variant="caption" color="text.secondary">Sem módulos classificados.</Typography>}
                      </Stack>
                    </Box>

                    <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                      <Typography sx={{ fontWeight: 850 }}>Qualidade por cliente</Typography>
                      <Typography variant="caption" color="text.secondary">Clientes com maior quantidade de ausências, classificações genéricas ou divergências sugeridas.</Typography>
                      <Stack spacing={.75} sx={{ mt: 1.25 }}>
                        {data.serviceAnalytics.clientQuality.slice(0, 6).map((item) => (
                          <Button key={item.client} onClick={() => void openDetails("serviceClient", `Serviços · ${item.client}`, undefined, undefined, item.client)} sx={{ justifyContent: "space-between", textTransform: "none", color: "text.primary", px: .5 }}>
                            <Box sx={{ minWidth: 0, textAlign: "left" }}><Typography variant="body2" noWrap title={item.client}>{item.client}</Typography><Typography variant="caption" color="text.secondary">{item.issues} revisão(ões) de {item.total}</Typography></Box>
                            <Chip size="small" label={`${item.rate}%`} color={item.rate >= 90 ? "success" : item.rate >= 75 ? "warning" : "error"} variant="outlined" />
                          </Button>
                        ))}
                      </Stack>
                    </Box>

                    <Box sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                      <Typography sx={{ fontWeight: 850 }}>Qualidade por analista</Typography>
                      <Typography variant="caption" color="text.secondary">Indicador de apoio à revisão de classificação, sem avaliação individual automática.</Typography>
                      <Stack spacing={.75} sx={{ mt: 1.25 }}>
                        {data.serviceAnalytics.analystQuality.slice(0, 6).map((item) => (
                          <Button key={item.analyst} onClick={() => void openDetails("serviceAnalyst", `Serviços · ${item.analyst}`, item.analyst)} sx={{ justifyContent: "space-between", textTransform: "none", color: "text.primary", px: .5 }}>
                            <Box sx={{ minWidth: 0, textAlign: "left" }}><Typography variant="body2" noWrap title={item.analyst}>{item.analyst}</Typography><Typography variant="caption" color="text.secondary">{item.issues} revisão(ões) de {item.total}</Typography></Box>
                            <Chip size="small" label={`${item.rate}%`} color={item.rate >= 90 ? "success" : item.rate >= 75 ? "warning" : "error"} variant="outlined" />
                          </Button>
                        ))}
                      </Stack>
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              {capacity && <Card variant="outlined">
                <CardContent>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                    <Box><Typography variant="h6" sx={{ fontWeight: 850 }}>Capacidade e horas registradas</Typography><Typography variant="body2" color="text.secondary">Últimos {capacity.days} dias. A cobertura compara apontamentos Movidesk com a jornada prevista e deve ser lida junto com volume, SLA e complexidade.</Typography></Box>
                    <Button variant="outlined" onClick={() => navigate("/analistas")}>Abrir análise completa</Button>
                  </Stack>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" }, gap: 1.25, mt: 1.5 }}>
                    <KpiCard title="Horas previstas" value={`${capacity.expectedHours.toLocaleString("pt-BR")}h`} subtitle={`${capacity.businessDays} dias úteis · ${capacity.hoursPerDay}h/dia`} info="Capacidade teórica da equipe no período, antes de ajustes individuais por férias ou afastamentos." accent={aliareColors.info}/>
                    <KpiCard title="Horas registradas" value={`${capacity.registeredHours.toLocaleString("pt-BR")}h`} subtitle="Apontamentos Movidesk" info="Soma dos apontamentos de tempo encontrados nos atendimentos da equipe." accent={aliareColors.green}/>
                    <KpiCard title="Cobertura de apontamento" value={capacity.coverageRate === null ? "—" : `${capacity.coverageRate.toLocaleString("pt-BR")}%`} subtitle="Registradas ÷ previstas" info="Indicador de cobertura de registro de tempo; não representa isoladamente produtividade ou desempenho." accent={aliareColors.warning}/>
                  </Box>
                  <Stack spacing={.5} sx={{ mt: 1.25 }}>{capacity.analysts.map((item) => <Button key={item.analyst} onClick={() => navigate(`/analistas?analyst=${encodeURIComponent(item.analyst)}`)} sx={{ justifyContent: "space-between", textTransform: "none", color: "text.primary", borderBottom: "1px solid", borderColor: "divider", borderRadius: 0 }}><Typography variant="body2" sx={{ fontWeight: 700 }}>{item.analyst}</Typography><Stack direction="row" spacing={1} sx={{ alignItems: "center" }}><Typography variant="caption" color="text.secondary">{item.registeredHours.toLocaleString("pt-BR")}h / {item.expectedHours.toLocaleString("pt-BR")}h</Typography><Chip size="small" variant="outlined" label={item.coverageRate === null ? "—" : `${item.coverageRate.toLocaleString("pt-BR")}%`} /></Stack></Button>)}</Stack>
                </CardContent>
              </Card>}

              <Card variant="outlined" sx={{ overflow: "hidden" }}>
                <CardContent>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" }, mb: 1.5 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 850 }}>Distribuição da carga operacional</Typography>
                      <Typography variant="body2" color="text.secondary">Tickets e itens Azure por analista da equipe oficial.</Typography>
                    </Box>
                    <Chip label="Visão comparativa" variant="outlined" />
                  </Stack>
                  {data.workload.length ? <Box sx={{ width: "100%", height: Math.max(250, data.workload.length * 42) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.workload} layout="vertical" margin={{ top: 6, right: 18, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke={theme.palette.divider} strokeDasharray="4 4" horizontal={false} opacity={0.55} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="analyst" width={118} tick={{ fontSize: 11, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} />
                        <ChartTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${theme.palette.divider}`, background: theme.palette.background.paper, boxShadow: "0 14px 36px rgba(0,0,0,.18)" }} cursor={{ fill: theme.palette.action.hover }} />
                        <Bar dataKey="tickets" name="Tickets" stackId="load" fill={aliareColors.info} radius={[0, 0, 0, 0]} cursor="pointer" onClick={(_, index) => { const analyst = data.workload[index]?.analyst; if (analyst) void openDetails("analyst", `Carga de ${analyst}`, analyst); }} />
                        <Bar dataKey="workItems" name="Azure" stackId="load" fill={aliareColors.green} radius={[0, 6, 6, 0]} cursor="pointer" onClick={(_, index) => { const analyst = data.workload[index]?.analyst; if (analyst) void openDetails("analyst", `Carga de ${analyst}`, analyst); }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box> : <Typography color="text.secondary">Nenhuma carga pendente localizada para os analistas da equipe.</Typography>}
                </CardContent>
              </Card>

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
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                            <Typography variant="body2" color="text.secondary">
                              {item.tickets} tickets · {item.workItems} itens Azure
                            </Typography>
                            <Tooltip title="Clique para abrir o recorte operacional deste analista."><InfoOutlined sx={{ fontSize: 15, color: "text.secondary" }} /></Tooltip>
                          </Stack>
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

            </Stack>
          )}
        </CardContent>
      </Card>
      <Drawer anchor="right" open={Boolean(slaDrilldown)} onClose={()=>setSlaDrilldown(null)} slotProps={{paper:{sx:{width:{xs:"100%",sm:560},p:2}}}}><Stack direction="row" sx={{justifyContent:"space-between",alignItems:"center",mb:1}}><Box><Typography variant="h6" sx={{fontWeight:900}}>{slaDrilldown?.title}</Typography><Typography variant="body2" color="text.secondary">Atendimentos responsáveis pelo indicador selecionado.</Typography></Box><IconButton onClick={()=>setSlaDrilldown(null)}><CloseOutlined/></IconButton></Stack><Divider sx={{mb:1}} />{(slaFlow?.rows??[]).filter((r:any)=>slaDrilldown?.ids.includes(r.movideskId)).map((r:any)=><Box key={r.movideskId} onClick={()=>navigate(`/tickets?movidesk=${r.movideskId}`)} sx={{p:1.25,borderRadius:2,cursor:"pointer","&:hover":{bgcolor:"action.hover"}}}><Stack direction="row" spacing={1} sx={{alignItems:"center"}}><Chip size="small" label={r.urgency}/><Typography sx={{fontWeight:800}}>#{r.movideskId} · {r.subject}</Typography></Stack><Typography variant="caption" color="text.secondary">{r.client} · {r.owner} · Suporte {formatMinutes(r.supportMinutes)} · Fábrica {formatMinutes(r.factoryMinutes??0)} · {r.bottleneck}</Typography></Box>)}</Drawer>
      <Drawer anchor="right" open={Boolean(detailTitle)} onClose={() => { setDetailTitle(""); setDetails(null); setDetailError(""); }} slotProps={{ paper: { sx: detailDrawerPaperSx } }}>
        <DetailPanelHeader eyebrow="Coordenação" title={detailTitle || "Detalhes"} identifier={details ? `${details.total} item(ns) no recorte · ${details.loaded ?? (details.tickets.length + details.workItems.length)} carregado(s)` : undefined} onClose={() => { setDetailTitle(""); setDetails(null); setDetailError(""); }} />
        {detailLoading ? <Box sx={{ py: 8, display: "grid", placeItems: "center" }}><CircularProgress /></Box> : detailError ? <Alert severity="error" sx={{m:2}}>{detailError}</Alert> : details ? (
          <Stack spacing={2}>
            {details.truncated && <Alert severity="info">Este recorte possui {details.total} item(ns). Exibindo {details.loaded ?? (details.tickets.length + details.workItems.length)} registro(s) carregado(s).</Alert>}
            {details.tickets.length > 0 && <ExportTicketsButton tickets={details.tickets.map((ticket) => ({ ...ticket, service: [ticket.serviceFirstLevel, ticket.serviceSecondLevel, ticket.serviceThirdLevel].filter(Boolean).join(" » ") || ticket.service }))} title={detailTitle || "Recorte operacional"} subtitle="Central da Coordenação · recorte para análise" />}
            {details.tickets.length > 0 && <DetailSection title="Atendimentos Movidesk"><Stack spacing={1}>{details.tickets.map((ticket) => (
              <Button key={ticket.movideskId} variant="outlined" onClick={() => navigate(`/tickets?movidesk=${ticket.movideskId}`)} sx={{ justifyContent: "flex-start", textTransform: "none", textAlign: "left", p: 1.25 }}>
                <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 800 }}>#{ticket.movideskId} · {ticket.subject}</Typography><Typography variant="caption" color="text.secondary">{[ticket.status, ticket.urgency, ticket.client, ticket.owner].filter(Boolean).join(" · ")}</Typography>
                {(ticket.serviceThirdLevel || ticket.serviceSecondLevel || ticket.serviceFirstLevel || ticket.service) && <Typography variant="caption" color="primary.main" sx={{ display: "block", mt: .35 }}>{[ticket.serviceFirstLevel, ticket.serviceSecondLevel, ticket.serviceThirdLevel].filter(Boolean).join(" » ") || ticket.service}</Typography>}
                {(ticket.category || ticket.cause) && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{[ticket.category, ticket.cause].filter(Boolean).join(" · ")}</Typography>}</Box>
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

function formatMinutes(value:number){if(!Number.isFinite(value)||value<=0)return "0h";const h=Math.floor(value/60),m=Math.round(value%60);return m?`${h}h ${m}min`:`${h}h`;}
