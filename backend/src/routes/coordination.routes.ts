import { Router } from "express";
import ExcelJS from "exceljs";
import { bomJesusReport } from "../services/BomJesusReportService";
import { isBugToAdequacao, isToAdequacao } from "../services/TicketCategoryHistoryService";
import type { SlaTier } from "../domain/AliareSlaRules";
import { requirePermission } from "../middlewares/roleMiddleware";
import { requireAnyPermission } from "../middlewares/routinePermissionMiddleware";
import { coordinationService } from "../services/CoordinationService";
import { SlaInvestigationService } from "../services/SlaInvestigationService";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";

const coordinationRoutes = Router();
coordinationRoutes.use((req, res, next) => {
  if (req.path.startsWith("/sla-investigation/")) return requireAnyPermission("performance", "coordination")(req as AuthenticatedRequest,res,next);
  const permission = req.path.startsWith("/services") ? "services" : "coordination";
  return requirePermission(permission)(req as AuthenticatedRequest, res, next);
});
const bomJesusTier = (req: AuthenticatedRequest): SlaTier | null => req.query.slaTier === "VIP" ? "VIP" : req.query.slaTier === "PADRAO" ? "PADRAO" : null;
const bomJesusDates = (req: AuthenticatedRequest) => ({
  startDate: typeof req.query.startDate === "string" ? req.query.startDate : "2026-07-01",
  endDate: typeof req.query.endDate === "string" ? req.query.endDate : new Date().toISOString().slice(0, 10),
});
coordinationRoutes.get("/bom-jesus-report", async (req: AuthenticatedRequest, res) => {
  try { res.json(await bomJesusReport(bomJesusDates(req).startDate, bomJesusDates(req).endDate, bomJesusTier(req))); }
  catch (error) {
    if (error instanceof Error && error.message.startsWith("Período inválido")) return res.status(400).json({ error: error.message });
    console.error("[coordination] Relatório Bom Jesus:", error);
    res.status(500).json({ error: "Não foi possível gerar o relatório Bom Jesus." });
  }
});
coordinationRoutes.get("/bom-jesus-report.xlsx", async (req: AuthenticatedRequest, res) => {
  try {
    const { startDate, endDate } = bomJesusDates(req);
    const report = await bomJesusReport(startDate, endDate, bomJesusTier(req));
    const book = new ExcelJS.Workbook();
    book.creator = "TechLead Hub";
    const overview = book.addWorksheet("Resumo");
    overview.addRows([
      ["Relatório Gerencial — Bom Jesus"], ["Período", startDate, endDate],
      ["Gerado em", report.generatedAt], ["Critério", report.methodology], [],
      ["Indicador", "Quantidade / situação"],
      ["Tickets", report.totals.tickets],
      ["Possíveis bugs (não confirmados)", report.totals.possibleBugs],
      ["Melhorias atuais (origem não validada)", report.totals.currentImprovements],
      ["Possíveis falhas Vistra / relatórios", report.totals.vistraCandidates],
      ["Tickets em grupos possivelmente recorrentes", report.totals.recurrenceCandidates],
      ["Bugs reais (definição: vinculados a Tasks de correção)", report.totals.confirmedBugs],
      ["Tasks de correção vinculadas", report.totals.linkedCorrectionTasks],
      ["Tasks de correção concluídas", report.totals.concludedCorrectionTasks],
      ["Tasks de correção ainda abertas", report.totals.openCorrectionTasks],
      ["Tasks de correção com versão vinculada", report.totals.correctionWithVersion],
      ["Tasks concluídas com versão vinculada", report.totals.deliveredCorrectionTasks],
      ["Transições observadas Bug → Adequação", report.totals.reclassified],
      ["Transições observadas Problema → Adequação", report.totals.problemaToAdequacaoObserved],
      ["Transições observadas outras categorias → Adequação", report.totals.otherToAdequacaoObserved],
      ["Tickets com qualquer transição observada → Adequação", report.totals.anyToAdequacaoObserved],
      ["Tickets com histórico de categoria registrado", report.totals.categoryHistoryCoverage],
      ["Categorias de abertura verificadas", "Não disponíveis na API de tickets"],
      ["Grupos de assuntos recorrentes", report.totals.recurrenceGroups],
      ["OLA Suporte excedido (perfil identificado; preliminar)", report.totals.olaBreaches],
      ["OLA Suporte excedido (perfil presumido; cenário)", report.totals.olaBreachesPreliminary],
      ["SLA 1ª resposta excedido (preliminar)", report.totals.responseBreaches],
      ["OLA Fábrica excedido em Tasks concluídas (preliminar)", report.totals.factoryBreaches],
      ["OLA Fábrica vencido em Tasks abertas (preliminar)", report.totals.factoryOverdueOpen],
      ["SLA Total excedido em Tasks concluídas (preliminar)", report.totals.totalSlaBreaches],
      ["Bugs com perfil Padrão/VIP a confirmar", report.totals.withoutVerifiedProfile],
      ["Atendimentos elegíveis com prioridade identificada", report.totals.slaCalculationEligible],
    ]);
    const detail = book.addWorksheet("Tickets e evidências");
    detail.addRow(["Ticket", "Assunto", "Cliente", "Abertura", "Situação", "Categoria", "Task", "Tipo Task", "Classificação indicativa", "Vistra ou relatório", "Grupo de recorrência", "Tamanho grupo", "Ações sincronizadas", "Primeira menção Produto", "OLA", "Observação", "Estado da Task", "Versão entregue", "Criação da Task", "Tempo Suporte (min)", "Meta Suporte (min)", "OLA excedido", "Data observada Bug → Adequação", "Evidência da transição", "Tipo de falha Vistra/relatório", "Evidência de recorrência", "Primeira categoria observada", "Data primeira observação", "Origem primeira observação", "Categoria na abertura comprovada?", "Conclusão técnica Task", "Outra categoria → Adequação?", "Categoria anterior → Adequação", "Data observada → Adequação"]);
    for (const x of report.rows) detail.addRow([x.id, x.subject, x.client, x.createdDate, x.status, x.category, x.taskNumber, x.taskType, x.classification, x.vistra ? "Sim — validar" : "Não identificado", x.recurrenceKey, x.recurrenceCount, x.actionCount, x.firstProductEvidence, x.ola, x.evidence, x.taskState, x.deliveredVersion, x.taskCreatedAt, x.supportMinutes, x.supportTargetMinutes, x.supportOlaBreached === null ? "Não calculável" : x.supportOlaBreached ? "Sim" : "Não", x.categoryChangedAt, x.categoryChangeEvidence, x.vistraType, x.recurrenceEvidence, x.initialObservedCategory, x.initialObservedAt, x.initialSource, x.openingCategoryVerified ? "Sim" : "Não", x.taskConcludedAt, x.anyToAdequacaoEvidence ? "Sim" : "Não", x.anyToAdequacaoFrom, x.anyToAdequacaoChangedAt]);
    const slaSheet = book.addWorksheet("Análise SLA e OLA");
    slaSheet.addRow([
      "Ticket", "Assunto", "Categoria atual", "Task", "Estado Task", "Versão vinculada",
      "Prioridade", "Perfil SLA", "Contrato informado no Movidesk", "Origem do perfil", "Perfil confirmado?", "Categoria elegível?",
      "Abertura", "Criação Task (proxy de passagem)", "Conclusão da Task (se concluída)", "Status SLA",
      "1ª resposta (min úteis)", "Meta 1ª resposta (min)", "1ª resposta excedida?",
      "OLA Suporte (min úteis)", "Meta OLA Suporte (min)", "Excesso OLA Suporte (min)", "OLA Suporte excedido?",
      "OLA Fábrica (min úteis)", "Meta OLA Fábrica (min)", "Excesso OLA Fábrica (min)", "Situação da Fábrica", "OLA Fábrica excedido?",
      "SLA total (min úteis)", "Meta SLA total (min)", "Excesso SLA total (min)", "Situação SLA total", "SLA total excedido?",
      "Pausas conhecidas Suporte (min)", "Pausas conhecidas Fábrica (min)", "Ressalvas / conferências",
    ]);
    for (const x of report.rows) {
      const a = x.sla;
      const status = a.eligible ? a.tierVerified ? "Preliminar — validar pausas/urgência" : "Cenário — confirmar perfil" : "Fora de escopo atual";
      slaSheet.addRow([
        x.id, x.subject, x.category, x.taskNumber, x.taskState, x.deliveredVersion,
        a.priority, a.tier, a.agreement, a.tierSource, a.tierVerified ? "Sim" : "Não", a.eligible ? "Sim" : "Não",
        x.createdDate, x.taskCreatedAt, x.taskConcludedAt, status,
        a.response.minutes, a.response.targetMinutes, a.response.exceeded === null ? "N/D" : a.response.exceeded ? "Sim" : "Não",
        a.support.minutes, a.support.targetMinutes, a.support.overMinutes, a.support.exceeded === null ? "N/D" : a.support.exceeded ? "Sim" : "Não",
        a.factory.minutes, a.factory.targetMinutes, a.factory.overMinutes, a.factory.state, a.factory.exceeded === null ? "N/D" : a.factory.exceeded ? "Sim" : "Não",
        a.total.minutes, a.total.targetMinutes, a.total.overMinutes, a.total.state, a.total.exceeded === null ? "N/D" : a.total.exceeded ? "Sim" : "Não",
        a.pauseMinutesSupport, a.pauseMinutesFactory, a.warnings.join(" | "),
      ]);
    }
    const categorySheet = book.addWorksheet("Histórico de Categorias");
    categorySheet.addRow(["Ticket", "Assunto", "Tipo", "Categoria anterior", "Categoria observada", "Capturado em (HUB)", "Atualização remota do ticket", "Fonte", "Bug para Adequação?", "Categoria na abertura comprovada?", "Qualquer categoria para Adequação?"]);
    for (const x of report.rows) {
      if (!x.categoryHistory.length) {
        categorySheet.addRow([x.id, x.subject, "SEM HISTÓRICO", null, x.category, null, null, "Sem observação", "Não", "Não"]);
      }
      for (const event of x.categoryHistory) {
        categorySheet.addRow([x.id, x.subject, event.kind === "BASELINE" ? "PRIMEIRA OBSERVAÇÃO" : "ALTERAÇÃO OBSERVADA",
          event.previousCategory, event.category, event.observedAt, event.sourceLastUpdate,
          event.source,
          isBugToAdequacao(event) ? "Sim" : "Não",
          "Não", isToAdequacao(event) ? "Sim" : "Não",
        ]);
      }
    }
    // Abas executivas: o mesmo objeto alimenta a tela e o Excel, sem contagens divergentes.
    const audit = report.executive;
    const executive = book.addWorksheet("PAINEL DIRETORIA", { views: [{ state:"frozen", ySplit: 4 }] });
    executive.addRows([
      ["DIAGNÓSTICO EXECUTIVO — BOM JESUS | Suporte SIMER"],
      ["Cliente", report.clientFilter], ["Período de abertura", startDate, endDate],
      ["Escopo", "Cliente exato + responsabilidade operacional SIMER. Mesma definição do card Clientes."], [],
      ["Indicador", "Resultado", "Qualificação"],
      ["Atendimentos", audit.matrix.total, "Tickets distintos no período e carteira SIMER"],
      ["Categorias Bug", audit.matrix.bugCategory, "Classificação atual no Movidesk"],
      ["Vinculados a Tasks de correção", audit.corrections.tickets, "Vínculo Azure confirmado"],
      ["Tasks distintas", audit.corrections.distinctTasks, "Work Items Azure sem dupla contagem"],
      ["Correções concluídas", audit.corrections.concluded, "Conclusão técnica, não aceite do cliente"],
      ["Correções concluídas com versão", audit.corrections.concludedWithVersion, "Versão vinculada; implantação não comprovada"],
      ["Correções abertas", audit.corrections.open, "Exclui canceladas"],
      ["Correções canceladas", audit.corrections.cancelled, "Analisar separadamente"],
      ["OLA Suporte: alertas", audit.ola.alerts, "Excesso calculado, sujeito à auditoria de pausas e marco de passagem"],
      ["OLA Suporte: dentro da meta", audit.ola.onTime, "Tempo calculável em Tasks não canceladas"],
      ["OLA Suporte: não mensurável", audit.ola.unmeasurable, "Sem marcos/prioridade ou categoria excluída"],
      ["OLA Suporte: % dentro da meta", audit.ola.withinTargetPercent, "Denominador = casos mensuráveis, não cancelados"],
      ["Mediana de OLA Suporte (horas úteis)", audit.ola.medianSupportMinutes===null?null:Math.round(audit.ola.medianSupportMinutes/60*100)/100, "Aferição preliminar"],
      ["Mediana do excesso (horas úteis)", audit.ola.medianExcessMinutes===null?null:Math.round(audit.ola.medianExcessMinutes/60*100)/100, "Somente alertas"],
      ["Categoria Bug sem Task correção", audit.matrix.bugWithoutCorrection, "Revisar vínculo e classificação"],
      ["Correção Azure sem categoria Bug", audit.matrix.correctionNonBug, "Investigar reclassificações e contexto"],
      ["Mudanças observadas para Adequação", audit.categories.observedTicketCount, "Histórico capturado; não prova categoria de abertura"],
      ["Adequações para revisão histórica", audit.categories.reviewCandidates.length, "Candidatos, não mudanças confirmadas"],
      ["Vistra explícito com suspeita de falha", audit.vistra.suspectedVistraFailures, "Separado do Analítico e relatórios SIMER"],
      ["Grupos de recorrência candidatos", audit.recurrence.groups, "Soma de grupos pode sobrepor tickets"],
      ["Grupos com ocorrência após conclusão técnica", audit.recurrence.afterConclusionGroups, "Não comprova regressão pós-implantação"], [],
      ["LEITURA CRÍTICA", "Abertura da Task Azure é proxy temporal de passagem, não data oficial confirmada."],
      ["LEITURA CRÍTICA", "A API pública do Movidesk não disponibiliza histórico nativo de categorias; observações são prospectivas."],
      ["LEITURA CRÍTICA", "Nenhum encerramento técnico comprova aceite explícito do cliente ou implantação da versão."],
    ]);
    executive.getColumn(1).width=54; executive.getColumn(2).width=32; executive.getColumn(3).width=90;
    executive.getRow(1).font={bold:true,size:16,color:{argb:"FFFFFFFF"}};
    executive.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF146C43"}};
    executive.getRow(6).font={bold:true,color:{argb:"FFFFFFFF"}};
    executive.getRow(6).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF146C43"}};
    executive.getRow(18).getCell(2).numFmt="0.0";
    const hrs=(minutes:number|null)=>minutes===null?null:Math.round(minutes/60*100)/100;
    const olaAudit = book.addWorksheet("OLA SUPORTE AUDITORIA");
    olaAudit.addRow(["Ticket","Assunto","Task Azure","Situação Task","Categoria atual","Abertura","Criação da Task (proxy)","Prioridade","Perfil SLA","Perfil identificado?","OLA Suporte (horas úteis)","Meta (horas úteis)","Excesso (horas úteis)","Pausas identificadas (horas)","Classificação","Ressalvas de auditoria","Link da Task"]);
    for(const x of audit.ola.cases)olaAudit.addRow([x.ticketId,x.subject,x.taskId,x.taskState,x.category,x.openedAt,x.taskCreatedAt,x.priority,x.tier,x.tierVerified?"Sim":"Não",hrs(x.minutes),hrs(x.targetMinutes),hrs(x.excessMinutes),hrs(x.pauseMinutes),x.status,x.warnings.join(" | "),x.taskUrl]);
    const quality=book.addWorksheet("QUALIDADE CORRECOES");
    quality.addRow(["Ticket","Assunto","Categoria","Task","Situação Azure","Grupo","Versão vinculada","Data conclusão técnica","Data resolução Movidesk","Última reabertura","Resolvido após conclusão?","Reaberto após conclusão?","Possível reocorrência?","Tickets posteriores com assunto igual","Aceite explícito do cliente","Link Task"]);
    for(const x of audit.corrections.rows)quality.addRow([x.ticketId,x.subject,x.category,x.taskId,x.taskState,x.outcome,x.version,x.taskConcludedAt,x.ticketResolvedAt,x.ticketReopenedAt,x.resolvedAfterTask?"Sim":"Não",x.reopenedAfterTask?"Sim":"Não",x.reappearanceCandidate?"Sim - conferir":"Não",x.reappearanceTicketIds.join(", "),x.validatedByClient,x.taskUrl]);
    const matrix=book.addWorksheet("MATRIZ CLASSIFICACOES");
    matrix.addRows([["MATRIZ MOVIdesk × AZURE","Tickets"],["Bug + Task de correção",audit.matrix.bugWithCorrection],["Bug sem Task de correção",audit.matrix.bugWithoutCorrection],["Outra categoria + Task de correção",audit.matrix.correctionNonBug],["Demais atendimentos",audit.matrix.others],["TOTAL",audit.matrix.total],[],["Ticket","Assunto","Categoria atual","Task","Tipo Azure","Motivo da divergência","Situação Movidesk"]]);
    for(const x of audit.matrix.cases)matrix.addRow([x.ticketId,x.subject,x.category,x.taskId,x.taskType,x.reason,x.status]);
    const categoryReview=book.addWorksheet("AUDITORIA ADEQUACOES");
    categoryReview.addRow(["Ticket","Assunto","Categoria atual","Categoria anterior observada","Data observação","Primeira categoria conhecida","Task","Situação","Fundamentação"]);
    for(const x of [...audit.categories.observed,...audit.categories.reviewCandidates])categoryReview.addRow([x.ticketId,x.subject,x.category,x.previousCategory,x.observedAt,x.initialObserved,x.taskId,x.evidence,x.reason]);
    const recurring=book.addWorksheet("RECORRENCIAS CANDIDATAS");
    recurring.addRow(["Agrupamento","Assunto base","Tickets","Qtd. tickets","Tasks","Primeiro registro","Último registro","Tipo evidência","Houve ticket após conclusão técnica?","Tickets posteriores","Ressalva"]);
    for(const x of audit.recurrence.groupsDetail)recurring.addRow([x.key,x.title,x.ticketIds.join(", "),x.count,x.taskIds.join(", "),x.firstAt,x.lastAt,x.evidence,x.afterTechnicalConclusion?"Sim - investigar":"Não",x.laterTicketIds.join(", "),x.qualification]);
    const vistra=book.addWorksheet("VISTRA ANALITICO RELATORIOS");
    vistra.addRow(["Ferramenta","Ticket","Assunto","Data abertura","Categoria","Task correção","Sintoma de falha?","Evidência"]);
    for(const x of audit.vistra.cases)vistra.addRow([x.area,x.ticketId,x.subject,x.date,x.category,x.taskId,x.suspectedFailure?"Suspeito - validar":"Não comprovado",x.evidence]);
    const monitoring=book.addWorksheet("EVOLUCAO MENSAL");
    monitoring.addRow(["Mês abertura","Tickets","Categorias Bug","Tasks correção","Alertas OLA suporte"]);
    for(const x of audit.monthly)monitoring.addRow([x.month,x.tickets,x.bugs,x.corrections,x.olaAlerts]);
    monitoring.addRow([]);monitoring.addRow(["Mês","Vistra","Analítico","Relatórios SIMER"]);
    for(const x of audit.vistra.monthly)monitoring.addRow([x.month,x.vistra,x.analitico,x.relatorios]);
    const plans=book.addWorksheet("PLANO DE ACAO");
    plans.addRows([
      ["Prioridade","Frente","Quantidade referência","Ação para validação","Critério de conclusão"],
      ["P1","OLA Suporte",audit.ola.alerts,"Revisar linha do tempo, pausa, mudança de urgência e data efetiva de passagem","Excesso comprovado ou descaracterizado por ticket"],
      ["P1","Correções pós-conclusão",audit.corrections.postConclusionCandidates,"Confrontar ocorrências novas com implantação efetiva e aceite","Regressão confirmada ou não"],
      ["P1","Bug / Azure divergentes",audit.matrix.discordantTicketIds.length,"Conferir Task, classificação e contexto de origem","Vínculo e classificação explicados"],
      ["P2","Mudança para Adequação",audit.categories.reviewCandidates.length,"Consultar histórico de alterações na interface Movidesk","Categoria inicial comprovada ou não disponível"],
      ["P2","Vistra e relatórios",audit.vistra.cases.length,"Validar ferramenta, causa-raiz e correção","Incidentes confirmados e periodicidade"],
      ["P2","Recorrências",audit.recurrence.groups,"Investigar grupos e identificar causa-raiz","Recorrência confirmada por defeito"],
    ]);
    const trend = book.addWorksheet("Periodicidade");
    trend.addRow(["Mês", "Tickets", "Candidatos Vistra / relatórios"]);
    for (const x of report.monthly) trend.addRow([x.month, x.tickets, x.vistra]);
    for (const sheet of book.worksheets) {
      sheet.views = [{ state: "frozen", ySplit: sheet.name === "Resumo" ? 0 : 1 }];
      sheet.getRow(sheet.name === "Resumo" ? 6 : 1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(sheet.name === "Resumo" ? 6 : 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF146C43" } };
      sheet.columns.forEach(col => { if(!col.width || col.width < 12) col.width = 25; });
      if (sheet.name === "Tickets e evidências") {
        sheet.getColumn(2).width = 55; sheet.getColumn(16).width = 55; sheet.getColumn(30).width = 26;
        sheet.autoFilter = { from: "A1", to: "AH1" };
      }
      if (sheet.name === "Análise SLA e OLA") {
        sheet.getColumn(2).width = 56; sheet.getColumn(36).width = 95;
        sheet.autoFilter = { from: "A1", to: "AJ1" };
      }
      if (["OLA SUPORTE AUDITORIA","QUALIDADE CORRECOES","MATRIZ CLASSIFICACOES","AUDITORIA ADEQUACOES","RECORRENCIAS CANDIDATAS","VISTRA ANALITICO RELATORIOS","EVOLUCAO MENSAL","PLANO DE ACAO"].includes(sheet.name)) {
        sheet.getColumn(2).width=52;
        sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
        sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF146C43"}};
      }
      if(sheet.name==="OLA SUPORTE AUDITORIA") {sheet.getColumn(16).width=85;sheet.autoFilter={from:"A1",to:"Q1"};}
      if(sheet.name==="QUALIDADE CORRECOES") {sheet.getColumn(2).width=56;sheet.autoFilter={from:"A1",to:"P1"};}
      if(sheet.name==="AUDITORIA ADEQUACOES") {sheet.getColumn(2).width=55;sheet.autoFilter={from:"A1",to:"I1"};}
      if(sheet.name==="VISTRA ANALITICO RELATORIOS") {sheet.getColumn(3).width=55;sheet.autoFilter={from:"A1",to:"H1"};}
      if (sheet.name === "Histórico de Categorias") {
        sheet.getColumn(2).width = 55; sheet.getColumn(3).width = 27; sheet.getColumn(8).width = 23;
        sheet.autoFilter = { from: "A1", to: "K1" };
      }
    }
    const buffer = await book.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="relatorio-bom-jesus.xlsx"');
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(buffer));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Período inválido")) return res.status(400).json({ error: error.message });
    console.error("[coordination] Excel Bom Jesus:", error);
    res.status(500).json({ error: "Não foi possível exportar o relatório Bom Jesus." });
  }
});

coordinationRoutes.get("/details", async (req: AuthenticatedRequest, res) => {
  try {
    const kind = String(req.query.kind ?? "backlog");
    const analyst = typeof req.query.analyst === "string" ? req.query.analyst : undefined;
    const serviceModule = typeof req.query.serviceModule === "string" ? req.query.serviceModule : undefined;
    const serviceClient = typeof req.query.serviceClient === "string" ? req.query.serviceClient : undefined;
    const serviceName = typeof req.query.serviceName === "string" ? req.query.serviceName : undefined;
    const parsedLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
    const serviceDays = Number(req.query.serviceDays ?? 0);
    res.json(await coordinationService.details(kind, analyst, limit, serviceModule, serviceClient, serviceName, Number.isFinite(serviceDays) ? serviceDays : 0));
  } catch (error) {
    console.error("[coordination] Falha ao carregar detalhes:", error);
    res.status(500).json({ error: "Não foi possível carregar os detalhes da coordenação." });
  }
});

coordinationRoutes.get("/productivity-capacity", async (req: AuthenticatedRequest, res) => {
  try {
    const parsedDays = Number(req.query.days ?? 28);
    res.json(await coordinationService.productivityCapacity(Number.isFinite(parsedDays) ? parsedDays : 28));
  } catch (error) {
    console.error("[coordination] Falha ao montar capacidade produtiva:", error);
    res.status(500).json({ error: "Não foi possível gerar a capacidade produtiva." });
  }
});

coordinationRoutes.get("/services", async (req: AuthenticatedRequest, res) => {
  try {
    const client = typeof req.query.client === "string" ? req.query.client.trim() : undefined;
    const analyst = typeof req.query.analyst === "string" ? req.query.analyst.trim() : undefined;
    const parsedMonths = Number(req.query.months ?? 6);
    const months = Number.isFinite(parsedMonths) ? parsedMonths : 6;
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    res.json(await coordinationService.serviceIntelligence({ client, analyst, months, startDate, endDate }));
  } catch (error) {
    console.error("[coordination] Falha ao montar inteligência de serviços:", error);
    res.status(500).json({ error: "Não foi possível gerar a inteligência de serviços." });
  }
});

coordinationRoutes.get("/integration-details", async (req: AuthenticatedRequest, res) => {
  try {
    const rawKind = String(req.query.kind ?? "tickets");
    if (!["tickets", "links", "azure", "services"].includes(rawKind)) return res.status(400).json({ error: "Tipo de detalhe inválido." });
    const days = Number(req.query.days ?? 30);
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    res.json(await coordinationService.integrationDetails(rawKind as "tickets" | "links" | "azure" | "services", Number.isFinite(days) ? days : 30, startDate, endDate));
  } catch (error) {
    console.error("[coordination] Falha ao carregar registros das integrações:", error);
    res.status(500).json({ error: "Não foi possível carregar os registros desta integração." });
  }
});

coordinationRoutes.get("/integration-health", async (req: AuthenticatedRequest, res) => {
  try {
    const days = Number(req.query.days ?? 30);
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    res.json(await coordinationService.integrationHealth(Number.isFinite(days) ? days : 30, startDate, endDate));
  } catch (error) {
    console.error("[coordination] Falha ao consultar saúde das integrações:", error);
    res.status(500).json({ error: "Não foi possível consultar a saúde das integrações." });
  }
});

coordinationRoutes.get("/csat", async (req: AuthenticatedRequest, res) => {
  try {
    const days = Number(req.query.days ?? 180);
    res.json(await coordinationService.csatOverview(Number.isFinite(days) ? days : 180));
  } catch (error) {
    console.error("[coordination] Falha na análise CSAT:", error);
    res.status(500).json({ error: "Não foi possível gerar a análise de CSAT." });
  }
});

coordinationRoutes.get("/csat/details", async (req: AuthenticatedRequest, res) => {
  try {
    const days = Number(req.query.days ?? 180);
    const value = req.query.value === undefined ? undefined : Number(req.query.value);
    const minValue = req.query.minValue === undefined ? undefined : Number(req.query.minValue);
    res.json(await coordinationService.csatDetails(Number.isFinite(days) ? days : 180, {
      client: typeof req.query.client === "string" ? req.query.client : undefined,
      analyst: typeof req.query.analyst === "string" ? req.query.analyst : undefined,
      service: typeof req.query.service === "string" ? req.query.service : undefined,
      value: value !== undefined && Number.isFinite(value) ? value : undefined,
      commentsOnly: req.query.commentsOnly === "true",
      minValue: minValue !== undefined && Number.isFinite(minValue) ? minValue : undefined,
    }));
  } catch (error) {
    console.error("[coordination] Falha ao carregar detalhes CSAT:", error);
    res.status(500).json({ error: "Não foi possível carregar os detalhes de CSAT." });
  }
});

coordinationRoutes.get("/sla-investigation/:ticketId", async (req:AuthenticatedRequest,res)=>{
 try {
  const tier=req.query.tier==="VIP"?"VIP":"PADRAO";
  const result=await new SlaInvestigationService().byTicket(Number(req.params.ticketId),tier);
  if(result.status!==200) return res.status(result.status).json({message:result.message});
  return res.json(result);
 }catch(error){console.error("[sla-investigation] Erro de análise:",error);return res.status(500).json({message:"Não foi possível investigar o SLA deste atendimento."});}
});

coordinationRoutes.get("/sla-development", async (req: AuthenticatedRequest, res) => {
  try {
    const days = Number(req.query.days ?? 180);
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    res.json(await coordinationService.slaDevelopmentFlow(Number.isFinite(days) ? days : 180, startDate, endDate));
  } catch (error) {
    console.error("[coordination] Falha na análise SLA x desenvolvimento:", error);
    res.status(500).json({ error: "Não foi possível gerar a análise SLA x desenvolvimento." });
  }
});

coordinationRoutes.get("/summary", async (req: AuthenticatedRequest, res) => {
  try {
    const serviceDays = Number(req.query.serviceDays ?? 0);
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    res.json(await coordinationService.summary(req.auth!.userId, Number.isFinite(serviceDays) ? serviceDays : 0, startDate, endDate));
  }
  catch (error) { console.error("[coordination] Falha ao montar visão:", error); res.status(500).json({ error: "Não foi possível gerar a visão de coordenação." }); }
});
export { coordinationRoutes };
