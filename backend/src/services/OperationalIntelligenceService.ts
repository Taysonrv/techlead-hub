import { prisma } from "../database/prisma";

const normalize=(value?:string|null)=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
const serviceOf=(row:any)=>row.serviceThirdLevel||row.serviceSecondLevel||row.serviceFirstLevel||row.service||"Sem serviço";
const percent=(part:number,total:number)=>total?Math.round(part/total*1000)/10:0;

export class OperationalIntelligenceService {
  async overview(days=90){
    const safeDays=Math.max(30,Math.min(days,730));
    const since=new Date(); since.setDate(since.getDate()-safeDays);
    const previousSince=new Date(since); previousSince.setDate(previousSince.getDate()-safeDays);

    const [tickets,previous,azure]=await Promise.all([
      prisma.ticket.findMany({where:{isDeleted:false,createdDate:{gte:since}},select:{movideskId:true,subject:true,client:true,category:true,cause:true,service:true,serviceFirstLevel:true,serviceSecondLevel:true,serviceThirdLevel:true,taskNumber:true,registeredVersion:true,deliveredVersion:true,createdDate:true}}),
      prisma.ticket.findMany({where:{isDeleted:false,createdDate:{gte:previousSince,lt:since}},select:{service:true,serviceFirstLevel:true,serviceSecondLevel:true,serviceThirdLevel:true}}),
      prisma.azureWorkItem.findMany({where:{azureChangedAt:{gte:since}},select:{id:true,workItemType:true,state:true,client:true,movideskTicket:true,deliveredVersion:true,registeredVersion:true,azureChangedAt:true}})
    ]);

    const aggregate=(rows:any[],key:(row:any)=>string)=>{
      const map=new Map<string,{name:string,total:number}>();
      rows.forEach(row=>{const name=key(row)||"Não informado";const id=normalize(name);const current=map.get(id)??{name,total:0};current.total++;map.set(id,current)});
      return [...map.values()].sort((a,b)=>b.total-a.total);
    };
    const services=aggregate(tickets,serviceOf);
    const clients=aggregate(tickets,row=>row.client||"Não informado");
    const versions=aggregate(tickets,row=>row.deliveredVersion||row.registeredVersion||"Sem versão");
    const previousServices=new Map(aggregate(previous,serviceOf).map(x=>[normalize(x.name),x.total]));
    const anomalies=services.slice(0,20).map(item=>{const before=previousServices.get(normalize(item.name))??0;const delta=before?Math.round((item.total-before)/before*100):item.total>=4?100:0;return {...item,previous:before,delta};}).filter(x=>x.total>=3&&x.delta>=50).sort((a,b)=>b.delta-a.delta||b.total-a.total).slice(0,8);

    const clustersMap=new Map<string,{service:string;client:string;version:string;cases:number;tickets:number[]}>();
    tickets.forEach(row=>{const service=serviceOf(row),client=row.client||"Sem cliente",version=row.deliveredVersion||row.registeredVersion||"Sem versão";const key=[normalize(service),normalize(client),normalize(version)].join("|");const current=clustersMap.get(key)??{service,client,version,cases:0,tickets:[] as number[]};current.cases++;current.tickets.push(row.movideskId);clustersMap.set(key,current);});
    const clusters=[...clustersMap.values()].filter(x=>x.cases>=2).sort((a,b)=>b.cases-a.cases).slice(0,10);
    const monthly=[...tickets.reduce((map,row)=>{const key=row.createdDate.toISOString().slice(0,7);map.set(key,(map.get(key)??0)+1);return map},new Map<string,number>()).entries()].map(([month,total])=>({month,total})).sort((a,b)=>a.month.localeCompare(b.month));

    const linked=tickets.filter(x=>x.taskNumber).length;
    const classified=tickets.filter(x=>x.cause||x.category).length;
    const versioned=tickets.filter(x=>x.deliveredVersion||x.registeredVersion).length;
    return {
      generatedAt:new Date().toISOString(),periodDays:safeDays,
      summary:{tickets:tickets.length,azureItems:azure.length,linkCoverage:percent(linked,tickets.length),classificationCoverage:percent(classified,tickets.length),versionCoverage:percent(versioned,tickets.length),anomalies:anomalies.length,clusters:clusters.length},
      trends:{monthly,services:services.slice(0,10),clients:clients.slice(0,10),versions:versions.slice(0,8)},
      anomalies,clusters,
      technicalDna:{
        topServices:services.slice(0,6).map(item=>({...item,share:percent(item.total,tickets.length)})),
        topClients:clients.slice(0,6).map(item=>({...item,share:percent(item.total,tickets.length)})),
        topVersions:versions.filter(x=>x.name!=="Sem versão").slice(0,6).map(item=>({...item,share:percent(item.total,tickets.length)})),
        recurrenceIndex:percent(clusters.reduce((sum,item)=>sum+item.cases,0),tickets.length),
        evidenceQuality:Math.round((percent(linked,tickets.length)+percent(classified,tickets.length)+percent(versioned,tickets.length))/3*10)/10
      },
      signals:[
        ...anomalies.slice(0,3).map(x=>({severity:x.delta>=100?"high":"medium",title:`Aumento em ${x.name}`,detail:`${x.total} tickets no período, ${x.delta}% acima do período anterior.`,query:x.name})),
        ...(percent(linked,tickets.length)<70?[{severity:"medium",title:"Cobertura Azure abaixo de 70%",detail:`${percent(linked,tickets.length)}% dos tickets possuem Task vinculada.`,path:"/qualidade-dados"}]:[])
      ].slice(0,6)
    };
  }
}
export const operationalIntelligenceService=new OperationalIntelligenceService();
