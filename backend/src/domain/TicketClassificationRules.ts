export const CAUSE_NOT_APPLICABLE_CATEGORIES = new Set(["bug","solucao de contorno","solicitacao de servico","adequacao"]);
export const SLA_PRIORITY = {
  P1:{label:"Crítica",supportMinutes:660,factoryMinutes:480,totalMinutes:1140},
  P2:{label:"Alta",supportMinutes:1320,factoryMinutes:3360,totalMinutes:4680},
  P3:{label:"Média",supportMinutes:1980,factoryMinutes:9600,totalMinutes:11580},
  P4:{label:"Baixa",supportMinutes:2640,factoryMinutes:21600,totalMinutes:24240},
} as const;
export type SlaPriority=keyof typeof SLA_PRIORITY;
export const normalizeDomainText=(value?:string|null)=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
export const isCauseApplicable=(category?:string|null)=>!CAUSE_NOT_APPLICABLE_CATEGORIES.has(normalizeDomainText(category));
export function isBug(category?:string|null,taskType?:string|null){const c=normalizeDomainText(category);return c==="bug"||c.includes("bug")||normalizeDomainText(taskType)==="bug";}
export function mapPriority(...values:Array<string|null|undefined>):SlaPriority|null{for(const value of values){const n=normalizeDomainText(value);if(n.includes("critica")||n==="p1")return"P1";if(n.includes("alta")||n==="p2")return"P2";if(n.includes("media")||n==="p3")return"P3";if(n.includes("baixa")||n==="p4")return"P4";}return null;}
export function isConcluded(...values:Array<string|null|undefined>){return values.some(value=>["concluida","concluido"].includes(normalizeDomainText(value)));}
export function businessMinutes(start:Date,end:Date){if(end<=start)return 0;let total=0;const cursor=new Date(start);cursor.setHours(0,0,0,0);while(cursor<=end){const day=cursor.getDay();if(day>=1&&day<=5){const from=new Date(cursor);from.setHours(8,0,0,0);const to=new Date(cursor);to.setHours(18,0,0,0);total+=Math.max(0,(Math.min(to.getTime(),end.getTime())-Math.max(from.getTime(),start.getTime()))/60000);}cursor.setDate(cursor.getDate()+1);}return Math.round(total);}
