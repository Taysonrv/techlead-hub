import { useEffect, useMemo, useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, FormControl,
  InputLabel, MenuItem, Select, Stack as MuiStack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography, useTheme,
} from "@mui/material";
import { RestartAltOutlined } from "@mui/icons-material";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../services/api";
import { KpiCard } from "./KpiCard";
import { aliareColors } from "../theme/theme";
import { chartPalette, semanticChartColors } from "../theme/chartPalette";

function Stack(props: React.ComponentProps<typeof MuiStack> & { alignItems?: unknown; justifyContent?: unknown; flexWrap?: unknown; gap?: unknown; mt?: unknown }) {
  const { alignItems, justifyContent, flexWrap, gap, mt, sx, ...rest } = props;
  return <MuiStack {...rest} sx={[...(Array.isArray(sx) ? sx : sx ? [sx] : []), { ...(alignItems !== undefined ? { alignItems } : {}), ...(justifyContent !== undefined ? { justifyContent } : {}), ...(flexWrap !== undefined ? { flexWrap } : {}), ...(gap !== undefined ? { gap } : {}), ...(mt !== undefined ? { mt } : {}) }] as React.ComponentProps<typeof MuiStack>["sx"]} />;
}

type Row = {
  id:number; title:string; client:string|null; createdBy:string|null; createdAt:string|null; status:string;
  lastStateChangedAt:string|null; urgency:string|null; prioritized:boolean|null; assignedTo:string|null;
  terminalAt:string|null; remoteUrl:string|null; stateAtOpen:string|null; stateAtClose:string|null;
  registeredInPeriod:boolean; deliveredInPeriod:boolean; canceledInPeriod:boolean; enteredRegistrationInPeriod:boolean;
  backlogInitial:boolean; backlogCurrent:boolean;
};
type Report = {
  period:{month:string;timezone:string;start:string;close:string}; rows:Row[]; generatedAt:string; source:string;
};
type Drill = "registered"|"delivered"|"canceled"|"registration"|"backlogInitial"|"backlogCurrent"|null;

const TERMINAL = new Set(["Concluído","Cancelado"]);
const fmt = (value:string|null) => value ? new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value)) : "-";
const currentMonth = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };

