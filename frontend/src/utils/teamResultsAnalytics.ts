import {isOperationallyOpen,isTicketCancelled} from './operationalMetrics';
import {calculateTimestampSla} from './timestampSla';
export type TeamTicket={id?:number;movideskId:number;createdDate:string;resolvedDate?:string|null;closedDate?:string|null;status?:string|null;baseStatus?:string|null;canceledDate?:string|null;ticketType?:number|null;isWithSimer?:boolean;owner?:string|null;satisfactionScore?:number|null;satisfactionDate?:string|null;firstResponseDate?:string|null;firstResponseDueDate?:string|null;dueDate?:string|null};
export const localDateKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const withinTeamPeriod=(raw:string|null|undefined,start:Date,end:Date)=>{const n=Date.parse(raw??'');return Number.isFinite(n)&&n>=start.getTime()&&n<=end.getTime();};
export type TeamTimelineBucket={label:string;date:string;start:Date;end:Date;abertos:number;resolvidos:number};
export function buildTeamTimeline<T extends TeamTicket>(opened:T[],resolved:T[],start:Date,end:Date){
 const days=Math.ceil((end.getTime()-start.getTime()+1)/86400000);
 const grain=days>400?'month':days>70?'week':'day';
 const buckets:TeamTimelineBucket[]=[];
 for(let cursor=new Date(start);cursor<=end;){
  const finish=new Date(cursor);
  if(grain==='month')finish.setMonth(finish.getMonth()+1,0);
  else if(grain==='week')finish.setDate(finish.getDate()+6);
  finish.setHours(23,59,59,999);
  const until=new Date(Math.min(end.getTime(),finish.getTime()));
  buckets.push({date:localDateKey(cursor),label:cursor.toLocaleDateString('pt-BR',grain==='month'?{month:'short',year:'2-digit'}:{day:'2-digit',month:'2-digit'}),start:new Date(cursor),end:until,abertos:0,resolvidos:0});
  cursor=new Date(until);cursor.setDate(cursor.getDate()+1);cursor.setHours(0,0,0,0);
 }
 const count=(rows:T[],field:'createdDate'|'resolvedDate',key:'abertos'|'resolvidos')=>rows.forEach(t=>{const d=Date.parse(t[field]??'');const bucket=buckets.find(b=>d>=b.start.getTime()&&d<=b.end.getTime());if(bucket)bucket[key]++;});
 count(opened,'createdDate','abertos');count(resolved,'resolvedDate','resolvidos');
 return {buckets,grain};
}
export function buildTeamResults<T extends TeamTicket>(scope:T[],start:Date,end:Date){
 const publicTickets=scope.filter(t=>t.ticketType===2);
 const opened=publicTickets.filter(t=>withinTeamPeriod(t.createdDate,start,end));
 const resolved=publicTickets.filter(t=>withinTeamPeriod(t.resolvedDate,start,end));
 const closed=publicTickets.filter(t=>withinTeamPeriod(t.closedDate,start,end)&&!isTicketCancelled(t));
 const backlog=publicTickets.filter(isOperationallyOpen),pendingOpened=opened.filter(isOperationallyOpen);
 const stopped=backlog.filter(t=>(t.baseStatus??'').trim().toLowerCase()==='stopped');
 const responseSla=calculateTimestampSla(opened,'response'),solutionSla=calculateTimestampSla(resolved,'solution');
 const agents=new Map<string,{name:string;opened:number;resolved:number;backlog:number}>();
 for(const t of publicTickets){const name=t.owner?.trim()||'Sem responsável';const item=agents.get(name)??{name,opened:0,resolved:0,backlog:0};if(withinTeamPeriod(t.createdDate,start,end))item.opened++;if(withinTeamPeriod(t.resolvedDate,start,end))item.resolved++;if(isOperationallyOpen(t))item.backlog++;agents.set(name,item);}
 const satisfaction=publicTickets.filter(t=>typeof t.satisfactionScore==='number'&&Number.isFinite(t.satisfactionScore)&&t.satisfactionScore>=1&&t.satisfactionScore<=5&&withinTeamPeriod(t.satisfactionDate,start,end));
 const timeline=buildTeamTimeline(opened,resolved,start,end);
 const duration=end.getTime()-start.getTime()+1,previousEnd=new Date(start.getTime()-1),previousStart=new Date(start.getTime()-duration);
 const previous=publicTickets;
 return {opened,resolved,closed,backlog,pendingOpened,stopped,responseSla,solutionSla,
  missingType:scope.filter(t=>t.ticketType==null&&isOperationallyOpen(t)).length,
  team:[...agents.values()].sort((a,b)=>b.resolved-a.resolved||a.name.localeCompare(b.name,'pt-BR')),
  chart:timeline.buckets,grain:timeline.grain,satisfaction,good:satisfaction.filter(t=>t.satisfactionScore!>=4).length,
  comparison:{previousStart,previousEnd,opened:previous.filter(t=>withinTeamPeriod(t.createdDate,previousStart,previousEnd)).length,resolved:previous.filter(t=>withinTeamPeriod(t.resolvedDate,previousStart,previousEnd)).length,closed:previous.filter(t=>withinTeamPeriod(t.closedDate,previousStart,previousEnd)&&!isTicketCancelled(t)).length}};
}
