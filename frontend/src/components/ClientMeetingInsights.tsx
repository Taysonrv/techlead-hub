import { useMemo } from "react";
import { Box, Button, Card, CardContent, Chip, Divider, Stack, Typography } from "@mui/material";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AssessmentOutlined, CalendarMonthOutlined, GroupsOutlined } from "@mui/icons-material";
import { SelectableDonut, SelectableHorizontalBars, SelectableLines } from "./ExecutiveChartControls";
import type { ClientMeetingAnalytics, WeeklyTicket } from "../utils/clientMeetingAnalytics";

type Props={
  analysis:ClientMeetingAnalytics;
  tickets:WeeklyTicket[];
  selectedClient:string;
  onShowTickets:(title:string,ids:number[],subtitle?:string)=>void;
  onFocusClient?:(client:string)=>void;
};
const br=(n:number)=>n.toLocaleString("pt-BR");
const date=(d:Date)=>d.toLocaleDateString("pt-BR");
const p=(n:number|null)=>n===null?"Sem medição":n.toLocaleString("pt-BR",{maximumFractionDigits:1})+"%";
const monthKey=(raw:string)=>{const d=new Date(raw);return Number.isFinite(d.getTime())?d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"):"";};
const event=(t:WeeklyTicket,field:"createdDate"|"resolvedDate"|"closedDate",month:string)=>{
  const raw=t[field];return Boolean(raw&&monthKey(raw)===month);
};
function Kpi({label,value,note,delta,onClick,color}:{label:string;value:string;note:string;delta?:string;onClick:()=>void;color?:string}){
  return <Box role="button" tabIndex={0} aria-label={label+"; listar tickets"} onClick={onClick}
    onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick();}}}
    sx={{p:2,minWidth:0,display:"flex",flexDirection:"column",justifyContent:"space-between",gap:.7,
      borderRadius:2.5,border:"1px solid",borderColor:"divider",backgroundColor:"background.paper",cursor:"pointer",
      "&:hover":{borderColor:color??"primary.main",boxShadow:2},"&:focus-visible":{outline:"2px solid",outlineColor:"primary.main"}}}>
    <Typography variant="caption" color="text.secondary" sx={{fontWeight:700}}>{label}</Typography>
    <Typography variant="h5" sx={{fontWeight:850,color:color??"text.primary",fontVariantNumeric:"tabular-nums"}}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{note}</Typography>
    {delta&&<Typography variant="caption" sx={{fontWeight:750,color:"text.secondary"}}>{delta}</Typography>}
  </Box>;
}
export function ClientMeetingInsights({analysis:a,tickets,selectedClient,onShowTickets,onFocusClient}:Props){
  const month=a.month,prevMonth=a.previousCutoff.getFullYear()+"-"+String(a.previousCutoff.getMonth()+1).padStart(2,"0");
  const open=(title:string,rows:WeeklyTicket[],description?:string)=>onShowTickets(title,rows.map(x=>x.id),description);
  const byIds=(ids:number[])=>{const set=new Set(ids);return tickets.filter(t=>set.has(t.id));};
  const currentOpened=a.opened.currentTickets;
  const resolved=a.resolved.currentTickets;
  const prevName=date(a.previousCutoff);
  const nowName=date(a.monthCutoff);
  const variation=(difference:number,rate:number|null)=>rate===null?"Mês anterior sem base para percentual":(difference>0?"+":"")+br(difference)+" · "+(rate>0?"+":"")+p(rate)+" vs. período anterior";
  const chartData=useMemo(()=>a.months.map(m=>({
    month:m.month,opened:m.opened,resolved:m.resolved,pendingOpened:m.pendingOpened,bugs:m.bugs,
  })),[a.months]);
  const statusKeys=useMemo(()=>a.pendingByStatus.map(x=>({...x})),[a.pendingByStatus]);
  const allBacklog=a.pendingNow.length;
  const critical=a.pendingNow.filter(t=>t.urgency?.toLocaleLowerCase("pt-BR").includes("crític")).length;
  return <Card variant="outlined" sx={{mb:2,borderRadius:3,overflow:"hidden"}} id="client-weekly-insights">
    <Box sx={{px:{xs:2,md:2.7},py:1.9,borderBottom:"1px solid",borderColor:"divider",
      background:"linear-gradient(110deg,rgba(25,115,80,.10),rgba(49,104,133,.05),transparent)"}}>
      <Stack direction={{xs:"column",md:"row"}} sx={{gap:1.5,justifyContent:"space-between",alignItems:{md:"center"}}}>
        <Stack direction="row" sx={{alignItems:"center",gap:1.2}}>
          <AssessmentOutlined sx={{color:"success.main",fontSize:28}}/>
          <Box>
            <Typography variant="h6" sx={{fontWeight:850}}>Resultados mensais e acompanhamento da sustentação</Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedClient||"Carteira SIMER"} · Comparativo com meses anteriores · Fonte: snapshot Movidesk/Azure
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" sx={{gap:1,flexWrap:"wrap"}}>
          <Chip icon={<CalendarMonthOutlined/>} variant="outlined" label={"Referência: "+month.slice(5,7)+"/"+month.slice(0,4)} />
          <Chip size="small" variant="outlined" label={"Até "+nowName}/>
          {!selectedClient&&onFocusClient&&<Button variant="outlined" size="small" onClick={()=>onFocusClient("BOM JESUS COOPERATIVA AGROINDUSTRIAL - LAPA-PR")} sx={{textTransform:"none"}}>Preparar reunião Bom Jesus</Button>}
        </Stack>
      </Stack>
    </Box>
    <CardContent sx={{p:{xs:1.5,md:2.4}}}>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"repeat(2,minmax(0,1fr))",md:"repeat(3,minmax(0,1fr))",xl:"repeat(6,minmax(0,1fr))"},gap:1.2,mb:2}}>
        <Kpi label="Abertos neste mês" value={br(a.opened.current)} note={"Mesmo período anterior: "+br(a.opened.previous)}
          delta={variation(a.opened.difference,a.opened.rate)} onClick={()=>open("Abertos em "+month,currentOpened)}/>
        <Kpi label="Resolvidos neste mês" value={br(a.resolved.current)} note={"Mesmo período anterior: "+br(a.resolved.previous)}
          delta={variation(a.resolved.difference,a.resolved.rate)} color="success.main" onClick={()=>open("Resolvidos em "+month,resolved)}/>
        <Kpi label="Categoria Bug · abertos no mês" value={br(a.bug.current)} note={"Mesmo período anterior: "+br(a.bug.previous)}
          delta={variation(a.bug.difference,a.bug.rate)} onClick={()=>open("Categoria Bug — "+month,a.bug.currentTickets)}/>
        <Kpi label="Pendentes públicos atuais" value={br(allBacklog)}
          note="Estoque atual, inclusive tickets antigos" color="warning.main"
          delta={br(critical)+" com urgência crítica"} onClick={()=>open("Backlog público atual",a.pendingNow)}/>
        <Kpi label="Pendentes abertos no filtro" value={br(a.pendingInPeriod.length)}
          note="Atualmente abertos; criação dentro do período da tela"
          onClick={()=>open("Pendentes públicos abertos no período",a.pendingInPeriod)}/>
        <Kpi label="SLA de 1ª resposta" value={p(a.responseSla.percentage)}
          note={br(a.responseSla.within)+" de "+br(a.responseSla.measured)+" tickets medidos"}
          onClick={()=>open("SLA de 1ª resposta — medidos",a.responseSla.tickets)}/>
      </Box>
      <Stack direction={{xs:"column",md:"row"}} sx={{justifyContent:"space-between",alignItems:{md:"center"},gap:1,mb:2,px:.5}}>
        <Stack direction="row" sx={{gap:1,flexWrap:"wrap"}}>
          <Chip size="small" variant="outlined" color="success" label={"SLA de solução: "+p(a.solutionSla.percentage)+" · "+a.solutionSla.measured+" medidos"}/>
          <Chip size="small" variant="outlined" label={"Primeiro contato: "+p(a.firstCall.percentage)+" · "+a.firstCall.measured+" medidos"}/>
          <Chip size="small" variant="outlined" label={"CSAT positivo: "+p(a.csat.percentage)+" · "+a.csat.measured+" avaliações"}/>
          <Chip size="small" variant="outlined" label={"Reaberturas: "+br(a.reopened)}/>
        </Stack>
        <Typography variant="caption" color="text.secondary">Comparação: 01/{month.slice(5,7)}–{nowName} × mês anterior até {prevName}</Typography>
      </Stack>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",xl:"1fr 1fr"},gap:2,mb:2}}>
        <SelectableLines title="Evolução mensal — demanda e resolutividade"
          description="Seis meses • aberturas pela criação e resoluções pela data de conclusão; selecione séries para analisar"
          data={chartData} series={[
            {key:"opened",name:"Abertos",color:"#197350"},
            {key:"resolved",name:"Resolvidos",color:"#316885"},
            {key:"bugs",name:"Categoria Bug",color:"#F26727"},
          ]}
          onInspect={(m,series)=>open("Movimentação de "+m+" — "+series,
            tickets.filter(t=>series==="resolved"?event(t,"resolvedDate",m):
              event(t,"createdDate",m)&&(series!=="bugs"||t.category?.trim().toLocaleLowerCase("pt-BR")==="bug")))}
        />
        <SelectableLines title="Pendentes atuais por mês de abertura"
          description="Não é backlog histórico: mostra onde foram abertos os tickets que continuam pendentes no snapshot atual"
          data={chartData} series={[{key:"pendingOpened",name:"Ainda pendentes",color:"#BD7229"}]}
          onInspect={(m)=>open("Pendentes atuais abertos em "+m,a.pendingNow.filter(t=>event(t,"createdDate",m)))}
        />
      </Box>
      <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",xl:"1.35fr .8fr"},gap:2}}>
        <SelectableHorizontalBars title={selectedClient?"Pendentes públicos — "+selectedClient:"Pendentes públicos por cliente"}
          description="Mesmo conceito do Dashboard: tickets públicos (tipo 2) com status Novo, Em atendimento ou Parado. Estoque atual."
          parts={a.pendingByClient.map((r,i)=>({name:r.name,value:r.value,color:i===0?"#197350":i%2===0?"#316885":"#65A98C"}))}
          onInspect={name=>open("Pendentes atuais — "+name,byIds(a.pendingByClient.find(x=>x.name===name)?.ids??[]))}
        />
        <SelectableDonut title="Situação dos pendentes públicos" description="Composição atual por status canônico"
          parts={statusKeys.map((r,i)=>({name:r.name,value:r.value,color:["#197350","#F26727","#316885","#82977F"][i%4]!}))}
          onInspect={name=>open("Pendentes atuais — "+name,byIds(a.pendingByStatus.find(x=>x.name===name)?.ids??[]))}
        />
      </Box>
      <Divider sx={{my:1.8}}/>
      <Stack direction={{xs:"column",md:"row"}} sx={{gap:.7,justifyContent:"space-between"}}>
        <Typography variant="caption" color="text.secondary">
          Comparações mensais usam eventos até a data de referência; o backlog representa somente o estado atual, sem reconstrução histórica.
          SLA considera exclusivamente tickets com marcos completos. A categoria Bug não comprova defeito técnico confirmado.
        </Typography>
        <Button size="small" variant="text" sx={{textTransform:"none",flexShrink:0}} onClick={()=>open("Todos os pendentes do cliente / carteira",a.pendingNow)}>
          <GroupsOutlined fontSize="small" sx={{mr:.5}}/> Listar pendências
        </Button>
      </Stack>
    </CardContent>
  </Card>;
}

