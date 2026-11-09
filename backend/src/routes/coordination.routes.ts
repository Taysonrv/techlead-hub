import { Router } from "express";
import ExcelJS from "exceljs";
import { bomJesusReport } from "../services/BomJesusReportService";
import { isBugToAdequacao } from "../services/TicketCategoryHistoryService";
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
const bomJesusDates = (req: AuthenticatedRequest) => ({
  startDate: typeof req.query.startDate === "string" ? req.query.startDate : "2026-06-01",
  endDate: typeof req.query.endDate === "string" ? req.query.endDate : new Date().toISOString().slice(0, 10),
});
coordinationRoutes.get("/bom-jesus-report", async (req: AuthenticatedRequest, res) => {
  try { res.json(await bomJesusReport(bomJesusDates(req).startDate, bomJesusDates(req).endDate)); }
  catch (error) {
    if (error instanceof Error && error.message.startsWith("Período inválido")) return res.status(400).json({ error: error.message });
    console.error("[coordination] Relatório Bom Jesus:", error);
    res.status(500).json({ error: "Não foi possível gerar o relatório Bom Jesus." });
  }
});
coordinationRoutes.get("/bom-jesus-report.xlsx", async (req: AuthenticatedRequest, res) => {
  try {
    const { startDate, endDate } = bomJesusDates(req);
    const report = await bomJesusReport(startDate, endDate);
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
      ["Bugs confirmados", "Pendente de validação do tipo de Task"],
      ["Tasks de correção vinculadas", report.totals.linkedCorrectionTasks],
      ["Tasks de correção com versão vinculada", report.totals.deliveredCorrectionTasks],
      ["Transições observadas Bug → Adequação", report.totals.reclassified],
      ["Tickets com histórico de categoria registrado", report.totals.categoryHistoryCoverage],
      ["Categorias de abertura verificadas", "Não disponíveis na API de tickets"],
      ["Grupos de assuntos recorrentes", report.totals.recurrenceGroups],
      ["OLA do Suporte excedido (Task de correção)", report.totals.olaBreaches],
    ]);
    const detail = book.addWorksheet("Tickets e evidências");
    detail.addRow(["Ticket", "Assunto", "Cliente", "Abertura", "Situação", "Categoria", "Task", "Tipo Task", "Classificação indicativa", "Vistra ou relatório", "Grupo de recorrência", "Tamanho grupo", "Ações sincronizadas", "Primeira menção Produto", "OLA", "Observação", "Estado da Task", "Versão entregue", "Criação da Task", "Tempo Suporte (min)", "Meta Suporte (min)", "OLA excedido", "Data observada Bug → Adequação", "Evidência da transição", "Tipo de falha Vistra/relatório", "Evidência de recorrência", "Primeira categoria observada", "Data primeira observação", "Origem primeira observação", "Categoria na abertura comprovada?"]);
    for (const x of report.rows) detail.addRow([x.id, x.subject, x.client, x.createdDate, x.status, x.category, x.taskNumber, x.taskType, x.classification, x.vistra ? "Sim — validar" : "Não identificado", x.recurrenceKey, x.recurrenceCount, x.actionCount, x.firstProductEvidence, x.ola, x.evidence, x.taskState, x.deliveredVersion, x.taskCreatedAt, x.supportMinutes, x.supportTargetMinutes, x.supportOlaBreached === null ? "Não calculável" : x.supportOlaBreached ? "Sim" : "Não", x.categoryChangedAt, x.categoryChangeEvidence, x.vistraType, x.recurrenceEvidence, x.initialObservedCategory, x.initialObservedAt, x.initialSource, x.openingCategoryVerified ? "Sim" : "Não"]);
    const categorySheet = book.addWorksheet("Histórico de Categorias");
    categorySheet.addRow(["Ticket", "Assunto", "Tipo", "Categoria anterior", "Categoria observada", "Capturado em (HUB)", "Atualização remota do ticket", "Fonte", "Bug para Adequação?", "Categoria na abertura comprovada?"]);
    for (const x of report.rows) {
      if (!x.categoryHistory.length) {
        categorySheet.addRow([x.id, x.subject, "SEM HISTÓRICO", null, x.category, null, null, "Sem observação", "Não", "Não"]);
      }
      for (const event of x.categoryHistory) {
        categorySheet.addRow([x.id, x.subject, event.kind === "BASELINE" ? "PRIMEIRA OBSERVAÇÃO" : "ALTERAÇÃO OBSERVADA",
          event.previousCategory, event.category, event.observedAt, event.sourceLastUpdate,
          event.source,
          isBugToAdequacao(event) ? "Sim" : "Não",
          "Não",
        ]);
      }
    }
    const trend = book.addWorksheet("Periodicidade");
    trend.addRow(["Mês", "Tickets", "Candidatos Vistra / relatórios"]);
    for (const x of report.monthly) trend.addRow([x.month, x.tickets, x.vistra]);
    for (const sheet of book.worksheets) {
      sheet.views = [{ state: "frozen", ySplit: sheet.name === "Resumo" ? 0 : 1 }];
      sheet.getRow(sheet.name === "Resumo" ? 6 : 1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(sheet.name === "Resumo" ? 6 : 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF146C43" } };
      sheet.columns.forEach(col => { col.width = 25; });
      if (sheet.name === "Tickets e evidências") {
        sheet.getColumn(2).width = 55; sheet.getColumn(16).width = 55; sheet.getColumn(30).width = 26;
        sheet.autoFilter = { from: "A1", to: "AD1" };
      }
      if (sheet.name === "Histórico de Categorias") {
        sheet.getColumn(2).width = 55; sheet.getColumn(3).width = 27; sheet.getColumn(8).width = 23;
        sheet.autoFilter = { from: "A1", to: "J1" };
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
