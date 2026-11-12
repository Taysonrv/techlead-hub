import ExcelJS from "exceljs";
import { renderDonut, renderMonthlyLine } from "./ExecutiveChartPng";
import type { BomJesusRow } from "./BomJesusReportService";

type FullReport = {
  generatedAt: string; clientFilter: string; startDate: string; endDate: string;
  methodology: string; rows: BomJesusRow[];
  executive: ReturnType<typeof import("./BomJesusExecutiveAudit").buildBomJesusExecutiveAudit>;
};

const P = {
  dark: "173E31", green: "197350", emerald: "227F59", mint: "E9F4EE",
  ink: "23372F", secondary: "63756B", light: "F5F8F6", white: "FFFFFF",
  border: "DDE9E0", orange: "BD7229", amber: "FFF1DA",
  red: "9B3C36", rose: "FBEAE7", blue: "316885", sky: "E8F2F9",
};
const fill = (hex: string): ExcelJS.Fill => ({
  type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex },
});
const font = (color=P.ink, size=10, bold=false): Partial<ExcelJS.Font> => ({
  name: "Aptos", size, bold, color: { argb: "FF" + color },
});
// Excel armazena data/hora sem fuso: converter instante UTC para relógio local de São Paulo.
// O Brasil não adota horário de verão no período de referência de 2026.
const fmtDate=(v:string|null)=>v && !Number.isNaN(Date.parse(v))
  ? new Date(Date.parse(v) - 3*60*60*1000) : null;
const safeHttps=(url:string|null)=>url && /^https:\/\//i.test(url) ? url : null;
const hrs=(m:number|null|undefined)=>typeof m==="number" && Number.isFinite(m) ? Math.round(m/60*100)/100 : null;
const int=(v:number)=>Number(v).toLocaleString("pt-BR");
const pct=(v:number|null)=>v === null ? "N/D" : v.toLocaleString("pt-BR",{maximumFractionDigits:1}) + "%";

