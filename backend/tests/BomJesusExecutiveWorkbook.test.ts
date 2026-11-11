import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildBomJesusExecutiveAudit, type ExecutiveTicketInput } from "../src/services/BomJesusExecutiveAudit";
import { createBomJesusExecutiveWorkbook } from "../src/services/BomJesusExecutiveWorkbook";
import type { SlaEvidence } from "../src/services/BomJesusSlaMetrics";
import type { BomJesusRow } from "../src/services/BomJesusReportService";

const metric=(minutes:number|null,limit:number|null):SlaEvidence["support"]=>({
  minutes,targetMinutes:limit,exceeded:minutes!=null&&limit!=null?minutes>limit:null,
  overMinutes:minutes!=null&&limit!=null?Math.max(0,minutes-limit):null,
  percent:minutes!=null&&limit?minutes/limit*100:null,state:minutes===null?"sem marco":"concluido",
});
const sla:SlaEvidence={
  tier:"PADRAO",tierSource:"TICKET_SLA_AGREEMENT",tierVerified:true,agreement:"SLA Padrão",priority:"P2",
  kind:"BUG",eligible:true,warnings:["Marco da Task é referência aproximada"],
  response:metric(60,120),support:metric(1500,1320),factory:metric(400,3360),total:metric(1900,4680),
  supportDeadlineAt:null,supportEndAt:"2026-08-05T12:00:00.000Z",factoryEndAt:null,
  pauseMinutesSupport:0,pauseMinutesFactory:0,holidayPolicy:"Brasil 2026",
};
const item:ExecutiveTicketInput={
  id:842001,subject:"Erro no relatório de estoque",category:"Bug",status:"Resolvido",baseStatus:"Resolved",
  createdDate:"2026-08-02T12:00:00.000Z",resolvedDate:"2026-08-07T12:00:00.000Z",reopenedDate:null,
  taskNumber:29001,taskType:"Correção Clientes",taskState:"Concluída",taskRemoteUrl:"https://dev.azure.com/exemplo/a/_workitems/edit/29001",
  taskCreatedAt:"2026-08-05T12:00:00.000Z",taskConcludedAt:"2026-08-06T12:00:00.000Z",
  deliveredVersion:"7.18.35-rc",isCorrectionTask:true,recurrenceKey:"erro no relatorio de estoque",
  vistra:false,vistraType:"Falha de relatório — revisar",serviceContext:"SIMER / Relatórios",
  anyToAdequacaoFrom:null,anyToAdequacaoChangedAt:null,initialObservedCategory:"Bug",categoryHistory:[],sla,
};
test("Excel da Diretoria possui capa executiva, anexos, prazos e rastreabilidade; arquivo abre novamente",async()=>{
  const executive=buildBomJesusExecutiveAudit([item]);
  const raw={
    ...item,client:"BOM JESUS COOPERATIVA AGROINDUSTRIAL - LAPA-PR",
    categoryHistory:[],classification:"Possível bug",vistraType:item.vistraType,
    recurrenceCount:1,actionCount:2,firstProductEvidence:null,
    ola:"OLA Suporte",evidence:"Task Azure",categoryChangedAt:null,categoryChangeEvidence:"",
    anyToAdequacaoEvidence:"",initialObservedAt:null,initialSource:"HUB_LEGACY",openingCategoryVerified:false,
    supportMinutes:1500,supportTargetMinutes:1320,supportOlaBreached:true,
  } as unknown as BomJesusRow;
  const wb=createBomJesusExecutiveWorkbook({
    generatedAt:"2026-11-11T12:00:00.000Z",
    clientFilter:"BOM JESUS COOPERATIVA AGROINDUSTRIAL - LAPA-PR",
    startDate:"2026-07-01",endDate:"2026-11-10",methodology:"Teste",
    rows:[raw],executive,
  });
  assert.deepEqual(wb.worksheets.map(x=>x.name),[
    "01 VISAO EXECUTIVA","02 OLA SUPORTE","03 QUALIDADE CORRECOES","04 CLASSIFICACOES",
    "05 RECLASSIFICACOES","06 VISTRA RELATORIOS","07 RECORRENCIAS",
    "08 EVOLUCAO MENSAL","09 PLANO DE ACAO","10 BASE AUDITAVEL","11 CRITERIOS FONTES",
  ]);
  assert.equal(wb.getWorksheet("01 VISAO EXECUTIVA")!.getCell("A3").value,"DIAGNÓSTICO EXECUTIVO  |  BOM JESUS");
  assert.equal(wb.getWorksheet("02 OLA SUPORTE")!.getCell("A8").value,842001);
  assert.equal(wb.getWorksheet("02 OLA SUPORTE")!.getCell("M8").value,"ALERTA");
  assert.equal(wb.getWorksheet("02 OLA SUPORTE")!.getCell("K8").value,3);
  assert.equal(wb.getWorksheet("03 QUALIDADE CORRECOES")!.getCell("G8").value,"7.18.35-rc");
  const bytes=await wb.xlsx.writeBuffer();
  assert.ok(Buffer.from(bytes).byteLength>3000);
  const reload=new ExcelJS.Workbook();
  await reload.xlsx.load(Buffer.from(bytes));
  assert.equal(reload.worksheets.length,11);
  assert.equal(reload.getWorksheet("02 OLA SUPORTE")!.getCell("M8").value,"ALERTA");
  assert.equal(reload.getWorksheet("10 BASE AUDITAVEL")!.getCell("A8").value,842001);
});
