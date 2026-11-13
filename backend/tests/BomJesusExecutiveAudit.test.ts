import assert from "node:assert/strict";
import test from "node:test";
import type { SlaEvidence } from "../src/services/BomJesusSlaMetrics";
import { buildBomJesusExecutiveAudit, type ExecutiveTicketInput } from "../src/services/BomJesusExecutiveAudit";

const m=(minutes:number|null,limit:number|null,exceeded:boolean|null=minutes!=null&&limit!=null?minutes>limit:null):SlaEvidence["support"]=>({
  minutes,targetMinutes:limit,exceeded,overMinutes:minutes!=null&&limit!=null?Math.max(0,minutes-limit):null,
  percent:minutes!=null&&limit?Math.round(minutes/limit*1000)/10:null,state:minutes==null?"sem marco":"concluido",
});
const baseSla=(support:SlaEvidence["support"]):SlaEvidence=>({
  tier:"PADRAO",tierSource:"TICKET_SLA_AGREEMENT",tierVerified:true,agreement:"Padrão",
  priority:"P2",kind:"BUG",eligible:true,warnings:["Task é proxy de passagem"],
  response:m(90,180),support,factory:m(60,3360),total:m(150,4680),
  supportDeadlineAt:null,supportEndAt:null,factoryEndAt:null,
  pauseMinutesSupport:30,pauseMinutesFactory:0,holidayPolicy:"Brasil 2026",
});
function row(id:number,overrides:Partial<ExecutiveTicketInput>={}):ExecutiveTicketInput {
  return {
    id,subject:"Erro no relatório de vendas",category:"Bug",status:"Em atendimento",baseStatus:"InAttendance",
    createdDate:"2026-08-01T12:00:00.000Z",resolvedDate:null,reopenedDate:null,
    taskNumber:null,taskType:"",taskState:"",taskRemoteUrl:null,
    taskCreatedAt:null,taskConcludedAt:null,deliveredVersion:"",
    isCorrectionTask:false,recurrenceKey:"erro no relatorio de vendas",vistra:false,vistraType:"Não identificado",
    serviceContext:"SIMER",anyToAdequacaoFrom:null,anyToAdequacaoChangedAt:null,
    initialObservedCategory:"Bug",categoryHistory:[],sla:baseSla(m(null,1320)),...overrides,
  };
}
test("matriz Bug × correção, estados Azure e auditoria OLA não somam canceladas",()=>{
  const rows=[
    row(1,{isCorrectionTask:true,taskNumber:42,taskType:"Correção Clientes",taskState:"Concluída",deliveredVersion:"7.18.35-rc",
      taskCreatedAt:"2026-08-02T12:00:00.000Z",taskConcludedAt:"2026-08-04T15:00:00.000Z",sla:baseSla(m(1400,1320))}),
    row(2,{subject:"Falha no painel",recurrenceKey:"falha painel",category:"Bug"}),
    row(3,{subject:"Erro no relatório de vendas",category:"Adequação",createdDate:"2026-08-06T12:00:00.000Z",
      isCorrectionTask:true,taskNumber:42,taskType:"Correção Clientes",taskState:"Concluída",
      taskCreatedAt:"2026-08-02T12:00:00.000Z",taskConcludedAt:"2026-08-04T15:00:00.000Z",
      sla:baseSla(m(null,1320))}),
    row(4,{category:"Dúvida",subject:"Como usar Vistra",vistra:true,serviceContext:"Vistra",
      recurrenceKey:"como usar vistra"}),
    row(5,{subject:"Erro na conferência",recurrenceKey:"erro conferencia",isCorrectionTask:true,taskNumber:81,
      taskState:"Cancelada",taskCreatedAt:"2026-08-02T11:00:00.000Z",sla:baseSla(m(1800,1320))}),
  ];
  const x=buildBomJesusExecutiveAudit(rows);
  assert.equal(x.matrix.total,5);
  assert.equal(x.matrix.bugWithCorrection,2);
  assert.equal(x.matrix.bugWithoutCorrection,1);
  assert.equal(x.matrix.correctionNonBug,1);
  assert.equal(x.matrix.others,1);
  assert.equal(x.corrections.tickets,3);
  assert.equal(x.corrections.distinctTasks,2);
  assert.equal(x.corrections.concluded,2);
  assert.equal(x.corrections.cancelled,1);
  assert.equal(x.ola.alerts,1);
  assert.equal(x.ola.cancelled,1);
  assert.equal(x.ola.unmeasurable,1);
  assert.equal(x.ola.maxExcessMinutes,80);
  assert.equal(x.recurrence.groupsDetail.some(g=>g.afterTechnicalConclusion),true);
  assert.equal(x.corrections.clientValidatedCount,null);
});
test("Adequação já no baseline não é uma mudança, mas mudança estruturada é rastreada",()=>{
  const x=buildBomJesusExecutiveAudit([
    row(11,{category:"Adequação",initialObservedCategory:"Adequação",subject:"Sistema travando",
      categoryHistory:[{kind:"BASELINE",category:"Adequação",previousCategory:null,source:"HUB_LEGACY",
        observedAt:"2026-11-08T00:00:00.000Z",sourceLastUpdate:null}]}),
    row(12,{category:"Adequação",subject:"Divergência no relatório",initialObservedCategory:"Problema",
      categoryHistory:[
        {kind:"BASELINE",category:"Problema",previousCategory:null,source:"MOVIDESK_API",observedAt:"2026-11-02T00:00:00.000Z",sourceLastUpdate:null},
        {kind:"CHANGE",category:"Adequação",previousCategory:"Problema",source:"MOVIDESK_API",observedAt:"2026-11-05T00:00:00.000Z",sourceLastUpdate:null},
      ]}),
  ]);
  assert.equal(x.categories.observedTicketCount,1);
  assert.equal(x.categories.observed[0]?.previousCategory,"Problema");
  assert.equal(x.categories.reviewCandidates.length,1);
  assert.equal(x.categories.reviewCandidates[0]?.ticketId,11);
});
test("separa Vistra, Analítico e relatórios comuns sem atribuir erro a todo item",()=>{
  const x=buildBomJesusExecutiveAudit([
    row(21,{subject:"Dúvida de acesso Vistra",serviceContext:"Vistra",vistra:true,recurrenceKey:"duvida vistra"}),
    row(22,{subject:"Erro de conexão Vistra",serviceContext:"Vistra",vistra:true,recurrenceKey:"erro conexao vistra"}),
    row(23,{subject:"Divergência no Analítico",serviceContext:"Analítico",recurrenceKey:"divergencia analitico"}),
    row(24,{subject:"Falha ao gerar relatório",serviceContext:"Relatórios",recurrenceKey:"falha relatorio"}),
  ]);
  assert.equal(x.vistra.explicitVistra,2);
  assert.equal(x.vistra.suspectedVistraFailures,1);
  assert.equal(x.vistra.suspectedAnaliticoFailures,1);
  assert.equal(x.vistra.suspectedReportFailures,1);
});
