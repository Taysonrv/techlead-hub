import { useMemo, useState } from "react";
import { SelectableDonut, SelectableLines } from "./ExecutiveChartControls";
import type { ClientManagementTicket, ClientInspect } from "./ClientManagementViews";
import {
  Alert, Box, Card, CardContent, Chip, Divider, FormControl, InputLabel, Link, MenuItem,
  Select, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, TextField, Typography,
} from "@mui/material";

type OLA = { ticketId:number;subject:string;taskId:number|null;taskState:string;priority:string|null;tier:string;tierVerified:boolean;category:string;openedAt:string;taskCreatedAt:string|null;minutes:number|null;targetMinutes:number|null;excessMinutes:number|null;pauseMinutes:number;status:"ALERTA"|"DENTRO"|"NAO_MENSURAVEL"|"CANCELADA";warnings:string[];taskUrl:string|null };
type Correction = {ticketId:number;subject:string;category:string;taskId:number|null;taskState:string;taskUrl:string|null;outcome:"CONCLUIDA"|"EM_ABERTO"|"CANCELADA";version:string|null;taskConcludedAt:string|null;ticketResolvedAt:string|null;ticketReopenedAt:string|null;resolvedAfterTask:boolean;reopenedAfterTask:boolean;validatedByClient:string;reappearanceCandidate:boolean;reappearanceTicketIds:number[]};
type MatrixCase={ticketId:number;subject:string;category:string;taskId:number|null;taskType:string;reason:string;status:string};
type CategoryCase={ticketId:number;subject:string;category:string;previousCategory:string|null;observedAt:string|null;initialObserved:string|null;taskId:number|null;reason:string;evidence:"OBSERVADA"|"INVESTIGAR"};
type Recurrence={key:string;title:string;ticketIds:number[];taskIds:number[];count:number;firstAt:string;lastAt:string;evidence:"MESMA_TASK"|"ASSUNTO_NORMALIZADO";afterTechnicalConclusion:boolean;laterTicketIds:number[];qualification:string};
type VistraCase={ticketId:number;subject:string;date:string;category:string;taskId:number|null;area:"VISTRA"|"ANALITICO"|"RELATORIO_SIMER";suspectedFailure:boolean;evidence:string};
export type BomJesusExecutiveAudit = {
  definition:string;
  matrix:{total:number;bugCategory:number;correctionTickets:number;bugWithCorrection:number;bugWithoutCorrection:number;correctionNonBug:number;others:number;discordantTicketIds:number[];cases:MatrixCase[]};
  corrections:{tickets:number;distinctTasks:number;concluded:number;open:number;cancelled:number;concludedWithVersion:number;resolvedAfterTask:number;reopenedAfterTask:number;postConclusionCandidates:number;clientValidatedCount:null;rows:Correction[]};
  ola:{totalCorrectionTickets:number;activeCorrectionTickets:number;measured:number;alerts:number;onTime:number;unmeasurable:number;cancelled:number;withinTargetPercent:number|null;medianSupportMinutes:number|null;medianExcessMinutes:number|null;maxExcessMinutes:number|null;withVerifiedTier:number;alertsWithVerifiedTier:number;cases:OLA[]};
  categories:{observedToAdequacao:number;observedTicketCount:number;observed:CategoryCase[];reviewCandidates:CategoryCase[];legacyWarning:string};
  recurrence:{groups:number;ticketCandidates:number;sameTaskGroups:number;afterConclusionGroups:number;groupsDetail:Recurrence[]};
  vistra:{explicitVistra:number;suspectedVistraFailures:number;suspectedAnaliticoFailures:number;suspectedReportFailures:number;cases:VistraCase[];monthly:Array<{month:string;vistra:number;analitico:number;relatorios:number}>};
  monthly:Array<{month:string;tickets:number;bugs:number;corrections:number;olaAlerts:number;categoryTransitions:number}>;
  dataQuality:{ticketIdsWithoutAzure:number[];ticketsWithUnknownOla:number[];ticketsWithAssumedTier:number[];linkedTicketLookup:number;noProvenHistoricalOpeningCategory:boolean};
};

