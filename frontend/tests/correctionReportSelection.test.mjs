import assert from "node:assert/strict";
import test from "node:test";
import { correctionReportLink, parseCorrectionReportSelection } from "../src/utils/correctionReportSelection.ts";

const base = { view:"monthly", month: "2026-09", creators: ["Tayson Araújo", "Alan Neto"], clients: ["COAP - SORRISO-MT", "CAMP - PRUDENTOPOLIS-PR"],
  urgencies: ["Crítica", "Média"], states: ["Concluído", "Registro"], prioritized: "true", search: "NF & série 1", metric: "delivered", slice: null, taskId: 26710 };

test("compartilhamento preserva setembro, múltiplos filtros, busca, indicador e Task selecionada", () => {
  const link = correctionReportLink(base);
  assert.ok(link.startsWith("/correcoes?reportMonth=2026-09"));
  assert.deepEqual(parseCorrectionReportSelection(link.slice(link.indexOf("?")), "2026-10"), base);
});

test("links preservam cada recorte de gráfico e priorização não informada", () => {
  for (const slice of [{kind:"status",value:"Qualificação"},{kind:"urgency",value:"Não informado"},
    {kind:"prioritized",value:true},{kind:"prioritized",value:false},{kind:"prioritized",value:null},{kind:"monthly"}]) {
    const selection = {...base,metric:null,slice,taskId:null};
    const link = correctionReportLink(selection);
    assert.deepEqual(parseCorrectionReportSelection(link.slice(link.indexOf("?")), "2026-10"), selection);
  }
});

test("parâmetros da operação e valores inválidos não alteram o recorte mensal", () => {
  const selection = parseCorrectionReportSelection("?task=999&month=2025-01&reportMonth=2026-13&reportTask=-1&reportMetric=unknown&reportPrioritized=maybe&reportSlice=prioritized&reportValue=maybe", "2026-10");
  assert.equal(selection.month,"2026-10");assert.equal(selection.taskId,null);
  assert.equal(selection.metric,null);assert.equal(selection.slice,null);assert.equal(selection.prioritized,"");
});

 test("compartilhamento distingue carteira acumulada e movimentos mensais", () => {
  for (const view of ["monthly", "portfolio"]) {
    const selection={...base,view,metric:null,slice:{kind:"status",value:"Concluído"}};
    const link=correctionReportLink(selection);
    assert.deepEqual(parseCorrectionReportSelection(link.slice(link.indexOf("?")),"2026-10"),selection);
  }
  assert.equal(parseCorrectionReportSelection("?reportView=invalid","2026-09").view,"monthly");
});
