import { prisma } from "../database/prisma";

const norm=(v?:string|null)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
const serviceOf=(t:any)=>t.serviceThirdLevel||t.serviceSecondLevel||t.serviceFirstLevel||t.service||null;
const month=(d:Date)=>d.toISOString().slice(0,7);

export class InvestigationIntelligenceService {
  async analyze(ticket:any,similar:any[]){
    const client=ticket.client?.trim()||null;
    const service=serviceOf(ticket);
    const since=new Date(ticket.createdDate);since.setMonth(since.getMonth()-12);
    const until=new Date(ticket.createdDate);until.setMonth(until.getMonth()+1);
    const clientTickets=client?await prisma.ticket.findMany({
      where:{isDeleted:false,client:{equals:client,mode:"insensitive"},createdDate:{gte:since,lte:until}},
      select:{movideskId:true,subject:true,category:true,cause:true,status:true,urgency:true,service:true,serviceFirstLevel:true,serviceSecondLevel:true,serviceThirdLevel:true,createdDate:true,taskNumber:true,registeredVersion:true,deliveredVersion:true}
    }):[];

    const count=(values:(string|null|undefined)[])=>{const m=new Map<string,number>();values.filter(Boolean).forEach(v=>m.set(String(v),(m.get(String(v))??0)+1));return [...m.entries()].sort((a,b)=>b[1]-a[1]);};
    const topServices=count(clientTickets.map(serviceOf)).slice(0,5).map(([name,total])=>({name,total}));
    const topCategories=count(clientTickets.map(x=>x.category)).slice(0,5).map(([name,total])=>({name,total}));
    const taskRate=clientTickets.length?Math.round(clientTickets.filter(x=>x.taskNumber).length/clientTickets.length*1000)/10:0;
    const serviceCases=service?clientTickets.filter(x=>norm(serviceOf(x))===norm(service)):[];

    const monthly=[...clientTickets.reduce((m,x)=>{const key=month(x.createdDate);m.set(key,(m.get(key)??0)+1);return m},new Map<string,number>()).entries()].map(([key,total])=>({month:key,total})).sort((a,b)=>a.month.localeCompare(b.month));
    const baseline=monthly.slice(0,-1).map(x=>x.total);
    const current=monthly.at(-1)?.total??0;
    const avg=baseline.length?baseline.reduce((a,b)=>a+b,0)/baseline.length:0;
    const anomalyRatio=avg?current/avg:null;

    const versions=count(similar.map(x=>x.deliveredVersion).filter(Boolean));
    const versionDistribution=versions.slice(0,8).map(([version,total])=>({version,total}));
    const versionSignal=versions[0]&&versions[0][1]>=3?{version:versions[0][0],cases:versions[0][1],text:`${versions[0][1]} casos correlacionados compartilham a versão ${versions[0][0]}.`}:null;

    const strong=similar.filter(x=>x.score>=45);
    const crossClients=new Set(strong.map(x=>norm(x.client)).filter(Boolean)).size;
    const recurrence={
      strongCases:strong.length,
      crossClient:crossClients>=2,
      clients:crossClients,
      concentration:strong.length?Math.round(strong.filter(x=>norm(x.client)===norm(client)).length/strong.length*1000)/10:0,
    };

    const signals:Array<{severity:"info"|"warning"|"success";title:string;detail:string}>=[];
    if(strong.length>=3)signals.push({severity:"warning",title:"Recorrência forte",detail:`${strong.length} casos atingem score de correlação ≥45.`});
    if(crossClients>=2)signals.push({severity:"warning",title:"Recorrência transversal",detail:`O padrão forte aparece em ${crossClients} clientes distintos; investigar regra/versão antes de tratar como cenário isolado.`});
    if(versionSignal)signals.push({severity:"info",title:"Concentração por versão",detail:versionSignal.text});
    if(anomalyRatio!==null&&anomalyRatio>=1.5&&current>=3)signals.push({severity:"warning",title:"Aumento recente no cliente",detail:`O último mês do recorte tem ${current} tickets, ${Math.round((anomalyRatio-1)*100)}% acima da média dos meses anteriores.`});
    if(serviceCases.length>=5)signals.push({severity:"info",title:"Serviço recorrente no cliente",detail:`${serviceCases.length} tickets do cliente no recorte pertencem a ${service}.`});

    return {
      clientDna:{client,totalTickets:clientTickets.length,taskRate,topServices,topCategories,serviceCases:serviceCases.length,periodStart:since,periodEnd:until,monthly},
      recurrence,versionSignal,versionDistribution,signals,
      confidence:{score:Math.min(100,Math.round((ticket.client?20:0)+(service?25:0)+(ticket.category?15:0)+(ticket.taskNumber?15:0)+(similar.length?25:0))),basis:["cliente","serviço","categoria","vínculo Azure","casos correlacionados"].filter((_,i)=>[ticket.client,service,ticket.category,ticket.taskNumber,similar.length][i])}
    };
  }
}
export const investigationIntelligenceService=new InvestigationIntelligenceService();
