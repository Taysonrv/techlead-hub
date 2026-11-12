import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

process.env.TZ="America/Sao_Paulo";
const transpile=(name)=>ts.transpileModule(readFileSync(new URL("../src/utils/"+name+".ts",import.meta.url),"utf8"),{
  compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
}).outputText;
const data=(js)=>"data:text/javascript,"+encodeURIComponent(js);
const op=data(transpile("operationalMetrics")),sla=data(transpile("timestampSla"));
const main=transpile("clientMeetingAnalytics")
  .replace('"./operationalMetrics"',JSON.stringify(op))
  .replace('"./timestampSla"',JSON.stringify(sla));
const {buildClientMeetingAnalytics}=await import(data(main));
const input=(id,createdDate,more={})=>({
  id,movideskId:id,subject:"Relato #"+id,client:"BOM JESUS COOPERATIVA AGROINDUSTRIAL - LAPA-PR",
  owner:"SUPORTE",category:"Problema",urgency:"Média",status:"Em atendimento",baseStatus:"InAttendance",
  ticketType:2,isWithSimer:true,createdDate,firstResponseDueDate:null,firstResponseDate:null,
  resolvedDate:null,closedDate:null,...more,
});
const nov="2026-11-07T12:00:00-03:00",oct="2026-10-07T12:00:00-03:00",sep="2026-09-15T12:00:00-03:00";
const periodStart=new Date("2026-11-01T00:00:00-03:00");
const periodEnd=new Date("2026-11-12T23:59:59-03:00");
const cutoff=new Date("2026-11-12T23:59:59-03:00");
const dataRows=[
 input(1,nov,{category:"Bug",firstResponseDueDate:"2026-11-07T14:00:00-03:00",firstResponseDate:"2026-11-07T13:00:00-03:00"}),
 input(2,nov,{baseStatus:"Resolved",status:"Resolvido",resolvedDate:"2026-11-09T13:00:00-03:00"}),
 input(3,oct,{client:"COAP - SORRISO-MT",category:"Bug",baseStatus:"Stopped"}),
 input(4,sep,{category:"Dúvida",baseStatus:"New"}),
 input(5,nov,{ticketType:1,baseStatus:"New"}),
 input(6,oct,{baseStatus:"Closed",resolvedDate:"2026-11-08T11:00:00-03:00",
    firstResponseDueDate:"2026-10-07T14:00:00-03:00",firstResponseDate:"2026-10-07T12:30:00-03:00"}),
 input(7,oct,{baseStatus:"Resolved",resolvedDate:"2026-10-10T10:00:00-03:00"}),
 input(8,"2026-11-15T11:00:00-03:00",{baseStatus:"New"}),
 input(9,nov,{baseStatus:"New",isWithSimer:false}),
];
test("six-month meeting comparisons use matching calendar days and ignore future events",()=>{
 const x=buildClientMeetingAnalytics(dataRows,cutoff,periodStart,periodEnd);
 assert.equal(x.month,"2026-11");
 assert.equal(x.months.length,6);
 assert.equal(x.opened.current,3); // nov: 1,2,5 ; excluded 8 future and 9 non-SIMER
 assert.equal(x.opened.previous,3); // oct: 3,6,7
 assert.equal(x.resolved.current,2); // 2 and 6 (ticket 6 opened in Oct)
 assert.equal(x.resolved.previous,1); // 7
 assert.equal(x.bug.current,1);
 assert.equal(x.bug.previous,1);
 assert.equal(x.months.at(-1).resolved,2);
});
test("public backlog matches Dashboard current state, not period openings or internal tickets",()=>{
 const x=buildClientMeetingAnalytics(dataRows,cutoff,periodStart,periodEnd);
 assert.deepEqual(x.pendingNow.map(t=>t.id),[1,3,4,8]);
 assert.deepEqual(x.pendingInPeriod.map(t=>t.id),[1]);
 assert.deepEqual(x.pendingByClient.map(t=>[t.name,t.value]),[
  ["BOM JESUS COOPERATIVA AGROINDUSTRIAL - LAPA-PR",3],["COAP - SORRISO-MT",1]
 ]);
 assert.equal(x.months.at(-1).pendingOpened,1);
 assert.equal(x.months.at(-2).pendingOpened,1);
});
test("SLA uses only measured timestamps; missing response date is not breach",()=>{
 const x=buildClientMeetingAnalytics(dataRows,cutoff,periodStart,periodEnd);
 assert.equal(x.responseSla.measured,1);
 assert.equal(x.responseSla.within,1);
 assert.equal(x.responseSla.outside,0);
 assert.equal(x.responseSla.percentage,100);
 const clientOnly=dataRows.filter(t=>t.client.startsWith("BOM JESUS"));
 const bj=buildClientMeetingAnalytics(clientOnly,cutoff,periodStart,periodEnd);
 assert.equal(bj.pendingByClient.length,1);
 assert.equal(bj.pendingNow.length,3);
});

test("resolução conta pelo evento mesmo com reabertura posterior, como no Dashboard",()=>{
 const ticket=input(12,"2026-10-02T12:00:00-03:00",{
  baseStatus:"InAttendance",resolvedDate:"2026-11-03T16:00:00-03:00",
  firstResponseDueDate:null,firstResponseDate:null,
 });
 const r=buildClientMeetingAnalytics([ticket],cutoff,periodStart,periodEnd);
 assert.equal(r.resolved.current,1);
 assert.equal(r.pendingNow.length,1);
 assert.equal(r.months.at(-1).resolved,1);
});
test("fechamentos cancelados não entram no indicador de fechamento mensal",()=>{
 const valid=input(21,nov,{baseStatus:"Closed",closedDate:"2026-11-09T12:00:00-03:00"});
 const canceled=input(22,nov,{baseStatus:"Canceled",closedDate:"2026-11-09T12:00:00-03:00",
  canceledDate:"2026-11-09T12:00:00-03:00"});
 const r=buildClientMeetingAnalytics([valid,canceled],cutoff,periodStart,periodEnd);
 assert.equal(r.months.at(-1).closed,1);
});

test("pending backlog groups by responsible and aging rather than mixing with SLA",()=>{
 const inputA=input(101,"2026-11-09T12:00:00-03:00",{owner:"ANA",baseStatus:"New",ticketType:2});
 const inputB=input(102,"2026-10-20T12:00:00-03:00",{owner:"ANA",baseStatus:"Stopped",ticketType:2});
 const inputC=input(103,"2026-06-01T12:00:00-03:00",{owner:"BIA",baseStatus:"InAttendance",ticketType:2});
 const inputInternal=input(104,"2026-06-01T12:00:00-03:00",{owner:"BIA",baseStatus:"InAttendance",ticketType:1});
 const result=buildClientMeetingAnalytics([inputA,inputB,inputC,inputInternal],cutoff,periodStart,periodEnd);
 assert.deepEqual(result.pendingByOwner.map(r=>[r.name,r.value]),[["ANA",2],["BIA",1]]);
 const byAge=Object.fromEntries(result.pendingByAge.map(r=>[r.name,r.value]));
 assert.equal(byAge["Até 7 dias"],1);
 assert.equal(byAge["8 a 30 dias"],1);
 assert.equal(byAge["Mais de 90 dias"],1);
 assert.equal(result.pendingNow.length,3);
});