function setMerged(ws:ExcelJS.Worksheet, address:string, value:string|number|null,
  style?:{background?:string;color?:string,size?:number,bold?:boolean,align?:ExcelJS.Alignment["horizontal"],wrap?:boolean}) {
  ws.mergeCells(address);
  const cell=ws.getCell(address.split(":")[0]!);
  cell.value=value;
  cell.font=font(style?.color??P.ink,style?.size??10,style?.bold??false);
  cell.alignment={horizontal:style?.align??"left",vertical:"middle",wrapText:style?.wrap??false,indent:style?.align==="center"?0:1};
  if(style?.background) cell.fill=fill(style.background);
}
function banner(ws:ExcelJS.Worksheet,title:string,subtitle:string,cols:number,scope:string,headerRow=7) {
  ws.views=[{state:"frozen",xSplit:1,ySplit:headerRow,showGridLines:false}];
  ws.pageSetup={paperSize:9,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0};
  ws.headerFooter.oddFooter="&LSUPORTE SIMER  |  RELATÓRIO GERENCIAL&CConfidencial - uso interno&R&P / &N";
  ws.properties.defaultRowHeight=19;
  ws.properties.tabColor={argb:"FF"+P.green};
  const last=ws.getColumn(cols).letter;
  ws.mergeCells("A1:"+last+"2");
  let c=ws.getCell("A1");c.value=title;c.font=font(P.white,16,true);c.fill=fill(P.dark);
  c.alignment={vertical:"middle",indent:1};ws.getRow(1).height=26;ws.getRow(2).height=16;
  setMerged(ws,"A3:"+last+"3",subtitle,{color:P.secondary,size:10});
  setMerged(ws,"A4:"+last+"4",scope,{color:P.ink,size:9,background:P.light});
  ws.getRow(3).height=25;ws.getRow(4).height=24;
  ws.getRow(5).height=10;ws.getRow(6).height=10;
}
function tableSheet(
  wb:ExcelJS.Workbook,name:string,title:string,subtitle:string,scope:string,
  headers:string[],rows:unknown[][],widths:number[],options?:{statusColumn?:number,hoursColumns?:number[],dateColumns?:number[],linkColumn?:number,sortNote?:string}
) {
  const ws=wb.addWorksheet(name);
  banner(ws,title,subtitle,headers.length,scope);
  const head=ws.getRow(7);
  headers.forEach((label,i)=>{
    let c=head.getCell(i+1);c.value=label;c.font=font(P.white,10,true);c.fill=fill(P.green);
    c.alignment={vertical:"middle",wrapText:true,indent:1};
    ws.getColumn(i+1).width=widths[i]??18;
  });
  head.height=39;
  for(const record of rows){
    const row=ws.addRow(record);
    row.height=22;
    row.eachCell({includeEmpty:true},(cell,i)=>{
      if(row.number%2===0) cell.fill=fill(P.light);
      cell.font=font(P.ink,10);
      cell.alignment={vertical:"middle",indent:i===1?1:0,wrapText:false};
      cell.border={bottom:{style:"hair",color:{argb:"FF"+P.border}}};
    });
    for(const idx of options?.dateColumns??[]){
      let cell=row.getCell(idx);
      if(cell.value instanceof Date)cell.numFmt="dd/mm/yyyy hh:mm";
    }
    for(const idx of options?.hoursColumns??[])row.getCell(idx).numFmt="0.00";
    if(options?.statusColumn){
      const c=row.getCell(options.statusColumn);const v=String(c.value??"").toUpperCase();
      if(v.includes("ALERTA")||v.includes("REABERT")||v.includes("CANCELAD")||v.includes("INVESTIGAR")){
        c.fill=fill(v.includes("CANCELAD")?P.light:P.amber);c.font=font(P.red,10,true);
      }else if(v.includes("DENTRO")||v.includes("CONCLUID")||v.includes("OBSERVADA")){
        c.fill=fill(P.mint);c.font=font(P.green,10,true);
      }
    }
    if(options?.linkColumn){
      const c=row.getCell(options.linkColumn);
      const url=typeof c.value==="string"?safeHttps(c.value):null;
      if(url){c.value={text:"Abrir Task",hyperlink:url};c.font={...font(P.blue,10,true),underline:true};}
    }
  }
  const lastRow=Math.max(ws.rowCount,7);
  ws.autoFilter={from:{row:7,column:1},to:{row:lastRow,column:headers.length}};
  ws.pageSetup.printTitlesRow="1:7";
  ws.pageSetup.printArea="A1:"+ws.getColumn(headers.length).letter+lastRow;
  if(options?.sortNote)ws.getCell(6,1).note=options.sortNote;
  return ws;
}
const card=(ws:ExcelJS.Worksheet,columns:[string,string],top:number,label:string,value:string|number,sub:string,tone:"green"|"amber"|"neutral"="green")=>{
  const [a,b]=columns;const color=tone==="amber"?P.orange:tone==="green"?P.green:P.ink;
  setMerged(ws,a+top+":"+b+top,label.toLocaleUpperCase("pt-BR"),{color:P.secondary,size:9,bold:true,background:P.light});
  setMerged(ws,a+(top+1)+":"+b+(top+3),value,{color,size:24,bold:true,background:P.light});
  setMerged(ws,a+(top+4)+":"+b+(top+4),sub,{color:P.secondary,size:8,background:P.light,wrap:true});
  ws.getRow(top+1).height=20;ws.getRow(top+2).height=20;ws.getRow(top+3).height=20;
  ws.getRow(top+4).height=25;
};
function titleBar(ws:ExcelJS.Worksheet,row:number,start:string,end:string,label:string) {
  setMerged(ws,start+row+":"+end+row,label,{background:P.dark,color:P.white,size:10,bold:true});
  ws.getRow(row).height=24;
}
export function createBomJesusExecutiveWorkbook(report:FullReport) {
  const book=new ExcelJS.Workbook();
  book.creator="TechLead Hub | Inteligência de Suporte SIMER";
  book.title="Relatório Executivo — Carteira SIMER";
  book.subject="Qualidade e resolutividade de atendimento | Movidesk + Azure DevOps";
  book.company="TechLead Hub";
  book.calcProperties.fullCalcOnLoad=true;
  const e=report.executive;
  const scope=report.clientFilter+"  •  "+report.startDate+" a "+report.endDate+"  •  Suporte SIMER";
  const ws=book.addWorksheet("01 VISAO EXECUTIVA",{properties:{tabColor:{argb:"FF"+P.green}}});
  ws.views=[{showGridLines:false,state:"frozen",ySplit:5}];
  for(let i=1;i<=12;i++)ws.getColumn(i).width=13;
  ws.getColumn(1).width=15; ws.getColumn(12).width=15;
  ws.pageSetup={paperSize:9,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:"A1:L52",
    margins:{left:.25,right:.25,top:.3,bottom:.3,header:.12,footer:.12}};
  ws.headerFooter.oddFooter="&LRelatório executivo • SIMER&CConfidencial • Uso interno&R&P / &N";
  setMerged(ws,"A1:L2","TECHLEAD HUB  /  INTELIGÊNCIA GERENCIAL",{background:P.dark,color:P.white,size:13,bold:true});
  setMerged(ws,"A3:L4","RELATÓRIO EXECUTIVO  |  SUPORTE SIMER",{color:P.dark,size:20,bold:true});
  setMerged(ws,"A5:L5",report.clientFilter+"  •  Atendimento SIMER  •  Movidesk + Azure DevOps",{color:P.secondary,size:10});
  setMerged(ws,"A6:L6",report.startDate+" a "+report.endDate+"   |   Gerado em "+new Date(report.generatedAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})+"   |   Indicadores de OLA sujeitos a auditoria",{background:P.light,color:P.secondary,size:9});
  ws.getRow(1).height=25;ws.getRow(2).height=11;ws.getRow(3).height=29;ws.getRow(4).height=18;ws.getRow(5).height=24;ws.getRow(6).height=23;
  card(ws,["A","D"],8,"Atendimentos",int(e.matrix.total),"Carteira SIMER • tickets distintos");
  card(ws,["E","H"],8,"Correções vinculadas",int(e.corrections.tickets),int(e.corrections.distinctTasks)+" Tasks distintas Azure");
  card(ws,["I","L"],8,"Alertas de OLA",int(e.ola.alerts),int(e.ola.measured)+" casos mensuráveis • preliminar","amber");
  card(ws,["A","D"],15,"Correções concluídas",int(e.corrections.concluded),int(e.corrections.concludedWithVersion)+" com versão vinculada");
  card(ws,["E","H"],15,"Mudanças → Adequação",int(e.categories.observedTicketCount),"Detectadas entre sincronizações");
  card(ws,["I","L"],15,"Recorrências potenciais",int(e.recurrence.groups),int(e.recurrence.ticketCandidates)+" tickets únicos em grupos","neutral");

  setMerged(ws,"A21:L21","VISTRA: "+int(e.vistra.suspectedVistraFailures)+" suspeitas  •  ANALÍTICO: "+int(e.vistra.suspectedAnaliticoFailures)+"  •  RELATÓRIOS: "+int(e.vistra.suspectedReportFailures)+"  •  RECORRÊNCIAS: "+int(e.recurrence.groups)+" grupos candidatos",
    {background:P.mint,color:P.dark,size:9,bold:true});
  ws.getRow(21).height=24;
  titleBar(ws,22,"A","G","01  |  DESEMPENHO DO SUPORTE — OLA");
  titleBar(ws,22,"I","L","LEITURA E RISCO EXECUTIVO");
  const statRows=[
    ["Correções não canceladas",e.ola.activeCorrectionTickets],
    ["Dentro da meta calculada",e.ola.onTime],
    ["Possível excesso de prazo",e.ola.alerts],
    ["Sem dados para apurar",e.ola.unmeasurable],
    ["Tasks canceladas (segregadas)",e.ola.cancelled],
    ["Taxa dentro da meta",pct(e.ola.withinTargetPercent)],
    ["Mediana de tempo útil",hrs(e.ola.medianSupportMinutes)===null?"N/D":hrs(e.ola.medianSupportMinutes)+" h"],
    ["Mediana do excesso",hrs(e.ola.medianExcessMinutes)===null?"N/D":hrs(e.ola.medianExcessMinutes)+" h"],
  ] as const;
  statRows.forEach((r,i)=>{
    const line=23+i;
    setMerged(ws,"A"+line+":E"+line,String(r[0]),{background:i%2===0?P.light:P.white,size:9,color:P.ink});
    setMerged(ws,"F"+line+":G"+line,typeof r[1]==="number"?r[1]:String(r[1]),{background:i%2===0?P.light:P.white,color:i===2?P.red:P.dark,bold:true,size:10,align:"center"});
    ws.getRow(line).height=22;
  });
  const executiveNotes=[
    "OLA: abertura do ticket → criação da Task Azure (marco aproximado).",
    "Excessos são alertas, não violações confirmadas: revisar pausas, urgência e perfil.",
    "Task concluída não demonstra aceite do cliente nem implantação da versão.",
    "Categoria atual não prova a classificação na abertura do ticket.",
  ];
  executiveNotes.forEach((n,i)=>setMerged(ws,"I"+(23+i*2)+":L"+(24+i*2),n,
    {background:i%2===0?P.light:P.mint,color:P.ink,size:9,wrap:true}));
  titleBar(ws,33,"A","L","02  |  EVOLUÇÃO MENSAL DOS ATENDIMENTOS");
  ["MÊS","TICKETS","BUGS ATUAIS","CORREÇÕES","ALERTAS OLA","VOLUME RELATIVO"].forEach((v,i)=>{
    const pairs: ReadonlyArray<readonly [string,string]>=[["A","B"],["C","D"],["E","F"],["G","H"],["I","J"],["K","L"]];
    setMerged(ws,pairs[i]![0]+"34:"+pairs[i]![1]+"34",v,{color:P.secondary,size:9,bold:true,background:P.light});
  });
  const max=Math.max(1,...e.monthly.map(m=>m.tickets));
  e.monthly.slice(-8).forEach((m,i)=>{
    const n=35+i;const pairs: ReadonlyArray<readonly [string,string]>=[["A","B"],["C","D"],["E","F"],["G","H"],["I","J"],["K","L"]];
    const values=[m.month,m.tickets,m.bugs,m.corrections,m.olaAlerts,"▮".repeat(Math.max(1,Math.round(m.tickets/max*12)))];
    values.forEach((v,k)=>setMerged(ws,pairs[k]![0]+n+":"+pairs[k]![1]+n,v,
      {background:i%2===0?P.white:P.light,color:k===4&&m.olaAlerts>0?P.orange:k===5?P.green:P.ink,size:9,bold:k===5,align:k===5?"left":"center"}));
    ws.getRow(n).height=20;
  });
  const sectionRow=44;titleBar(ws,sectionRow,"A","L","03  |  ENCAMINHAMENTOS PRIORITÁRIOS");
  const decisions: Array<readonly ["P1"|"P2",string]>=[
    ["P1","Auditar "+e.ola.alerts+" alertas de OLA, priorizando maiores excessos e histórico de pausas."],
    ["P1","Revisar "+e.matrix.discordantTicketIds.length+" divergências entre categoria Movidesk e Task Azure."],
    ["P2","Validar "+e.categories.reviewCandidates.length+" Adequações com indícios de classificação anterior."],
    ["P2","Conferir Vistra e "+e.recurrence.groups+" grupos de possíveis erros recorrentes."],
  ];
  decisions.forEach((x,i)=>{
    const row=sectionRow+1+i;
    setMerged(ws,"A"+row+":B"+row,x[0],{background:x[0]==="P1"?P.amber:P.mint,color:x[0]==="P1"?P.orange:P.green,bold:true,align:"center"});
    setMerged(ws,"C"+row+":L"+row,x[1],{background:i%2===0?P.light:P.white,color:P.ink,size:9});
    ws.getRow(row).height=22;
  });
  setMerged(ws,"A50:L51","RESSALVA: dados cruzados de Movidesk/Azure. O histórico completo de categorias anteriores ao HUB, a implantação efetiva e o aceite do cliente não são inferidos automaticamente.",{background:P.light,color:P.secondary,size:9,wrap:true});
  ws.getRow(50).height=17;ws.getRow(51).height=18;
  setMerged(ws,"A52:L52","Gráficos na aba 02; indicadores e evidências auditáveis nas abas 03–12. Fontes somente leitura.",{color:P.secondary,size:8});

  // Gráficos são imagens PNG nítidas dentro do XLSX; a base numérica fica disponível e filtrável nas abas posteriores.
  // ExcelJS não expõe criação de gráficos editáveis; não apresentamos essas visualizações como objetos nativos.
  const graph=book.addWorksheet("02 GRAFICOS",{properties:{tabColor:{argb:"FF"+P.blue}}});
  graph.views=[{showGridLines:false,state:"frozen",ySplit:4}];
  for(let i=1;i<=18;i++) graph.getColumn(i).width=12;
  for(let i=1;i<=47;i++) graph.getRow(i).height=22;
  graph.pageSetup={paperSize:9,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:1,
    printArea:"A1:R47",margins:{left:.25,right:.25,top:.3,bottom:.3,header:.12,footer:.12}};
  setMerged(graph,"A1:R2","PAINEL GRÁFICO  |  INDICADORES EXECUTIVOS",{background:P.dark,color:P.white,size:16,bold:true});
  setMerged(graph,"A3:R3",scope,{color:P.secondary,size:9});
  setMerged(graph,"A4:R4","Distribuição das correções e do OLA, evolução mensal de atendimentos e alertas",{background:P.light,color:P.ink,size:10});
  const pngs=[
    renderDonut("SITUACAO DAS CORRECOES",[
      {name:"CONCLUIDAS",value:e.corrections.concluded},
      {name:"EM ABERTO",value:e.corrections.open},
      {name:"CANCELADAS",value:e.corrections.cancelled},
    ]),
    renderDonut("OLA DO SUPORTE",[
      {name:"DENTRO DA META",value:e.ola.onTime},
      {name:"ALERTA",value:e.ola.alerts},
      {name:"NAO MENSURAVEL",value:e.ola.unmeasurable},
      {name:"CANCELADO",value:e.ola.cancelled},
    ]),
    renderMonthlyLine("EVOLUCAO DOS ATENDIMENTOS",e.monthly,"volume"),
    renderMonthlyLine("CORRECOES E ALERTAS DE OLA",e.monthly,"ola"),
  ];
  const positions=[
    {tl:{col:.20,row:5},ext:{width:650,height:325}},
    {tl:{col:9.00,row:5},ext:{width:650,height:325}},
    {tl:{col:.20,row:22},ext:{width:650,height:325}},
    {tl:{col:9.00,row:22},ext:{width:650,height:325}},
  ];
  // ExcelJS accepts base64 PNG and avoids Buffer<ArrayBufferLike> vs Buffer<ArrayBuffer> typing in Node 26.
  pngs.forEach((png,i)=>graph.addImage(book.addImage({base64:png.toString("base64"),extension:"png"}),positions[i]!));
  setMerged(graph,"A41:R42","LEITURA: os gráficos representam capturas dos dados calculados no HUB. As tabelas e critérios auditáveis estão nas próximas abas.",
    {background:P.mint,color:P.ink,size:9,wrap:true});
  setMerged(graph,"A44:R45","ATENÇÃO: alertas de OLA são preliminares. A conclusão de Task não comprova implantação ou aceite do cliente.",
    {background:P.light,color:P.secondary,size:9,wrap:true});
  graph.getRow(41).height=24;graph.getRow(42).height=20;graph.getRow(44).height=24;graph.getRow(45).height=20;
  graph.headerFooter.oddFooter="&LRelatório gerencial / Gráficos&CConfidencial&R&P / &N";

  const ola=tableSheet(book,"03 OLA SUPORTE","OLA DO SUPORTE  |  AUDITORIA POR TICKET",
    "Alertas calculados por horas úteis; evidência do prazo interno para passagem à Fábrica.",scope,
    ["Ticket","Assunto","Task Azure","Abertura","Criação Task (proxy)","Prioridade","Perfil","Perfil comprovado","Tempo útil (h)","Meta (h)","Excesso (h)","Pausas (h)","Resultado","Ressalvas de auditoria","Link Azure"],
    e.ola.cases.map(x=>[x.ticketId,x.subject,x.taskId,fmtDate(x.openedAt),fmtDate(x.taskCreatedAt),
      x.priority,x.tier,x.tierVerified?"Sim":"Não",hrs(x.minutes),hrs(x.targetMinutes),hrs(x.excessMinutes),
      hrs(x.pauseMinutes),x.status,x.warnings.join(" • "),x.taskUrl]),
    [12,60,15,23,23,13,14,18,18,16,18,15,20,90,19],
    {hoursColumns:[9,10,11,12],dateColumns:[4,5],statusColumn:13,linkColumn:15});
  ola.properties.tabColor={argb:"FF"+P.orange};
  ola.getCell("N6").note="A criação da Task é proxy de passagem ao Desenvolvimento; o marco efetivo pode ser diferente.";

  const corrections=tableSheet(book,"04 QUALIDADE CORRECOES","CORREÇÕES  |  RESOLUTIVIDADE E RASTREABILIDADE",
    "Separação entre conclusão técnica, versão vinculada, resolução no Movidesk e reabertura.",scope,
    ["Ticket","Descrição","Categoria","Task","Estado técnico","Situação","Versão vinculada",
      "Conclusão técnica","Resolução Movidesk","Reabertura","Resolvido após Task?",
      "Reaberto após Task?","Reocorrência candidata?","Tickets relacionados","Aceite cliente","Link Azure"],
    e.corrections.rows.map(x=>[x.ticketId,x.subject,x.category,x.taskId,x.taskState,x.outcome,x.version,
      fmtDate(x.taskConcludedAt),fmtDate(x.ticketResolvedAt),fmtDate(x.ticketReopenedAt),
      x.resolvedAfterTask?"Sim":"Não",x.reopenedAfterTask?"Sim — conferir":"Não",
      x.reappearanceCandidate?"Sim — investigar":"Não",x.reappearanceTicketIds.join(", "),
      "Não comprovado",x.taskUrl]),
    [12,62,20,14,23,19,22,23,23,23,19,22,23,23,24,19],
    {dateColumns:[8,9,10],statusColumn:6,linkColumn:16});
  corrections.properties.tabColor={argb:"FF"+P.green};

  const matRows=[
    ["Bug + correção Azure",e.matrix.bugWithCorrection,"Categoria atual e correção técnica vinculadas"],
    ["Bug sem correção Azure",e.matrix.bugWithoutCorrection,"Investigar tratamento, vínculo e tipo de demanda"],
    ["Outra categoria + correção Azure",e.matrix.correctionNonBug,"Pode haver revisão de classificação; ainda não comprovada"],
    ["Demais atendimentos",e.matrix.others,"Sem essa combinação de sinais"],
  ];
  const matrix=tableSheet(book,"05 CLASSIFICACOES","MATRIZ BUG × TASK AZURE",
    "Conciliação de categoria atual (Movidesk) com natureza da Task técnica (Azure).",scope,
    ["Cenário","Tickets","Interpretação"],matRows,[46,18,80]);
  matrix.addRow([]);const hdr=matrix.addRow(["Ticket","Assunto","Categoria atual","Task Azure","Tipo Task","Motivo da investigação","Situação Movidesk"]);
  hdr.font=font(P.white,10,true);hdr.fill=fill(P.green);
  matrix.getColumn(4).width=20;matrix.getColumn(5).width=25;matrix.getColumn(6).width=65;matrix.getColumn(7).width=25;
  e.matrix.cases.forEach(x=>matrix.addRow([x.ticketId,x.subject,x.category,x.taskId,x.taskType,x.reason,x.status]));
  matrix.pageSetup.printArea="A1:G"+matrix.rowCount;

  const reclass=tableSheet(book,"06 RECLASSIFICACOES","ADEQUAÇÕES  |  HISTÓRICO COMPROVÁVEL",
    "Mudanças observadas no HUB são diferentes de categorias de abertura não recuperadas.",scope,
    ["Ticket","Assunto","Categoria atual","Categoria anterior observada","Data de observação",
      "Primeira conhecida","Task Azure","Status da evidência","Justificativa"],
    [...e.categories.observed,...e.categories.reviewCandidates].map(x=>
      [x.ticketId,x.subject,x.category,x.previousCategory,fmtDate(x.observedAt),x.initialObserved,
        x.taskId,x.evidence,x.reason]),
    [12,60,23,29,23,25,16,22,95],{statusColumn:8,dateColumns:[5]});
  reclass.properties.tabColor={argb:"FF"+P.blue};

  const vistraRows=e.vistra.cases.map(x=>[x.area,x.ticketId,x.subject,fmtDate(x.date),x.category,x.taskId,
    x.suspectedFailure?"Suspeita — validar":"Sem defeito comprovado",x.evidence]);
  const vistra=tableSheet(book,"07 VISTRA RELATORIOS","VISTRA, ANALÍTICO E RELATÓRIOS",
    "As ferramentas são apresentadas separadamente. Menção ou suspeita não comprova defeito.",scope,
    ["Ferramenta","Ticket","Descrição","Abertura","Categoria","Task Azure","Diagnóstico","Evidência"],
    vistraRows,[25,12,70,23,23,17,29,80],{dateColumns:[4],statusColumn:7});
  vistra.properties.tabColor={argb:"FF"+P.blue};

  const recurrence=tableSheet(book,"08 RECORRENCIAS","RECORRÊNCIAS  |  AGRUPAMENTOS PARA CONFIRMAÇÃO",
    "Mesmo assunto ou mesma Task é evidência de relação, mas não prova reincidência por causa-raiz.",scope,
    ["Critério","Assunto base","Tickets","Qtde","Tasks","Primeiro","Último",
      "Surgiu após conclusão técnica?","Tickets posteriores","Nota de validação"],
    e.recurrence.groupsDetail.map(x=>[x.evidence==="MESMA_TASK"?"Mesma Task":"Assunto normalizado",x.title,
      x.ticketIds.join(", "),x.count,x.taskIds.join(", "),fmtDate(x.firstAt),fmtDate(x.lastAt),
      x.afterTechnicalConclusion?"Sim — investigar":"Não observado",x.laterTicketIds.join(", "),x.qualification]),
    [24,63,38,12,27,23,23,30,33,90],{dateColumns:[6,7],statusColumn:8});
  recurrence.properties.tabColor={argb:"FF"+P.blue};

  const trend=tableSheet(book,"09 EVOLUCAO MENSAL","EVOLUÇÃO MENSAL  |  CLIENTE SELECIONADO",
    "Volume de abertura, classificação atual de Bug, correções e alertas preliminares de OLA.",scope,
    ["Mês","Tickets","Categoria Bug","Tasks correção","Alertas OLA","Vistra","Analítico","Relatórios SIMER"],
    e.monthly.map(m=>{
      const vm=e.vistra.monthly.find(v=>v.month===m.month);
      return [m.month,m.tickets,m.bugs,m.corrections,m.olaAlerts,vm?.vistra??0,vm?.analitico??0,vm?.relatorios??0];
    }),[20,20,20,24,22,20,20,23]);
  trend.properties.tabColor={argb:"FF"+P.green};
  // Barra de volume textual: não depende da formatação condicional da versão do Excel.
  trend.getColumn(9).width=30;
  const trendHead=trend.getCell("I7");trendHead.value="Volume relativo";
  trendHead.font=font(P.white,10,true);trendHead.fill=fill(P.green);
  trendHead.alignment={vertical:"middle",indent:1};
  const maxMonthly=Math.max(1,...e.monthly.map(x=>x.tickets));
  e.monthly.forEach((m,i)=>{
    const c=trend.getRow(i+8).getCell(9);
    c.value="▮".repeat(Math.max(1,Math.round(m.tickets/maxMonthly*20)));
    c.font=font(P.green,11,true);
    if((i+8)%2===0)c.fill=fill(P.light);
  });
  trend.autoFilter={from:{row:7,column:1},to:{row:Math.max(7,trend.rowCount),column:9}};
  trend.pageSetup.printArea="A1:I"+trend.rowCount;

  const actions=[
    ["P1","Auditoria de OLA",e.ola.alerts,"Validar marcos, pausas, contrato e urgência histórica.",
      "Cada alerta classificado como confirmado ou descaracterizado."],
    ["P1","Correções com reabertura / nova ocorrência",e.corrections.postConclusionCandidates,
      "Confrontar versão implantada, conclusão e aceite do cliente.","Regressão comprovada ou descartada."],
    ["P1","Divergências Bug × Azure",e.matrix.discordantTicketIds.length,
      "Investigar vínculos, classificação e tipificação da Task.","Cada divergência fundamentada."],
    ["P2","Mudanças para Adequação",e.categories.reviewCandidates.length,
      "Consultar histórico de alterações na interface Movidesk.","Categoria anterior comprovada ou não recuperável."],
    ["P2","Vistra / relatórios",e.vistra.cases.length,
      "Confirmar ferramenta, impacto, data e causa-raiz.","Falhas confirmadas e periodicidade documentada."],
    ["P2","Recorrências",e.recurrence.groups,
      "Revisar agrupamentos e entregas; registrar causa-raiz.","Mesmo defeito e pós-entrega evidenciados."],
  ];
  const plan=tableSheet(book,"10 PLANO DE ACAO","AGENDA EXECUTIVA  |  PLANO DE TRATAMENTO",
    "Ações sugeridas a partir dos achados. Responsável e prazo não foram definidos automaticamente.",scope,
    ["Prioridade","Frente","Casos de referência","Próxima ação","Critério de conclusão","Responsável","Prazo"],
    actions.map(x=>[x[0],x[1],x[2],x[3],x[4],"A definir","A definir"]),
    [18,44,22,85,85,25,20],{statusColumn:1});
  plan.properties.tabColor={argb:"FF"+P.orange};

  const tech=tableSheet(book,"11 BASE AUDITAVEL","BASE ANALÍTICA  |  EVIDÊNCIAS DO HUB",
    "Todos os tickets do recorte; para investigar prazos utilize principalmente a aba 03.",scope,
    ["Ticket","Assunto","Cliente","Responsável atual","Equipe atual","Rotina / serviço",
      "Abertura","Categoria atual","Status Movidesk","Task",
      "Tipo Task","Estado Task","Versão","Abertura Task","Conclusão Task","OLA Suporte min",
      "Meta min","OLA excedido?","Categoria inicial observada","Data observação",
      "Mudança → Adequação?","Categoria anterior","Primeira menção Produto","Vistra/relatório",
      "Agrupamento assunto","Nº ações"],
    report.rows.map(x=>[x.id,x.subject,x.client,x.owner,x.ownerTeam,x.serviceContext,
      fmtDate(x.createdDate),x.category,x.status,x.taskNumber,
      x.taskType,x.taskState,x.deliveredVersion,fmtDate(x.taskCreatedAt),fmtDate(x.taskConcludedAt),
      x.supportMinutes,x.supportTargetMinutes,x.supportOlaBreached==null?"N/D":x.supportOlaBreached?"Sim":"Não",
      x.initialObservedCategory,fmtDate(x.initialObservedAt),x.anyToAdequacaoEvidence?"Sim":"Não",
      x.anyToAdequacaoFrom,fmtDate(x.firstProductEvidence),x.vistraType,x.recurrenceKey,x.actionCount]),
    [12,62,47,40,30,45,23,22,26,14,27,23,25,23,23,20,18,18,27,23,24,23,23,37,52,15],
    {dateColumns:[7,14,15,20,23],statusColumn:18});
  tech.properties.tabColor={argb:"FF"+P.secondary};

  const definitions=[
    ["UNIVERSO","Aberturas no período, cliente selecionado da carteira e responsável operacional SIMER.",
      "Ticket Movidesk sincronizado pelo HUB"],
    ["BUG ATUAL","Categoria Bug informada atualmente no Movidesk. Não equivale automaticamente a erro confirmado.",
      "Movidesk Ticket.category"],
    ["CORREÇÃO TÉCNICA","Ticket vinculado a Work Item de tipo correção no Azure. Tickets e Tasks distintas são contados separadamente.",
      "Ticket.taskNumber + AzureWorkItem.workItemType"],
    ["OLA DO SUPORTE","Tempo útil da abertura do ticket até a criação da Task Azure (proxy). Pausas capturadas e metas por prioridade/perfil.",
      "Movidesk + Azure + regras Aliare 2026"],
    ["ALERTA DE OLA","Tempo útil acima da meta calculada; não é descumprimento auditado até validação de pausas e marco real de passagem.",
      "Cálculo BomJesusSlaMetrics"],
    ["TAXA NO PRAZO","Casos mensuráveis e não cancelados, dentro da meta, divididos por todos os casos mensuráveis e não cancelados.",
      "Aba 03 OLA SUPORTE"],
    ["VERSÃO","Versão registrada/entregue no Azure; não significa automaticamente que foi implantada no cliente.",
      "Azure Work Item"],
    ["ACEITE CLIENTE","Sem evidência explícita a validação não é afirmada; situação de Task/Movidesk isolada não comprova aceite.",
      "Evidência contextual a confirmar"],
    ["REABERTURA","Reabertura posterior à conclusão técnica é sinal de investigação, não comprovação de regressão.",
      "Movidesk.reopenedDate + AzureClosedAt"],
    ["RECLASSIFICAÇÃO","Mudança observada em capturas sucessivas; categoria de abertura não pode ser inferida do baseline.",
      "MovideskCategorySnapshot"],
    ["RECORRÊNCIA","Mesmo assunto normalizado ou mesma Task são agrupamentos candidatos, sujeitos a validação da causa-raiz.",
      "Ticket.subject + AzureWorkItem.id"],
    ["VISTRA / ANALÍTICO / RELATÓRIOS","Ferramentas tratadas separadamente; palavra-chave e sintoma são sinais, não prova de falha.",
      "Assunto + serviço + natureza da Task"],
  ];
  const methodology=tableSheet(book,"12 CRITERIOS FONTES","METODOLOGIA  |  CRITÉRIOS DE EVIDÊNCIA",
    "Glossário auditável, hipóteses de cálculo e limitações para leitura pela Diretoria.",scope,
    ["Conceito","Definição operacional","Evidência e fonte"],definitions,[29,115,71]);
  methodology.properties.tabColor={argb:"FF"+P.secondary};
  methodology.addRow([]);
  methodology.addRow(["OBSERVAÇÃO","As informações são instantâneos sincronizados do HUB, não necessariamente o estado exato do Movidesk em tempo real."]);
  methodology.addRow(["GERADO EM",fmtDate(report.generatedAt)]);
  methodology.addRow(["ESCOPO",report.clientFilter+" | "+report.startDate+" a "+report.endDate+" | Analistas SIMER"]);
  methodology.addRow(["ALERTAS","Os alertas de SLA/OLA exigem conferência de pausas, mudança histórica de prioridade, feriados locais e efetiva passagem."]);
  methodology.getColumn(2).width=115;

  // Complementos executivos alinhados às novas abas nativas da Coordenação.
  // O número de casos por responsável representa carteira atual, não desempenho individual.
  const alertTicketIds=new Set(e.ola.cases.filter(x=>x.status==="ALERTA").map(x=>x.ticketId));
  const dimension=(row:BomJesusRow,key:"client"|"owner"|"category"|"status"|"service")=>{
    if(key==="client")return row.client?.trim()||"Sem cliente";
    if(key==="owner")return row.owner?.trim()||"Não atribuído";
    if(key==="category")return row.category?.trim()||"Sem categoria";
    if(key==="status")return row.status?.trim()||"Sem situação";
    const levels=(row.serviceContext||"").split(" / ").map(x=>x.trim()).filter(Boolean);
    return levels.length>1?levels[1]!:levels[0]||"Não classificado";
  };
  type RankingRecord={name:string;tickets:number;bugs:number;corrections:number;olaAlerts:number};
  const rank=(key:"client"|"owner"|"category"|"status"|"service")=>{
    const items=new Map<string,RankingRecord>();
    for(const row of report.rows){
      const name=dimension(row,key);
      const record=items.get(name)??{name,tickets:0,bugs:0,corrections:0,olaAlerts:0};
      record.tickets++;
      record.bugs+=row.category?.trim().toLocaleLowerCase("pt-BR")==="bug"?1:0;
      record.corrections+=row.isCorrectionTask?1:0;
      record.olaAlerts+=alertTicketIds.has(row.id)?1:0;
      items.set(name,record);
    }
    return [...items.values()].sort((a,b)=>b.tickets-a.tickets||a.name.localeCompare(b.name,"pt-BR"));
  };
  const rankingWs=book.addWorksheet("13 RANKINGS",{properties:{tabColor:{argb:"FF"+P.blue}}});
  banner(rankingWs,"RANKINGS OPERACIONAIS  |  CLIENTE SELECIONADO",
    "Participação por responsável, categoria, status e rotina. Contagens auditáveis com base no mesmo recorte.",6,scope);
  [52,21,22,22,24,23].forEach((v,i)=>{rankingWs.getColumn(i+1).width=v;});
  let nextRow=7;
  const sections=[
    {key:"owner" as const,label:"RESPONSÁVEL (CARTEIRA ATUAL)"},
    {key:"category" as const,label:"CATEGORIA ATUAL"},
    {key:"status" as const,label:"SITUAÇÃO ATUAL"},
    {key:"service" as const,label:"ROTINA / SERVIÇO"},
    {key:"client" as const,label:"CLIENTE DA CARTEIRA"},
  ];
  for(const item of sections){
    titleBar(rankingWs,nextRow++,"A","F",item.label);
    const labels=["Grupo","Atendimentos","Categoria Bug","Correções Azure","Alertas OLA","Participação"];
    const head=rankingWs.getRow(nextRow++);
    labels.forEach((label,i)=>{const c=head.getCell(i+1);c.value=label;c.font=font(P.white,9,true);
      c.fill=fill(P.green);c.alignment={wrapText:true,vertical:"middle",indent:1};});
    head.height=30;
    const groups=rank(item.key);
    for(const [i,group] of groups.slice(0,15).entries()){
      const row=rankingWs.getRow(nextRow++);
      row.values=[group.name,group.tickets,group.bugs,group.corrections,group.olaAlerts,
        report.rows.length?group.tickets/report.rows.length:0];
      row.getCell(6).numFmt="0.0%";
      row.height=21;
      row.eachCell(c=>{c.font=font(P.ink,10);c.alignment={vertical:"middle",indent:1};if(i%2)c.fill=fill(P.light);});
    }
    if(!groups.length){
      rankingWs.getCell("A"+nextRow).value="Sem dados neste período.";nextRow++;
    }
    nextRow+=2;
  }
  rankingWs.views=[{state:"frozen",ySplit:7,showGridLines:false}];
  rankingWs.pageSetup.printArea="A1:F"+nextRow;
  rankingWs.pageSetup.printTitlesRow="1:6";

  const allOwners=rank("owner");
  const allCategories=rank("category");
  const topCategories=allCategories.slice(0,8).map(x=>x.name);
  const pivotHeaders=["Analista responsável",...topCategories,"Outras categorias","Total"];
  const pivotRows=allOwners.map(owner=>{
    const assigned=report.rows.filter(x=>dimension(x,"owner")===owner.name);
    const perCategory=topCategories.map(category=>assigned.filter(x=>dimension(x,"category")===category).length);
    const remaining=assigned.length-perCategory.reduce((sum,n)=>sum+n,0);
    return [owner.name,...perCategory,remaining,assigned.length];
  });
  const summedCategories=topCategories.map(category=>report.rows.filter(x=>dimension(x,"category")===category).length);
  pivotRows.push(["TOTAL GERAL",...summedCategories,
    report.rows.length-summedCategories.reduce((sum,n)=>sum+n,0),report.rows.length]);
  const pivotWs=tableSheet(book,"14 MULTIDIMENSIONAL",
    "COMPOSIÇÃO MULTIDIMENSIONAL  |  ANALISTA × CATEGORIA",
    "Distribuição dos atendimentos por responsável atual e categoria atual. Totais por linha e coluna.",
    scope,pivotHeaders,pivotRows,[52,...topCategories.map(()=>21),23,18]);
  pivotWs.properties.tabColor={argb:"FF"+P.blue};
  const lastPivot=pivotWs.getRow(pivotWs.rowCount);
  lastPivot.eachCell(c=>{c.font=font(P.white,10,true);c.fill=fill(P.dark);});
  pivotWs.pageSetup.fitToWidth=1;
  pivotWs.pageSetup.printArea="A1:"+pivotWs.getColumn(pivotHeaders.length).letter+pivotWs.rowCount;
  book.worksheets.forEach((sheet,index)=>{
    if(index===0)return;
    sheet.headerFooter.oddHeader="&LTechLead Hub / Carteira SIMER&CDiagnóstico gerencial&R"+report.endDate;
    sheet.headerFooter.oddFooter="&LInformações para revisão interna • não redistribuir sem validação&C"+sheet.name+"&RPágina &P de &N";
    sheet.pageSetup.fitToPage=true;
    // Anexos largos usam duas páginas horizontais para preservar leitura na impressão.
    sheet.pageSetup.fitToWidth=sheet.name==="02 GRAFICOS"?1:sheet.columnCount>16?2:1;
    sheet.pageSetup.fitToHeight=sheet.name==="02 GRAFICOS"?1:0;
  });
  return book;
}
