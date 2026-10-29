import { KpiGrid } from "../components/KpiGrid";
import { KpiCard as ExecutiveKpiCard } from "../components/KpiCard";
import { useEffect,useRef,useState } from "react";
import type { ReactNode } from "react";
import { Alert,Box,Button,Card,CardContent,Chip,LinearProgress,MenuItem,Stack,TextField,Tooltip,Typography,useTheme } from "@mui/material";
import { AutoGraphOutlined,HubOutlined,PsychologyOutlined,SearchOutlined,TrendingUpOutlined } from "@mui/icons-material";
import { Bar,BarChart,CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip as ChartTooltip,XAxis,YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { api,getApiErrorMessage } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { aliareColors } from "../theme/theme";
import { useVisiblePolling } from "../hooks/useVisiblePolling";

type Data={
  generatedAt:string;periodDays:number;scope:{name:string;description:string};
  summary:{tickets:number;azureItems:number;linkCoverage:number;classificationCoverage:number;versionCoverage:number;anomalies:number;clusters:number};
  trends:{monthly:Array<{month:string;total:number}>;services:Array<{name:string;total:number}>;clients:Array<{name:string;total:number}>;versions:Array<{name:string;total:number}>};
  anomalies:Array<{name:string;total:number;previous:number;delta:number}>;
  clusters:Array<{service:string;client:string;version:string;cases:number;tickets:number[]}>;
  signals:Array<{severity:string;title:string;detail:string;query?:string;path?:string}>;
  observability:{sources:Array<{key:string;label:string;status:"healthy"|"syncing"|"attention"|"unknown";lastSyncAt:string|null;items:number;errors:number;detail:string}>;warning:string};
  health:{score:number;formula:string;components:Array<{key:string;label:string;score:number;weight:number}>};
  technicalDna:{topServices:Array<{name:string;total:number;share:number}>;topClients:Array<{name:string;total:number;share:number}>;topVersions:Array<{name:string;total:number;share:number}>;recurrenceIndex:number;evidenceQuality:number};
};

export function Intelligence(){
  const navigate=useNavigate(),theme=useTheme();
  const [period,setPeriod]=useState("month"),[data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[refreshVersion,setRefreshVersion]=useState(0);
  const loadedOnce=useRef(false);
  const days=period==="month"?30:Number(period);
  useVisiblePolling(()=>setRefreshVersion((value)=>value+1),120_000);
  useEffect(()=>{const controller=new AbortController();if(!loadedOnce.current)setLoading(true);setError("");api.get<Data>("/intelligence/overview",{params:{days,period:period==="month"?period:undefined},signal:controller.signal}).then(r=>{if(!controller.signal.aborted){loadedOnce.current=true;setData(r.data)}}).catch(e=>{if(!controller.signal.aborted)setError(getApiErrorMessage(e,"Não foi possível carregar a inteligência operacional."));}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort();},[days,period,refreshVersion]);
  const panel={border:"1px solid",borderColor:"divider",borderRadius:3,background:theme.palette.mode==="dark"?"linear-gradient(145deg,rgba(12,31,55,.96),rgba(8,22,40,.98))":"linear-gradient(145deg,#fff,#f8fbff)",boxShadow:theme.palette.mode==="dark"?"0 18px 44px rgba(0,0,0,.18)":"0 14px 34px rgba(30,64,175,.06)"} as const;
  const openInvestigation=(q:string)=>navigate(`/investigacao?q=${encodeURIComponent(q)}`);
  return <Box sx={{pb:4}}>
    <PageHeader eyebrow="Inteligência 2.1" title="Central de Inteligência" description="Correlação, recorrência e sinais operacionais para transformar dados do suporte em evidências acionáveis." meta={data?`${data.periodDays} dias · atualizado ${new Date(data.generatedAt).toLocaleString("pt-BR")}`:undefined}/>
    <Stack direction={{xs:"column",sm:"row"}} spacing={1.5} sx={{mb:2,alignItems:{sm:"center"}}}><Chip label={data?data.scope.name:"Carteira SIMER"} color="success" variant="outlined" sx={{fontWeight:800}}/><TextField select size="small" label="Período" value={period} onChange={e=>setPeriod(String(e.target.value))} sx={{minWidth:190}}><MenuItem value="month">Este mês</MenuItem><MenuItem value="30">30 dias</MenuItem><MenuItem value="90">90 dias</MenuItem><MenuItem value="180">6 meses</MenuItem><MenuItem value="365">12 meses</MenuItem></TextField><Button startIcon={<SearchOutlined/>} onClick={()=>navigate("/investigacao")} variant="outlined">Investigar assunto</Button><Button startIcon={<PsychologyOutlined/>} onClick={()=>navigate("/problemas-conhecidos")} variant="outlined">Problemas conhecidos</Button></Stack>
    {loading&&<LinearProgress sx={{mb:2}}/>}{error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
    {data&&<><KpiGrid sx={{mb:2}}>
      <Metric title="Tickets analisados" value={data.summary.tickets} detail="Base do período" icon={<HubOutlined/>}/>
      <Metric title="Vínculo Azure" value={`${data.summary.linkCoverage}%`} detail={`${data.summary.azureItems} Work Items no período`} icon={<AutoGraphOutlined/>}/>
      <Metric title="Classificação" value={`${data.summary.classificationCoverage}%`} detail="Categoria ou causa informada" icon={<PsychologyOutlined/>}/>
      <Metric title="Anomalias" value={data.summary.anomalies} detail="Aumentos relevantes detectados" icon={<TrendingUpOutlined/>}/>
      <Metric title="Clusters" value={data.summary.clusters} detail="Padrões recorrentes" icon={<HubOutlined/>}/>
    </KpiGrid>
    {data.signals.length>0&&<Card elevation={0} sx={{...panel,mb:2,borderColor:"rgba(245,158,11,.28)"}}><CardContent><Typography sx={{fontWeight:850,fontSize:"1.05rem",mb:1.5}}>Radar de sinais</Typography><Stack spacing={1}>{data.signals.map((s,i)=><Button key={i} onClick={()=>s.query?openInvestigation(s.query):s.path?navigate(s.path):undefined} sx={{justifyContent:"flex-start",textAlign:"left",textTransform:"none",p:1.25,borderRadius:2,color:"text.primary","&:hover":{bgcolor:"action.hover"}}}><Box><Stack direction="row" spacing={1} sx={{alignItems:"center"}}><Chip size="small" label={s.severity==="high"?"Prioridade":"Atenção"} color={s.severity==="high"?"error":"warning"}/><Typography sx={{fontWeight:800}}>{s.title}</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{mt:.5}}>{s.detail}</Typography></Box></Button>)}</Stack></CardContent></Card>}
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"1.05fr .95fr"},gap:2,mb:2}}>
      <Card elevation={0} sx={panel}><CardContent><Typography sx={{fontWeight:850}}>Evolução da demanda</Typography><Typography variant="body2" color="text.secondary" sx={{mb:2}}>Volume mensal dentro do recorte selecionado.</Typography><Box sx={{height:290}}><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trends.monthly}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month"/><YAxis allowDecimals={false}/><ChartTooltip/><Line type="linear" dataKey="total" stroke={aliareColors.green} strokeWidth={3} dot={{r:3}}/></LineChart></ResponsiveContainer></Box></CardContent></Card>
      <Card elevation={0} sx={panel}><CardContent><Typography sx={{fontWeight:850}}>Serviços com maior demanda</Typography><Typography variant="body2" color="text.secondary" sx={{mb:2}}>Clique no gráfico para aprofundar pela Central de Investigação.</Typography><Box sx={{height:290}}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.trends.services.slice(0,7)} layout="vertical" margin={{left:20}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={130} tick={{fontSize:11}}/><ChartTooltip/><Bar dataKey="total" fill={aliareColors.info} radius={[0,7,7,0]} onClick={(row:any)=>row?.name&&openInvestigation(row.name)}/></BarChart></ResponsiveContainer></Box></CardContent></Card>
    </Box>
    <Card elevation={0} sx={{...panel,mb:2,overflow:"hidden"}}><CardContent>
      <Stack direction={{xs:"column",md:"row"}} sx={{justifyContent:"space-between",gap:2,mb:1.5}}><Box><Typography sx={{fontWeight:900,fontSize:"1.08rem"}}>Confiabilidade das fontes</Typography><Typography variant="body2" color="text.secondary">Estado das sincronizações que sustentam os diagnósticos desta central.</Typography></Box><Button size="small" variant="outlined" onClick={()=>navigate("/sincronizacao")}>Abrir sincronização</Button></Stack>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(2,1fr)",xl:"repeat(4,1fr)"},gap:1}}>{data.observability.sources.map(source=><Box key={source.key} sx={{p:1.15,border:"1px solid",borderColor:"divider",borderRadius:2,bgcolor:"background.paper"}}><Stack direction="row" sx={{justifyContent:"space-between",gap:1,alignItems:"center"}}><Typography variant="body2" sx={{fontWeight:850}}>{source.label}</Typography><Chip size="small" color={source.status==="healthy"?"success":source.status==="syncing"?"info":source.status==="attention"?"warning":"default"} label={source.status==="healthy"?"Saudável":source.status==="syncing"?"Sincronizando":source.status==="attention"?"Atenção":"Sem evidência"}/></Stack><Typography variant="caption" color="text.secondary" sx={{display:"block",mt:.7}}>{source.items.toLocaleString("pt-BR")} registro(s) · {source.errors} erro(s)</Typography><Typography variant="caption" color="text.secondary" sx={{display:"block"}}>{source.lastSyncAt?`Atualizado ${new Date(source.lastSyncAt).toLocaleString("pt-BR")}`:"Sem data de sincronização"}</Typography></Box>)}</Box>
      <Alert severity="info" variant="outlined" sx={{mt:1.2}}>{data.observability.warning}</Alert>
    </CardContent></Card>
    <Card elevation={0} sx={{...panel,mb:2,overflow:"hidden"}}><CardContent>
      <Stack direction={{xs:"column",md:"row"}} sx={{justifyContent:"space-between",gap:2,mb:1.5}}><Box><Typography sx={{fontWeight:900,fontSize:"1.08rem"}}>Saúde operacional explicável</Typography><Typography variant="body2" color="text.secondary">Composição objetiva da confiabilidade e estabilidade do período. Passe pelos componentes para entender o cálculo.</Typography></Box><Tooltip title={data.health.formula}><Chip label={`${data.health.score}% · ${data.health.score>=85?"Estável":data.health.score>=70?"Atenção":"Crítico"}`} color={data.health.score>=85?"success":data.health.score>=70?"warning":"error"}/></Tooltip></Stack>
      <KpiGrid>{data.health.components.map((item,index)=><ExecutiveKpiCard key={`${item.key}-${index}`} title={item.label} value={`${item.score}%`} subtitle={`${item.weight}% de peso no índice`} info={data.health.formula} progress={item.score}/>)}</KpiGrid>
    </CardContent></Card>
    <Card elevation={0} sx={{...panel,mb:2,overflow:"hidden"}}><CardContent>
      <Stack direction={{xs:"column",md:"row"}} sx={{justifyContent:"space-between",gap:2,mb:2}}>
        <Box><Typography sx={{fontWeight:900,fontSize:"1.08rem"}}>DNA Técnico da operação</Typography><Typography variant="body2" color="text.secondary">Assinatura explicável do período baseada em recorrência, concentração e qualidade das evidências.</Typography></Box>
        <Stack direction="row" spacing={1}><Chip label={`Recorrência ${data.technicalDna.recurrenceIndex}%`} variant="outlined"/><Chip label={`Evidência ${data.technicalDna.evidenceQuality}%`} color={data.technicalDna.evidenceQuality>=75?"success":"warning"}/></Stack>
      </Stack>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(3,1fr)"},gap:2}}>
        <DnaColumn title="Serviços dominantes" rows={data.technicalDna.topServices} onOpen={openInvestigation}/>
        <DnaColumn title="Clientes com maior sinal" rows={data.technicalDna.topClients} onOpen={openInvestigation}/>
        <DnaColumn title="Versões presentes" rows={data.technicalDna.topVersions} onOpen={openInvestigation}/>
      </Box>
    </CardContent></Card>
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"1fr 1fr"},gap:2}}>
      <Card elevation={0} sx={panel}><CardContent><Typography sx={{fontWeight:850,mb:.5}}>Anomalias detectadas</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1.5}}>Compara o período atual com uma janela anterior de mesmo tamanho.</Typography><Stack spacing={1}>{data.anomalies.length?data.anomalies.map(a=><Button key={a.name} onClick={()=>openInvestigation(a.name)} sx={{textTransform:"none",justifyContent:"space-between",p:1.2,borderRadius:2,color:"text.primary","&:hover":{bgcolor:"action.hover"}}}><Box sx={{textAlign:"left",minWidth:0}}><Typography sx={{fontWeight:750,overflow:"hidden",textOverflow:"ellipsis"}}>{a.name}</Typography><Typography variant="caption" color="text.secondary">{a.total} agora · {a.previous} anteriormente</Typography></Box><Chip label={`+${a.delta}%`} size="small" color={a.delta>=100?"error":"warning"}/></Button>):<Alert severity="success">Nenhuma anomalia relevante neste período.</Alert>}</Stack></CardContent></Card>
      <Card elevation={0} sx={panel}><CardContent><Typography sx={{fontWeight:850,mb:.5}}>Clusters recorrentes</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1.5}}>Concentrações de serviço, cliente e versão encontradas automaticamente.</Typography><Stack spacing={1}>{data.clusters.map((c,i)=><Button key={i} onClick={()=>openInvestigation([c.service,c.client].join(" "))} sx={{textTransform:"none",justifyContent:"flex-start",textAlign:"left",p:1.2,borderRadius:2,color:"text.primary","&:hover":{bgcolor:"action.hover"}}}><Box sx={{minWidth:0,width:"100%"}}><Stack direction="row" sx={{justifyContent:"space-between",gap:1}}><Typography sx={{fontWeight:750,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.service}</Typography><Chip size="small" label={`${c.cases} casos`}/></Stack><Typography variant="caption" color="text.secondary">{c.client} · {c.version}</Typography></Box></Button>)}</Stack></CardContent></Card>
    </Box></>}
  </Box>;
}

