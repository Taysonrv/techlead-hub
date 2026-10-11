import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { prisma } from "../src/database/prisma";
import { CorrectionMonthlyReportService, identityName, isCorrectionTeamCreator } from "../src/services/CorrectionMonthlyReportService";

type Snapshot={id:number;rev?:number;fields:Record<string,unknown>};
type Result={
  cards:{registered:number;delivered:number;canceled:number;inRegistration:number;backlogInitial:number;backlogCurrent:number};
  rows:Array<{id:number;stateAtOpen:string|null;stateAtClose:string|null;inMonthlyIndicators:boolean}>;
  pipeline:Array<{name:string;total:number}>;
  quality:{historicalMetricsReliable:boolean;backlogHistoricalReliable:boolean;missingClosingFields:number};
};
const fields={client:"client",urgency:"urgency",prioritized:"prioritized"};
function snapshot(id:number,state:string,created:string,changed:string,client="COAP",creator="Tayson Araujo"):Snapshot {
  return {id,rev:2,fields:{
    "System.Id":id,"System.WorkItemType":"Correção Clientes","System.State":state,
    "System.CreatedDate":created,"System.ChangedDate":changed,
    "System.CreatedBy":{uniqueName:`${creator} <test@example.invalid>`},
    "Microsoft.VSTS.Common.StateChangeDate":changed,client,urgency:"Média",prioritized:false,
  }};
}
const asBuilder=(service:CorrectionMonthlyReportService)=>service as unknown as {build(month:string):Promise<Result>};
function localDb(t:TestContext) {
  const find=prisma.azureWorkItem.findMany;
  const query=prisma.$queryRaw;
  prisma.azureWorkItem.findMany=(async()=>[]) as typeof find;
  prisma.$queryRaw=(async()=>[]) as typeof query;
  t.after(()=>{prisma.azureWorkItem.findMany=find;prisma.$queryRaw=query;});
}
function reportService(t:TestContext) {
  const service=new CorrectionMonthlyReportService();
  t.mock.method(service,"loadClosing",async()=>null);
  t.mock.method(service,"resolveFields",async()=>fields);
  t.mock.method(service,"workItemUrl",()=>null);
  return service;
}

test("Reporting aceita uniqueName e nome com email sem incluir outro Renan",()=>{
  assert.equal(identityName({uniqueName:"Tayson Araujo <test@example.invalid>"}),"Tayson Araujo");
  assert.equal(identityName({displayName:"Alan Neto",uniqueName:"login"}),"Alan Neto");
  assert.equal(isCorrectionTeamCreator(identityName({uniqueName:"Renan Sousa <test@example.invalid>"})),true);
  assert.equal(isCorrectionTeamCreator("Renan Stein <test@example.invalid>"),false);
});

test("Reporting percorre continuação sem nextLink e não certifica página truncada",async(t)=>{
  const service=new CorrectionMonthlyReportService();
  t.mock.method(service,"azureConfig",()=>({organization:"coverage-test",project:"test",pat:"test"}));
  const calls:Array<{params:Record<string,unknown>}>=[];
  const responses=[
    {values:[],isLastBatch:false,continuationToken:"page-2"},
    {values:[{id:1,rev:2,fields:{"System.State":"Concluído"}}],isLastBatch:true},
  ];
  t.mock.method(service,"client",()=>({get:async(_url:string,options:{params:Record<string,unknown>})=>{
    calls.push(options);return {data:responses.shift()};
  }}));
  const reader=service as unknown as {revisions(f:typeof fields,start:Date):Promise<Snapshot[]>};
  assert.equal((await reader.revisions(fields,new Date("2026-09-01T03:00:00Z"))).length,1);
  assert.equal(calls[0].params.startDateTime,"2026-09-01T03:00:00.000Z");
  assert.equal(calls[1].params.continuationToken,"page-2");
  assert.equal(calls[1].params.startDateTime,undefined);
  t.mock.method(service,"client",()=>({get:async()=>({data:{values:[{id:2}],isLastBatch:false}})}));
  await assert.rejects(reader.revisions(fields,new Date("2026-08-01T03:00:00Z")),/continuação/);
});

