import assert from "node:assert/strict";
import test from "node:test";
import type {Request,Response} from "express";
import {CorrectionMonthlyReportController} from "../src/controllers/CorrectionMonthlyReportController";
import {CorrectionMonthlyReportService} from "../src/services/CorrectionMonthlyReportService";

const preview={rows:[{id:1}],quality:{historicalMetricsReliable:false,localPreview:true}};
const completed={rows:[{id:1},{id:2}],quality:{historicalMetricsReliable:true,localPreview:false}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred<T>(){
  let resolve!:(value:T)=>void;
  let reject!:(error:Error)=>void;
  const promise=new Promise<T>((success,failure)=>{resolve=success;reject=failure;});
  return {promise,resolve,reject};
}
function response(){
  return {statusCode:200,body:undefined as any,
    status(code:number){this.statusCode=code;return this;},
    json(data:unknown){this.body=data;return this;},
  };
}
async function request(controller:CorrectionMonthlyReportController,month:string,refresh=false){
  const result=response();
  await controller.get({query:{month,...(refresh?{refresh:"1"}:{})}} as unknown as Request,result as unknown as Response);
  return result;
}

test("primeira carga lenta responde 202 sem totais e as consultas compartilham a mesma geração",async(t)=>{
  const service=new CorrectionMonthlyReportService();
  const local=deferred<typeof preview>();
  const remote=deferred<typeof completed>();
  let localCalls=0,remoteCalls=0;
  t.mock.method(service,"saveClosing",async()=>{});
  t.mock.method(service,"build",async(_month:string,localOnly:boolean)=>{
    if(localOnly){localCalls++;return local.promise;}
    remoteCalls++;return remote.promise;
  });
  const controller=new CorrectionMonthlyReportController(service,5);
  const first=await request(controller,"2026-01");
  assert.equal(first.statusCode,202);
  assert.deepEqual(first.body,{status:"generating",month:"2026-01",retryAfterMs:3000});
  const second=await request(controller,"2026-01");
  assert.equal(second.statusCode,202);
  assert.equal(localCalls,1,"a consulta de acompanhamento não duplica a leitura local");
  assert.equal(remoteCalls,0);
  local.resolve(preview);
  await tick();
  const available=await request(controller,"2026-01");
  assert.equal(available.statusCode,200);
  assert.deepEqual(available.body.rows,[{id:1}]);
  assert.equal(available.body.quality.refreshing,true);
  remote.resolve(completed);
  await tick();
  const finished=await request(controller,"2026-01");
  assert.deepEqual(finished.body.rows,[{id:1},{id:2}]);
  assert.equal(finished.body.quality.refreshing,false);
  assert.equal(localCalls,1);
  assert.equal(remoteCalls,1);
});

test("erro da prévia após 202 é entregue na próxima consulta e Recarregar permite recuperar",async(t)=>{
  const service=new CorrectionMonthlyReportService();
  const slow=deferred<typeof preview>();
  let failed=true,localCalls=0;
  t.mock.method(service,"saveClosing",async()=>{});
  t.mock.method(service,"build",async(_month:string,localOnly:boolean)=>{
    if(!localOnly)return completed;
    localCalls++;
    return failed?slow.promise:preview;
  });
  const controller=new CorrectionMonthlyReportController(service,5);
  assert.equal((await request(controller,"2026-02")).statusCode,202);
  slow.reject(new Error("Falha de leitura local de teste"));
  await tick();
  const error=await request(controller,"2026-02");
  assert.equal(error.statusCode,500);
  assert.equal(error.body.message,"Falha de leitura local de teste");
  assert.equal(localCalls,1,"a falha não dispara repetidamente novas consultas silenciosas");
  failed=false;
  assert.equal((await request(controller,"2026-02",true)).statusCode,200);
  await tick();
  const recovered=await request(controller,"2026-02");
  assert.equal(recovered.body.quality.historicalMetricsReliable,true);
  assert.equal(localCalls,2);
});

test("gravação lenta do fechamento não bloqueia a entrega da prévia e mantém a ordem de persistência",async(t)=>{
  const service=new CorrectionMonthlyReportService();
  const saving=deferred<void>();
  let remoteCalls=0;
  const savedRows:number[][]=[];
  t.mock.method(service,"saveClosing",async(_month:string,data:typeof preview)=>{
    await saving.promise;savedRows.push(data.rows.map(row=>row.id));
  });
  t.mock.method(service,"build",async(_month:string,localOnly:boolean)=>{
    if(localOnly)return preview;
    remoteCalls++;return completed;
  });
  const controller=new CorrectionMonthlyReportController(service,5);
  const available=await request(controller,"2026-03");
  assert.equal(available.statusCode,200);
  assert.deepEqual(available.body.rows,[{id:1}]);
  assert.equal(available.body.quality.refreshing,true);
  assert.equal(remoteCalls,0);
  assert.deepEqual(savedRows,[]);
  saving.resolve();
  await tick();
  const finished=await request(controller,"2026-03");
  assert.deepEqual(finished.body.rows,[{id:1},{id:2}]);
  assert.equal(remoteCalls,1);
  assert.deepEqual(savedRows,[[1],[1,2]]);
});
