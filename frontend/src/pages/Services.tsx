import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography, useTheme } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";
import { useNavigate } from "react-router-dom";

type Data = {
  periodMonths: number; total: number; specific: number; generic: number; withoutService: number; suspected: number; classificationRate: number; catalogSize: number;
  trend: Array<{ month: string; total: number; specific: number; generic: number; withoutService: number; suspected: number }>;
  ranking: Array<{ service: string; count: number }>;
  modules: Array<{ module: string; count: number }>;
  samples: Array<{ movideskId: number; subject: string; client: string | null; owner: string | null; currentService: string; suggestedService: string | null; confidence: string | null; evidence: string[]; createdDate: string }>;
  comparison: { previousTotal: number; volumeDelta: number; previousClassificationRate: number; classificationDelta: number };
  causes: Array<{ cause: string; count: number }>;
  categories: Array<{ category: string; count: number }>;
  filters: { clients: string[]; analysts: string[] };
};

export function Services() {
  const theme = useTheme(); const navigate = useNavigate();
  const [data,setData]=useState<Data|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const [client,setClient]=useState(""); const [analyst,setAnalyst]=useState(""); const [months,setMonths]=useState(6);
  const load=useCallback(async()=>{try{setLoading(true);setError("");const r=await api.get<Data>("/coordination/services",{params:{client:client||undefined,analyst:analyst||undefined,months}});setData(r.data);}catch(e:any){setError(e?.response?.data?.error||"Não foi possível carregar a inteligência de Serviços.");}finally{setLoading(false)}},[client,analyst,months]);
  useEffect(()=>{void load()},[load]);
  const tooltip={borderRadius:12,border:`1px solid ${theme.palette.divider}`,background:theme.palette.background.paper};
  return <Box sx={{pb:4}}>
    <PageHeader eyebrow="Inteligência operacional" title="Serviços SIMER" description="Análise histórica da classificação de Serviços no Movidesk, demanda por módulo e oportunidades de melhoria na qualidade dos atendimentos." meta={data?`${data.total} atendimento(s) · últimos ${data.periodMonths} meses · ${data.catalogSize} serviços conhecidos`:undefined}/>
    <Card variant="outlined" sx={{mt:2}}><CardContent><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(3,minmax(180px,1fr)) auto"},gap:1.2}}>
      <Autocomplete size="small" options={data?.filters.clients??[]} value={client||null} onChange={(_,v)=>setClient(v??"")} renderInput={(p)=><TextField {...p} label="Cliente"/>}/>
      <Autocomplete size="small" options={data?.filters.analysts??[]} value={analyst||null} onChange={(_,v)=>setAnalyst(v??"")} renderInput={(p)=><TextField {...p} label="Analista"/>}/>
      <FormControl size="small"><InputLabel>Período</InputLabel><Select label="Período" value={months} onChange={(e)=>setMonths(Number(e.target.value))}><MenuItem value={3}>3 meses</MenuItem><MenuItem value={6}>6 meses</MenuItem><MenuItem value={9}>9 meses</MenuItem><MenuItem value={12}>12 meses</MenuItem></Select></FormControl>
      <Button disabled={!client&&!analyst&&months===6} onClick={()=>{setClient("");setAnalyst("");setMonths(6)}}>Limpar</Button>
    </Box></CardContent></Card>
    {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
    {loading?<Box sx={{py:10,display:"grid",placeItems:"center"}}><CircularProgress/></Box>:data&&<Stack spacing={2} sx={{mt:2}}>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(2,1fr)",xl:"repeat(5,1fr)"},gap:2}}>
        <KpiCard title="Classificação específica" value={`${data.classificationRate}%`} subtitle={`${data.specific} atendimento(s)`} info="Percentual de tickets com Serviço específico no período." accent={aliareColors.green}/>
        <KpiCard title="SIMER genérico" value={data.generic} subtitle="Requer revisão" info="Classificações somente em níveis genéricos do SIMER." onClick={()=>navigate("/qualidade-dados?issue=genericSimerService")} accent={aliareColors.warning}/>
        <KpiCard title="Sem serviço" value={data.withoutService} subtitle="Requer classificação" info="Tickets sem Serviço identificado." onClick={()=>navigate("/qualidade-dados?issue=withoutService")} accent={aliareColors.error}/>
        <KpiCard title="Possível incorreto" value={data.suspected} subtitle="Validação assistiva" info="Divergências com sugestão de confiança suficiente." onClick={()=>navigate("/qualidade-dados?issue=suspectedServiceMismatch")} accent={aliareColors.info}/>
        <KpiCard title="Atendimentos analisados" value={data.total} subtitle={`${data.comparison.volumeDelta >= 0 ? "+" : ""}${data.comparison.volumeDelta}% vs. período anterior`} info={`Período anterior: ${data.comparison.previousTotal} atendimento(s).`} accent={aliareColors.info}/>
      </Box>
      <Card variant="outlined"><CardContent><Stack direction={{xs:"column",md:"row"}} spacing={1.5} sx={{alignItems:{md:"center"},justifyContent:"space-between"}}><Box><Typography variant="h6" sx={{fontWeight:850}}>Comparação com o período anterior</Typography><Typography variant="body2" color="text.secondary">Compara janelas consecutivas de {data.periodMonths} meses usando o mesmo filtro de cliente e analista.</Typography></Box><Stack direction="row" spacing={1} sx={{flexWrap:"wrap"}}><Chip label={`Volume ${data.comparison.volumeDelta >= 0 ? "+" : ""}${data.comparison.volumeDelta}%`} color={data.comparison.volumeDelta > 0 ? "warning" : "success"} variant="outlined"/><Chip label={`Qualidade ${data.comparison.classificationDelta >= 0 ? "+" : ""}${data.comparison.classificationDelta} p.p.`} color={data.comparison.classificationDelta >= 0 ? "success" : "warning"} variant="outlined"/><Chip label={`Anterior: ${data.comparison.previousClassificationRate}% específicos`} variant="outlined"/></Stack></CardContent></Card>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",xl:"1.25fr .75fr"},gap:2}}>
        <Card variant="outlined"><CardContent><Typography variant="h6" sx={{fontWeight:850}}>Evolução mensal da classificação</Typography><Typography variant="body2" color="text.secondary">Acompanhe a evolução do uso de Serviços específicos e das pendências.</Typography><Box sx={{height:320,mt:2}}><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trend}><CartesianGrid stroke={theme.palette.divider} strokeDasharray="4 4" vertical={false}/><XAxis dataKey="month" tick={{fontSize:11}}/><YAxis allowDecimals={false}/><ChartTooltip contentStyle={tooltip}/><Line type="monotone" dataKey="specific" name="Específico" stroke={aliareColors.green} strokeWidth={2}/><Line type="monotone" dataKey="generic" name="Genérico" stroke={aliareColors.warning} strokeWidth={2}/><Line type="monotone" dataKey="suspected" name="Possível incorreto" stroke={aliareColors.info} strokeWidth={2}/></LineChart></ResponsiveContainer></Box></CardContent></Card>
        <Card variant="outlined"><CardContent><Typography variant="h6" sx={{fontWeight:850}}>Demanda por módulo</Typography><Typography variant="body2" color="text.secondary">Módulos com maior volume no recorte.</Typography><Box sx={{height:320,mt:2}}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.modules.slice(0,8)} layout="vertical" margin={{left:12}}><CartesianGrid stroke={theme.palette.divider} strokeDasharray="4 4" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="module" width={135} tick={{fontSize:10}}/><ChartTooltip contentStyle={tooltip}/><Bar dataKey="count" name="Atendimentos" fill={aliareColors.info} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></Box></CardContent></Card>
      </Box>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"repeat(2,1fr)"},gap:2}}>
        <Card variant="outlined"><CardContent><Typography variant="h6" sx={{fontWeight:850}}>Principais causas</Typography><Typography variant="body2" color="text.secondary">Causas mais recorrentes no recorte selecionado.</Typography><Stack spacing={.75} sx={{mt:1.5}}>{data.causes.slice(0,8).map((item,index)=><Stack key={item.cause} direction="row" spacing={1} sx={{alignItems:"center",p:.8,borderBottom:"1px solid",borderColor:"divider"}}><Chip size="small" label={index+1}/><Typography variant="body2" sx={{flex:1}}>{item.cause}</Typography><Chip size="small" variant="outlined" label={item.count}/></Stack>)}</Stack></CardContent></Card>
        <Card variant="outlined"><CardContent><Typography variant="h6" sx={{fontWeight:850}}>Principais categorias</Typography><Typography variant="body2" color="text.secondary">Categorias que concentram os atendimentos associados aos Serviços.</Typography><Stack spacing={.75} sx={{mt:1.5}}>{data.categories.slice(0,8).map((item,index)=><Stack key={item.category} direction="row" spacing={1} sx={{alignItems:"center",p:.8,borderBottom:"1px solid",borderColor:"divider"}}><Chip size="small" label={index+1}/><Typography variant="body2" sx={{flex:1}}>{item.category}</Typography><Chip size="small" variant="outlined" label={item.count}/></Stack>)}</Stack></CardContent></Card>
      </Box>
      <Card variant="outlined"><CardContent><Typography variant="h6" sx={{fontWeight:850}}>Serviços mais demandados</Typography><Typography variant="body2" color="text.secondary">Ranking das rotinas mais utilizadas no período selecionado.</Typography><Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(2,1fr)"},gap:.75,mt:1.5}}>{data.ranking.map((item,index)=><Stack key={item.service} direction="row" spacing={1} sx={{alignItems:"center",p:1,border:"1px solid",borderColor:"divider",borderRadius:1.5}}><Chip size="small" label={index+1}/><Typography variant="body2" sx={{flex:1}} noWrap title={item.service}>{item.service.split("»").at(-1)?.trim()??item.service}</Typography><Chip size="small" variant="outlined" label={item.count}/></Stack>)}</Box></CardContent></Card>
      <Card variant="outlined"><CardContent><Stack direction={{xs:"column",sm:"row"}} spacing={1} sx={{justifyContent:"space-between",alignItems:{sm:"center"}}}><Box><Typography variant="h6" sx={{fontWeight:850}}>Fila de revisão</Typography><Typography variant="body2" color="text.secondary">Amostra de tickets sem Serviço, genéricos ou com possível divergência.</Typography></Box><Button onClick={()=>navigate("/qualidade-dados?issue=suspectedServiceMismatch")}>Abrir Qualidade dos Dados</Button></Stack><Stack spacing={1} sx={{mt:1.5}}>{data.samples.map((item)=><Button key={item.movideskId} onClick={()=>navigate(`/tickets?movidesk=${item.movideskId}`)} sx={{justifyContent:"flex-start",textTransform:"none",textAlign:"left",border:"1px solid",borderColor:"divider",p:1.2}}><Box sx={{minWidth:0}}><Typography sx={{fontWeight:800}}>#{item.movideskId} · {item.subject}</Typography><Typography variant="caption" color="text.secondary">{[item.client,item.owner,item.currentService].filter(Boolean).join(" · ")}</Typography>{item.suggestedService&&<Typography variant="caption" color="primary.main" sx={{display:"block"}}>Sugestão: {item.suggestedService} · {item.confidence}{item.evidence.length?` · ${item.evidence.join(", ")}`:""}</Typography>}</Box></Button>)}</Stack></CardContent></Card>
    </Stack>}
  </Box>
}
