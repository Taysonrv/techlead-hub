import { useEffect, useMemo, useState } from "react";
import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, FormControl, InputLabel, MenuItem, Select, Stack as MuiStack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, useTheme } from "@mui/material";
import { AssessmentOutlined, RestartAltOutlined, TrendingDownOutlined, TrendingUpOutlined } from "@mui/icons-material";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../services/api";
import { aliareColors } from "../theme/theme";
import { chartPalette, semanticChartColors } from "../theme/chartPalette";

function Stack(
  props: React.ComponentProps<typeof MuiStack> & {
    alignItems?: unknown;
    justifyContent?: unknown;
    flexWrap?: unknown;
    gap?: unknown;
  },
) {
  const {
    alignItems,
    justifyContent,
    flexWrap,
    gap,
    sx,
    ...rest
  } = props;

  return (
    <MuiStack
      {...rest}
      sx={[
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
        {
          ...(alignItems !== undefined ? { alignItems } : {}),
          ...(justifyContent !== undefined ? { justifyContent } : {}),
          ...(flexWrap !== undefined ? { flexWrap } : {}),
          ...(gap !== undefined ? { gap } : {}),
        },
      ] as React.ComponentProps<typeof MuiStack>["sx"]}
    />
  );
}

type Row={id:number;title:string;client:string|null;createdBy:string|null;createdAt:string|null;status:string;lastStateChangedAt:string|null;urgency:string|null;prioritized:boolean|null;assignedTo:string|null;terminalAt:string|null;remoteUrl:string|null;registeredInPeriod:boolean;deliveredInPeriod:boolean;canceledInPeriod:boolean;enteredRegistrationInPeriod:boolean;backlogInitial:boolean;backlogCurrent:boolean};
type Report={period:{month:string;timezone:string;start:string;close:string};rows:Row[];source:string;quality?:{historyAvailable:boolean;historyError:string|null;mode:string;historicalMetricsReliable:boolean}};
type Drill="registered"|"delivered"|"canceled"|"registration"|"backlogInitial"|"backlogCurrent"|null;
const TERMINAL=new Set(["Concluído","Cancelado"]);
const fmt=(v:string|null)=>v?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(v)):"-";
const currentMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`};
const metricLabel:Record<Exclude<Drill,null>,string>={registered:"Registradas no mês",delivered:"Entregues no mês",canceled:"Canceladas no mês",registration:"Em Registro",backlogInitial:"Backlog inicial",backlogCurrent:"Backlog atual"};

export function CorrectionMonthlyPanel(){
 const theme=useTheme();const [month,setMonth]=useState(currentMonth());const [report,setReport]=useState<Report|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState("");
 const [creators,setCreators]=useState<string[]>([]),[clients,setClients]=useState<string[]>([]),[urgencies,setUrgencies]=useState<string[]>([]),[states,setStates]=useState<string[]>([]);const [prioritized,setPrioritized]=useState<""|"true"|"false">("");const [search,setSearch]=useState("");const [drill,setDrill]=useState<Drill>(null);
 useEffect(()=>{let active=true;setLoading(true);setError("");api.get<Report>("/azure-work-items/corrections/monthly-report",{params:{month}}).then(({data})=>{if(active)setReport(data)}).catch(e=>{if(active)setError(e?.response?.data?.message||"Não foi possível carregar o report mensal.")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[month]);
 const options=useMemo(()=>({creators:[...new Set((report?.rows??[]).map(r=>r.createdBy).filter((v):v is string=>!!v))].sort(),clients:[...new Set((report?.rows??[]).map(r=>r.client).filter((v):v is string=>!!v))].sort(),urgencies:[...new Set((report?.rows??[]).map(r=>r.urgency).filter((v):v is string=>!!v))].sort(),states:[...new Set((report?.rows??[]).map(r=>r.status).filter(Boolean))].sort()}),[report]);
 const base=useMemo(()=>(report?.rows??[]).filter(r=>(!creators.length||!!r.createdBy&&creators.includes(r.createdBy))&&(!clients.length||!!r.client&&clients.includes(r.client))&&(!urgencies.length||!!r.urgency&&urgencies.includes(r.urgency))&&(!states.length||states.includes(r.status))&&(!prioritized||r.prioritized===(prioritized==="true"))),[report,creators,clients,urgencies,states,prioritized]);
 const match=(r:Row,k:Exclude<Drill,null>)=>k==="registered"?r.registeredInPeriod:k==="delivered"?r.deliveredInPeriod:k==="canceled"?r.canceledInPeriod:k==="registration"?r.enteredRegistrationInPeriod:k==="backlogInitial"?r.backlogInitial:r.backlogCurrent;
 const value=(k:Exclude<Drill,null>)=>base.filter(r=>match(r,k)).length;const initial=value("backlogInitial"),current=value("backlogCurrent"),delta=current-initial;
 const cards=[["backlogInitial","Backlog inicial",initial,"Estoque aberto na entrada"],["registered","Tasks registradas",value("registered"),"Criadas no período"],["delivered","Tasks entregues",value("delivered"),"Concluídas no período"],["canceled","Tasks canceladas",value("canceled"),"Canceladas no período"],["registration","Tasks em Registro",value("registration"),"Fora do backlog"],["backlogCurrent","Backlog atual",current,"Estoque aberto no fechamento"]] as const;
 const group=(fn:(r:Row)=>string|null)=>Object.entries(base.reduce<Record<string,number>>((a,r)=>{const k=fn(r)||"Não informado";a[k]=(a[k]??0)+1;return a},{})).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total);
 const pipeline=group(r=>r.status),urgency=group(r=>r.urgency),priority=[{name:"Priorizadas",total:base.filter(r=>r.prioritized===true).length},{name:"Não priorizadas",total:base.filter(r=>r.prioritized===false).length},{name:"Não informado",total:base.filter(r=>r.prioritized===null).length}].filter(x=>x.total);
 const detailed=useMemo(()=>base.filter(r=>(!drill||match(r,drill))&&(!search.trim()||String(r.id).includes(search.trim())||r.title.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")))),[base,drill,search]);
 const clear=()=>{setCreators([]);setClients([]);setUrgencies([]);setStates([]);setPrioritized("");setSearch("");setDrill(null)};
 const panel={border:"1px solid",borderColor:"divider",borderRadius:3,bgcolor:"background.paper",overflow:"hidden"};
 return <Box sx={{order:.5,display:"grid",gap:1.5}}>
  <Card elevation={0} sx={panel}><CardContent sx={{p:{xs:2,md:2.5}}}>
   <Stack direction={{xs:"column",lg:"row"}} justifyContent="space-between" gap={2}>
    <Box><Typography variant="overline" color="primary.main" sx={{fontWeight:900}}>REPORT EXECUTIVO · AZURE DEVOPS</Typography><Typography variant="h5" sx={{fontWeight:900}}>Visão mensal das Correções Clientes</Typography><Typography variant="body2" color="text.secondary">Estoque, entradas, saídas e pipeline no fechamento · System.Id distinto · America/Sao_Paulo.</Typography></Box>
    <TextField label="Período" type="month" value={month} onChange={e=>setMonth(e.target.value)} size="small" sx={{minWidth:200}} slotProps={{inputLabel:{shrink:true}}}/>
   </Stack>
   <Stack direction={{xs:"column",lg:"row"}} gap={1.25} sx={{mt:2}}>
    <Autocomplete multiple size="small" options={options.creators} value={creators} onChange={(_,v)=>setCreators(v)} renderInput={p=><TextField {...p} label="Criado por"/>} sx={{flex:1}}/><Autocomplete multiple size="small" options={options.clients} value={clients} onChange={(_,v)=>setClients(v)} renderInput={p=><TextField {...p} label="Cliente"/>} sx={{flex:1}}/><Autocomplete multiple size="small" options={options.urgencies} value={urgencies} onChange={(_,v)=>setUrgencies(v)} renderInput={p=><TextField {...p} label="Urgência"/>} sx={{flex:1}}/><Autocomplete multiple size="small" options={options.states} value={states} onChange={(_,v)=>setStates(v)} renderInput={p=><TextField {...p} label="Status"/>} sx={{flex:1}}/><FormControl size="small" sx={{minWidth:150}}><InputLabel>Priorizada</InputLabel><Select label="Priorizada" value={prioritized} onChange={e=>setPrioritized(e.target.value as typeof prioritized)}><MenuItem value="">Todas</MenuItem><MenuItem value="true">Sim</MenuItem><MenuItem value="false">Não</MenuItem></Select></FormControl><Button startIcon={<RestartAltOutlined/>} onClick={clear}>Limpar</Button>
   </Stack>
  </CardContent></Card>
  {error&&<Alert severity="error">{error}</Alert>}
  {report?.quality&&!report.quality.historyAvailable&&<Alert severity="warning"><b>Modo snapshot local.</b> O painel permanece disponível, mas os indicadores que dependem do histórico de mudança de status precisam do histórico do Azure para homologação mensal. {report.quality.historyError||""}</Alert>}
  {loading?<Box sx={{py:5,textAlign:"center"}}><CircularProgress size={28}/><Typography variant="body2" color="text.secondary" sx={{mt:1}}>Reconstruindo o fechamento mensal…</Typography></Box>:report&&<>
   <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(2,1fr)",lg:"repeat(3,1fr)",xl:"repeat(6,1fr)"},gap:1.25}}>
    {cards.map(([key,label,noteValue,note])=><Card key={key} elevation={0} onClick={()=>setDrill(drill===key?null:key)} sx={{...panel,cursor:"pointer",borderTop:"3px solid",borderTopColor:drill===key?"primary.main":"divider",transition:".18s", "&:hover":{transform:"translateY(-2px)",boxShadow:2}}}><CardContent sx={{p:1.8}}><Typography variant="caption" color="text.secondary" sx={{fontWeight:800}}>{label}</Typography><Typography variant="h4" sx={{fontWeight:950,my:.4}}>{noteValue}</Typography><Typography variant="caption" color="text.secondary">{note}</Typography></CardContent></Card>)}
   </Box>
   <Card elevation={0} sx={{...panel,background:theme.palette.mode==="dark"?"linear-gradient(110deg,rgba(0,190,112,.09),rgba(255,255,255,.02))":"linear-gradient(110deg,rgba(0,190,112,.08),#fff)"}}><CardContent sx={{py:1.8}}>
    <Stack direction={{xs:"column",md:"row"}} justifyContent="space-between" alignItems={{md:"center"}} gap={2}><Box><Typography variant="overline" color="primary.main" sx={{fontWeight:900}}>LEITURA EXECUTIVA DO MÊS</Typography><Typography sx={{fontWeight:900}}>Movimento do backlog</Typography></Box><Stack direction="row" gap={3} alignItems="center"><Box><Typography variant="caption" color="text.secondary">Variação</Typography><Stack direction="row" alignItems="center" gap={0.5}>{delta <= 0 ? <TrendingDownOutlined color="success"/> : <TrendingUpOutlined color="warning"/>}<Typography variant="h6" sx={{fontWeight:900}}>{delta > 0 ? "+" : ""}{delta}</Typography></Stack></Box><Box><Typography variant="caption" color="text.secondary">Taxa de entrega</Typography><Typography variant="h6" sx={{fontWeight:900}}>{value("registered")?Math.round(value("delivered")/value("registered")*100):0}%</Typography></Box><Box><Typography variant="caption" color="text.secondary">Universo no fechamento</Typography><Typography variant="h6" sx={{fontWeight:900}}>{base.length}</Typography></Box></Stack></Stack>
   </CardContent></Card>
   <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",xl:"2fr 1fr 1fr"},gap:1.5}}>
    <Card elevation={0} sx={panel}><CardContent><Typography sx={{fontWeight:900}}>Pipeline no fechamento</Typography><Typography variant="caption" color="text.secondary">Distribuição operacional por status. Registro permanece visível, mas não compõe backlog.</Typography><Box sx={{height:Math.max(300,pipeline.length*34),mt:1}}><ResponsiveContainer><BarChart data={pipeline} layout="vertical" margin={{left:25,right:35}}><CartesianGrid strokeDasharray="3 5" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={130}/><Tooltip/><Bar dataKey="total" radius={[0,7,7,0]} onClick={d=>{const n=(d as {name?:string}).name;if(n)setStates([n])}}>{pipeline.map((_,i)=><Cell key={i} fill={chartPalette[i%chartPalette.length]}/>)}<LabelList dataKey="total" position="right"/></Bar></BarChart></ResponsiveContainer></Box></CardContent></Card>
    <Card elevation={0} sx={panel}><CardContent><Typography sx={{fontWeight:900}}>Urgência</Typography><Typography variant="caption" color="text.secondary">Concentração do universo filtrado.</Typography><Box sx={{height:280}}><ResponsiveContainer><BarChart data={urgency}><CartesianGrid strokeDasharray="3 5" vertical={false}/><XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="total" fill={semanticChartColors.attention} radius={[7,7,0,0]} onClick={d=>{const n=(d as {name?:string}).name;if(n)setUrgencies([n])}}><LabelList dataKey="total" position="top"/></Bar></BarChart></ResponsiveContainer></Box></CardContent></Card>
    <Card elevation={0} sx={panel}><CardContent><Typography sx={{fontWeight:900}}>Priorização</Typography><Typography variant="caption" color="text.secondary">Distribuição das tasks no fechamento.</Typography><Box sx={{height:220}}><ResponsiveContainer><PieChart><Pie data={priority} dataKey="total" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3} onClick={d=>{const n=(d as {name?:string}).name;setPrioritized(n==="Priorizadas"?"true":n==="Não priorizadas"?"false":"")}}>{priority.map((_,i)=><Cell key={i} fill={[aliareColors.green,aliareColors.info,semanticChartColors.attention][i%3]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></Box>{priority.map(p=><Stack key={p.name} direction="row" justifyContent="space-between" sx={{mb:.6}}><Typography variant="body2">{p.name}</Typography><Chip size="small" label={p.total}/></Stack>)}</CardContent></Card>
   </Box>
   <Card elevation={0} sx={panel}><CardContent>
    <Stack direction={{xs:"column",md:"row"}} justifyContent="space-between" gap={1.5}><Box><Stack direction="row" gap={1} alignItems="center"><AssessmentOutlined color="primary"/><Typography sx={{fontWeight:900}}>Detalhamento rastreável{drill?` · ${metricLabel[drill]}`:""}</Typography></Stack><Typography variant="body2" color="text.secondary">{detailed.length} task(s) no recorte atual · ID abre o Work Item no Azure.</Typography></Box><TextField size="small" label="Buscar ID ou título" value={search} onChange={e=>setSearch(e.target.value)} sx={{minWidth:{md:280}}}/></Stack>
    <TableContainer sx={{mt:1.5,maxHeight:560}}><Table stickyHeader size="small"><TableHead><TableRow>{["ID","Título","Cliente","Criado por","Criação","Status","Última mudança","Urgência","Priorizada","Responsável","Conclusão/Cancelamento"].map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{detailed.map(r=><TableRow hover key={r.id}><TableCell>{r.remoteUrl?<Button size="small" component="a" href={r.remoteUrl} target="_blank" rel="noreferrer">{r.id}</Button>:r.id}</TableCell><TableCell sx={{minWidth:250,maxWidth:380}}>{r.title}</TableCell><TableCell>{r.client||"-"}</TableCell><TableCell>{r.createdBy||"-"}</TableCell><TableCell>{fmt(r.createdAt)}</TableCell><TableCell><Chip size="small" label={r.status}/></TableCell><TableCell>{fmt(r.lastStateChangedAt)}</TableCell><TableCell>{r.urgency||"-"}</TableCell><TableCell>{r.prioritized===null?"-":r.prioritized?"Sim":"Não"}</TableCell><TableCell>{r.assignedTo||"-"}</TableCell><TableCell>{TERMINAL.has(r.status)?fmt(r.terminalAt):"-"}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
    <Typography variant="caption" color="text.secondary" sx={{display:"block",mt:1.25}}>Fonte: {report.source}. O fechamento histórico não deve ser alterado por movimentações posteriores ao período.</Typography>
   </CardContent></Card>
  </>}
 </Box>
}