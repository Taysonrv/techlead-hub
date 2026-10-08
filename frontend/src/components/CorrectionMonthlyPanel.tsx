import { useEffect, useMemo, useState } from "react";
import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, FormControl, IconButton, InputLabel, MenuItem, Select, Stack as MuiStack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip as MuiTooltip, Typography, useTheme } from "@mui/material";
import { AssessmentOutlined, InfoOutlined, RestartAltOutlined, TrendingDownOutlined, TrendingUpOutlined } from "@mui/icons-material";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { api, getApiErrorMessage } from "../services/api";
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

function InfoButton({ title, description }: { title: string; description: string }) {
  return (
    <MuiTooltip
      arrow
      placement="top"
      title={
        <Box sx={{ maxWidth: 340 }}>
          <Typography variant="caption" sx={{ fontWeight: 900, display: "block", mb: 0.45 }}>
            {title}
          </Typography>
          <Typography variant="caption">
            {description}
          </Typography>
        </Box>
      }
    >
      <IconButton
        size="small"
        aria-label={`Informações sobre ${title}`}
        onClick={(event) => event.stopPropagation()}
        sx={{ p: 0.35, color: "text.secondary", flexShrink: 0 }}
      >
        <InfoOutlined sx={{ fontSize: 17 }} />
      </IconButton>
    </MuiTooltip>
  );
}

function CardHeading({ title, subtitle, info }: { title: string; subtitle?: string; info: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 900 }}>{title}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
      </Box>
      <InfoButton title={title} description={info} />
    </Box>
  );
}

type Row={id:number;title:string;client:string|null;createdBy:string|null;createdAt:string|null;status:string;lastStateChangedAt:string|null;urgency:string|null;prioritized:boolean|null;assignedTo:string|null;terminalAt:string|null;remoteUrl:string|null;registeredInPeriod:boolean;deliveredInPeriod:boolean;canceledInPeriod:boolean;enteredRegistrationInPeriod:boolean;backlogInitial:boolean;backlogCurrent:boolean;inPeriodUniverse?:boolean};
type Report={period:{month:string;timezone:string;start:string;close:string};rows:Row[];source:string;filters?:{creators:string[];clients:string[];urgencies:string[];states:string[]};quality?:{historyAvailable:boolean;historyError:string|null;snapshotAvailable?:boolean;snapshotError?:string|null;mode:string;historicalMetricsReliable:boolean;backlogHistoricalReliable?:boolean}};
type Drill="registered"|"delivered"|"canceled"|"registration"|"backlogInitial"|"backlogCurrent"|null;
type SliceDrill=
 | {kind:"status";value:string}
 | {kind:"urgency";value:string}
 | {kind:"prioritized";value:boolean|null}
 | null;
