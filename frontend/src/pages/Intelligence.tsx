import { useEffect,useState } from "react";
import { Alert,Box,Button,Card,CardContent,Chip,LinearProgress,MenuItem,Stack,TextField,Typography,useTheme } from "@mui/material";
import { AutoGraphOutlined,HubOutlined,PsychologyOutlined,SearchOutlined,TrendingUpOutlined } from "@mui/icons-material";
import { Bar,BarChart,CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip as ChartTooltip,XAxis,YAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { api,getApiErrorMessage } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { aliareColors } from "../theme/theme";

type Data={
  generatedAt:string;periodDays:number;
  summary:{tickets:number;azureItems:number;linkCoverage:number;classificationCoverage:number;versionCoverage:number;anomalies:number;clusters:number};
  trends:{monthly:Array<{month:string;total:number}>;services:Array<{name:string;total:number}>;clients:Array<{name:string;total:number}>;versions:Array<{name:string;total:number}>};
  anomalies:Array<{name:string;total:number;previous:number;delta:number}>;
  clusters:Array<{service:string;client:string;version:string;cases:number;tickets:number[]}>;
  signals:Array<{severity:string;title:string;detail:string;query?:string;path?:string}>;
};

export function Intelligence(){
  const navigate=useNavigate(),theme=useTheme();
  const [days,setDays]=useState(90),[data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError("");api.get<Data>("/intelligence/overview",{params:{days},signal:controller.signal}).then(r=>setData(r.data)).catch(e=>{if(!controller.signal.aborted)setError(getApiErrorMessage(e,"Não foi possível carregar a inteligência operacional."));}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort();},[days]);
  const panel={border:"1px solid",borderColor:"divider",borderRadius:3,background:theme.palette.mode==="dark"?"linear-gradient(145deg,rgba(12,31,55,.96),rgba(8,22,40,.98))":"linear-gradient(145deg,#fff,#f8fbff)",boxShadow:theme.palette.mode==="dark"?"0 18px 44px rgba(0,0,0,.18)":"0 14px 34px rgba(30,64,175,.06)"} as const;
  const openInvestigation=(q:string)=>navigate(`/investigacao?q=${encodeURIComponent(q)}`);
  return <Box sx={{pb:4}}>
    <PageHeader eyebrow="Inteligência 2.1" title="Central de Inteligência" description="Correlação, recorrência e sinais operacionais para transformar dados do suporte em evidências acionáveis." meta={data?`${data.periodDays} dias · atualizado ${new Date(data.generatedAt).toLocaleString("pt-BR")}`:undefined}/>
    <Stack direction={{xs:"column",sm:"row"}} spacing={1.5} sx={{mb:2,alignItems:{sm:"center"}}}><TextField select size="small" label="Período" value={days} onChange={e=>setDays(Number(e.target.value))} sx={{minWidth:190}}><MenuItem value={30}>30 dias</MenuItem><MenuItem value={90}>90 dias</MenuItem><MenuItem value={180}>6 meses</MenuItem><MenuItem value={365}>12 meses</MenuItem></TextField><Button startIcon={<SearchOutlined/>} onClick={()=>navigate("/investigacao")} variant="outlined">Investigar assunto</Button><Button startIcon={<PsychologyOutlined/>} onClick={()=>navigate("/problemas-conhecidos")} variant="outlined">Problemas conhecidos</Button></Stack>
    {loading&&<LinearProgress sx={{mb:2}}/>}{error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
    {data&&<><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(2,1fr)",xl:"repeat(5,1fr)"},gap:1.5,mb:2}}>
      <Metric title="Tickets analisados" value={data.summary.tickets} detail="Base do período" icon={<HubOutlined/>}/>
      <Metric title="Vínculo Azure" value={`${data.summary.linkCoverage}%`} detail={`${data.summary.azureItems} Work Items no período`} icon={<AutoGraphOutlined/>}/>
      <Metric title="Classificação" value={`${data.summary.classificationCoverage}%`} detail="Categoria ou causa informada" icon={<PsychologyOutlined/>}/>
      <Metric title="Anomalias" value={data.summary.anomalies} detail="Aumentos relevantes detectados" icon={<TrendingUpOutlined/>}/>
      <Metric title="Clusters" value={data.summary.clusters} detail="Padrões recorrentes" icon={<HubOutlined/>}/>
    </Box>
    {data.signals.length>0&&<Card elevation={0} sx={{...panel,mb:2,borderColor:"rgba(245,158,11,.28)"}}><CardContent><Typography sx={{fontWeight:850,fontSize:"1.05rem",mb:1.5}}>Radar de sinais</Typography><Stack spacing={1}>{data.signals.map((s,i)=><Button key={i} onClick={()=>s.query?openInvestigation(s.query):s.path?navigate(s.path):undefined} sx={{justifyContent:"flex-start",textAlign:"left",textTransform:"none",p:1.25,borderRadius:2,color:"text.primary","&:hover":{bgcolor:"action.hover"}}}><Box><Stack direction="row" spacing={1} sx={{alignItems:"center"}}><Chip size="small" label={s.severity==="high"?"Prioridade":"Atenção"} color={s.severity==="high"?"error":"warning"}/><Typography sx={{fontWeight:800}}>{s.title}</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{mt:.5}}>{s.detail}</Typography></Box></Button>)}</Stack></CardContent></Card>}
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"1.05fr .95fr"},gap:2,mb:2}}>
      <Card elevation={0} sx={panel}><CardContent><Typography sx={{fontWeight:850}}>Evolução da demanda</Typography><Typography variant="body2" color="text.secondary" sx={{mb:2}}>Volume mensal dentro do recorte selecionado.</Typography><Box sx={{height:290}}><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trends.monthly}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month"/><YAxis allowDecimals={false}/><ChartTooltip/><Line type="monotone" dataKey="total" stroke={aliareColors.green} strokeWidth={3} dot={{r:3}}/></LineChart></ResponsiveContainer></Box></CardContent></Card>
      <Card elevation={0} sx={panel}><CardContent><Typography sx={{fontWeight:850}}>Serviços com maior demanda</Typography><Typography variant="body2" color="text.secondary" sx={{mb:2}}>Clique no gráfico para aprofundar pela Central de Investigação.</Typography><Box sx={{height:290}}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.trends.services.slice(0,7)} layout="vertical" margin={{left:20}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={130} tick={{fontSize:11}}/><ChartTooltip/><Bar dataKey="total" fill={aliareColors.info} radius={[0,7,7,0]} onClick={(row:any)=>row?.name&&openInvestigation(row.name)}/></BarChart></ResponsiveContainer></Box></CardContent></Card>
    </Box>
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"1fr 1fr"},gap:2}}>
      <Card elevation={0} sx={panel}><CardContent><Typography sx={{fontWeight:850,mb:.5}}>Anomalias detectadas</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1.5}}>Compara o período atual com uma janela anterior de mesmo tamanho.</Typography><Stack spacing={1}>{data.anomalies.length?data.anomalies.map(a=><Button key={a.name} onClick={()=>openInvestigation(a.name)} sx={{textTransform:"none",justifyContent:"space-between",p:1.2,borderRadius:2,color:"text.primary","&:hover":{bgcolor:"action.hover"}}}><Box sx={{textAlign:"left",minWidth:0}}><Typography sx={{fontWeight:750,overflow:"hidden",textOverflow:"ellipsis"}}>{a.name}</Typography><Typography variant="caption" color="text.secondary">{a.total} agora · {a.previous} anteriormente</Typography></Box><Chip label={`+${a.delta}%`} size="small" color={a.delta>=100?"error":"warning"}/></Button>):<Alert severity="success">Nenhuma anomalia relevante neste período.</Alert>}</Stack></CardContent></Card>
      <Card elevation={0} sx={panel}><CardContent><Typography sx={{fontWeight:850,mb:.5}}>Clusters recorrentes</Typography><Typography variant="body2" color="text.secondary" sx={{mb:1.5}}>Concentrações de serviço, cliente e versão encontradas automaticamente.</Typography><Stack spacing={1}>{data.clusters.map((c,i)=><Button key={i} onClick={()=>openInvestigation([c.service,c.client].join(" "))} sx={{textTransform:"none",justifyContent:"flex-start",textAlign:"left",p:1.2,borderRadius:2,color:"text.primary","&:hover":{bgcolor:"action.hover"}}}><Box sx={{minWidth:0,width:"100%"}}><Stack direction="row" sx={{justifyContent:"space-between",gap:1}}><Typography sx={{fontWeight:750,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.service}</Typography><Chip size="small" label={`${c.cases} casos`}/></Stack><Typography variant="caption" color="text.secondary">{c.client} · {c.version}</Typography></Box></Button>)}</Stack></CardContent></Card>
    </Box></>}
  </Box>;
}

function Metric({title,value,detail,icon}:{title:string;value:string|number;detail:string;icon:React.ReactNode}){
  return <Card elevation={0} sx={{border:"1px solid",borderColor:"divider",borderRadius:3,height:"100%",transition:"transform .16s ease, box-shadow .16s ease","&:hover":{transform:"translateY(-2px)",boxShadow:"0 12px 30px rgba(15,23,42,.08)"}}}><CardContent><Stack direction="row" sx={{alignItems:"center",justifyContent:"space-between",mb:1}}><Typography variant="body2" color="text.secondary" sx={{fontWeight:700}}>{title}</Typography><Box sx={{display:"flex",color:"primary.main"}}>{icon}</Box></Stack><Typography sx={{fontSize:"1.8rem",fontWeight:900,lineHeight:1.1}}>{value}</Typography><Typography variant="caption" color="text.secondary">{detail}</Typography></CardContent></Card>;
}
