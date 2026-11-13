import { isOperationallyOpen, isTicketCancelled } from "./operationalMetrics";
import { calculateTimestampSla } from "./timestampSla";

/**
 * Reunião semanal de sustentação: marcos de evento por mês e estoque de pendentes ATUAL.
 * O estoque não é reconstruído historicamente: o Movidesk fornece um snapshot do estado atual.
 */
export type WeeklyTicket = {
  id:number; movideskId:number; subject:string; client:string|null; owner:string|null;
  category:string|null; urgency:string|null; status:string|null; baseStatus:string|null;
  ticketType?:number|null; isWithSimer?:boolean; canceledDate?:string|null;
  createdDate:string; resolvedDate?:string|null; closedDate?:string|null;
  firstResponseDate?:string|null; firstResponseDueDate?:string|null; dueDate?:string|null;
  azureWorkItem?:{id:number;workItemType:string;state:string;deliveredVersion:string|null}|null;
  taskNumber?:number|null;
  satisfactionScore?:number|null; satisfactionDate?:string|null;
  resolvedInFirstCall?:boolean|null; reopenedDate?:string|null; reopenCount?:number;
};
export type MonthSnapshot={month:string;opened:number;resolved:number;closed:number;pendingOpened:number;bugs:number};
export type MeetingComparison={current:number;previous:number;difference:number;rate:number|null;currentTickets:WeeklyTicket[];previousTickets:WeeklyTicket[]};
export type MeetingSla={percentage:number|null;measured:number;within:number;outside:number;tickets:WeeklyTicket[];outsideTickets:WeeklyTicket[]};
export type ClientMeetingAnalytics={
  month:string;reference:Date;monthCutoff:Date;previousCutoff:Date;
  months:MonthSnapshot[];
  opened:MeetingComparison;resolved:MeetingComparison;bug:MeetingComparison;
  pendingNow:WeeklyTicket[];pendingInPeriod:WeeklyTicket[];
  pendingByClient:Array<{name:string;value:number;ids:number[]}>;
  pendingByOwner:Array<{name:string;value:number;ids:number[]}>;
  pendingByAge:Array<{name:string;value:number;ids:number[]}>;
  pendingByStatus:Array<{name:string;value:number;ids:number[]}>;
  responseSla:MeetingSla;solutionSla:MeetingSla;
  workItems:number; correctionTasks:number;withVersion:number;
  firstCall:{count:number;measured:number;percentage:number|null;eligible:number};
  csat:{positive:number;measured:number;percentage:number|null;historicalMeasured:number;undated:number};
  reopened:number;
};

function eventWithin(ticket:WeeklyTicket,field:"createdDate"|"resolvedDate"|"closedDate"|"satisfactionDate"|"reopenedDate",start:Date,end:Date){
  const raw=ticket[field];if(!raw)return false;
  const t=Date.parse(raw);return Number.isFinite(t)&&t>=start.getTime()&&t<=end.getTime();
}
/** Drilldowns use the same event boundary as the monthly aggregates. */
export function isMeetingEventInMonth(ticket:WeeklyTicket,field:"createdDate"|"resolvedDate"|"closedDate"|"satisfactionDate"|"reopenedDate",month:string,cutoff:Date):boolean {
  const [year,number]=month.split("-").map(Number);
  if(!Number.isInteger(year)||!Number.isInteger(number)||number<1||number>12)return false;
  return eventWithin(ticket,field,new Date(year,number-1,1),new Date(Math.min(new Date(year,number,0,23,59,59,999).getTime(),cutoff.getTime())));
}
const monthKey=(date:Date)=>date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0");
const firstDay=(y:number,m:number)=>new Date(y,m,1,0,0,0,0);
const lastDay=(y:number,m:number)=>new Date(y,m+1,0,23,59,59,999);
const minEnd=(a:Date,b:Date)=>new Date(Math.min(a.getTime(),b.getTime()));
const group=(rows:WeeklyTicket[],getKey:(row:WeeklyTicket)=>string)=>{
  const grouped=new Map<string,{name:string;value:number;ids:number[]}>();
  for(const ticket of rows){
    const name=getKey(ticket).trim()||"Não informado";
    const entry=grouped.get(name)??{name,value:0,ids:[]};
    entry.value++;entry.ids.push(ticket.id);grouped.set(name,entry);
  }
  return [...grouped.values()].sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name,"pt-BR"));
};
const compare=(currentTickets:WeeklyTicket[],previousTickets:WeeklyTicket[]):MeetingComparison=>{
  const current=currentTickets.length,previous=previousTickets.length;
  return {current,previous,difference:current-previous,rate:previous?Math.round((current-previous)/previous*1000)/10:null,currentTickets,previousTickets};
};
const isBug=(t:WeeklyTicket)=>t.category?.trim().toLocaleLowerCase("pt-BR")==="bug";
const isPublicPending=(t:WeeklyTicket)=>t.ticketType===2&&isOperationallyOpen(t);

