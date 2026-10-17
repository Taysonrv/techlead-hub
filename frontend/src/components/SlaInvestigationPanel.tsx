import { useState, type FormEvent } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, LinearProgress, Stack, TextField, Typography, MenuItem } from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import { api } from "../services/api";

type Metric = { minutes:number|null; targetMinutes:number|null; percent:number|null; overdue:boolean|null };
type Investigation = { ticket:{id:number;subject:string;client:string|null;urgency:string|null}; task:null|{id:number;title:string;state:string;version:string|null}; metrics:Record<"response"|"support"|"factory"|"total",Metric>; timeline:Array<{at:string;title:string;detail:string;evidence:string}>; issues:string[]; summary:string };

const metricLabels = { response:"1ª resposta", support:"OLA · Suporte", factory:"OLA · Fábrica", total:"SLA · Total" };
const duration = (m:number|null) => m===null ? "Sem dados" : m < 60 ? `${m} min` : `${(m/60).toLocaleString("pt-BR",{maximumFractionDigits:1})} h`;

export function SlaInvestigationPanel() {
 const [number,setNumber]=useState("");
 const [tier,setTier]=useState("PADRAO");
 const [data,setData]=useState<Investigation|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(false);

 async function submit(event:FormEvent) {
  event.preventDefault();
  if(!/^\d+$/.test(number.trim())) return;
  setLoading(true); setError(""); setData(null);
  try {
   const result=await api.get<Investigation>(`/coordination/sla-investigation/${number.trim()}`,{params:{tier}});
   setData(result.data);
  } catch(e) {
   setError((e as {response?:{data?:{message?:string}}}).response?.data?.message??"Não foi possível investigar este atendimento. Confira o número e tente novamente.");
  } finally { setLoading(false); }
 }

 return <Card variant="outlined" sx={{borderRadius:3,mb:2,overflow:"hidden",borderColor:"divider"}}>
  <Box sx={{height:4,background:"linear-gradient(90deg, #16a765 0%, #4f8df7 100%)"}} />
  <CardContent sx={{p:{xs:2,md:3}}}>
   <Stack spacing={2.5}>
    <Stack direction="row" spacing={1.5} sx={{alignItems:"center"}}>
     <Box sx={{display:"grid",placeItems:"center",width:44,height:44,borderRadius:2,bgcolor:"action.hover",color:"primary.main",flexShrink:0}}><InsightsRoundedIcon /></Box>
     <Box sx={{minWidth:0,flex:1}}>
      <Typography variant="h6" sx={{fontWeight:800,lineHeight:1.25}}>Investigação de SLA e OLA</Typography>
      <Typography variant="body2" color="text.secondary">Rastreie o atendimento do Movidesk à Task do Azure DevOps e à versão entregue.</Typography>
     </Box>
     <Chip size="small" variant="outlined" label="Aliare 2026 v1.0" sx={{display:{xs:"none",sm:"inline-flex"}}}/>
    </Stack>
    <Box component="form" onSubmit={submit} sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"minmax(220px,1fr) 150px auto"},gap:1.25,alignItems:"start"}}>
     <TextField fullWidth label="Número do atendimento" placeholder="Ex.: 814643" size="small" value={number} onChange={e=>setNumber(e.target.value)} slotProps={{htmlInput:{inputMode:"numeric"}}} helperText="Informe o número do ticket no Movidesk."/>
     <TextField fullWidth label="Perfil de SLA" size="small" select value={tier} onChange={e=>setTier(e.target.value)}><MenuItem value="PADRAO">Padrão</MenuItem><MenuItem value="VIP">VIP</MenuItem></TextField>
     <Button type="submit" variant="contained" startIcon={<SearchRoundedIcon/>} disabled={loading||!/^\d+$/.test(number.trim())} sx={{height:40,px:2.5,whiteSpace:"nowrap"}}>{loading?"Analisando…":"Investigar"}</Button>
    </Box>
    {loading&&<LinearProgress sx={{borderRadius:2}}/>}
    {error&&<Alert severity="error" onClose={()=>setError("")}>{error}</Alert>}
    {data&&<>
     <Alert severity="info" sx={{borderRadius:2}}>Análise preliminar: feriados e pausas ainda dependem de evidência validada. Este relatório não substitui o SLA oficial do Movidesk.</Alert>
     <Box sx={{p:{xs:1.5,md:2},borderRadius:2,bgcolor:"action.hover"}}>
      <Stack direction={{xs:"column",sm:"row"}} spacing={1} sx={{justifyContent:"space-between",alignItems:{xs:"flex-start",sm:"center"}}}>
       <Box sx={{minWidth:0}}>
        <Typography variant="overline" color="text.secondary">Atendimento #{data.ticket.id}</Typography>
        <Typography variant="subtitle1" sx={{fontWeight:800,lineHeight:1.35,overflowWrap:"anywhere"}}>{data.ticket.subject}</Typography>
        <Typography variant="body2" color="text.secondary">{data.ticket.client||"Cliente não informado"}{data.ticket.urgency? ` · Urgência: ${data.ticket.urgency}`:""}</Typography>
       </Box>
       {data.task&&<Chip color="primary" variant="outlined" label={`Azure #${data.task.id} · ${data.task.state}`} sx={{maxWidth:"100%"}}/>}
      </Stack>
     </Box>
     <Box sx={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,210px),1fr))",gap:1.25}}>
      {(["response","support","factory","total"] as const).map(key=>{
       const metric=data.metrics[key];
       const valid=metric.percent!==null;
       const percent=valid?Math.max(0,Math.min(100,metric.percent as number)):0;
       const color=metric.overdue===true?"error.main":metric.overdue===false?"success.main":"text.secondary";
       return <Box key={key} sx={{p:1.75,border:"1px solid",borderColor:"divider",borderRadius:2.5,minWidth:0}}>
        <Typography variant="body2" color="text.secondary" sx={{fontWeight:650}}>{metricLabels[key]}</Typography>
        <Typography variant="h5" sx={{fontWeight:800,my:0.75,color}}>{valid?`${metric.percent}%`:"—"}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{display:"block"}}>{duration(metric.minutes)} consumidos</Typography>
        <Typography variant="caption" color="text.secondary" sx={{display:"block"}}>Meta: {duration(metric.targetMinutes)}</Typography>
        <LinearProgress variant="determinate" value={percent} color={metric.overdue===true?"error":metric.overdue===false?"success":"primary"} sx={{mt:1.25,height:5,borderRadius:5,bgcolor:"action.hover"}}/>
       </Box>;
      })}
     </Box>
     <Box>
      <Typography variant="subtitle2" sx={{fontWeight:800,mb:0.5}}>Resumo da análise</Typography>
      <Typography variant="body2" color="text.secondary">{data.summary}</Typography>
     </Box>
     <Divider/>
     <Stack direction="row" spacing={1} sx={{alignItems:"center"}}>
      <TimelineRoundedIcon color="primary"/>
      <Box>
       <Typography variant="subtitle1" sx={{fontWeight:800}}>Linha do tempo e evidências</Typography>
       <Typography variant="caption" color="text.secondary">{data.timeline.length} evento(s) identificado(s)</Typography>
      </Box>
     </Stack>
     {data.timeline.length===0?<Alert severity="warning">Nenhum evento foi localizado para compor a linha do tempo deste atendimento.</Alert>:
      <Stack spacing={0} sx={{maxHeight:480,overflowY:"auto",pr:0.5}}>
       {data.timeline.map((event,i)=><Box key={`${event.at}-${i}`} sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"150px 1fr"},gap:1.5,py:1.5,borderBottom:i===data.timeline.length-1?0:"1px solid",borderColor:"divider"}}>
        <Typography variant="caption" color="text.secondary" sx={{pt:0.25}}>{new Date(event.at).toLocaleString("pt-BR")}</Typography>
        <Box sx={{position:"relative",pl:2,borderLeft:"2px solid",borderColor:"primary.main",minWidth:0}}>
         <Typography variant="body2" sx={{fontWeight:750}}>{event.title}</Typography>
         <Typography variant="body2" sx={{mt:0.4,overflowWrap:"anywhere"}}>{event.detail}</Typography>
         <Typography variant="caption" color="text.secondary" sx={{display:"block",mt:0.75}}>Evidência: {event.evidence}</Typography>
        </Box>
       </Box>)}
      </Stack>}
     {data.issues.length>0&&<Alert severity="warning" sx={{borderRadius:2}}><Typography variant="subtitle2" sx={{fontWeight:800,mb:0.5}}>Limitações e dados pendentes</Typography><Stack spacing={0.5}>{data.issues.map((issue,i)=><Typography variant="body2" key={i}>• {issue}</Typography>)}</Stack></Alert>}
    </>}
   </Stack>
  </CardContent>
 </Card>;
}