function DnaColumn({title,rows,onOpen}:{title:string;rows:Array<{name:string;total:number;share:number}>;onOpen:(q:string)=>void}){
  return <Box sx={{p:1.5,borderRadius:2.5,bgcolor:"action.hover",minWidth:0}}><Typography variant="caption" color="text.secondary" sx={{fontWeight:800,textTransform:"uppercase",letterSpacing:".06em"}}>{title}</Typography><Stack spacing={1.2} sx={{mt:1.2}}>{rows.length?rows.slice(0,5).map(row=><Box key={row.name} onClick={()=>onOpen(row.name)} sx={{cursor:"pointer"}}><Stack direction="row" sx={{justifyContent:"space-between",gap:1,mb:.4}}><Typography variant="body2" sx={{fontWeight:750,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{row.total} · {row.share}%</Typography></Stack><LinearProgress variant="determinate" value={Math.min(100,row.share)} sx={{height:5,borderRadius:99}}/></Box>):<Typography variant="body2" color="text.secondary">Sem evidências suficientes.</Typography>}</Stack></Box>;
}

function Metric({title,value,detail,icon}:{title:string;value:string|number;detail:string;icon:ReactNode}){
  return <ExecutiveKpiCard title={title} value={value} subtitle={detail} icon={icon} />;
}