const hours=(min:number|null|undefined)=>min==null?"N/D":`${Math.floor(min/60)}h${String(min%60).padStart(2,"0")}`;
const date=(v:string|null)=>v?new Date(v).toLocaleDateString("pt-BR"):"—";
const ticket=(id:number)=><Link href={`/tickets?movidesk=${id}`} underline="hover" sx={{fontWeight:700}}>#{id}</Link>;
const task=(id:number|null,url:string|null)=>id ? (url?<Link href={url} target="_blank" rel="noopener noreferrer">#{id}</Link>:<span>#{id}</span>):<span>—</span>;
const indicator=(label:string,value:string|number,note?:string,onClick?:()=>void)=><Box key={label}
  role={onClick?"button":undefined} tabIndex={onClick?0:undefined} onClick={onClick}
  onKeyDown={onClick?e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onClick();}}:undefined} sx={{minWidth:155,flex:"1 1 150px",border:"1px solid",borderColor:"divider",borderRadius:2,p:1.5,cursor:onClick?"pointer":undefined,"&:hover":onClick?{borderColor:"primary.main"}:undefined}}>
  <Typography variant="caption" color="text.secondary">{label}</Typography>
  <Typography variant="h5" sx={{mt:.5,fontWeight:700}}>{value}</Typography>
  {note&&<Typography variant="caption" color="text.secondary">{note}</Typography>}
</Box>;

