export type PopupCandidate={key:string;kind:string;occurredAt:string};
/** Only acknowledged deliveries are marked shown; overflow remains eligible. */
export function selectPopupCandidates<T extends PopupCandidate>(items:T[],shown:Set<string>,now:number,capacity:number){
 return items.filter(item=>{
  const age=now-Date.parse(item.occurredAt);
  return !shown.has(item.key)&&item.kind!=="USER_ONLINE"&&Number.isFinite(age)&&age>=0&&age<5*60_000;
 }).sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)).slice(0,Math.max(0,capacity));
}