/** Página limpa para o modo de apresentação e para o PDF do cliente. */
export function ClientMeetingPresentation({analysis:a,client}:{
  analysis:ClientMeetingAnalytics;client:string;
}){
  const card={p:1.5,border:"1px solid",borderColor:"divider",borderRadius:2,backgroundColor:"background.paper"};
  const rows=a.months.map(m=>({month:m.month,abertos:m.opened,resolvidos:m.resolved,pendentesAbertos:m.pendingOpened}));
  return <Box sx={{minWidth:0,width:"100%"}}>
    <Typography variant="h5" sx={{fontWeight:850,mb:1}}>Resultados mensais · Suporte e Sustentação</Typography>
    <Typography variant="body2" color="text.secondary" sx={{mb:1.5}}>
      {client} • Histórico de 6 meses até {date(a.monthCutoff)} • comparação com período equivalente anterior.
    </Typography>
    <Box sx={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:1,mb:1.5}}>
      {[
        ["Abertos",br(a.opened.current),"Anterior: "+br(a.opened.previous)],
        ["Resolvidos",br(a.resolved.current),"Anterior: "+br(a.resolved.previous)],
        ["Backlog público",br(a.pendingNow.length),"Estoque atual"],
        ["SLA 1ª resposta",p(a.responseSla.percentage),br(a.responseSla.measured)+" medidos"],
      ].map(([label,val,note])=><Box key={label} sx={card}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h5" sx={{fontWeight:850,mt:.5}}>{val}</Typography>
        <Typography variant="caption" color="text.secondary">{note}</Typography>
      </Box>)}
    </Box>
    <Box sx={{...card,mb:1}}>
      <Typography sx={{fontWeight:800,fontSize:".95rem"}}>Evolução dos atendimentos</Typography>
      <Box sx={{height:245,width:"100%"}}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{top:15,right:12,left:-19,bottom:2}}>
            <CartesianGrid strokeDasharray="3 4" vertical={false} opacity={.23}/>
            <XAxis dataKey="month" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:10}}/>
            <Tooltip/><Legend wrapperStyle={{fontSize:10}}/>
            <Line dataKey="abertos" name="Abertos" type="monotone" stroke="#197350" strokeWidth={3} dot={{r:3}}/>
            <Line dataKey="resolvidos" name="Resolvidos" type="monotone" stroke="#316885" strokeWidth={3} dot={{r:3}}/>
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
    <Stack direction="row" sx={{gap:1,flexWrap:"wrap",mb:1}}>
      <Chip size="small" label={"SLA solução: "+p(a.solutionSla.percentage)+" ("+a.solutionSla.measured+" medidos)"}/>
      <Chip size="small" label={"1º contato: "+p(a.firstCall.percentage)}/>
      <Chip size="small" label={"CSAT positivo: "+p(a.csat.percentage)}/>
      <Chip size="small" label={"Reaberturas: "+a.reopened}/>
    </Stack>
    <Typography variant="caption" color="text.secondary">
      Pendências = tickets públicos em aberto no snapshot atual. Não representa saldo histórico do mês.
      SLA somente com datas válidas. Visão produzida com dados sincronizados do HUB.
    </Typography>
  </Box>;
}
