import {useMemo} from 'react';
import {Box,Card,CardContent,Typography,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Button} from '@mui/material';
import {KpiCard} from './KpiCard';
import {KpiGrid} from './KpiGrid';
import {SelectableLines,SelectableHorizontalBars} from './ExecutiveChartControls';
import {buildClientDeliveries,type DeliveryTicket,type DeliveryItem} from '../utils/clientDeliveries';
const date=(d:Date)=>d.toLocaleDateString('pt-BR');
export function ClientDeliveryInsights({tickets,start,end,onShowTickets}:{tickets:DeliveryTicket[];start:Date;end:Date;onShowTickets:(title:string,ids:number[])=>void}){
 const a=useMemo(()=>buildClientDeliveries(tickets,start,end),[tickets,start,end]);
 const inspect=(title:string,items:DeliveryItem[])=>onShowTickets(title,[...new Set(items.flatMap(i=>i.ticketIds))]);
 const prevDelivered=a.previous.filter(i=>i.version).length;
 const delta=a.delivered.length-prevDelivered;
 return <Card component="section" variant="outlined" sx={{mb:2,borderRadius:3}}>
  <CardContent sx={{p:{xs:2,md:2.5}}}>
   <Typography variant="h6" sx={{fontWeight:850}}>Correções e versões no período</Typography>
   <Typography variant="body2" color="text.secondary" sx={{mb:2}}>Conclusões de {date(start)} a {date(a.cutoff)} · comparação com {date(a.previousStart)} a {date(a.previousEnd)} (mesma duração).</Typography>
   <TableContainer sx={{mb:2}}><Table size="small" aria-label="Comparação entre períodos"><TableHead><TableRow>
    <TableCell>Indicador</TableCell><TableCell align="right">Anterior</TableCell><TableCell align="right">Atual</TableCell><TableCell align="right">Diferença</TableCell><TableCell align="right">Variação</TableCell>
   </TableRow></TableHead><TableBody>{a.movements.map(m=><TableRow key={m.label}><TableCell>{m.label}</TableCell><TableCell align="right">{m.previous}</TableCell><TableCell align="right">{m.current}</TableCell><TableCell align="right">{m.difference>0?'+':''}{m.difference}</TableCell><TableCell align="right">{m.rate===null?'Sem base anterior':m.rate.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
   <KpiGrid sx={{gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))',lg:'repeat(4,minmax(0,1fr))'},mb:2}}>
    <KpiCard title="Correções entregues" value={a.corrections.length} subtitle="Tasks únicas concluídas com versão" info="Tipo Correção Clientes, estado Concluído, versão informada e data oficial azureClosedAt no intervalo. Inclui tickets abertos antes do período." onClick={()=>inspect('Correções entregues no período',a.corrections)}/>
    <KpiCard title="Evoluções entregues" value={a.evolutions.length} subtitle="Tasks únicas concluídas com versão" info="Tipo Evolução. Mesma regra temporal das correções, sem inferência pela abertura do ticket." onClick={()=>inspect('Evoluções entregues no período',a.evolutions)}/>
    <KpiCard title="Versões com entregas" value={a.versions.length} subtitle="Versões distintas vinculadas às conclusões" info="Versões registradas no Azure para Tasks concluídas no intervalo. Não é a data de publicação da versão nem confirmação de instalação no cliente." onClick={()=>inspect('Tasks com versão no período',a.delivered)}/>
    <KpiCard title="Entregas versus período anterior" value={`${delta>0?'+':''}${delta}`} subtitle={`${a.delivered.length} atuais • ${prevDelivered} anteriores`} info="Diferença absoluta de correções e evoluções concluídas com versão entre intervalos consecutivos de mesma duração. Uma Task vinculada a vários tickets conta uma vez." onClick={()=>inspect('Entregas do intervalo atual',a.delivered)}/>
   </KpiGrid>
   <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',xl:'1fr 1fr'},gap:2,mb:2}}>
    <SelectableLines title="Evolução das entregas — seis meses" description="Conclusão oficial no Azure, com versão; último mês até o corte. Meses anteriores completos." data={a.months.map(({month,corrections,evolutions})=>({month,corrections,evolutions}))} series={[{key:'corrections',name:'Correções',color:'#197350'},{key:'evolutions',name:'Evoluções',color:'#316885'}]} onInspect={(month,key)=>{const m=a.months.find(m=>m.month===month);inspect(`Entregas em ${month}`,m?.rows.filter(i=>key==='corrections'?i.type==='Correção Clientes':key==='evolutions'?i.type==='Evolução':true)??[]);}}/>
    <SelectableHorizontalBars title="Entregas por versão" description="Quantidade de Tasks únicas concluídas no intervalo, agrupadas pela versão informada." parts={a.versions.map(v=>({name:v.version,value:v.items.length,color:'#197350'}))} onInspect={version=>inspect(`Versão ${version}`,a.versions.find(v=>v.version===version)?.items??[])}/>
   </Box>
   <Typography variant="subtitle2" sx={{fontWeight:800,mb:1}}>Rastreabilidade das entregas</Typography>
   <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Versão</TableCell><TableCell>Task / entrega</TableCell><TableCell>Tipo</TableCell><TableCell>Conclusão Azure</TableCell><TableCell>Atendimentos</TableCell></TableRow></TableHead><TableBody>
    {a.delivered.map(i=><TableRow key={i.id}><TableCell>{i.version}</TableCell><TableCell>#{i.id} · {i.title}</TableCell><TableCell>{i.type}</TableCell><TableCell>{new Date(i.closedAt!).toLocaleDateString('pt-BR')}</TableCell><TableCell><Button size="small" onClick={()=>inspect(`Task ${i.id}`, [i])}>{i.ticketIds.length} vinculado(s)</Button></TableCell></TableRow>)}
    {!a.delivered.length&&<TableRow><TableCell colSpan={5}>Nenhuma entrega com conclusão oficial e versão no intervalo selecionado.</TableCell></TableRow>}
   </TableBody></Table></TableContainer>
   <Typography variant="body2" color="text.secondary" sx={{mt:2,lineHeight:1.6}}>{a.withoutVersion.length} conclusão(ões) no intervalo sem versão; {a.missingDate.length} Task(s) concluída(s) sem data oficial válida, fora da comparação; {a.inProgress.length} Task(s) atualmente em andamento no escopo selecionado.</Typography>
   <Typography variant="caption" color="text.secondary">Fonte: Tasks Azure vinculadas aos tickets SIMER do cliente e filtros adicionais. A versão informada indica entrega registrada no desenvolvimento; atualização e homologação no cliente dependem de confirmação própria.</Typography>
  </CardContent>
 </Card>;
}