test("WIQL inclui Registro na abertura e terminais na descoberta do fechamento",async(t)=>{
  const service=new CorrectionMonthlyReportService();
  const queries:string[]=[];
  t.mock.method(service,"client",()=>({post:async(_url:string,body:{query:string})=>{
    queries.push(body.query);return {data:{workItems:[{id:1},{id:1}]}};
  }}));
  const reader=service as unknown as {workItemIdsAsOf(at:Date,all?:boolean):Promise<number[]>};
  const at=new Date("2026-10-01T02:59:59.999Z");
  assert.deepEqual(await reader.workItemIdsAsOf(at),[1]);
  assert.deepEqual(await reader.workItemIdsAsOf(at,true),[1]);
  assert.doesNotMatch(queries[0],/<> 'Registro'/);
  assert.match(queries[0],/<> 'Concluído'/);
  assert.doesNotMatch(queries[1],/System.State/);
  assert.match(queries[1],/ASOF '2026-10-01T02:59:59.999Z'/);
});

test("setembro reproduz referência por snapshots completos sem depender de Tasks sincronizadas",async(t)=>{
  localDb(t);
  const service=reportService(t);
  const open=new Map<number,Snapshot>();
  const close=new Map<number,Snapshot>();
  const august="2026-08-10T12:00:00Z";
  const september="2026-09-15T12:00:00Z";
  for(let id=1;id<=18;id++) {
    open.set(id,snapshot(id,id<=14?"Qualidade":"Registro",august,august));
    close.set(id,snapshot(id,id<=11?"Concluído":id<=14?"Cancelado":"Registro",august,id<=14?september:august));
  }
  for(let id=100;id<145;id++)
    close.set(id,snapshot(id,id<130?"Concluído":id<135?"Cancelado":id===135?"Registro":"Qualificação","2026-09-02T12:00:00Z",september));
  // Encerrados em agosto continuam no pipeline, sem inflar cards de setembro.
  for(const [id,state] of [[900,"Concluído"],[901,"Cancelado"]] as const) {
    open.set(id,snapshot(id,state,august,august));close.set(id,open.get(id)!);
  }
  close.set(920,snapshot(920,"Concluído",september,september,"Cliente externo"));
  close.set(921,snapshot(921,"Concluído",september,september,"COAP","Renan Stein"));
  t.mock.method(service,"workItemIdsAsOf",async(_at:Date,all:boolean)=>all?[...close.keys()]:Array.from({length:18},(_,i)=>i+1));
  t.mock.method(service,"snapshots",async(_ids:number[],at:Date)=>at.getUTCMonth()===8?open:close);
  t.mock.method(service,"revisions",async()=>[...close.values()]);
  const report=await asBuilder(service).build("2026-09");
  assert.deepEqual(report.cards,{registered:45,delivered:41,canceled:8,inRegistration:1,backlogInitial:14,backlogCurrent:9});
  assert.equal(report.quality.historicalMetricsReliable,true);
  assert.equal(report.rows.length,65);
  assert.equal(report.rows.filter(row=>row.inMonthlyIndicators).length,59);
  assert.equal(report.rows.some(row=>row.id===920||row.id===921),false);
  assert.equal(report.pipeline.find(row=>row.name==="Registro")?.total,5);
  assert.equal(report.pipeline.reduce((sum,row)=>sum+row.total,0),65);

  // O estoque de setembro vira a abertura de outubro; somente eventos de
  // outubro alteram seus cards, sem recontar as 41 entregas de setembro.
  const octoberClose=new Map(close);
  for(const id of [136,137]) octoberClose.set(id,snapshot(id,"Concluído","2026-09-02T12:00:00Z","2026-10-02T12:00:00Z"));
  octoberClose.set(999,snapshot(999,"Concluído","2026-10-03T12:00:00Z","2026-10-04T12:00:00Z"));
  t.mock.method(service,"workItemIdsAsOf",async(_at:Date,all:boolean)=>all?[...octoberClose.keys()]:[15,16,17,18,135,136,137,138,139,140,141,142,143,144]);
  t.mock.method(service,"snapshots",async(_ids:number[],at:Date)=>at.getUTCMonth()===9&&at.getUTCDate()===1?close:octoberClose);
  t.mock.method(service,"revisions",async()=>[...octoberClose.values()]);
  const october=await asBuilder(service).build("2026-10");
  assert.equal(october.cards.backlogInitial,report.cards.backlogCurrent);
  assert.equal(october.cards.backlogCurrent,7);
  assert.equal(october.cards.registered,1);
  assert.equal(october.cards.delivered,3);
  assert.equal(october.cards.canceled,0);
});

