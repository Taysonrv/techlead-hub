import { Router } from "express";
import { MovideskController } from "../controllers/MovideskController";
import { requirePermission } from "../middlewares/roleMiddleware";
import { prisma } from "../database/prisma";

export const movideskRoutes = Router();
const controller = new MovideskController();

movideskRoutes.post("/sync", requirePermission("imports"), controller.sync.bind(controller));

movideskRoutes.post("/baseline/start", requirePermission("imports"), controller.startBaseline.bind(controller));
movideskRoutes.get("/baseline/status", requirePermission("imports"), controller.baselineStatus.bind(controller));
movideskRoutes.get("/coverage", requirePermission("imports"), controller.coverage.bind(controller));
movideskRoutes.post("/sync/full", requirePermission("imports"), controller.fullSync.bind(controller));
movideskRoutes.get("/test", requirePermission("imports"), controller.test.bind(controller));
movideskRoutes.get("/scope/diagnostic", requirePermission("imports"), controller.diagnoseScope.bind(controller));
movideskRoutes.get("/enrichment/diagnostic", requirePermission("imports"), controller.diagnoseEnrichment.bind(controller));
movideskRoutes.get("/enrichment/recent", requirePermission("imports"), controller.recentEnrichments.bind(controller));
movideskRoutes.post("/enrichment/sync", requirePermission("imports"), controller.syncEnrichment.bind(controller));
movideskRoutes.post("/causes/backfill", requirePermission("imports"), controller.backfillCauses.bind(controller));
movideskRoutes.get("/classifications/coverage", requirePermission("imports"), controller.classificationCoverage.bind(controller));
movideskRoutes.get("/metadata/timeline", requirePermission("imports"), controller.analyticalMetadataTimeline.bind(controller));
movideskRoutes.get("/metadata/diagnostic", requirePermission("imports"), controller.diagnoseAnalyticalMetadata.bind(controller));
movideskRoutes.get("/catalog/diagnostic", requirePermission("imports"), controller.diagnoseApiCatalog.bind(controller));
movideskRoutes.post("/reference-sync", requirePermission("imports"), controller.syncReferenceData.bind(controller));
movideskRoutes.get("/reference-sync/status", requirePermission("imports"), controller.referenceSyncStatus.bind(controller));
movideskRoutes.get("/preview", requirePermission("imports"), controller.preview.bind(controller));

/**
 * Auditoria somente leitura das solicitações de encerramento feitas nas ações
 * Movidesk. Os resultados são candidatos e exigem conferência do autor/contexto.
 */
movideskRoutes.get("/closure-requests", requirePermission("attention"), async (request, response) => {
  const client = typeof request.query.client === "string" ? request.query.client.trim() : "Bom Jesus";
  if (client.length < 3 || client.length > 80) {
    return response.status(400).json({ message: "Informe um cliente válido." });
  }
  try {
    const tickets = await prisma.ticket.findMany({
      where: { client: { contains: client, mode: "insensitive" }, isDeleted: false },
      select: {
        id: true, movideskId: true, subject: true, client: true, contact: true,
        status: true, baseStatus: true, closedDate: true, canceledDate: true,
        actions: {
          where: { isDeleted: false },
          select: { movideskActionId: true, description: true, createdDate: true, createdByName: true },
          orderBy: { createdDate: "desc" },
        },
      },
      orderBy: { movideskId: "desc" },
      take: 5000,
    });
    const positive = /(?:pode(?:m|mos)?\\s+(?:baixar|cancelar|encerrar|fechar)|(?:solicito|solicitamos|peço|pedimos|favor|por favor)\\s+(?:(?:a|o)\\s+)?(?:baixa|cancelamento|encerramento)|(?:ticket|chamado|atendimento)\\s+(?:pode\\s+ser|seja|deve\\s+ser)\\s+(?:baixado|cancelado|encerrado|fechado)|(?:não\\s+(?:precisa|é\\s+necessário)\\s+mais\\s+(?:do|desse)\\s+(?:ticket|chamado|atendimento)))/i;
    const negative = /(?:não\\s+(?:pode|podemos|consigo|conseguimos)\\s+(?:baixar|cancelar|encerrar)|(?:cancelar|baixar|encerrar)\\s+(?:a\\s+)?(?:nota|nf-e|nfe|pedido|contrato|título|romaneio|documento))/i;
    const results = tickets.flatMap((ticket) => {
      const matches = ticket.actions.filter((action) => {
        const value = (action.description ?? "").replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim();
        return positive.test(value) && !negative.test(value);
      });
      if (!matches.length) return [];
      const action = matches[0];
      const text = (action.description ?? "").replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim();
      const open = !["Closed", "Resolved", "Canceled", "Cancelled"].includes(ticket.baseStatus ?? "");
      return [{
        ticketId: ticket.movideskId, subject: ticket.subject, client: ticket.client,
        contact: ticket.contact, status: ticket.status, baseStatus: ticket.baseStatus,
        stillOpen: open, evidence: text.slice(0, 320),
        actionDate: action.createdDate, actionAuthor: action.createdByName,
        actionId: action.movideskActionId, matchingActions: matches.length,
        needsAuthorVerification: true,
      }];
    });
    return response.json({
      client, checkedTickets: tickets.length, enrichedTickets: tickets.filter(t => t.actions.length > 0).length,
      coverageLimited: tickets.length === 5000,
      totalCandidates: results.length,
      openCandidates: results.filter(row => row.stillOpen).length,
      closedCandidates: results.filter(row => !row.stillOpen).length,
      disclaimer: "Correspondências textuais preliminares. Verifique autoria, contexto e cobertura de ações antes de concluir que o cliente pediu encerramento.",
      items: results,
    });
  } catch {
    return response.status(503).json({ message: "Não foi possível consultar o histórico sincronizado de ações." });
  }
});
