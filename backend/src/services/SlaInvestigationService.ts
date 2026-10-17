import { prisma } from "../database/prisma";
import { scopedTicketWhere, scopedAzureWhere } from "../domain/OperationalScope";
import { isBug, mapPriority } from "../domain/TicketClassificationRules";
import { ALIARE_TARGETS, aliareBusinessMinutes, isSlaEligibleCategory, isAliarePause, type SlaTier, type SlaKind } from "../domain/AliareSlaRules";

type Event = { at:Date; title:string; category:string; detail:string; evidence:string };
type History = {field:string;oldValue:string|null;newValue:string|null;changedAt:Date};
export class SlaInvestigationService {
 async byTicket(ticketNumber:number,tier:SlaTier="PADRAO") {
  if(!Number.isSafeInteger(ticketNumber)||ticketNumber<1) return {status:400 as const,message:"Número de atendimento inválido."};
  const ticket=await prisma.ticket.findFirst({where:scopedTicketWhere({movideskId:ticketNumber,isDeleted:false}),
   include:{ownerHistories:{orderBy:{changedDate:"asc"},take:200},statusHistories:{orderBy:{changedDate:"asc"},take:300}}});
  if(!ticket) return {status:404 as const,message:"Atendimento não encontrado na carteira SIMER."};
  const task=await prisma.azureWorkItem.findFirst({where:scopedAzureWhere({
   OR:[...(ticket.taskNumber?[{id:ticket.taskNumber}]:[]),{movideskTicket:ticket.movideskId}]
  }),orderBy:{azureChangedAt:"desc"}});
  const history:History[]=task?await prisma.$queryRaw<History[]>`
   SELECT "field","oldValue","newValue","changedAt" FROM "AzureWorkItemHistory"
   WHERE "workItemId" = ${task.id} ORDER BY "changedAt" ASC LIMIT 300
  `:[];
  const events:Event[]=[{at:ticket.createdDate,title:"Atendimento aberto",category:"TICKET",detail:ticket.subject,evidence:"Ticket.createdDate"}];
  for(const h of ticket.statusHistories)if(h.changedDate)events.push({at:h.changedDate,title:"Mudança de status no Movidesk",category:"STATUS",detail:`${h.status}${h.justification?" · "+h.justification:""}`,evidence:"MovideskStatusHistory"});
  for(const h of ticket.ownerHistories)if(h.changedDate)events.push({at:h.changedDate,title:"Responsável alterado",category:"OWNER",detail:h.ownerName??h.ownerTeam??"Não informado",evidence:"MovideskOwnerHistory"});
  if(task?.azureCreatedAt)events.push({at:task.azureCreatedAt,title:"Tarefa Azure aberta",category:"TASK",detail:`#${task.id} · ${task.title}`,evidence:"AzureWorkItem.azureCreatedAt"});
  for(const h of history)events.push({at:h.changedAt,title:/(critical|priorit|urgenc)/i.test(h.field)?"Classificação da tarefa alterada":"Tarefa atualizada",category:/(critical|priorit|urgenc)/i.test(h.field)?"PRIORITY":"TASK_HISTORY",detail:`${h.field}: ${h.oldValue??"—"} → ${h.newValue??"—"}`,evidence:"AzureWorkItemHistory"});
  const taskDone=task&&["concluida","concluido","done","closed","resolved"].includes(task.state.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase());
  const concluded=taskDone?(task?.stateChangedAt??task?.azureClosedAt??null):null;
  if(concluded)events.push({at:concluded,title:"Tarefa concluída",category:"DONE",detail:task!.state,evidence:"AzureWorkItem.stateChangedAt/azureClosedAt"});
  if(task?.deliveredVersion)events.push({at:task.azureChangedAt??task.syncedAt,title:"Versão vinculada (data observada)",category:"VERSION",detail:task.deliveredVersion,evidence:"AzureWorkItem.deliveredVersion; não comprova implantação"});
  if(ticket.resolvedDate)events.push({at:ticket.resolvedDate,title:"Atendimento resolvido",category:"TICKET",detail:ticket.status,evidence:"Ticket.resolvedDate"});
  events.sort((a,b)=>a.at.getTime()-b.at.getTime());
  const kind:SlaKind=isBug(ticket.category,ticket.taskType)?"BUG":"OUTROS";
  const priority=mapPriority(ticket.urgency,task?.criticality);
  const issues:string[]=[];
  if(!isSlaEligibleCategory(ticket.category))issues.push("Categoria excluída do SLA oficial.");
  if(!priority)issues.push("Prioridade não identificada; não é possível estabelecer a meta.");
  if(!task)issues.push("Nenhuma tarefa Azure vinculada ou visível no escopo SIMER.");
  if(kind==="BUG"&&!task?.azureCreatedAt)issues.push("Sem abertura da tarefa: OLA de suporte não pode ser fechado.");
  if(taskDone&&!concluded)issues.push("Estado final detectado, mas não há data comprovada de conclusão técnica.");
  if(task?.deliveredVersion)issues.push("Versão cadastrada não comprova data de disponibilização ao cliente.");
  if(ticket.urgency&&ticket.statusHistories.length===0)issues.push("Histórico de urgência não está disponível; prioridade atual pode não representar períodos anteriores.");
  if(ticket.statusHistories.some(h=>isAliarePause(h.status)))issues.push("Existem status de pausa; os períodos não foram descontados sem validar início/fim e responsabilidade.");
  issues.push("Feriados nacionais precisam de calendário validado; cálculo preliminar ainda não os desconta.");
  const target=priority?ALIARE_TARGETS[tier][kind][priority]:null;
  const now=new Date();
  const supportEnd=task?.azureCreatedAt??null;
  const factoryEnd=concluded??now;
  const response=ticket.firstResponseDate?aliareBusinessMinutes(ticket.createdDate,ticket.firstResponseDate,kind):null;
  const support=supportEnd?aliareBusinessMinutes(ticket.createdDate,supportEnd,kind):null;
  const factory=kind==="BUG"&&supportEnd?aliareBusinessMinutes(supportEnd,factoryEnd,kind):null;
  const total=support!==null&&factory!==null?support+factory:kind==="OUTROS"&&ticket.resolvedDate?aliareBusinessMinutes(ticket.createdDate,ticket.resolvedDate,kind):null;
  const metric=(value:number|null,limit:number|null)=>({minutes:value,targetMinutes:limit,percent:value!==null&&limit?Math.round(value/limit*1000)/10:null,overdue:value!==null&&limit!==null?value>limit:null});
  return {status:200 as const,profile:{tier,kind,priority,calendar:kind==="BUG"?"Seg–Sex 08:00–18:00":"Seg–Sex 08:00–18:30; Sáb 08:00–12:00",reference:"Aliare — Prazos de Atendimento 2026 v1.0"},
   ticket:{id:ticket.movideskId,subject:ticket.subject,client:ticket.client,category:ticket.category,urgency:ticket.urgency,owner:ticket.owner,status:ticket.status,createdAt:ticket.createdDate},
   task:task?{id:task.id,title:task.title,state:task.state,criticality:task.criticality,createdAt:task.azureCreatedAt,concludedAt:concluded,version:task.deliveredVersion}:null,
   metrics:{response:metric(response,target?.response??null),support:metric(support,target?.support??null),factory:metric(factory,target?.factory??null),total:metric(total,target?.total??null)},
   timeline:events.map(e=>({...e,at:e.at.toISOString()})),issues,preliminary:true,
   summary:!isSlaEligibleCategory(ticket.category)?"Categoria fora do escopo de SLA definido no documento.":!target?"Prazo indeterminado: prioridade não identificada.":support===null?"Aguardando marco de encaminhamento para desenvolvimento.":support>target.support?"Suporte excedeu o OLA antes da abertura da tarefa.":"Suporte dentro da meta calculada; verifique Fábrica, pausas e conclusão."};
 }
}
