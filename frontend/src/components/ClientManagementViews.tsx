import { useMemo, useState } from "react";
import {
  Box, Button, Chip, FormControl, InputLabel, Link, MenuItem, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination,
  TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import { Cell, CartesianGrid, Bar, BarChart, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import type { BomJesusExecutiveAudit } from "./BomJesusExecutiveDashboard";

export type ClientManagementTicket = {
  id:number; subject:string; createdDate:string; client:string; category:string;
  status:string; owner:string|null; ownerTeam:string|null; serviceContext:string;
  taskNumber:number|null; taskState:string; deliveredVersion:string;
  isCorrectionTask:boolean; supportOlaBreached:boolean|null;
};
type Dimension="owner"|"category"|"status"|"service";
type Measure="tickets"|"bugs"|"corrections"|"olaAlerts";
const dims:ReadonlyArray<{key:Dimension;label:string}>=[
  {key:"owner",label:"Analista responsável"}, {key:"category",label:"Categoria atual"},
  {key:"status",label:"Situação do atendimento"}, {key:"service",label:"Rotina / serviço"},
];
const measures:ReadonlyArray<{key:Measure;label:string}>=[
  {key:"tickets",label:"Quantidade de tickets"}, {key:"bugs",label:"Categoria Bug"},
  {key:"corrections",label:"Correções vinculadas"}, {key:"olaAlerts",label:"Alertas de OLA"},
];
const chartColors=["#197350","#F26727","#CDD936","#316885","#819888","#8A69A5","#D9A244","#9A5751"];
export const dimensionOf=(r:ClientManagementTicket,dim:Dimension):string=>{
  if(dim==="owner")return r.owner?.trim()||"Não atribuído";
  if(dim==="category")return r.category?.trim()||"Sem categoria";
  if(dim==="status")return r.status?.trim()||"Sem situação";
  const context=r.serviceContext?.split(" / ").map(x=>x.trim()).filter(Boolean)??[];
  return context.length ? (context.length>1?context[1]!:context[0]!) : "Não classificado";
};
export const measured=(r:ClientManagementTicket,m:Measure):number=>{
  if(m==="bugs")return r.category.toLocaleLowerCase("pt-BR").trim()==="bug"?1:0;
  if(m==="corrections")return r.isCorrectionTask?1:0;
  if(m==="olaAlerts")return r.isCorrectionTask && r.supportOlaBreached===true?1:0;
  return 1;
};
export const rankTickets=(rows:ClientManagementTicket[],dim:Dimension,measure:Measure="tickets")=>{
  const groups=new Map<string,{name:string;tickets:number;value:number;corrections:number;olaAlerts:number}>();
  for(const r of rows){
    const name=dimensionOf(r,dim);
    const row=groups.get(name)??{name,tickets:0,value:0,corrections:0,olaAlerts:0};
    row.tickets++;row.value+=measured(r,measure);row.corrections+=measured(r,"corrections");row.olaAlerts+=measured(r,"olaAlerts");
    groups.set(name,row);
  }
  return [...groups.values()].sort((a,b)=>b.value-a.value||b.tickets-a.tickets||a.name.localeCompare(b.name,"pt-BR"));
};
const number=(n:number)=>n.toLocaleString("pt-BR");
const formatDate=(iso:string)=>new Date(iso).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"});
const ticketLink=(id:number)=><Link href={`/tickets?movidesk=${id}`} underline="hover" sx={{fontWeight:700}}>#{id}</Link>;
const metricCard=(label:string,value:string|number,note:string,attention=false)=><Box key={label}
  sx={{minWidth:0,p:2,borderRadius:2.5,border:"1px solid",borderColor:"divider",backgroundColor:"background.paper",display:"flex",flexDirection:"column",gap:1}}>
  <Typography variant="caption" color="text.secondary" sx={{fontWeight:600}}>{label}</Typography>
  <Typography variant="h5" sx={{fontWeight:800,color:attention?"warning.main":"text.primary",fontVariantNumeric:"tabular-nums"}}>{value}</Typography>
  <Typography variant="caption" color="text.secondary">{note}</Typography>
</Box>;
const panelSx={p:2.2,border:"1px solid",borderColor:"divider",borderRadius:2.5,backgroundColor:"background.paper",minWidth:0};
function RankedTable({rows,title,metric="tickets",onInspect}:{rows:ClientManagementTicket[];title:Dimension;metric?:Measure;onInspect?:(dimension:Dimension,value:string)=>void}){
  const ranking=rankTickets(rows,title,metric);
  const label=dims.find(x=>x.key===title)?.label??title;
  const total=ranking.reduce((sum,item)=>sum+item.value,0);
  return <Box sx={panelSx}>
    <Stack direction="row" sx={{justifyContent:"space-between",alignItems:"center",mb:1.5}}>
      <Box><Typography variant="subtitle1" sx={{fontWeight:750}}>Ranking por {label.toLocaleLowerCase("pt-BR")}</Typography>
        <Typography variant="caption" color="text.secondary">{number(ranking.length)} grupos • base do cliente selecionado</Typography></Box>
    </Stack>
    <TableContainer sx={{maxHeight:340}}><Table stickyHeader size="small">
      <TableHead><TableRow>{["#","Grupo","Tickets","Correções","Participação"].map(v=><TableCell key={v} sx={{fontWeight:750,whiteSpace:"nowrap"}}>{v}</TableCell>)}</TableRow></TableHead>
      <TableBody>{ranking.slice(0,10).map((r,i)=><TableRow hover key={r.name}>
        <TableCell sx={{color:"text.secondary"}}>{i+1}</TableCell>
        <TableCell sx={{maxWidth:215}}>
          <Tooltip title={r.name}><Button size="small" color="inherit" onClick={()=>onInspect?.(title,r.name)}
            sx={{textTransform:"none",p:0,justifyContent:"flex-start",textAlign:"left",fontSize:12,fontWeight:500,maxWidth:"100%"}}>
            <Box component="span" sx={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</Box>
          </Button></Tooltip>
        </TableCell>
        <TableCell align="right">{number(r.tickets)}</TableCell><TableCell align="right">{number(r.corrections)}</TableCell>
        <TableCell align="right">{total?(r.value/total*100).toLocaleString("pt-BR",{maximumFractionDigits:1}):"0"}%</TableCell>
      </TableRow>)}</TableBody>
    </Table></TableContainer>
    {!ranking.length&&<Typography sx={{py:3,textAlign:"center"}} color="text.secondary">Sem registros no período.</Typography>}
  </Box>;
}
export function ClientManagementOverview({rows,audit}:{rows:ClientManagementTicket[];audit:BomJesusExecutiveAudit}){
  const categoryRanking=useMemo(()=>rankTickets(rows,"category").slice(0,7),[rows]);
  const tickets=rows.length;
  const donut=(title:string,items:Array<{name:string;value:number}>,description:string)=><Box sx={panelSx}>
    <Typography variant="subtitle1" sx={{fontWeight:750}}>{title}</Typography>
    <Typography variant="caption" color="text.secondary">{description}</Typography>
    {items.some(x=>x.value>0)?
    <Box sx={{height:270}}><ResponsiveContainer width="100%" height="100%"><PieChart>
      <Pie data={items.filter(x=>x.value>0)} dataKey="value" nameKey="name" cx="45%" cy="47%" innerRadius={55} outerRadius={90} stroke="none" paddingAngle={2}>
        {items.filter(x=>x.value>0).map((v,i)=><Cell key={v.name} fill={chartColors[i%chartColors.length]}/>)}
      </Pie>
      <ChartTooltip formatter={(value,name)=>[`${value} tickets`,String(name)]}/>
      <Legend verticalAlign="bottom" height={35} wrapperStyle={{fontSize:11}}/>
    </PieChart></ResponsiveContainer></Box>:
    <Box sx={{height:270,display:"grid",placeItems:"center"}}><Typography color="text.secondary" variant="body2">Sem dados para o gráfico</Typography></Box>}
  </Box>;
  return <Stack spacing={2}>
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"repeat(2,minmax(0,1fr))",md:"repeat(3,minmax(0,1fr))",xl:"repeat(6,minmax(0,1fr))"},gap:1.5}}>
      {metricCard("Tickets do período",number(tickets),"Abertos pelo cliente no intervalo")}
      {metricCard("Categorias Bug",number(audit.matrix.bugCategory),"Classificação atual Movidesk")}
      {metricCard("Correções vinculadas",number(audit.corrections.tickets),`${audit.corrections.distinctTasks} Tasks distintas`)}
      {metricCard("Correções concluídas",number(audit.corrections.concluded),`${audit.corrections.concludedWithVersion} com versão`)}
      {metricCard("OLA no prazo",audit.ola.withinTargetPercent===null?"N/D":`${audit.ola.withinTargetPercent}%`,`${audit.ola.measured} casos mensuráveis`)}
      {metricCard("Alertas de OLA",number(audit.ola.alerts),"Sujeitos à auditoria",true)}
    </Box>
    <Box sx={panelSx}>
      <Typography variant="subtitle1" sx={{fontWeight:750,mb:.5}}>Composição dos atendimentos por categoria</Typography>
      <Typography variant="caption" color="text.secondary">Distribuição das categorias atuais registradas no Movidesk</Typography>
      <Box sx={{height:Math.max(245,categoryRanking.length*45),mt:1.5}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={categoryRanking} layout="vertical" margin={{top:6,left:5,right:40,bottom:4}}>
            <CartesianGrid strokeDasharray="3 4" horizontal={false} stroke="rgba(110,130,120,.18)"/>
            <XAxis type="number" allowDecimals={false} tick={{fontSize:11}}/>
            <YAxis type="category" dataKey="name" width={170} tick={{fontSize:11}}/>
            <ChartTooltip formatter={v=>[`${v} tickets`,"Atendimentos"]}/>
            <Bar dataKey="tickets" name="Atendimentos" radius={[0,6,6,0]} maxBarSize={25}>
              {categoryRanking.map((r,i)=><Cell key={r.name} fill={chartColors[i%chartColors.length]}/>)}
              <LabelList dataKey="tickets" position="right" style={{fontSize:12,fill:"currentColor"}}/>
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",md:"1fr 1fr"},gap:2}}>
      {donut("Situação das correções",[
        {name:"Concluídas",value:audit.corrections.concluded},{name:"Em andamento",value:audit.corrections.open},
        {name:"Canceladas",value:audit.corrections.cancelled},
      ],"Distribuição das correções vinculadas a Tasks do Azure")}
      {donut("OLA do Suporte",[
        {name:"Dentro da meta",value:audit.ola.onTime},{name:"Alerta",value:audit.ola.alerts},
        {name:"Não mensurável",value:audit.ola.unmeasurable},{name:"Canceladas",value:audit.ola.cancelled},
      ],"Avaliação preliminar: criação da Task como referência de passagem")}
    </Box>
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"1fr 1fr"},gap:2}}>
      <RankedTable rows={rows} title="status"/>
      <RankedTable rows={rows} title="service"/>
    </Box>
    <Typography variant="caption" color="text.secondary">
      Os gráficos exibem ocorrências, não valores financeiros. Distribuições por categoria e situação usam o estado atual dos tickets.
    </Typography>
  </Stack>;
}
export function ClientManagementRankings({rows,onInspect}:{rows:ClientManagementTicket[];onInspect?:(dimension:Dimension,value:string)=>void}){
  const [metric,setMetric]=useState<Measure>("tickets");
  return <Stack spacing={2}>
    <Stack direction={{xs:"column",sm:"row"}} sx={{alignItems:{sm:"center"},justifyContent:"space-between",gap:1}}>
      <Box><Typography variant="h6" sx={{fontWeight:750}}>Ranking operacional</Typography>
        <Typography variant="body2" color="text.secondary">Participação calculada no universo selecionado; grupos não são uma nota de desempenho individual.</Typography></Box>
      <TextField select size="small" value={metric} label="Medida" onChange={e=>setMetric(e.target.value as Measure)} sx={{minWidth:240}}>
        {measures.map(x=><MenuItem key={x.key} value={x.key}>{x.label}</MenuItem>)}
      </TextField>
    </Stack>
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"repeat(2,minmax(0,1fr))"},gap:2}}>
      {dims.map(d=><RankedTable key={d.key} rows={rows} title={d.key} metric={metric} onInspect={onInspect}/>)}
    </Box>
  </Stack>;
}
export function ClientManagementTickets({rows,initialFilter}:{rows:ClientManagementTicket[];initialFilter?:{dimension:Dimension;value:string}|null}){
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState("TODAS");
  const [page,setPage]=useState(0);
  const [pageSize,setPageSize]=useState(15);
  const [sort,setSort]=useState<"newest"|"oldest"|"ticket">("newest");
  const categories=useMemo(()=>[...new Set(rows.map(x=>x.category||"Sem categoria"))].sort((a,b)=>a.localeCompare(b,"pt-BR")),[rows]);
  const listed=useMemo(()=>{
    const query=search.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    const filtered=rows.filter(r=>(category==="TODAS"||(r.category||"Sem categoria")===category)
      &&(!initialFilter||dimensionOf(r,initialFilter.dimension)===initialFilter.value)
      &&(!query||[r.id,r.subject,r.owner,r.category,r.status,r.taskNumber].some(v=>
        String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes(query))));
    return [...filtered].sort((a,b)=>sort==="ticket"?b.id-a.id:sort==="oldest"?
      a.createdDate.localeCompare(b.createdDate):b.createdDate.localeCompare(a.createdDate));
  },[rows,category,initialFilter,search,sort]);
  const shown=listed.slice(page*pageSize,(page+1)*pageSize);
  return <Box sx={panelSx}>
    <Stack direction={{xs:"column",md:"row"}} sx={{justifyContent:"space-between",gap:2,mb:2}}>
      <Box><Typography variant="h6" sx={{fontWeight:750}}>Lista de atendimentos</Typography>
        <Typography variant="body2" color="text.secondary">{number(listed.length)} tickets • clique no número para consultar o atendimento</Typography>
        {initialFilter&&<Chip size="small" color="info" variant="outlined" sx={{mt:.7}} label={`${dims.find(d=>d.key===initialFilter.dimension)?.label}: ${initialFilter.value}`}/>}
      </Box>
      <Stack direction="row" sx={{gap:1,flexWrap:"wrap"}}>
        <TextField size="small" label="Buscar ticket, assunto, Task" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} sx={{minWidth:245}}/>
        <TextField select size="small" label="Categoria" value={category} onChange={e=>{setCategory(e.target.value);setPage(0);}} sx={{minWidth:160}}>
          <MenuItem value="TODAS">Todas</MenuItem>{categories.map(x=><MenuItem key={x} value={x}>{x}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Ordenar" value={sort} onChange={e=>{setSort(e.target.value as "newest"|"oldest"|"ticket");setPage(0);}} sx={{minWidth:155}}>
          <MenuItem value="newest">Mais recentes</MenuItem><MenuItem value="oldest">Mais antigos</MenuItem><MenuItem value="ticket">Número do ticket</MenuItem>
        </TextField>
      </Stack>
    </Stack>
    <TableContainer sx={{maxHeight:590}}><Table stickyHeader size="small" sx={{minWidth:920}}>
      <TableHead><TableRow>{["Abertura","Ticket","Assunto","Categoria","Responsável","Situação","Task Azure","OLA Suporte"].map(label=>
        <TableCell key={label} sx={{fontWeight:750,backgroundColor:"action.hover"}}>{label}</TableCell>)}</TableRow></TableHead>
      <TableBody>{shown.map((r,i)=><TableRow key={r.id} hover sx={{backgroundColor:i%2?"action.hover":"transparent"}}>
        <TableCell sx={{whiteSpace:"nowrap"}}>{formatDate(r.createdDate)}</TableCell>
        <TableCell>{ticketLink(r.id)}</TableCell><TableCell sx={{minWidth:230,maxWidth:340}}>{r.subject}</TableCell>
        <TableCell>{r.category||"—"}</TableCell><TableCell>{r.owner||"—"}</TableCell>
        <TableCell>{r.status||"—"}</TableCell><TableCell>{r.taskNumber??"—"}</TableCell>
        <TableCell>{!r.isCorrectionTask?"—":r.supportOlaBreached===null?"Sem medição":
          r.supportOlaBreached?<Chip label="Alerta preliminar" color="warning" size="small"/>:<Chip label="Dentro da meta" color="success" variant="outlined" size="small"/>}</TableCell>
      </TableRow>)}</TableBody>
    </Table></TableContainer>
    {!listed.length&&<Typography sx={{textAlign:"center",py:3}} color="text.secondary">Nenhum atendimento corresponde aos filtros.</Typography>}
    <TablePagination component="div" count={listed.length} page={page} onPageChange={(_,v)=>setPage(v)} rowsPerPage={pageSize}
      onRowsPerPageChange={e=>{setPageSize(Number(e.target.value));setPage(0);}} rowsPerPageOptions={[15,30,50]}
      labelRowsPerPage="Linhas por página" labelDisplayedRows={({from,to,count})=>`${from}–${to} de ${count}`}/>
  </Box>;
}
export function ClientManagementPivot({rows}:{rows:ClientManagementTicket[]}){
  const [rowDim,setRowDim]=useState<Dimension>("owner");
  const [colDim,setColDim]=useState<Dimension>("category");
  const [measure,setMeasure]=useState<Measure>("tickets");
  const [onlyTop,setOnlyTop]=useState("10");
  const aggregate=useMemo(()=>{
    const rowTotals=rankTickets(rows,rowDim,measure);
    const colTotals=rankTickets(rows,colDim,measure);
    const maxCols=10;
    const selectedColumns=colTotals.slice(0,maxCols).map(x=>x.name);
    const selectedRows=onlyTop==="all"?rowTotals:rowTotals.slice(0,Number(onlyTop));
    const matrix=selectedRows.map(row=>{
      const byCol=new Map<string,number>();
      rows.filter(x=>dimensionOf(x,rowDim)===row.name).forEach(x=>{
        const col=dimensionOf(x,colDim);
        byCol.set(col,(byCol.get(col)||0)+measured(x,measure));
      });
      const named=selectedColumns.map(x=>byCol.get(x)||0);
      return {name:row.name,values:named,others:row.value-named.reduce((a,b)=>a+b,0),total:row.value};
    });
    const total=rows.reduce((sum,r)=>sum+measured(r,measure),0);
    const byColumn=selectedColumns.map((c)=>rows.filter(r=>dimensionOf(r,colDim)===c).reduce((n,r)=>n+measured(r,measure),0));
    return {matrix,columns:selectedColumns,total,byColumn,others:total-byColumn.reduce((a,b)=>a+b,0)};
  },[rows,rowDim,colDim,measure,onlyTop]);
  return <Stack spacing={2}>
    <Box sx={panelSx}>
      <Typography variant="h6" sx={{fontWeight:750}}>Análise multidimensional</Typography>
      <Typography variant="body2" color="text.secondary" sx={{mb:2}}>
        Cruze livremente duas dimensões da carteira. Os totais respeitam o cliente e o período selecionados.
      </Typography>
      <Stack direction="row" sx={{gap:1.5,flexWrap:"wrap"}}>
        <FormControl size="small" sx={{minWidth:205}}><InputLabel>Linhas</InputLabel><Select label="Linhas" value={rowDim}
          onChange={e=>{const value=e.target.value as Dimension;setRowDim(value);if(value===colDim)setColDim(dims.find(x=>x.key!==value)!.key);}}>
          {dims.map(x=><MenuItem key={x.key} value={x.key}>{x.label}</MenuItem>)}
        </Select></FormControl>
        <FormControl size="small" sx={{minWidth:205}}><InputLabel>Colunas</InputLabel><Select label="Colunas" value={colDim}
          onChange={e=>{const value=e.target.value as Dimension;setColDim(value);if(value===rowDim)setRowDim(dims.find(x=>x.key!==value)!.key);}}>
          {dims.map(x=><MenuItem key={x.key} value={x.key}>{x.label}</MenuItem>)}
        </Select></FormControl>
        <FormControl size="small" sx={{minWidth:205}}><InputLabel>Indicador</InputLabel><Select label="Indicador" value={measure} onChange={e=>setMeasure(e.target.value as Measure)}>
          {measures.map(x=><MenuItem key={x.key} value={x.key}>{x.label}</MenuItem>)}
        </Select></FormControl>
        <FormControl size="small" sx={{minWidth:150}}><InputLabel>Mostrar linhas</InputLabel><Select label="Mostrar linhas" value={onlyTop} onChange={e=>setOnlyTop(e.target.value)}>
          <MenuItem value="10">Top 10</MenuItem><MenuItem value="20">Top 20</MenuItem><MenuItem value="all">Todas</MenuItem>
        </Select></FormControl>
      </Stack>
    </Box>
    <Box sx={panelSx}>
      <Stack direction="row" sx={{gap:1,flexWrap:"wrap",mb:1}}>
        <Chip color="primary" variant="outlined" label={`Linhas: ${dims.find(x=>x.key===rowDim)?.label}`}/>
        <Chip variant="outlined" label={`Colunas: ${dims.find(x=>x.key===colDim)?.label}`}/>
        <Chip color="success" variant="outlined" label={`Total geral: ${number(aggregate.total)}`}/>
      </Stack>
      <TableContainer sx={{maxHeight:530}}><Table stickyHeader size="small" sx={{minWidth:740}}>
        <TableHead><TableRow><TableCell sx={{fontWeight:800,position:"sticky",left:0,zIndex:4,backgroundColor:"background.paper",minWidth:210}}>
          {dims.find(x=>x.key===rowDim)?.label}</TableCell>
          {aggregate.columns.map(x=><TableCell key={x} align="right" sx={{fontWeight:800,minWidth:100,whiteSpace:"normal",maxWidth:180}}>{x}</TableCell>)}
          <TableCell align="right" sx={{fontWeight:800}}>Outros</TableCell><TableCell align="right" sx={{fontWeight:800}}>Total</TableCell>
        </TableRow></TableHead>
        <TableBody>{aggregate.matrix.map((x,i)=><TableRow key={x.name} hover sx={{backgroundColor:i%2?"action.hover":"transparent"}}>
          <TableCell sx={{fontWeight:650,position:"sticky",left:0,backgroundColor:"background.paper",zIndex:1,maxWidth:250}}>
            {x.name}</TableCell>
          {x.values.map((v,k)=><TableCell key={aggregate.columns[k]} align="right" sx={{fontVariantNumeric:"tabular-nums",
            backgroundColor:v>0?"rgba(25,115,80,.07)":undefined}}>{v?number(v):"—"}</TableCell>)}
          <TableCell align="right">{number(x.others)}</TableCell><TableCell align="right" sx={{fontWeight:800}}>{number(x.total)}</TableCell>
        </TableRow>)}
        <TableRow sx={{backgroundColor:"action.hover"}}>
          <TableCell sx={{fontWeight:850,position:"sticky",left:0,backgroundColor:"background.paper"}}>Total geral</TableCell>
          {aggregate.byColumn.map((v,i)=><TableCell key={aggregate.columns[i]} align="right" sx={{fontWeight:850}}>{number(v)}</TableCell>)}
          <TableCell align="right" sx={{fontWeight:850}}>{number(aggregate.others)}</TableCell>
          <TableCell align="right" sx={{fontWeight:850}}>{number(aggregate.total)}</TableCell>
        </TableRow>
        </TableBody>
      </Table></TableContainer>
      <Typography variant="caption" color="text.secondary" sx={{display:"block",mt:1}}>
        Se houver mais de dez valores de coluna, os demais aparecem em “Outros”. O total geral inclui todas as linhas, mesmo que apenas o Top 10/20 seja exibido.
      </Typography>
    </Box>
  </Stack>;
}
