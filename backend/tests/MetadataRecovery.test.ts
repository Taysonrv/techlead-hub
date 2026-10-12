import test from "node:test";
import assert from "node:assert/strict";
import { prisma, isDatabaseConnectivityError } from "../src/database/prisma";
import { MovideskService } from "../src/services/MovideskService";
import { requestMovideskApiPriority, clearMovideskApiPriority } from "../src/jobs/MovideskSyncCoordinator";

test("pool e indisponibilidade pausam jobs, erros de consulta não",()=>{
  assert.equal(isDatabaseConnectivityError({code:"P2024"}),true);
  assert.equal(isDatabaseConnectivityError({code:"P1001"}),true);
  assert.equal(isDatabaseConnectivityError({code:"P2002"}),false);
  assert.equal(isDatabaseConnectivityError(Object.assign(new Error("Unable to start a transaction in the given time."),{code:"P2028"})),true);
  assert.equal(isDatabaseConnectivityError(Object.assign(new Error("Transaction already closed"),{code:"P2028"})),false);
});

test("metadados cedem prioridade, retomam checkpoint e não confirmam ticket com falha",async(t)=>{
  const token=process.env.MOVIDESK_TOKEN;process.env.MOVIDESK_TOKEN="test-token";
  t.after(()=>{if(token===undefined) delete process.env.MOVIDESK_TOKEN;else process.env.MOVIDESK_TOKEN=token;clearMovideskApiPriority();});
  const mock=(target:any,key:string,fn:any)=>{const original=target[key];target[key]=fn;t.after(()=>{target[key]=original;});};
  let saved:string|null=null;
  const candidates=[1,2].map(movideskId=>({movideskId,category:"Problema",cause:null,reason:null,businessArea:null}));
  mock(prisma.systemSetting,"findUnique",async()=>saved?{value:saved}:null);
  mock(prisma.systemSetting,"upsert",async(args:any)=>{saved=args.update.value;return {};});
  mock(prisma.ticket,"findMany",async()=>candidates);
  mock(prisma.ticket,"update",async()=>{throw new Error("DB indisponível");});
  const service=new MovideskService();let calls:number[]=[];
  t.mock.method(service as any,"getWithRetry",async(_url:string,args:any)=>{
    calls.push(args.params.id);requestMovideskApiPriority();return {data:{id:args.params.id}};
  });
  const first=await service.syncAnalyticalMetadataBatch();
  assert.equal(first.remaining,1);assert.deepEqual(calls,[2]);
  clearMovideskApiPriority();
  const restarted=new MovideskService();
  t.mock.method(restarted as any,"getWithRetry",async(_url:string,args:any)=>{
    calls.push(args.params.id);return {data:{id:args.params.id,category:"Problema",customFieldValues:[{customFieldId:52401,value:"Bug"}]}};
  });
  await assert.rejects(()=>restarted.syncAnalyticalMetadataBatch(),/DB indisponível/);
  assert.deepEqual(JSON.parse(saved!).checked,[2]);
  assert.deepEqual(calls,[2,1]);
});

test("marcar notificações lidas usa uma gravação parametrizada, sem concorrência por chave",async(t)=>{
  const {NotificationService}=await import("../src/services/NotificationService");
  const original=prisma.$executeRaw;let calls=0;let values:unknown[]=[];
  prisma.$executeRaw=(async(query:any)=>{calls++;values=query.values;return 2;}) as typeof original;
  t.after(()=>{prisma.$executeRaw=original;});
  const service=new NotificationService();
  assert.equal(await service.markRead(7,[" key-1 ","key-1","key-2",""]),2);
  assert.equal(calls,1);assert.deepEqual(values,[7,"key-1",7,"key-2"]);
  assert.equal(await service.markRead(7,[]),0);assert.equal(calls,1);
});
