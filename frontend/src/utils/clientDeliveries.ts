export type DeliveryTicket={id:number;createdDate?:string;resolvedDate?:string|null;category?:string|null;azureWorkItem?:{id:number;title?:string;workItemType:string;state:string;deliveredVersion:string|null;azureClosedAt?:string|null}|null};
export type DeliveryItem={id:number;title:string;type:string;state:string;version:string|null;closedAt:string|null;ticketIds:number[]};
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const concluded=(i:DeliveryItem)=>norm(i.state)==='concluido';
const correction=(i:DeliveryItem)=>norm(i.type)==='correcao clientes';
const evolution=(i:DeliveryItem)=>norm(i.type)==='evolucao';
export function buildClientDeliveries(tickets:DeliveryTicket[],start:Date,end:Date){
 const unique=new Map<number,DeliveryItem>();
 for(const t of tickets){const w=t.azureWorkItem;if(!w)continue;const prior=unique.get(w.id);
  if(prior){if(!prior.ticketIds.includes(t.id))prior.ticketIds.push(t.id);continue;}
  unique.set(w.id,{id:w.id,title:w.title??`Task ${w.id}`,type:w.workItemType,state:w.state,version:w.deliveredVersion?.trim()||null,closedAt:w.azureClosedAt??null,ticketIds:[t.id]});
 }
 const items=[...unique.values()].filter(i=>correction(i)||evolution(i));
 const cutoff=new Date(Math.min(end.getTime(),Date.now()));
 const within=(i:DeliveryItem,a:Date,b:Date)=>{const d=Date.parse(i.closedAt??'');return concluded(i)&&Number.isFinite(d)&&d>=a.getTime()&&d<=b.getTime();};
 const duration=Math.max(0,cutoff.getTime()-start.getTime()+1);
 const previousEnd=new Date(start.getTime()-1),previousStart=new Date(start.getTime()-duration);
 const eventCount=(field:'createdDate'|'resolvedDate',a:Date,b:Date,bug=false)=>tickets.filter(t=>{const d=Date.parse(t[field]??'');return Number.isFinite(d)&&d>=a.getTime()&&d<=b.getTime()&&(!bug||norm(t.category??'')==='bug');}).length;
 const movements=[{label:'Atendimentos abertos',field:'createdDate' as const,bug:false},{label:'Atendimentos resolvidos',field:'resolvedDate' as const,bug:false},{label:'Categoria Bug · abertos',field:'createdDate' as const,bug:true}].map(m=>{const current=eventCount(m.field,start,cutoff,m.bug),previous=eventCount(m.field,previousStart,previousEnd,m.bug);return {label:m.label,current,previous,difference:current-previous,rate:previous?(current-previous)/previous*100:null};});
 const current=items.filter(i=>within(i,start,cutoff));
 const previous=items.filter(i=>within(i,previousStart,previousEnd));
 const delivered=current.filter(i=>i.version);
 const versions=[...new Set(delivered.map(i=>i.version!))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})).map(version=>({version,items:delivered.filter(i=>i.version===version)}));
 const months=Array.from({length:6},(_,index)=>{const a=new Date(cutoff.getFullYear(),cutoff.getMonth()-5+index,1),b=new Date(Math.min(new Date(a.getFullYear(),a.getMonth()+1,0,23,59,59,999).getTime(),cutoff.getTime()));const rows=items.filter(i=>within(i,a,b)&&i.version);return {month:`${a.getFullYear()}-${String(a.getMonth()+1).padStart(2,'0')}`,corrections:rows.filter(correction).length,evolutions:rows.filter(evolution).length,rows};});
 return {movements,current,previous,delivered,versions,months,previousStart,previousEnd,cutoff,
  corrections:delivered.filter(correction),evolutions:delivered.filter(evolution),
  missingDate:items.filter(i=>concluded(i)&&!Number.isFinite(Date.parse(i.closedAt??''))),
  withoutVersion:current.filter(i=>!i.version),inProgress:items.filter(i=>!concluded(i)&&norm(i.state)!=='cancelado')};
}