/**
 * "tickets" deve estar filtrado por responsabilidade SIMER e seleções locais,
 * porém SEM cortar por período: o mês anterior e as pendências antigas são necessários.
 * "periodStart/End" são somente para pendências abertas no intervalo da tela.
 */
export function buildClientMeetingAnalytics(
  tickets:WeeklyTicket[],referenceDate:Date,periodStart:Date,periodEnd:Date,
  backlogSnapshotDate:Date=new Date(),
):ClientMeetingAnalytics{
  const valid=tickets.filter(t=>t.isWithSimer===true);
  const reference=new Date(referenceDate);
  const year=reference.getFullYear(),month=reference.getMonth(),day=reference.getDate();
  const monthStart=firstDay(year,month);
  const monthCutoff=minEnd(reference,lastDay(year,month));
  const priorStart=firstDay(year,month-1);
  const previousCutoff=lastDay(year,month-1);
  previousCutoff.setDate(Math.min(day,previousCutoff.getDate()));
  previousCutoff.setHours(23,59,59,999);
  // Se foi selecionado o mês completo, comparar com igual dia de corte no anterior;
  // se o mês de referência estiver encerrado, comparar meses completos.
  const isFullMonth=monthCutoff.getDate()===lastDay(year,month).getDate();
  if(isFullMonth)previousCutoff.setTime(lastDay(year,month-1).getTime());

  const inCurrent=(field:"createdDate"|"resolvedDate"|"closedDate")=>valid.filter(t=>eventWithin(t,field,monthStart,monthCutoff));
  const inPrevious=(field:"createdDate"|"resolvedDate"|"closedDate")=>valid.filter(t=>eventWithin(t,field,priorStart,previousCutoff));
  const openedTickets=inCurrent("createdDate");
  // Igual ao Dashboard: o evento de resolução conta mesmo se o ticket foi reaberto depois.
  const resolvedTickets=inCurrent("resolvedDate");
  const currentBugs=openedTickets.filter(isBug);
  const previousOpened=inPrevious("createdDate");
  const previousResolved=inPrevious("resolvedDate");
  const monthly:MonthSnapshot[]=[];
  for(let offset=5;offset>=0;offset--){
    const m=month-offset,y=year;
    const start=firstDay(y,m),end=(offset===0)?monthCutoff:lastDay(y,m);
    const entries=valid.filter(t=>eventWithin(t,"createdDate",start,end));
    monthly.push({
      month:monthKey(start),opened:entries.length,
      resolved:valid.filter(t=>eventWithin(t,"resolvedDate",start,end)).length,
      closed:valid.filter(t=>eventWithin(t,"closedDate",start,end)&&!isTicketCancelled(t)).length,
      pendingOpened:entries.filter(isPublicPending).length,
      bugs:entries.filter(isBug).length,
    });
  }
  const pendingNow=valid.filter(isPublicPending);
  // Antiguidade sempre considera a fotografia atual, não a data histórica do filtro.
  // Parâmetro explícito permite testes reprodutíveis e evita misturar marcos temporais.
  const snapshotCutoff=new Date(backlogSnapshotDate);
  const pendingAge=(ticket:WeeklyTicket)=>{
    const opening=Date.parse(ticket.createdDate);
    if(!Number.isFinite(opening))return "Abertura não informada";
    const elapsed=Math.floor((snapshotCutoff.getTime()-opening)/86400000);
    if(elapsed<0)return "Data futura / verificar";
    if(elapsed<=7)return "Até 7 dias";
    if(elapsed<=30)return "8 a 30 dias";
    if(elapsed<=90)return "31 a 90 dias";
    return "Mais de 90 dias";
  };
  const pendingInPeriod=pendingNow.filter(t=>eventWithin(t,"createdDate",periodStart,periodEnd));
  const response=calculateTimestampSla(openedTickets,"response");
  const solution=calculateTimestampSla(resolvedTickets,"solution");
  const azure=Array.from(new Map(valid.filter(t=>t.azureWorkItem).map(t=>[t.azureWorkItem!.id,t.azureWorkItem!])).values());
  // Resolução no primeiro contato é verificável apenas quando o ticket já foi resolvido.
  // O Movidesk pode retornar false para tickets ainda abertos; não entram no denominador.
  const firstCallMeasured=resolvedTickets.filter(t=>typeof t.resolvedInFirstCall==="boolean");
  const firstCallCount=firstCallMeasured.filter(t=>t.resolvedInFirstCall===true).length;
  // CSAT é evento de pesquisa, não um evento de abertura de ticket. A resposta
  // pode chegar muitos dias após a criação e deve ser atribuída ao mês da resposta.
  const surveyRows=valid.filter(t=>typeof t.satisfactionScore==="number" &&
    Number.isFinite(t.satisfactionScore) && t.satisfactionScore!>=1 && t.satisfactionScore!<=5);
  const csatTickets=surveyRows.filter(t=>eventWithin(t,"satisfactionDate",monthStart,monthCutoff));
  const csatPositive=csatTickets.filter(t=>(t.satisfactionScore??0)>=4).length;
  return {
    month:monthKey(reference),reference,monthCutoff,previousCutoff,
    months:monthly,
    opened:compare(openedTickets,previousOpened),
    resolved:compare(resolvedTickets,previousResolved),
    bug:compare(currentBugs,previousOpened.filter(isBug)),
    pendingNow,pendingInPeriod,
    pendingByClient:group(pendingNow,t=>t.client||"Sem cliente"),
    pendingByOwner:group(pendingNow,t=>t.owner?.trim()||"Sem responsável"),
    pendingByAge:group(pendingNow,pendingAge),
    pendingByStatus:group(pendingNow,t=>t.baseStatus==="New"?"Novo":t.baseStatus==="InAttendance"?"Em atendimento":t.baseStatus==="Stopped"?"Parado":t.status||"Outro"),
    responseSla:{percentage:response.percentage,measured:response.measured,within:response.within,outside:response.outside,tickets:response.measuredTickets,outsideTickets:response.outsideTickets},
    solutionSla:{percentage:solution.percentage,measured:solution.measured,within:solution.within,outside:solution.outside,tickets:solution.measuredTickets,outsideTickets:solution.outsideTickets},
    workItems:azure.length,
    correctionTasks:azure.filter(x=>x.workItemType==="Correção Clientes").length,
    withVersion:azure.filter(x=>Boolean(x.deliveredVersion?.trim())).length,
    firstCall:{count:firstCallCount,measured:firstCallMeasured.length,percentage:firstCallMeasured.length?Math.round(firstCallCount/firstCallMeasured.length*1000)/10:null,eligible:resolvedTickets.length},
    csat:{positive:csatPositive,measured:csatTickets.length,percentage:csatTickets.length?Math.round(csatPositive/csatTickets.length*1000)/10:null,historicalMeasured:surveyRows.length,undated:surveyRows.filter(t=>!t.satisfactionDate).length},
    reopened:valid.filter(t=>eventWithin(t,"reopenedDate",monthStart,monthCutoff)).length,
  };
}