test("falha na abertura preserva fechamento recuperado e bloqueia homologação",async(t)=>{
  localDb(t);
  const service=reportService(t);
  const item=snapshot(1,"Concluído","2026-09-02T12:00:00Z","2026-09-10T12:00:00Z");
  t.mock.method(service,"workItemIdsAsOf",async(_at:Date,all:boolean)=>{if(!all)throw new Error("timeout abertura");return [1];});
  t.mock.method(service,"snapshots",async(_ids:number[],at:Date)=>{if(at.getUTCMonth()===8)throw new Error("timeout abertura");return new Map([[1,item]]);});
  t.mock.method(service,"revisions",async()=>[item]);
  t.mock.method(service,"recoverHistoricalSnapshots",async()=>({opening:new Map(),closing:new Map(),revisions:[],completed:new Set(),failures:1}));
  const report=await asBuilder(service).build("2026-09");
  assert.equal(report.cards.registered,1);
  assert.equal(report.cards.delivered,1);
  assert.equal(report.rows[0]?.stateAtClose,"Concluído");
  assert.equal(report.quality.historicalMetricsReliable,false);
});

test("histórico por ID recupera Task remota ausente da sincronização local",async(t)=>{
  localDb(t);
  const service=reportService(t);
  const item=snapshot(1,"Concluído","2026-08-10T12:00:00Z","2026-09-10T12:00:00Z");
  delete item.fields["Microsoft.VSTS.Common.StateChangeDate"];
  const before=snapshot(1,"Qualidade","2026-08-10T12:00:00Z","2026-08-10T12:00:00Z");
  before.rev=1;
  t.mock.method(service,"workItemIdsAsOf",async()=>[1]);
  t.mock.method(service,"snapshots",async(_ids:number[],at:Date)=>new Map([[1,at.getUTCMonth()===8?before:item]]));
  t.mock.method(service,"revisions",async()=>[]);
  t.mock.method(service,"recoverHistoricalSnapshots",async(ids:number[])=>{
    assert.deepEqual(ids,[1]);
    return {opening:new Map([[1,before]]),closing:new Map([[1,item]]),revisions:[before,item],completed:new Set([1]),failures:0};
  });
  const report=await asBuilder(service).build("2026-09");
  assert.equal(report.cards.backlogInitial,1);
  assert.equal(report.cards.delivered,1);
  assert.equal(report.quality.historicalMetricsReliable,true);
});

test("campos customizados omitidos não certificam carteira vazia",async(t)=>{
  localDb(t);
  const service=reportService(t);
  const item=snapshot(1,"Concluído","2026-09-02T12:00:00Z","2026-09-10T12:00:00Z");
  delete item.fields.client;
  t.mock.method(service,"workItemIdsAsOf",async(_at:Date,all:boolean)=>all?[1]:[]);
  t.mock.method(service,"snapshots",async(_ids:number[],at:Date)=>at.getUTCMonth()===8?new Map():new Map([[1,item]]));
  t.mock.method(service,"revisions",async()=>[item]);
  const report=await asBuilder(service).build("2026-09");
  assert.equal(report.quality.missingClosingFields,1);
  assert.equal(report.quality.historicalMetricsReliable,false);
});

test("revisões completas complementam Cliente Principal omitido pelo batch",async(t)=>{
  localDb(t);
  const service=reportService(t);
  const before=snapshot(1,"Qualidade","2026-08-10T12:00:00Z","2026-08-10T12:00:00Z");
  before.rev=1;
  const final=snapshot(1,"Concluído","2026-08-10T12:00:00Z","2026-09-10T12:00:00Z");
  const core=(item:Snapshot)=>{const f={...item.fields};delete f.client;return {...item,fields:f};};
  t.mock.method(service,"workItemIdsAsOf",async()=>[1]);
  t.mock.method(service,"snapshots",async(_ids:number[],at:Date)=>new Map([[1,core(at.getUTCMonth()===8?before:final)]]));
  t.mock.method(service,"revisions",async()=>[]);
  t.mock.method(service,"recoverHistoricalSnapshots",async()=>({opening:new Map([[1,before]]),closing:new Map([[1,final]]),revisions:[before,final],completed:new Set([1]),failures:0}));
  const report=await asBuilder(service).build("2026-09");
  assert.equal(report.quality.missingClosingFields,0);
  assert.equal(report.quality.historicalMetricsReliable,true);
  assert.equal(report.cards.delivered,1);
  assert.equal(report.cards.backlogInitial,1);
});

