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
  t.mock.method(service,"currentAssignees",async()=>new Map());
  return service;
}

test("Reporting aceita uniqueName e nome com email sem incluir outro Renan",()=>{
  assert.equal(identityName({uniqueName:"Tayson Araujo <test@example.invalid>"}),"Tayson Araujo");
  assert.equal(identityName({displayName:"Alan Neto",uniqueName:"login"}),"Alan Neto");
  assert.equal(isCorrectionTeamCreator(identityName({uniqueName:"Renan Sousa <test@example.invalid>"})),true);
  assert.equal(isCorrectionTeamCreator("Renan Stein <test@example.invalid>"),false);
});

test("fechamentos anteriores à correção dos filtros históricos são reapurados",async(t)=>{
  const original=prisma.systemSetting.findUnique;
  let version=4;
  prisma.systemSetting.findUnique=(async()=>({value:JSON.stringify({version,rows:[],reliable:true})})) as typeof original;
  t.after(()=>{prisma.systemSetting.findUnique=original;});
  const reader=new CorrectionMonthlyReportService() as unknown as {loadClosing(month:string):Promise<{reliable:boolean}|null>};
  assert.equal(await reader.loadClosing("2026-09"),null);
  version=5;
  assert.equal((await reader.loadClosing("2026-09"))?.reliable,true);
});

test("valores atuais nunca preenchem filtros históricos ausentes e o responsável atual fica separado",async(t)=>{
  localDb(t);
  const service=reportService(t);
  const before=snapshot(1,"Qualidade","2026-08-10T12:00:00Z","2026-08-10T12:00:00Z");
  const final=snapshot(1,"Concluído","2026-08-10T12:00:00Z","2026-09-10T12:00:00Z");
  delete final.fields.urgency;delete final.fields.prioritized;
  final.fields["Microsoft.VSTS.Common.Priority"]=2;
  final.fields["System.AssignedTo"]={displayName:"Responsável de setembro"};
  let criticality="Alta",prioritized=true,assignedToName:string|null="Responsável de outubro";
  prisma.azureWorkItem.findMany=(async()=>[{
    id:1,client:"COAP",createdByName:"Tayson Araujo",azureCreatedAt:new Date("2026-08-10T12:00:00Z"),
    state:"Concluído",stateChangedAt:new Date("2026-10-05T12:00:00Z"),criticality,prioritized,assignedToName,
  }]) as typeof prisma.azureWorkItem.findMany;
  t.mock.method(service,"workItemIdsAsOf",async()=>[1]);
  t.mock.method(service,"snapshots",async(_ids:number[],at:Date)=>new Map([[1,at.getTime()<Date.parse("2026-09-01T03:00:00Z")?before:final]]));
  t.mock.method(service,"revisions",async()=>[final]);
  type Details=Result&{rows:Array<{urgency:string|null;prioritized:boolean|null;assignedTo:string|null;assignedAtClose:string|null;assignedToSource:string}>};
  const first=await asBuilder(service).build("2026-09") as Details;
  criticality="Baixa";prioritized=false;assignedToName=null;
  const second=await asBuilder(service).build("2026-09") as Details;
  assert.equal(first.rows[0].urgency,null);assert.equal(second.rows[0].urgency,null);
  assert.equal(first.rows[0].prioritized,null);assert.equal(second.rows[0].prioritized,null);
  assert.deepEqual(first.cards,second.cards);
  assert.equal(first.rows[0].assignedTo,"Responsável de outubro");
  assert.equal(second.rows[0].assignedTo,null,"a remoção do responsável atual não volta ao nome histórico");
  assert.equal(second.rows[0].assignedAtClose,"Responsável de setembro");
  assert.equal(second.rows[0].assignedToSource,"local-sync");
});

test("snapshot pode completar campos pela mesma revisão histórica sem usar metadados atuais",async(t)=>{
  localDb(t);
  const service=reportService(t);
  const before=snapshot(1,"Qualidade","2026-08-10T12:00:00Z","2026-08-10T12:00:00Z");
  const final=snapshot(1,"Concluído","2026-08-10T12:00:00Z","2026-09-10T12:00:00Z");
  const batch={...final,fields:{...final.fields}};delete batch.fields.urgency;delete batch.fields.prioritized;
  t.mock.method(service,"workItemIdsAsOf",async()=>[1]);
  t.mock.method(service,"snapshots",async(_ids:number[],at:Date)=>new Map([[1,at.getTime()<Date.parse("2026-09-01T03:00:00Z")?before:batch]]));
  t.mock.method(service,"revisions",async()=>[final]);
  const report=await asBuilder(service).build("2026-09") as Result&{rows:Array<{urgency:string|null;prioritized:boolean|null}>};
  assert.equal(report.rows[0].urgency,"Média");
  assert.equal(report.rows[0].prioritized,false);
});