type Props={executive:BomJesusExecutiveAudit; clientName:string;rows:ClientManagementTicket[];onInspect?:ClientInspect};
export function BomJesusExecutiveDashboard({executive:a,clientName,rows,onInspect}:Props){
  const inspect=(title:string,filter:(row:ClientManagementTicket)=>boolean)=>onInspect?.(title,rows.filter(filter));
  const month=(iso:string)=>new Date(Date.parse(iso)-3*3600000).toISOString().slice(0,7);
  const [tab,setTab]=useState(0);
  const [query,setQuery]=useState("");
  const [olaStatus,setOlaStatus]=useState("TODOS");
  const [vistraArea,setVistraArea]=useState("TODOS");
  const search=useMemo(()=>query.toLocaleLowerCase("pt-BR").trim(),[query]);
  const match=(...values:Array<string|number|null|undefined>)=>!search||values.some(v=>String(v??"").toLocaleLowerCase("pt-BR").includes(search));
  const ola=a.ola.cases.filter(r=>(olaStatus==="TODOS"||r.status===olaStatus)&&match(r.ticketId,r.taskId,r.subject));
  const correction=a.corrections.rows.filter(r=>match(r.ticketId,r.taskId,r.subject,r.version));
  const divergence=a.matrix.cases.filter(r=>match(r.ticketId,r.taskId,r.subject,r.category));
  const category=[...a.categories.observed,...a.categories.reviewCandidates].filter(r=>match(r.ticketId,r.subject,r.category,r.previousCategory));
  const recurrence=a.recurrence.groupsDetail.filter(r=>match(r.title,r.ticketIds.join(","),r.taskIds.join(",")));
  const vistra=a.vistra.cases.filter(r=>(vistraArea==="TODOS"||r.area===vistraArea)&&match(r.ticketId,r.subject,r.area));

  return <Card variant="outlined" sx={{borderRadius:3,mb:2}}><CardContent>
    <Stack direction={{xs:"column",md:"row"}} sx={{alignItems:{xs:"flex-start",md:"center"},justifyContent:"space-between",gap:1,mb:1}}>
      <Box>
        <Typography variant="h6">Visão executiva e trilhas de auditoria</Typography>
        <Typography variant="body2" color="text.secondary">Cliente: {clientName} • Fontes: Movidesk + Azure DevOps • Suporte SIMER</Typography>
      </Box>
      <Chip color="warning" size="small" label="Indicadores de prazo preliminares"/>
    </Stack>
    <Stack direction="row" sx={{flexWrap:"wrap",gap:1,my:2}}>
      {indicator("Tickets do período",a.matrix.total,undefined,()=>onInspect?.("Todos os atendimentos",rows))}
      {indicator("Bugs com Task",a.matrix.bugWithCorrection,undefined,()=>inspect("Bugs com Task",r=>r.isCorrectionTask&&r.category.toLocaleLowerCase("pt-BR").trim()==="bug"))}
      {indicator("Correções concluídas",a.corrections.concluded,String(a.corrections.concludedWithVersion)+" com versão",()=>inspect("Correções concluídas",r=>a.corrections.rows.some(c=>c.ticketId===r.id&&c.outcome==="CONCLUIDA")))}
      {indicator("OLA Suporte: alertas",a.ola.alerts,String(a.ola.measured)+" mensuráveis",()=>inspect("OLA — alertas",r=>r.olaStatus==="ALERTA"))}
      {indicator("OLA: dentro da meta",a.ola.withinTargetPercent===null?"N/D":String(a.ola.withinTargetPercent)+"%",undefined,()=>inspect("OLA — dentro da meta",r=>r.olaStatus==="DENTRO"))}
      {indicator("Mediana de passagem",hours(a.ola.medianSupportMinutes),"Horas úteis",()=>inspect("Cases mensuráveis de OLA",r=>r.olaStatus==="DENTRO"||r.olaStatus==="ALERTA"))}
    </Stack>
    <Box sx={{display:"grid",gridTemplateColumns:{xs:"1fr",lg:"1fr 1fr"},gap:2,mb:2}}>
      <SelectableDonut title="Situação das correções" description="Distribuição das Tasks técnicas vinculadas" parts={[
        {name:"Concluídas",value:a.corrections.concluded,color:"#197350"},
        {name:"Em aberto",value:a.corrections.open,color:"#BD7229"},
        {name:"Canceladas",value:a.corrections.cancelled,color:"#9B3C36"},
      ]} onInspect={name=>inspect("Correções — "+name,r=>a.corrections.rows.some(c=>c.ticketId===r.id&&c.outcome===(name==="Concluídas"?"CONCLUIDA":name==="Canceladas"?"CANCELADA":"EM_ABERTO")))}/>
      <SelectableDonut title="OLA do Suporte" description="Resultado preliminar dos casos de correção" parts={[
        {name:"Dentro da meta",value:a.ola.onTime,color:"#197350"},
        {name:"Alertas",value:a.ola.alerts,color:"#BD7229"},
        {name:"Não mensurável",value:a.ola.unmeasurable,color:"#97A69B"},
        {name:"Canceladas",value:a.ola.cancelled,color:"#9B3C36"},
      ]} onInspect={name=>inspect("OLA — "+name,r=>r.olaStatus===(name==="Dentro da meta"?"DENTRO":name==="Alertas"?"ALERTA":name==="Canceladas"?"CANCELADA":"NAO_MENSURAVEL"))}/>
      <SelectableLines title="Evolução mensal da carteira" description="Aberturas e correções vinculadas por mês"
        data={a.monthly} series={[
          {key:"tickets",name:"Atendimentos",color:"#197350"},
          {key:"corrections",name:"Correções",color:"#316885"},
        ]}
        onInspect={(m,key)=>inspect("Evolução mensal — "+m,r=>month(r.createdDate)===m&&(key!=="corrections"||r.isCorrectionTask))}/>
      <SelectableLines title="Tendência dos alertas de OLA" description="Mês de abertura e alertas sujeitos à auditoria"
        data={a.monthly} series={[
          {key:"olaAlerts",name:"Alertas OLA",color:"#BD7229"},
          {key:"corrections",name:"Correções",color:"#197350"},
        ]}
        onInspect={(m,key)=>inspect("OLA mensal — "+m,r=>month(r.createdDate)===m&&(key!=="olaAlerts"||r.olaStatus==="ALERTA")&&(key!=="corrections"||r.isCorrectionTask))}/>
    </Box>
    <Alert severity="info" sx={{mb:2}}>Os alertas de OLA usam a criação da Task como referência de passagem. Pausas, urgência histórica e perfil contratual precisam de validação. As reclassificações anteriores ao primeiro registro do HUB não são recuperadas automaticamente pela API pública.</Alert>
    <Box sx={{borderBottom:1,borderColor:"divider",mb:2}}>
      <Tabs value={tab} onChange={(_,v:number)=>{setTab(v);setQuery("");}} variant="scrollable" scrollButtons="auto" aria-label="Auditoria executiva do cliente selecionado">
        <Tab label="OLA do Suporte"/><Tab label="Qualidade das correções"/><Tab label="Classificações"/><Tab label="Adequações"/><Tab label="Recorrências"/><Tab label="Vistra e relatórios"/>
      </Tabs>
    </Box>
    <Stack direction="row" sx={{gap:1,flexWrap:"wrap",mb:1}}>
      <TextField size="small" value={query} onChange={e=>setQuery(e.target.value)} label="Pesquisar ticket, assunto ou Task" sx={{minWidth:260,flex:"1 1 260px"}}/>
      {tab===0&&<FormControl size="small" sx={{minWidth:190}}><InputLabel>Resultado OLA</InputLabel><Select label="Resultado OLA" value={olaStatus} onChange={e=>setOlaStatus(e.target.value)}>
        <MenuItem value="TODOS">Todos</MenuItem><MenuItem value="ALERTA">Alertas</MenuItem><MenuItem value="DENTRO">Dentro da meta</MenuItem><MenuItem value="NAO_MENSURAVEL">Não mensuráveis</MenuItem><MenuItem value="CANCELADA">Canceladas</MenuItem>
      </Select></FormControl>}
      {tab===5&&<FormControl size="small" sx={{minWidth:180}}><InputLabel>Ferramenta</InputLabel><Select label="Ferramenta" value={vistraArea} onChange={e=>setVistraArea(e.target.value)}>
        <MenuItem value="TODOS">Todas</MenuItem><MenuItem value="VISTRA">Vistra</MenuItem><MenuItem value="ANALITICO">Analítico</MenuItem><MenuItem value="RELATORIO_SIMER">Relatório SIMER</MenuItem>
      </Select></FormControl>}
    </Stack>
    {tab===0&&<>
      <Stack direction="row" sx={{gap:1,flexWrap:"wrap",mb:1}}>
        <Chip label={`Alertas: ${a.ola.alerts}`} color="warning"/>
        <Chip label={`Dentro da meta: ${a.ola.onTime}`}/>
        <Chip label={`Sem medição: ${a.ola.unmeasurable}`}/>
        <Chip label={`Canceladas: ${a.ola.cancelled}`}/>
        <Chip label={`Mediana de excesso: ${hours(a.ola.medianExcessMinutes)}`}/>
      </Stack>
      <TableContainer sx={{maxHeight:470}}><Table size="small" stickyHeader sx={{minWidth:1050}}>
        <TableHead><TableRow>{["Ticket","Task","Situação","Prioridade / perfil","Horas úteis","Meta","Excesso","Pausas","Ação"].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
        <TableBody>{ola.map(x=><TableRow key={x.ticketId} hover title={x.warnings.join(" | ")} onClick={()=>inspect("OLA — Ticket #"+x.ticketId,r=>r.id===x.ticketId)} sx={{cursor:"pointer"}}>
          <TableCell>{ticket(x.ticketId)}</TableCell><TableCell>{task(x.taskId,x.taskUrl)}</TableCell><TableCell><Chip size="small" color={x.status==="ALERTA"?"warning":"default"} label={x.status.replaceAll("_"," ")}/></TableCell>
          <TableCell>{x.priority??"N/D"} · {x.tier}{x.tierVerified?"":" (estim.)"}</TableCell>
          <TableCell>{hours(x.minutes)}</TableCell><TableCell>{hours(x.targetMinutes)}</TableCell>
          <TableCell>{hours(x.excessMinutes)}</TableCell><TableCell>{hours(x.pauseMinutes)}</TableCell>
          <TableCell><Link href={`/tickets?movidesk=${x.ticketId}`}>Ver ticket</Link></TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
      <Typography variant="caption" color="text.secondary">Ordenação: excessos maiores primeiro. Para investigação individual, abra o ticket e verifique o histórico de status, a Task e as ações.</Typography>
    </>}
    {tab===1&&<>
      <Stack direction="row" sx={{gap:1,flexWrap:"wrap",mb:1}}>
        <Chip label={`Concluídas: ${a.corrections.concluded}`} color="success"/>
        <Chip label={`Em aberto: ${a.corrections.open}`}/>
        <Chip label={`Canceladas: ${a.corrections.cancelled}`}/>
        <Chip label={`Concluídas com versão: ${a.corrections.concludedWithVersion}`}/>
        <Chip label={`Reabertura após conclusão: ${a.corrections.reopenedAfterTask}`} color="warning"/>
      </Stack>
      <Alert severity="info" sx={{mb:1}}>Concluída + versão não comprova implantação ou aceite do cliente. Os tickets reabertos após a conclusão técnica são candidatos à investigação, não regressões confirmadas.</Alert>
      <TableContainer sx={{maxHeight:470}}><Table size="small" stickyHeader sx={{minWidth:1000}}>
        <TableHead><TableRow>{["Ticket","Task","Estado","Versão","Conclusão","Resolução Movidesk","Reabertura após conclusão?","Nova ocorrência candidata"].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
        <TableBody>{correction.map(x=><TableRow key={x.ticketId} hover onClick={()=>inspect("Correção — Ticket #"+x.ticketId,r=>r.id===x.ticketId)} sx={{cursor:"pointer"}}>
          <TableCell>{ticket(x.ticketId)}</TableCell><TableCell>{task(x.taskId,x.taskUrl)}</TableCell>
          <TableCell>{x.outcome}</TableCell><TableCell>{x.version??"—"}</TableCell>
          <TableCell>{date(x.taskConcludedAt)}</TableCell><TableCell>{date(x.ticketResolvedAt)}</TableCell>
          <TableCell>{x.reopenedAfterTask?"Sim - validar":"Não identificado"}</TableCell>
          <TableCell>{x.reappearanceTicketIds.length?x.reappearanceTicketIds.map(id=>"#"+id).join(", "):"—"}</TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
    </>}
    {tab===2&&<>
      <Stack direction="row" sx={{gap:1,flexWrap:"wrap",mb:1}}>
        <Chip label={`Bug + correção: ${a.matrix.bugWithCorrection}`} color="success"/>
        <Chip label={`Bug sem correção: ${a.matrix.bugWithoutCorrection}`} color="warning"/>
        <Chip label={`Correção + outra categoria: ${a.matrix.correctionNonBug}`} color="warning"/>
        <Chip label={`Demais: ${a.matrix.others}`}/>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{mb:1}}>A matriz compara a categoria atual do Movidesk com o tipo da Task no Azure. Divergência não prova reclassificação histórica.</Typography>
      <TableContainer sx={{maxHeight:430}}><Table size="small" stickyHeader sx={{minWidth:750}}><TableHead><TableRow>{["Ticket","Assunto","Categoria atual","Task","Tipo","A investigar"].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
        <TableBody>{divergence.map(x=><TableRow key={x.ticketId} hover onClick={()=>inspect("Classificação — Ticket #"+x.ticketId,r=>r.id===x.ticketId)} sx={{cursor:"pointer"}}>
          <TableCell>{ticket(x.ticketId)}</TableCell><TableCell>{x.subject}</TableCell><TableCell>{x.category}</TableCell>
          <TableCell>{x.taskId??"—"}</TableCell><TableCell>{x.taskType}</TableCell><TableCell>{x.reason}</TableCell>
        </TableRow>)}</TableBody></Table></TableContainer>
    </>}
    {tab===3&&<>
      <Stack direction="row" sx={{gap:1,flexWrap:"wrap",mb:1}}>
        <Chip label={`Mudanças observadas: ${a.categories.observedTicketCount}`} color="info"/>
        <Chip label={`Revisão histórica: ${a.categories.reviewCandidates.length}`} color="warning"/>
      </Stack>
      <Alert severity="warning" sx={{mb:1}}>{a.categories.legacyWarning}</Alert>
      <TableContainer sx={{maxHeight:420}}><Table size="small" stickyHeader sx={{minWidth:850}}><TableHead><TableRow>{["Ticket","Assunto","Categoria atual","Anterior observada","Primeira observada","Task","Evidência","Motivo"].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
        <TableBody>{category.map((x,i)=><TableRow key={x.ticketId+"-"+i} hover onClick={()=>inspect("Adequação — Ticket #"+x.ticketId,r=>r.id===x.ticketId)} sx={{cursor:"pointer"}}>
          <TableCell>{ticket(x.ticketId)}</TableCell><TableCell>{x.subject}</TableCell><TableCell>{x.category}</TableCell>
          <TableCell>{x.previousCategory??"Não recuperada"}</TableCell><TableCell>{x.initialObserved??"—"}</TableCell>
          <TableCell>{x.taskId??"—"}</TableCell><TableCell>{x.evidence}</TableCell><TableCell>{x.reason}</TableCell>
        </TableRow>)}</TableBody></Table></TableContainer>
    </>}
    {tab===4&&<>
      <Stack direction="row" sx={{gap:1,flexWrap:"wrap",mb:1}}>
        <Chip label={`Grupos candidatos: ${a.recurrence.groups}`}/>
        <Chip label={`Tickets únicos envolvidos: ${a.recurrence.ticketCandidates}`}/>
        <Chip label={`Mesma Task: ${a.recurrence.sameTaskGroups}`}/>
        <Chip color="warning" label={`Pós-conclusão técnica: ${a.recurrence.afterConclusionGroups}`}/>
      </Stack>
      <Alert severity="info" sx={{mb:1}}>Agrupamentos por Task e assunto podem se sobrepor. Ocorrência posterior à conclusão técnica não comprova regressão após implantação.</Alert>
      <TableContainer sx={{maxHeight:440}}><Table size="small" stickyHeader sx={{minWidth:960}}><TableHead><TableRow>{["Assunto base","Tipo","Tickets","Tasks","Período","Pós-conclusão?","Tickets posteriores"].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
        <TableBody>{recurrence.map(x=><TableRow key={x.key} hover title={x.qualification} onClick={()=>inspect("Recorrência — "+x.title,r=>x.ticketIds.includes(r.id))} sx={{cursor:"pointer"}}>
          <TableCell sx={{minWidth:230}}>{x.title}</TableCell><TableCell>{x.evidence==="MESMA_TASK"?"Mesma Task":"Mesmo assunto"}</TableCell>
          <TableCell>{x.ticketIds.map(id=><Box key={id} sx={{display:"inline-block",mr:1}}>{ticket(id)}</Box>)}</TableCell>
          <TableCell>{x.taskIds.join(", ")||"—"}</TableCell><TableCell>{date(x.firstAt)} a {date(x.lastAt)}</TableCell>
          <TableCell>{x.afterTechnicalConclusion?"Sim, avaliar":"Não identificado"}</TableCell>
          <TableCell>{x.laterTicketIds.join(", ")||"—"}</TableCell>
        </TableRow>)}</TableBody></Table></TableContainer>
    </>}
    {tab===5&&<>
      <Stack direction="row" sx={{gap:1,flexWrap:"wrap",mb:1}}>
        <Chip label={`Vistra citado: ${a.vistra.explicitVistra}`}/>
        <Chip label={`Vistra com suspeita de erro: ${a.vistra.suspectedVistraFailures}`} color="warning"/>
        <Chip label={`Analítico com suspeita: ${a.vistra.suspectedAnaliticoFailures}`}/>
        <Chip label={`Relatórios SIMER com suspeita: ${a.vistra.suspectedReportFailures}`}/>
      </Stack>
      <Typography variant="subtitle2" sx={{mb:1}}>Periodicidade de possíveis falhas</Typography>
      <Stack direction="row" sx={{flexWrap:"wrap",gap:1,mb:2}}>{a.vistra.monthly.map(m=><Chip key={m.month} size="small" variant="outlined" label={`${m.month}: Vistra ${m.vistra} · Analítico ${m.analitico} · Relatórios ${m.relatorios}`}/>)}</Stack>
      <TableContainer sx={{maxHeight:440}}><Table size="small" stickyHeader><TableHead><TableRow>{["Ticket","Assunto","Ferramenta","Data","Task","Falha?","Evidência"].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
        <TableBody>{vistra.map(x=><TableRow key={x.ticketId} hover onClick={()=>inspect("Vistra/relatório — Ticket #"+x.ticketId,r=>r.id===x.ticketId)} sx={{cursor:"pointer"}}><TableCell>{ticket(x.ticketId)}</TableCell>
          <TableCell>{x.subject}</TableCell><TableCell>{x.area}</TableCell><TableCell>{date(x.date)}</TableCell>
          <TableCell>{x.taskId??"—"}</TableCell><TableCell>{x.suspectedFailure?"Suspeita":"Não comprovada"}</TableCell>
          <TableCell>{x.evidence}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
    </>}
    <Divider sx={{my:2}}/>
    <Typography variant="caption" color="text.secondary">Todas as relações e ressalvas ficam disponíveis no Excel exportado. Nenhuma operação altera tickets ou Tasks nas fontes.</Typography>
  </CardContent></Card>;
}