test("snapshots completos com StateChangeDate dispensam recuperação individual redundante",async(t)=>{
  localDb(t);
  const service=reportService(t);
  const before=snapshot(1,"Qualidade","2026-08-10T12:00:00Z","2026-08-10T12:00:00Z");
  const final=snapshot(1,"Concluído","2026-08-10T12:00:00Z","2026-09-10T12:00:00Z");
  t.mock.method(service,"workItemIdsAsOf",async()=>[1]);
  t.mock.method(service,"snapshots",async(_ids:number[],at:Date)=>new Map([[1,at.getUTCMonth()===8?before:final]]));
  t.mock.method(service,"revisions",async()=>[]);
  const recovery=t.mock.method(service,"recoverHistoricalSnapshots",async()=>{throw new Error("Consulta redundante");});
  const report=await asBuilder(service).build("2026-09");
  assert.equal(recovery.mock.callCount(),0);
  assert.equal(report.quality.historicalMetricsReliable,true);
  assert.equal(report.cards.delivered,1);
});

test("snapshot com ID mas sem estado não comprova backlog zero",async(t)=>{
  localDb(t);
  const service=reportService(t);
  const item=snapshot(1,"Concluído","2026-08-02T12:00:00Z","2026-09-10T12:00:00Z");
  const missingState={...item,fields:{...item.fields}};
  delete missingState.fields["System.State"];
  t.mock.method(service,"workItemIdsAsOf",async()=>[1]);
  t.mock.method(service,"snapshots",async(_ids:number[],at:Date)=>new Map([[1,at.getUTCMonth()===8?missingState:item]]));
  t.mock.method(service,"revisions",async()=>[item]);
  const report=await asBuilder(service).build("2026-09");
  assert.equal(report.quality.historicalMetricsReliable,false);
  t.mock.method(service,"snapshots",async()=>new Map([[1,missingState]]));
  const noClosingState=await asBuilder(service).build("2026-09");
  assert.equal(noClosingState.quality.missingClosingFields,1);
  assert.equal(noClosingState.quality.historicalMetricsReliable,false);
});

test("nova consulta parcial não substitui movimentos de fechamento já comprovado",async(t)=>{
  const service=new CorrectionMonthlyReportService();
  t.mock.method(service,"loadClosing",async()=>({rows:[],reliable:true,coverage:{movementHistoryReliable:true}}));
  const original=prisma.systemSetting.upsert;
  let writes=0;
  prisma.systemSetting.upsert=(async()=>{writes++;return {};}) as typeof original;
  t.after(()=>{prisma.systemSetting.upsert=original;});
  const saver=service as unknown as {saveClosing(month:string,data:unknown):Promise<void>};
  await saver.saveClosing("2026-09",{rows:[],quality:{backlogHistoricalReliable:true,movementHistoryReliable:false}});
  assert.equal(writes,0);
});

test("Recarregar recupera revisões novas em vez de reutilizar resposta vazia em cache",async(t)=>{
  const service=new CorrectionMonthlyReportService();
  t.mock.method(service,"azureConfig",()=>({organization:"reload-test",project:"test",pat:"test"}));
  let calls=0;
  t.mock.method(service,"client",()=>({get:async()=>({data:{values:++calls===1?[]:[{id:1,rev:2}],isLastBatch:true}})}));
  const reader=service as unknown as {revisions(f:typeof fields,start:Date):Promise<Snapshot[]>};
  const start=new Date("2026-09-01T03:00:00Z");
  assert.equal((await reader.revisions(fields,start)).length,0);
  assert.equal((await reader.revisions(fields,start)).length,0);
  assert.equal(calls,1);
  t.mock.method(service,"saveClosing",async()=>{});
  t.mock.method(service,"build",async()=>({rows:[],quality:{},revisions:(await reader.revisions(fields,start)).length}));
  const reloaded=await service.get("2026-09",true) as {revisions:number};
  assert.equal(reloaded.revisions,1);
  assert.equal(calls,2);
});

test("snapshots usam lotes de até 200 com concorrência limitada",async(t)=>{
  const service=new CorrectionMonthlyReportService();
  let active=0,maxActive=0;
  const requests:number[][]=[];
  t.mock.method(service,"client",()=>({post:async(_url:string,body:{ids:number[]})=>{
    requests.push(body.ids);active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setImmediate(resolve));active--;
    return {data:{value:body.ids.map(id=>({id}))}};
  }}));
  const reader=service as unknown as {snapshots(ids:number[],at:Date,f:typeof fields):Promise<Map<number,Snapshot>>};
  const ids=Array.from({length:650},(_,i)=>i+1);
  assert.equal((await reader.snapshots(ids,new Date("2026-10-01T02:59:59.999Z"),fields)).size,650);
  assert.equal(requests.length,4);
  assert.equal(requests.every(batch=>batch.length<=200),true);
  assert.equal(maxActive,3);
});
