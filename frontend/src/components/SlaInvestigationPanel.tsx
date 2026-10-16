import { useState, type FormEvent } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, TextField, Typography } from "@mui/material";
import { api } from "../services/api";
type Metric = { minutes:number|null; targetMinutes:number|null; percent:number|null; overdue:boolean|null };
type Investigation = { ticket:{id:number;subject:string;client:string|null;urgency:string|null}; task:null|{id:number;title:string;state:string;version:string|null}; metrics:Record<"response"|"support"|"factory"|"total",Metric>; timeline:Array<{at:string;title:string;detail:string;evidence:string}>; issues:string[]; summary:string };
export function SlaInvestigationPanel() {
 const [number,setNumber]=useState(""); const [tier,setTier]=useState("PADRAO");
 const [data,setData]=useState<Investigation|null>(null);const [error,setError]=useState("");const [loading,setLoading]=useState(false);
 async function submit(event:FormEvent) {
  event.preventDefault();if(!/^\d+$/.test(number))return;setLoading(true);setError("");setData(null);
  try{const result=await api.get<Investigation>(`/coordination/sla-investigation/${number}`,{params:{tier}});setData(result.data);}
  catch(e){setError((e as {response?:{data?:{message?:string}}}).response?.data?.message??"Falha ao investigar atendimento.");}
  finally{setLoading(false);}
 }
 const duration=(m:number|null)=>m===null?"—":`${(m/60).toLocaleString("pt-BR",{maximumFractionDigits:1})} h`;
 return <Card variant="outlined" sx={{borderRadius:3,mb:2}}>
 <CardContent sx={{p:2.5}}>
 <Typography variant="h6" sx={{fontWeight:800}}>Investigação de SLA e OLA por atendimento</Typography>
 <Typography variant="body2" color="text.secondary" sx={{mb:2}}>Movidesk → Azure DevOps → Versão · Aliare 2026 v1.0</Typography>
 <Box component="form" onSubmit={submit} sx={{display:"flex",gap:1,flexWrap:"wrap"}}>
 <TextField label="Número do atendimento" size="small" value={number} onChange={e=>setNumber(e.target.value)} sx={{flex:"1 1 220px"}}/>
 <TextField label="Perfil" size="small" select slotProps={{select:{native:true}}} value={tier} onChange={e=>setTier(e.target.value)}><option value="PADRAO">Padrão</option><option value="VIP">VIP</option></TextField>
 <Button type="submit" variant="contained" disabled={loading||!/^\d+$/.test(number)}>{loading?"Analisando...":"Investigar"}</Button></Box>
 {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
 {data&&<Stack spacing={2} sx={{mt:2}}>
 <Alert severity="info">Resultado preliminar: feriados e pausas ainda requerem evidência validada; não substitui o SLA oficial do Movidesk.</Alert>
 <Typography sx={{fontWeight:800}}>#{data.ticket.id} · {data.ticket.subject}</Typography>
 <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">{(["response","support","factory","total"] as const).map((key)=>{
 const metric=data.metrics[key];return <Box key={key} sx={{p:1.5,border:"1px solid",borderColor:"divider",borderRadius:2,minWidth:146,flex:"1 1 140px"}}>
 <Typography variant="caption">{({response:"1ª resposta",support:"OLA Suporte",factory:"OLA Fábrica",total:"SLA total"})[key]}</Typography>
 <Typography variant="h6">{metric.percent===null?"—":`${metric.percent}%`}</Typography>
 <Typography variant="caption" color="text.secondary">{duration(metric.minutes)} / {duration(metric.targetMinutes)}</Typography></Box>;})}</Stack>
 <Typography variant="body2">{data.summary}</Typography>
 {data.task&&<Chip variant="outlined" label={`Azure #${data.task.id} · ${data.task.state}`} sx={{alignSelf:"flex-start"}}/>}
 <Divider/><Typography fontWeight={800}>Linha do tempo · evidências</Typography>
 <Box sx={{maxHeight:420,overflow:"auto"}}>{data.timeline.map((event,i)=><Box key={i} sx={{py:1.5,pl:2,borderLeft:"2px solid",borderColor:"divider"}}>
 <Typography variant="caption" color="text.secondary">{new Date(event.at).toLocaleString("pt-BR")}</Typography>
 <Typography variant="body2" sx={{fontWeight:700}}>{event.title}</Typography><Typography variant="body2">{event.detail}</Typography>
 <Typography variant="caption" color="text.secondary">Fonte: {event.evidence}</Typography></Box>)}</Box>
 {data.issues.length>0&&<Alert severity="warning"><strong>Limitações da análise</strong>{data.issues.map((issue,i)=><Typography variant="body2" key={i}>• {issue}</Typography>)}</Alert>}
 </Stack>}
 </CardContent></Card>;
}
