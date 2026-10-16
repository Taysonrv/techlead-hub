/** SLA Interna Aliare (2026 v1.0), páginas 2–7. */
export type SlaTier = "PADRAO" | "VIP";
export type SlaPriority = "P1" | "P2" | "P3" | "P4";
export type SlaKind = "BUG" | "OUTROS";
export const ALIARE_TARGETS: Record<SlaTier, Record<SlaKind, Record<SlaPriority,{response:number;support:number;factory:number;total:number}>>> = {
 PADRAO:{
 BUG:{P1:{response:120,support:660,factory:480,total:1140},P2:{response:180,support:1320,factory:3360,total:4680},P3:{response:270,support:1980,factory:9600,total:11580},P4:{response:480,support:2640,factory:21600,total:24240}},
 OUTROS:{P1:{response:120,support:660,factory:0,total:660},P2:{response:180,support:1320,factory:0,total:1320},P3:{response:270,support:1980,factory:0,total:1980},P4:{response:480,support:2640,factory:0,total:2640}}},
 VIP:{
 BUG:{P1:{response:60,support:330,factory:240,total:570},P2:{response:90,support:660,factory:1440,total:2100},P3:{response:150,support:990,factory:4800,total:5790},P4:{response:240,support:1320,factory:10800,total:12120}},
 OUTROS:{P1:{response:60,support:330,factory:0,total:330},P2:{response:90,support:660,factory:0,total:660},P3:{response:150,support:990,factory:0,total:990},P4:{response:240,support:1320,factory:0,total:1320}}}
};
export const ALIARE_PAUSE_STATUSES = [
"Aguardando » Agendamento","Aguardando » Aprovação de Proposta","Aguardando » Dados Complementares",
"Aguardando » Faturamento","Aguardando » Negócios","Aguardando » Retorno do cliente",
"Aguardando » Serviço","Aguardando » Terceiros (Externo)","Aguardando » Validação Serviço",
"Aguardando » Validar Versão","Pausado » Reaberto"
] as const;
export function normalizeSlaLabel(v:string|null|undefined) {
 return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/gi," ").trim().toLowerCase();
}
export function isSlaEligibleCategory(v:string|null|undefined) {
 return !["adequacao","solicitacao de servico"].includes(normalizeSlaLabel(v));
}
export function isAliarePause(v:string|null|undefined) {
 const value=normalizeSlaLabel(v);
 return ALIARE_PAUSE_STATUSES.some(s=>normalizeSlaLabel(s)===value);
}
/** Hora útil BRT; feriados devem ser injetados explicitamente (yyyy-MM-dd). */
export function aliareBusinessMinutes(start:Date,end:Date,kind:SlaKind,holidays:ReadonlySet<string>=new Set()):number {
 if(end<=start) return 0;
 if(end.getTime()-start.getTime()>366*86400000) throw new Error("Período acima de um ano requer análise segmentada.");
 const fmt=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
 let minutes=0;
 for(let t=Math.ceil(start.getTime()/60000)*60000;t+60000<=end.getTime();t+=60000){
  const p=Object.fromEntries(fmt.formatToParts(new Date(t)).map(item=>[item.type,item.value]));
  const wd=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(p.weekday);
  const m=Number(p.hour)*60+Number(p.minute);
  if(holidays.has(`${p.year}-${p.month}-${p.day}`)) continue;
  if(wd>=1&&wd<=5&&m>=480&&m<(kind==="BUG"?1080:1110)) minutes++;
  else if(kind==="OUTROS"&&wd===6&&m>=480&&m<720) minutes++;
 }
 return minutes;
}