const TERMINAL=new Set(["Concluído","Cancelado"]);
const fmt=(v:string|null)=>v?new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(v)):"-";
const currentMonth=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`};
const metricLabel:Record<Exclude<Drill,null>,string>={registered:"Registradas no mês",delivered:"Entregues no mês",canceled:"Canceladas no mês",registration:"Em Registro",backlogInitial:"Backlog inicial",backlogCurrent:"Backlog atual"};
const PIPELINE_ORDER=["Registro","Qualificação","Fila de Negócio","Negócio","Fila Desenvolvimento","Desenvolvimento","Fila Qualidade","Qualidade","Integração","Concluído","Cancelado"] as const;

export function CorrectionMonthlyPanel(){
 const theme=useTheme();const [month,setMonth]=useState(currentMonth());const [report,setReport]=useState<Report|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState("");
 const [creators,setCreators]=useState<string[]>([]),[clients,setClients]=useState<string[]>([]),[urgencies,setUrgencies]=useState<string[]>([]),[states,setStates]=useState<string[]>([]);const [prioritized,setPrioritized]=useState<""|"true"|"false">("");const [search,setSearch]=useState("");const [drill,setDrill]=useState<Drill>(null);const [sliceDrill,setSliceDrill]=useState<SliceDrill>(null);
 useEffect(()=>{let active=true;setLoading(true);setError("");api.get<Report>("/azure-work-items/corrections/monthly-report",{params:{month},timeout:120000}).then(({data})=>{if(active)setReport(data)}).catch(e=>{if(active)setError(getApiErrorMessage(e,"Não foi possível carregar o report mensal."))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[month]);
 const options=useMemo(()=>({creators:[...new Set((report?.rows??[]).map(r=>r.createdBy).filter((v):v is string=>!!v))].sort(),clients:report?.filters?.clients??[...new Set((report?.rows??[]).map(r=>r.client).filter((v):v is string=>!!v))].sort(),urgencies:[...new Set((report?.rows??[]).map(r=>r.urgency).filter((v):v is string=>!!v))].sort(),states:[...new Set((report?.rows??[]).map(r=>r.status).filter(Boolean))].sort()}),[report]);
 const base=useMemo(()=>(report?.rows??[]).filter(r=>(!creators.length||!!r.createdBy&&creators.includes(r.createdBy))&&(!clients.length||!!r.client&&clients.includes(r.client))&&(!urgencies.length||!!r.urgency&&urgencies.includes(r.urgency))&&(!states.length||states.includes(r.status))&&(!prioritized||r.prioritized===(prioritized==="true"))),[report,creators,clients,urgencies,states,prioritized]);
 const match=(r:Row,k:Exclude<Drill,null>)=>k==="registered"?r.registeredInPeriod:k==="delivered"?r.deliveredInPeriod:k==="canceled"?r.canceledInPeriod:k==="registration"?r.enteredRegistrationInPeriod:k==="backlogInitial"?r.backlogInitial:r.backlogCurrent;
 const isPeriodRow=(r:Row)=>r.inPeriodUniverse??(r.registeredInPeriod||r.deliveredInPeriod||r.canceledInPeriod||r.enteredRegistrationInPeriod||r.backlogInitial||r.backlogCurrent);
 const value=(k:Exclude<Drill,null>)=>base.filter(r=>match(r,k)).length;const initial=value("backlogInitial"),current=value("backlogCurrent"),delta=current-initial;
 const cards=[
  {key:"backlogInitial" as const,label:"Backlog inicial",value:initial,note:"Estoque aberto na entrada",info:"Estoque aberto imediatamente antes do início do período, excluindo Tasks em Registro, Concluído e Cancelado. A Task não precisa ter movimentação no mês para compor este estoque."},
  {key:"registered" as const,label:"Tasks registradas",value:value("registered"),note:"Criadas no período",info:"Tasks criadas dentro do período selecionado, independentemente do estado em que se encontravam no snapshot de fechamento."},
  {key:"delivered" as const,label:"Tasks entregues",value:value("delivered"),note:"Concluídas no período",info:"Tasks que entraram efetivamente em Concluído durante o período e permaneceram em Concluído no snapshot de fechamento."},
  {key:"canceled" as const,label:"Tasks canceladas",value:value("canceled"),note:"Canceladas no período",info:"Tasks que entraram efetivamente em Cancelado durante o período e permaneceram em Cancelado no snapshot de fechamento."},
  {key:"registration" as const,label:"Tasks em Registro",value:value("registration"),note:"Fora do backlog",info:"Tasks que entraram em Registro durante o período e estavam em Registro no fechamento. Registro é exibido no pipeline, mas nunca compõe backlog."},
  {key:"backlogCurrent" as const,label:"Backlog atual",value:current,note:"Estoque aberto no fechamento",info:"Estoque aberto no snapshot de fechamento do período, excluindo Tasks em Registro, Concluído e Cancelado."},
 ] as const;
 const periodRows=base.filter(isPeriodRow);
 const statusCounts=base.reduce<Record<string,number>>((acc,row)=>{acc[row.status]=(acc[row.status]??0)+1;return acc},{});
 const expectedPipeline=PIPELINE_ORDER.map(name=>({name,total:statusCounts[name]??0}));
 const extraPipeline=Object.entries(statusCounts).filter(([name])=>!PIPELINE_ORDER.includes(name as typeof PIPELINE_ORDER[number])).map(([name,total])=>({name,total}));
 const pipeline=[...expectedPipeline,...extraPipeline];
 const urgency=Object.entries(periodRows.reduce<Record<string,number>>((acc,row)=>{const key=row.urgency||"Não informado";acc[key]=(acc[key]??0)+1;return acc},{})).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total);
 const priority=[{name:"Priorizadas",total:periodRows.filter(r=>r.prioritized===true).length},{name:"Não priorizadas",total:periodRows.filter(r=>r.prioritized===false).length},{name:"Não informado",total:periodRows.filter(r=>r.prioritized===null).length}].filter(x=>x.total);
 const detailed=useMemo(()=>base.filter(r=>{
  const selected=drill
   ? match(r,drill)
   : sliceDrill?.kind==="status"
    ? r.status===sliceDrill.value
    : sliceDrill?.kind==="urgency"
     ? isPeriodRow(r)&&(r.urgency||"Não informado")===sliceDrill.value
     : sliceDrill?.kind==="prioritized"
      ? isPeriodRow(r)&&r.prioritized===sliceDrill.value
      : isPeriodRow(r);
  return selected&&(!search.trim()||String(r.id).includes(search.trim())||r.title.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
 }),[base,drill,sliceDrill,search]);
 const periodUniverse=periodRows.length;
 const selectSlice=(next:Exclude<SliceDrill,null>)=>{setDrill(null);setSliceDrill(current=>current&&current.kind===next.kind&&current.value===next.value?null:next)};
 const activeDrillLabel=drill
  ? metricLabel[drill]
  : sliceDrill?.kind==="status"
   ? `Status · ${sliceDrill.value}`
   : sliceDrill?.kind==="urgency"
    ? `Urgência · ${sliceDrill.value}`
    : sliceDrill?.kind==="prioritized"
     ? `Priorização · ${sliceDrill.value===true?"Sim":sliceDrill.value===false?"Não":"Não informado"}`
     : "";
 const clear=()=>{setCreators([]);setClients([]);setUrgencies([]);setStates([]);setPrioritized("");setSearch("");setDrill(null);setSliceDrill(null)};
 const panel={border:"1px solid",borderColor:"divider",borderRadius:3,bgcolor:"background.paper",overflow:"hidden"};
 return <Box sx={{order:.5,display:"grid",gap:1.5}}>
  <Card elevation={0} sx={panel}><CardContent sx={{p:{xs:2,md:2.5}}}>
   <Stack direction={{xs:"column",lg:"row"}} justifyContent="space-between" gap={2}>
    <Box sx={{display:"flex",alignItems:"flex-start",gap:1}}><Box><Typography variant="overline" color="primary.main" sx={{fontWeight:900}}>REPORT EXECUTIVO · AZURE DEVOPS</Typography><Typography variant="h5" sx={{fontWeight:900}}>Visão mensal das Correções Clientes</Typography><Typography variant="body2" color="text.secondary">Estoque, entradas, saídas e pipeline no fechamento · System.Id distinto · America/Sao_Paulo.</Typography></Box><InfoButton title="Report executivo" description="Consolida exclusivamente Work Items do tipo Correção Clientes pertencentes à carteira oficial de clientes SIMER. O período usa America/Sao_Paulo e os indicadores históricos respeitam snapshots e mudanças efetivas de System.State."/></Box>
    <TextField label="Período" type="month" value={month} onChange={e=>setMonth(e.target.value)} size="small" sx={{minWidth:200}} slotProps={{inputLabel:{shrink:true}}}/>
   </Stack>
   <Stack direction={{xs:"column",lg:"row"}} gap={1.25} sx={{mt:2}}>
    <Autocomplete multiple size="small" options={options.creators} value={creators} onChange={(_,v)=>setCreators(v)} renderInput={p=><TextField {...p} label="Criado por"/>} sx={{flex:1}}/><Autocomplete multiple size="small" options={options.clients} value={clients} onChange={(_,v)=>setClients(v)} renderInput={p=><TextField {...p} label="Cliente · carteira SIMER"/>} sx={{flex:1}}/><Autocomplete multiple size="small" options={options.urgencies} value={urgencies} onChange={(_,v)=>setUrgencies(v)} renderInput={p=><TextField {...p} label="Urgência"/>} sx={{flex:1}}/><Autocomplete multiple size="small" options={options.states} value={states} onChange={(_,v)=>setStates(v)} renderInput={p=><TextField {...p} label="Status"/>} sx={{flex:1}}/><FormControl size="small" sx={{minWidth:150}}><InputLabel id="correction-prioritized-label">Priorizada</InputLabel><Select id="correction-prioritized" labelId="correction-prioritized-label" label="Priorizada" value={prioritized} onChange={e=>setPrioritized(e.target.value as typeof prioritized)}><MenuItem value="">Todas</MenuItem><MenuItem value="true">Sim</MenuItem><MenuItem value="false">Não</MenuItem></Select></FormControl><Button startIcon={<RestartAltOutlined/>} onClick={clear}>Limpar</Button>
   </Stack>
  </CardContent></Card>
  {error&&<Alert severity="error">{error}</Alert>}
  {report?.quality&&!report.quality.historicalMetricsReliable&&<Alert severity="warning"><b>{report.quality.snapshotAvailable?"Modo snapshot histórico parcial.":"Modo snapshot local."}</b> Os indicadores de movimentação mensal só são homologáveis quando o histórico de mudanças de status está disponível. {report.quality.historyError||report.quality.snapshotError||""}</Alert>}
  {!loading&&report&&report.rows.length===0&&<Alert severity="warning">Nenhuma Correção Cliente da carteira SIMER foi localizada no recorte carregado. O painel não considera este resultado como uma homologação válida enquanto o universo esperado não estiver disponível.</Alert>}
  {loading?<Box sx={{py:5,textAlign:"center"}}><CircularProgress size={28}/><Typography variant="body2" color="text.secondary" sx={{mt:1}}>Reconstruindo snapshots e movimentações do fechamento mensal…</Typography></Box>:report&&<>
   <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",sm:"repeat(2,1fr)",lg:"repeat(3,1fr)",xl:"repeat(6,1fr)"},gap:1.25}}>
    {cards.map(card=><Card key={card.key} elevation={0} onClick={()=>{setSliceDrill(null);setDrill(drill===card.key?null:card.key)}} sx={{...panel,cursor:"pointer",borderTop:"3px solid",borderTopColor:drill===card.key?"primary.main":"divider",transition:".18s", "&:hover":{transform:"translateY(-2px)",boxShadow:2}}}><CardContent sx={{p:1.8}}><Box sx={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:.75}}><Typography variant="caption" color="text.secondary" sx={{fontWeight:800}}>{card.label}</Typography><InfoButton title={card.label} description={card.info}/></Box><Typography variant="h4" sx={{fontWeight:950,my:.4}}>{card.value}</Typography><Typography variant="caption" color="text.secondary">{card.note}</Typography></CardContent></Card>)}
   </Box>
   <Card elevation={0} sx={{...panel,background:theme.palette.mode==="dark"?"linear-gradient(110deg,rgba(0,190,112,.09),rgba(255,255,255,.02))":"linear-gradient(110deg,rgba(0,190,112,.08),#fff)"}}><CardContent sx={{py:1.8}}>
    <Stack direction={{xs:"column",md:"row"}} justifyContent="space-between" alignItems={{md:"center"}} gap={2}><Box sx={{display:"flex",alignItems:"flex-start",gap:.75}}><Box><Typography variant="overline" color="primary.main" sx={{fontWeight:900}}>LEITURA EXECUTIVA DO MÊS</Typography><Typography sx={{fontWeight:900}}>Movimento do backlog</Typography></Box><InfoButton title="Leitura executiva do mês" description="Resume a variação entre Backlog inicial e atual, a relação entre entregas e entradas e o universo de Tasks que participou do período por entrada, saída, Registro ou backlog. É uma leitura gerencial; não altera as regras dos seis indicadores oficiais."/></Box><Stack direction="row" gap={3} alignItems="center"><Box><Typography variant="caption" color="text.secondary">Variação</Typography><Stack direction="row" alignItems="center" gap={0.5}>{delta <= 0 ? <TrendingDownOutlined color="success"/> : <TrendingUpOutlined color="warning"/>}<Typography variant="h6" sx={{fontWeight:900}}>{delta > 0 ? "+" : ""}{delta}</Typography></Stack></Box><Box><Typography variant="caption" color="text.secondary">Taxa de entrega</Typography><Typography variant="h6" sx={{fontWeight:900}}>{value("registered")?Math.round(value("delivered")/value("registered")*100):0}%</Typography></Box><Box><Typography variant="caption" color="text.secondary">Universo do período</Typography><Typography variant="h6" sx={{fontWeight:900}}>{periodUniverse}</Typography></Box></Stack></Stack>
   </CardContent></Card>
   <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",xl:"2fr 1fr 1fr"},gap:1.5}}>
    <Card elevation={0} sx={{...panel,height:"100%",display:"flex"}}><CardContent sx={{flex:1,display:"flex",flexDirection:"column"}}><CardHeading title="Pipeline no fechamento" subtitle="Distribuição operacional por status. Registro permanece visível, mas não compõe backlog." info="Mostra a quantidade de Correções Clientes em cada estado no snapshot de fechamento. Os estados seguem a ordem do fluxo de Correção Clientes; Registro aparece no pipeline, mas é excluído do backlog. Clique em uma barra para filtrar o recorte."/><Box sx={{flex:1,minHeight:Math.max(320,pipeline.length*34),mt:1}}><ResponsiveContainer width="100%" height="100%"><BarChart data={pipeline} layout="vertical" margin={{left:25,right:35}}><CartesianGrid strokeDasharray="3 5" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={130}/><ChartTooltip/><Bar dataKey="total" radius={[0,7,7,0]} onClick={d=>{const n=(d as {name?:string}).name;if(n)selectSlice({kind:"status",value:n})}}>{pipeline.map((_,i)=><Cell key={i} fill={chartPalette[i%chartPalette.length]}/>)}<LabelList dataKey="total" position="right"/></Bar></BarChart></ResponsiveContainer></Box></CardContent></Card>
    <Card elevation={0} sx={{...panel,height:"100%",display:"flex"}}><CardContent sx={{flex:1,display:"flex",flexDirection:"column"}}><CardHeading title="Urgência" subtitle="Concentração do universo filtrado." info="Distribui somente o universo do período pelo valor de urgência/criticidade existente no Azure. Respeita todos os filtros globais e permite drill-down ao clicar em uma barra."/><Box sx={{flex:1,minHeight:320,mt:1}}><ResponsiveContainer width="100%" height="100%"><BarChart data={urgency} margin={{top:18,right:12,bottom:34,left:4}}><CartesianGrid strokeDasharray="3 5" vertical={false}/><XAxis dataKey="name" interval={0} angle={-18} textAnchor="end" height={52}/><YAxis allowDecimals={false}/><ChartTooltip/><Bar dataKey="total" fill={semanticChartColors.attention} radius={[7,7,0,0]} onClick={d=>{const n=(d as {name?:string}).name;if(n)selectSlice({kind:"urgency",value:n})}}><LabelList dataKey="total" position="top"/></Bar></BarChart></ResponsiveContainer></Box></CardContent></Card>
    <Card elevation={0} sx={{...panel,height:"100%",display:"flex"}}><CardContent sx={{flex:1,display:"flex",flexDirection:"column"}}><CardHeading title="Priorização" subtitle="Distribuição das Tasks no fechamento." info="Mostra a priorização somente das Tasks que participam do universo do período. Respeita os filtros globais; clique no gráfico para aplicar o recorte."/><Box sx={{flex:1,minHeight:270,mt:1}}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={priority} dataKey="total" nameKey="name" innerRadius={68} outerRadius={105} paddingAngle={3} onClick={d=>{const n=(d as {name?:string}).name;if(n)selectSlice({kind:"prioritized",value:n==="Priorizadas"?true:n==="Não priorizadas"?false:null})}}>{priority.map((_,i)=><Cell key={i} fill={[aliareColors.green,aliareColors.info,semanticChartColors.attention][i%3]}/>)}</Pie><ChartTooltip/></PieChart></ResponsiveContainer></Box>{priority.map(p=><Stack key={p.name} direction="row" justifyContent="space-between" sx={{mb:.6}}><Typography variant="body2">{p.name}</Typography><Chip size="small" label={p.total}/></Stack>)}</CardContent></Card>
   </Box>
   <Card elevation={0} sx={panel}><CardContent>
    <Stack direction={{xs:"column",md:"row"}} justifyContent="space-between" gap={1.5}><Box><Box sx={{display:"flex",alignItems:"center",gap:.65}}><AssessmentOutlined color="primary"/><Typography sx={{fontWeight:900}}>Detalhamento rastreável{activeDrillLabel?` · ${activeDrillLabel}`:""}</Typography><InfoButton title="Detalhamento rastreável" description="Lista o universo correspondente aos filtros e ao drill-down selecionado. O ID abre o Work Item no Azure e a tabela preserva os campos mínimos solicitados para auditoria do report mensal."/></Box><Typography variant="body2" color="text.secondary">{detailed.length} task(s) no período/recorte atual · ID abre o Work Item no Azure.</Typography></Box><TextField size="small" label="Buscar ID ou título" value={search} onChange={e=>setSearch(e.target.value)} sx={{minWidth:{md:280}}}/></Stack>
    <TableContainer sx={{mt:1.5,maxHeight:560,border:"1px solid",borderColor:"divider",borderRadius:2,overflow:"auto"}}><Table stickyHeader size="small"><TableHead sx={{"& .MuiTableCell-head":{bgcolor:theme.palette.mode==="dark"?"#111827":"#172033",color:"#fff",fontWeight:900,borderBottom:"none",whiteSpace:"nowrap"}}}><TableRow>{["ID","Título","Cliente","Criado por","Criação","Status","Última mudança","Urgência","Priorizada","Responsável","Conclusão/Cancelamento"].map(h=><TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{detailed.map(r=><TableRow hover key={r.id}><TableCell>{r.remoteUrl?<Button size="small" component="a" href={r.remoteUrl} target="_blank" rel="noreferrer">{r.id}</Button>:r.id}</TableCell><TableCell sx={{minWidth:250,maxWidth:380}}>{r.title}</TableCell><TableCell>{r.client||"-"}</TableCell><TableCell>{r.createdBy||"-"}</TableCell><TableCell>{fmt(r.createdAt)}</TableCell><TableCell><Chip size="small" label={r.status}/></TableCell><TableCell>{fmt(r.lastStateChangedAt)}</TableCell><TableCell>{r.urgency||"-"}</TableCell><TableCell>{r.prioritized===null?"-":r.prioritized?"Sim":"Não"}</TableCell><TableCell>{r.assignedTo||"-"}</TableCell><TableCell>{TERMINAL.has(r.status)?fmt(r.terminalAt):"-"}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
    <Typography variant="caption" color="text.secondary" sx={{display:"block",mt:1.25}}>Fonte: {report.source}. O fechamento histórico não deve ser alterado por movimentações posteriores ao período.</Typography>
   </CardContent></Card>
  </>}
 </Box>
}