export function CorrectionMonthlyPanel() {
  const theme=useTheme();
  const [month,setMonth]=useState(currentMonth());
  const [report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [creators,setCreators]=useState<string[]>([]);
  const [clients,setClients]=useState<string[]>([]);
  const [urgencies,setUrgencies]=useState<string[]>([]);
  const [states,setStates]=useState<string[]>([]);
  const [prioritized,setPrioritized]=useState<""|"true"|"false">("");
  const [search,setSearch]=useState("");
  const [drill,setDrill]=useState<Drill>(null);

  useEffect(()=>{ let active=true; setLoading(true); setError("");
    api.get<Report>("/azure-work-items/corrections/monthly-report",{params:{month}})
      .then(({data})=>{if(active)setReport(data);})
      .catch((e)=>{if(active)setError(e?.response?.data?.message || "Não foi possível carregar o report mensal.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false};
  },[month]);

  const options=useMemo(()=>({
    creators:[...new Set((report?.rows??[]).map(r=>r.createdBy).filter((v):v is string=>!!v))].sort(),
    clients:[...new Set((report?.rows??[]).map(r=>r.client).filter((v):v is string=>!!v))].sort(),
    urgencies:[...new Set((report?.rows??[]).map(r=>r.urgency).filter((v):v is string=>!!v))].sort(),
    states:[...new Set((report?.rows??[]).map(r=>r.status).filter(Boolean))].sort(),
  }),[report]);

  const baseRows=useMemo(()=>(report?.rows??[]).filter(r=>
    (!creators.length || (!!r.createdBy&&creators.includes(r.createdBy))) &&
    (!clients.length || (!!r.client&&clients.includes(r.client))) &&
    (!urgencies.length || (!!r.urgency&&urgencies.includes(r.urgency))) &&
    (!states.length || states.includes(r.status)) &&
    (!prioritized || r.prioritized === (prioritized==="true"))
  ),[report,creators,clients,urgencies,states,prioritized]);

  const metric=(key:Exclude<Drill,null>)=>baseRows.filter(r=>
    key==="registered"?r.registeredInPeriod:key==="delivered"?r.deliveredInPeriod:key==="canceled"?r.canceledInPeriod:
    key==="registration"?r.enteredRegistrationInPeriod:key==="backlogInitial"?r.backlogInitial:r.backlogCurrent
  ).length;
  const cards=[
    {key:"registered" as const,label:"Tasks registradas",value:metric("registered"),info:"Criadas dentro do mês selecionado."},
    {key:"delivered" as const,label:"Tasks entregues",value:metric("delivered"),info:"Entraram em Concluído no mês e estavam Concluídas no fechamento."},
    {key:"canceled" as const,label:"Tasks canceladas",value:metric("canceled"),info:"Entraram em Cancelado no mês e estavam Canceladas no fechamento."},
    {key:"registration" as const,label:"Tasks em registro",value:metric("registration"),info:"Entraram em Registro no mês e estavam em Registro no fechamento."},
    {key:"backlogInitial" as const,label:"Backlog inicial",value:metric("backlogInitial"),info:"Estoque aberto antes do mês, sem Registro, Concluído e Cancelado."},
    {key:"backlogCurrent" as const,label:"Backlog atual",value:metric("backlogCurrent"),info:"Estoque aberto no fechamento, sem Registro, Concluído e Cancelado."},
  ];

  const group=(selector:(r:Row)=>string|null)=>Object.entries(baseRows.reduce<Record<string,number>>((a,r)=>{const k=selector(r)||"Não informado";a[k]=(a[k]??0)+1;return a;},{})).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total);
  const pipeline=group(r=>r.status);
  const urgency=group(r=>r.urgency);
  const priority=[
    {name:"Priorizadas",total:baseRows.filter(r=>r.prioritized===true).length},
    {name:"Não priorizadas",total:baseRows.filter(r=>r.prioritized===false).length},
    {name:"Não informado",total:baseRows.filter(r=>r.prioritized===null).length},
  ].filter(x=>x.total>0);

  const detailed=useMemo(()=>baseRows.filter(r=>{
    if(drill==="registered"&&!r.registeredInPeriod)return false;if(drill==="delivered"&&!r.deliveredInPeriod)return false;
    if(drill==="canceled"&&!r.canceledInPeriod)return false;if(drill==="registration"&&!r.enteredRegistrationInPeriod)return false;
    if(drill==="backlogInitial"&&!r.backlogInitial)return false;if(drill==="backlogCurrent"&&!r.backlogCurrent)return false;
    const q=search.trim().toLocaleLowerCase("pt-BR");return !q||String(r.id).includes(q)||r.title.toLocaleLowerCase("pt-BR").includes(q);
  }),[baseRows,drill,search]);

  const clear=()=>{setCreators([]);setClients([]);setUrgencies([]);setStates([]);setPrioritized("");setSearch("");setDrill(null)};
  const panelSx={border:"1px solid",borderColor:"divider",borderRadius:3,background:theme.palette.mode==="dark"?"linear-gradient(145deg,rgba(12,31,55,.94),rgba(8,22,40,.98))":"linear-gradient(145deg,#fff,#f7faff)",overflow:"hidden"};

  return <Box sx={{order:0.5,display:"grid",gap:2}}>
    <Card elevation={0} sx={panelSx}><CardContent sx={{p:{xs:2,md:2.5}}}>
      <Stack direction={{xs:"column",md:"row"}} justifyContent="space-between" gap={2} alignItems={{md:"center"}}>
        <Box><Typography variant="overline" color="primary.main" sx={{fontWeight:900}}>REPORT MENSAL · AZURE DEVOPS</Typography>
          <Typography variant="h5" sx={{fontWeight:900}}>Painel de Tasks de Correção</Typography>
          <Typography variant="body2" color="text.secondary">Snapshots históricos de Correções Clientes · fuso America/Sao_Paulo · System.Id distinto.</Typography></Box>
        <TextField label="Período" type="month" value={month} onChange={e=>setMonth(e.target.value)} size="small" sx={{minWidth:180}} slotProps={{inputLabel:{shrink:true}}}/>
      </Stack>
      <Stack direction={{xs:"column",lg:"row"}} gap={1.25} mt={2} flexWrap="wrap">
        <Autocomplete multiple size="small" options={options.creators} value={creators} onChange={(_,v)=>setCreators(v)} renderInput={p=><TextField {...p} label="Criado por"/>} sx={{minWidth:220,flex:1}}/>
        <Autocomplete multiple size="small" options={options.clients} value={clients} onChange={(_,v)=>setClients(v)} renderInput={p=><TextField {...p} label="Cliente"/>} sx={{minWidth:220,flex:1}}/>
        <Autocomplete multiple size="small" options={options.urgencies} value={urgencies} onChange={(_,v)=>setUrgencies(v)} renderInput={p=><TextField {...p} label="Urgência"/>} sx={{minWidth:180,flex:1}}/>
        <Autocomplete multiple size="small" options={options.states} value={states} onChange={(_,v)=>setStates(v)} renderInput={p=><TextField {...p} label="Status"/>} sx={{minWidth:220,flex:1}}/>
        <FormControl size="small" sx={{minWidth:160}}><InputLabel>Priorizada</InputLabel><Select label="Priorizada" value={prioritized} onChange={e=>setPrioritized(e.target.value as typeof prioritized)}><MenuItem value="">Todas</MenuItem><MenuItem value="true">Sim</MenuItem><MenuItem value="false">Não</MenuItem></Select></FormControl>
        <Button startIcon={<RestartAltOutlined/>} onClick={clear}>Limpar filtros</Button>
      </Stack>
    </CardContent></Card>

    {error&&<Alert severity="error">{error}</Alert>}
    {loading?<Box sx={{py:5,textAlign:"center"}}><CircularProgress size={28}/><Typography variant="body2" color="text.secondary" sx={{mt:1}}>Reconstruindo snapshots e histórico de status…</Typography></Box>:report&&<>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(2,1fr)",lg:"repeat(3,1fr)",xl:"repeat(6,1fr)"},gap:1.25}}>
        {cards.map(c=><Box key={c.key} onClick={()=>setDrill(drill===c.key?null:c.key)} sx={{cursor:"pointer"}}><KpiCard title={c.label} value={c.value} subtitle={c.info} active={drill===c.key}/></Box>)}
      </Box>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",xl:"2fr 1fr 1fr"},gap:1.5}}>
        <Card elevation={0} sx={panelSx}><CardContent><Typography sx={{fontWeight:900}}>Pipeline no fechamento</Typography><Typography variant="caption" color="text.secondary">Registro permanece visível no pipeline, mas não compõe backlog.</Typography><Box sx={{height:Math.max(280,pipeline.length*34),mt:1}}><ResponsiveContainer width="100%" height="100%"><BarChart data={pipeline} layout="vertical" margin={{left:25,right:20}}><CartesianGrid strokeDasharray="3 5" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={125}/><Tooltip/><Bar dataKey="total" radius={[0,7,7,0]} onClick={(d)=>{const name=(d as {name?:string}).name;if(name)setStates([name]);}}>{pipeline.map((_,i)=><Cell key={i} fill={chartPalette[i%chartPalette.length]}/>)}</Bar></BarChart></ResponsiveContainer></Box></CardContent></Card>
        <Card elevation={0} sx={panelSx}><CardContent><Typography sx={{fontWeight:900}}>Urgência</Typography><Box sx={{height:280}}><ResponsiveContainer width="100%" height="100%"><BarChart data={urgency}><CartesianGrid strokeDasharray="3 5" vertical={false}/><XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="total" fill={semanticChartColors.attention} radius={[7,7,0,0]} onClick={(d)=>{const name=(d as {name?:string}).name;if(name)setUrgencies([name]);}}/></BarChart></ResponsiveContainer></Box></CardContent></Card>
        <Card elevation={0} sx={panelSx}><CardContent><Typography sx={{fontWeight:900}}>Priorização</Typography><Box sx={{height:280}}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={priority} dataKey="total" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3} onClick={(d)=>{const name=(d as {name?:string}).name;setPrioritized(name==="Priorizadas"?"true":name==="Não priorizadas"?"false":"");}}>{priority.map((_,i)=><Cell key={i} fill={[aliareColors.green,aliareColors.info,semanticChartColors.attention][i%3]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></Box><Stack gap={.75}>{priority.map((p)=><Stack key={p.name} direction="row" justifyContent="space-between"><Chip size="small" label={p.name}/><Typography sx={{fontWeight:900}}>{p.total}</Typography></Stack>)}</Stack></CardContent></Card>
      </Box>
      <Card elevation={0} sx={panelSx}><CardContent>
        <Stack direction={{xs:"column",md:"row"}} justifyContent="space-between" gap={1.5} alignItems={{md:"center"}}><Box><Typography sx={{fontWeight:900}}>Detalhamento rastreável</Typography><Typography variant="body2" color="text.secondary">{detailed.length} task(s) · clique no ID para abrir no Azure</Typography></Box><TextField size="small" label="Buscar ID ou título" value={search} onChange={e=>setSearch(e.target.value)} sx={{minWidth:{md:280}}}/></Stack>
        <TableContainer sx={{mt:1.5,maxHeight:560}}><Table stickyHeader size="small"><TableHead><TableRow>{["ID","Título","Cliente","Criado por","Criação","Status","Última mudança","Urgência","Priorizada","Responsável","Conclusão/Cancelamento"].map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{detailed.map(r=><TableRow hover key={r.id}><TableCell>r.remoteUrl ? <Button size="small" component="a" href={r.remoteUrl} target="_blank" rel="noreferrer">{r.id}</Button> : <Button size="small" disabled>{r.id}</Button></TableCell><TableCell sx={{minWidth:260,maxWidth:380}}>{r.title}</TableCell><TableCell>{r.client||"-"}</TableCell><TableCell>{r.createdBy||"-"}</TableCell><TableCell>{fmt(r.createdAt)}</TableCell><TableCell><Chip size="small" label={r.status}/></TableCell><TableCell>{fmt(r.lastStateChangedAt)}</TableCell><TableCell>{r.urgency||"-"}</TableCell><TableCell>{r.prioritized===null?"-":r.prioritized?"Sim":"Não"}</TableCell><TableCell>{r.assignedTo||"-"}</TableCell><TableCell>{TERMINAL.has(r.status)?fmt(r.terminalAt):"-"}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
        <Typography variant="caption" color="text.secondary" sx={{display:"block",mt:1.5}}>Fonte: {report.source}. Alterações posteriores ao fechamento não alteram o snapshot do mês selecionado.</Typography>
      </CardContent></Card>
    </>}
  </Box>;
}