test("responsável de Task remota vem do Azure atual, inclusive quando não há atribuição",async(t)=>{
  localDb(t);
  const service=reportService(t);
  const final=snapshot(1,"Concluído","2026-09-02T12:00:00Z","2026-09-10T12:00:00Z");
  final.fields["System.AssignedTo"]={displayName:"Responsável de setembro"};
  t.mock.method(service,"workItemIdsAsOf",async(_at:Date,all:boolean)=>all?[1]:[]);
  t.mock.method(service,"snapshots",async(_ids:number[],at:Date)=>at.getTime()<Date.parse("2026-09-01T03:00:00Z")?new Map():new Map([[1,final]]));
  t.mock.method(service,"revisions",async()=>[final]);
  let owner:string|null="Responsável atual no Azure";
  // Restore the real batch reader so its request is checked as well.
  const reader=(CorrectionMonthlyReportService.prototype as any).currentAssignees;
  t.mock.method(service,"currentAssignees",reader.bind(service));
  t.mock.method(service,"client",()=>({post:async(_url:string,body:Record<string,unknown>)=>{
    assert.equal(body.asOf,undefined);assert.deepEqual(body.ids,[1]);
    assert.deepEqual(body.fields,["System.Id","System.AssignedTo"]);
    return {data:{value:[{id:1,fields:owner?{"System.AssignedTo":{displayName:owner}}:{}}]}};
  }}));
  type Details=Result&{rows:Array<{assignedTo:string|null;assignedAtClose:string|null;assignedToSource:string}>};
  const first=await asBuilder(service).build("2026-09") as Details;
  owner=null;
  const second=await asBuilder(service).build("2026-09") as Details;
  assert.equal(first.rows[0].assignedTo,"Responsável atual no Azure");
  assert.equal(first.rows[0].assignedToSource,"azure-current");
  assert.equal(second.rows[0].assignedTo,null);
  assert.equal(second.rows[0].assignedAtClose,"Responsável de setembro");
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

test("payload inválido do Azure não é tratado como consulta histórica vazia",async(t)=>{
  const service=new CorrectionMonthlyReportService();
  t.mock.method(service,"azureConfig",()=>({organization:"invalid-payload-test",project:"test",pat:"test"}));
  t.mock.method(service,"client",()=>({get:async()=>({data:"<html>Sign in</html>"}),post:async()=>({data:{message:"Resposta inesperada"}})}));
  const reader=service as unknown as {
    revisions(f:typeof fields,start:Date):Promise<Snapshot[]>;
    workItemIdsAsOf(at:Date):Promise<number[]>;
    snapshots(ids:number[],at:Date,f:typeof fields):Promise<Map<number,Snapshot>>;
  };
  const at=new Date("2026-09-01T03:00:00Z");
  await assert.rejects(reader.revisions(fields,at),/Resposta inválida.*Reporting/);
  await assert.rejects(reader.workItemIdsAsOf(at),/Resposta inválida.*WIQL/);
  await assert.rejects(reader.snapshots([1],at,fields),/Resposta inválida.*snapshots/);
  t.mock.method(service,"client",()=>({get:async()=>({data:{values:[],isLastBatch:true}}),post:async()=>({data:{workItems:[],value:[]}})}));
  assert.deepEqual(await reader.revisions(fields,at),[]);
  assert.deepEqual(await reader.workItemIdsAsOf(at),[]);
  assert.equal((await reader.snapshots([1],at,fields)).size,0);
});

test("falha em segundo plano fica disponível à tela e recarga remove o erro após sucesso",async(t)=>{
  const service=new CorrectionMonthlyReportService();
  let now=Date.now();
  t.mock.method(Date,"now",()=>now);
  const preview={rows:[],quality:{historicalMetricsReliable:false,localPreview:true}};
  let fail=true;
  t.mock.method(service,"saveClosing",async()=>{});
  t.mock.method(service,"build",async(_month:string,localOnly:boolean)=>{
    if(localOnly)return preview;
    if(fail)throw new Error("Falha ao processar histórico de teste");
    return {rows:[],quality:{historicalMetricsReliable:true}};
  });
  const asReport=(value:unknown)=>value as {quality:{refreshing:boolean;refreshError?:string;historicalMetricsReliable:boolean}};
  assert.equal(asReport(await service.getPreview("2026-06",true)).quality.refreshing,true);
  await new Promise(resolve=>setImmediate(resolve));
  const failed=asReport(await service.getPreview("2026-06"));
  assert.equal(failed.quality.refreshing,false);
  assert.equal(failed.quality.refreshError,"Falha ao processar histórico de teste");
  assert.equal(failed.quality.historicalMetricsReliable,false);
  now+=2*60_000+1;
  const retained=asReport(await service.getPreview("2026-06"));
  assert.equal(retained.quality.refreshError,"Falha ao processar histórico de teste","a expiração do cache não deve apagar o diagnóstico durante a espera pela próxima tentativa");
  assert.equal(retained.quality.refreshing,false);
  fail=false;
  await service.getPreview("2026-06",true);
  await new Promise(resolve=>setImmediate(resolve));
  const completed=asReport(await service.getPreview("2026-06"));
  assert.equal(completed.quality.historicalMetricsReliable,true);
  assert.equal(completed.quality.refreshError,undefined);
});

test("apuração parcial preserva IDs e cobertura após expirar o cache e tenta novamente ao fim da espera",async(t)=>{
  const service=new CorrectionMonthlyReportService();
  let now=Date.now();
  t.mock.method(Date,"now",()=>now);
  const local={rows:[{id:1}],quality:{historicalMetricsReliable:false,localPreview:true}};
  const partial={rows:[{id:1},{id:2}],quality:{historicalMetricsReliable:false,localPreview:false,snapshotError:"Abertura indisponível",diagnostics:{closingSnapshotItems:2}}};
  let localCalls=0,remoteCalls=0;
  let complete=false;
  t.mock.method(service,"saveClosing",async()=>{});
  t.mock.method(service,"build",async(_month:string,localOnly:boolean)=>{
    if(localOnly){localCalls++;return local;}
    remoteCalls++;
    return complete?{...partial,quality:{historicalMetricsReliable:true,localPreview:false}}:partial;
  });
  const asReport=(value:unknown)=>value as {rows:Array<{id:number}>;quality:{refreshing:boolean;historicalMetricsReliable:boolean;snapshotError?:string;diagnostics?:{closingSnapshotItems:number}}};
  await service.getPreview("2026-05",true);
  await new Promise(resolve=>setImmediate(resolve));
  now+=2*60_000+1;
  const retained=asReport(await service.getPreview("2026-05"));
  assert.deepEqual(retained.rows.map(row=>row.id),[1,2]);
  assert.equal(retained.quality.snapshotError,"Abertura indisponível");
  assert.equal(retained.quality.diagnostics?.closingSnapshotItems,2);
  assert.equal(retained.quality.refreshing,false);
  assert.equal(localCalls,1);
  assert.equal(remoteCalls,1);
  // Mesmo uma leitura pouco antes da próxima tentativa não adia a recuperação.
  now+=7*60_000;
  await service.getPreview("2026-05");
  complete=true;
  now+=60_000;
  assert.equal(asReport(await service.getPreview("2026-05")).quality.refreshing,true);
  await new Promise(resolve=>setImmediate(resolve));
  const finished=asReport(await service.getPreview("2026-05"));
  assert.equal(finished.quality.historicalMetricsReliable,true);
  assert.equal(finished.quality.snapshotError,undefined);
  assert.equal(localCalls,1);
  assert.equal(remoteCalls,2);
});

test("recarga mantém a apuração anterior enquanto consulta o Azure e quando a atualização falha",async(t)=>{
  const service=new CorrectionMonthlyReportService();
  const local={rows:[{id:1}],quality:{historicalMetricsReliable:false,localPreview:true}};
  const historical={rows:[{id:1},{id:2}],quality:{historicalMetricsReliable:true,localPreview:false,diagnostics:{closingSnapshotItems:2}}};
  let release!:(value:typeof historical)=>void;
  let reject!:(reason:Error)=>void;
  let update:Promise<typeof historical>=Promise.resolve(historical);
  let localCalls=0,remoteCalls=0;
  t.mock.method(service,"saveClosing",async()=>{});
  t.mock.method(service,"build",async(_month:string,localOnly:boolean)=>{
    if(localOnly){localCalls++;return local;}
    remoteCalls++;return update;
  });
  const asReport=(value:unknown)=>value as {rows:Array<{id:number}>;quality:{refreshing:boolean;historicalMetricsReliable:boolean;refreshError?:string}};
  await service.getPreview("2026-04",true);
  await new Promise(resolve=>setImmediate(resolve));
  update=new Promise((resolve,onReject)=>{release=resolve;reject=onReject;});
  const refreshing=asReport(await service.getPreview("2026-04",true));
  assert.deepEqual(refreshing.rows.map(row=>row.id),[1,2]);
  assert.equal(refreshing.quality.refreshing,true);
  const concurrent=asReport(await service.getPreview("2026-04",true));
  assert.deepEqual(concurrent.rows,refreshing.rows);
  assert.equal(remoteCalls,2,"recargas simultâneas compartilham a consulta em andamento");
  reject(new Error("Atualização indisponível"));
  await new Promise(resolve=>setImmediate(resolve));
  const retained=asReport(await service.getPreview("2026-04"));
  assert.deepEqual(retained.rows.map(row=>row.id),[1,2]);
  assert.equal(retained.quality.historicalMetricsReliable,true);
  assert.equal(retained.quality.refreshError,"Atualização indisponível");
  assert.equal(retained.quality.refreshing,false);
  assert.equal(localCalls,1);
  update=new Promise(resolve=>{release=resolve;});
  await service.getPreview("2026-04",true);
  release(historical);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(asReport(await service.getPreview("2026-04")).quality.refreshError,undefined);
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
