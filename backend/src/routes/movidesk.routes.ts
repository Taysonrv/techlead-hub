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
movideskRoutes.get("/closure-requests/clients", requirePermission("attention"), async (_request, response) => {
  try {
    const values = await prisma.ticket.findMany({
      where: { isDeleted: false, client: { not: null } },
      distinct: ["client"], select: { client: true }, orderBy: { client: "asc" },
    });
    return response.json({ clients: values.map(row => row.client).filter((name): name is string => Boolean(name?.trim())) });
  } catch {
    return response.status(503).json({ message: "Não foi possível consultar a carteira de clientes." });
  }
});

movideskRoutes.get("/closure-requests", requirePermission("attention"), async (request, response) => {
  const client = typeof request.query.client === "string" ? request.query.client.trim() : "Bom Jesus";
  const allClients = client === "__all__";
  if (!allClients && (client.length < 2 || client.length > 80)) {
    return response.status(400).json({ message: "Informe um cliente válido." });
  }
  try {
    const tickets = await prisma.ticket.findMany({
      where: { ...(allClients ? {} : { client: { equals: client, mode: "insensitive" as const } }), isDeleted: false },
      select: {
        id: true, movideskId: true, subject: true, client: true, contact: true,
        status: true, baseStatus: true, closedDate: true, canceledDate: true, owner: true, ownerTeam: true,
        actions: {
          where: { isDeleted: false },
          select: { movideskActionId: true, description: true, createdDate: true, createdByName: true },
          orderBy: { createdDate: "desc" },
        },
      },
      orderBy: { movideskId: "desc" },
      take: 5000,
    });
    // Pedidos explícitos de encerramento do atendimento; ocorrências são
    // hipóteses auditáveis, nunca autorizações confirmadas automaticamente.
    const normalizeText = (value: string) => value
      .replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ")
      .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
      .replace(/\\s+/g, " ").trim().toLowerCase();
    const positive = [
      /\\b(?:pode|podem|podemos|poderiam|poderia|favor|solicito|solicitamos|peco|pedimos)\\b.{0,50}\\b(?:baixar|baixa|cancelar|cancelamento|encerrar|encerramento|fechar|fechamento|concluir|conclusao|finalizar|finalizacao)\\b/,
      /\\b(?:ticket|tkt|chamado|atendimento|solicitacao)\\b.{0,60}\\b(?:pode ser|pode ficar|seja|esta|estaria|foi)\\s+(?:baixado|cancelado|encerrado|fechado|concluido|finalizado)\\b/,
      /\\b(?:assunto|problema|caso|situacao)\\s+(?:ja\\s+)?(?:foi|esta|ficou)\\s+(?:resolvido|solucionado|normalizado)\\b/,
      /\\b(?:nao precisamos mais|nao e mais necessario|nao ha mais necessidade|nao sera mais necessario|pode desconsiderar|desconsiderem)\\b.{0,65}\\b(?:ticket|chamado|atendimento|solicitacao|pedido de suporte)\\b/,
      /\\b(?:podem dar baixa|pode dar baixa|autorizo o encerramento|autorizamos o encerramento|sem necessidade de continuidade|podem finalizar|pode concluir)\\b/,
    ];
    const negative = [
      /\\b(?:nao|nunca|sem)\\s+(?:pode|podemos|consigo|conseguimos|autoriza|autorizamos|solicito)\\s+(?:baixar|cancelar|encerrar|fechar|concluir|finalizar)\\b/,
      /\\b(?:cancelar|baixar|encerrar|fechar|concluir)\\s+(?:a|o|uma|um)\\s+(?:nota|nf-e|nfe|pedido|contrato|titulo|romaneio|documento|op|receita|boleto|parcela)\\b/,
      /\\b(?:erro|falha|problema|duvida|como|nao consegue|nao consigo)\\b.{0,35}\\b(?:baixar|cancelar|encerrar)\\b/,
    ];
    const results = tickets.map((ticket) => {
      const matches = ticket.actions.filter((action) => {
        const value = (action.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        return positive.test(value) && !negative.test(value);
      });
      const action = matches[0];
      const evidence = (action?.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const stillOpen = !["Closed", "Resolved", "Canceled", "Cancelled"].includes(ticket.baseStatus ?? "");
      // A classificação utiliza a equipe atual do Movidesk e não o texto da ação.
      // Equipes não reconhecidas permanecem em "Outros", sem inferência automática.
      const teamText = (ticket.ownerTeam ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const area = /produto|product/.test(teamText) ? "Produto"
        : /suporte|sustentacao|support/.test(teamText) ? "Suporte" : "Outros";
      return {
        ticketId: ticket.movideskId, subject: ticket.subject, client: ticket.client,
        contact: ticket.contact, status: ticket.status, baseStatus: ticket.baseStatus,
        owner: ticket.owner, ownerTeam: ticket.ownerTeam, area,
        stillOpen, hasClosureRequest: Boolean(action), hasActions: ticket.actions.length > 0, evidence: evidence.slice(0, 320),
        actionDate: action?.createdDate ?? null, actionAuthor: action?.createdByName ?? null,
        actionId: action?.movideskActionId ?? null, matchingActions: matches.length,
        needsAuthorVerification: Boolean(action),
      };
    });
    const candidates = results.filter(row => row.hasClosureRequest);
    return response.json({
      client: allClients ? "Toda a carteira" : client, checkedTickets: tickets.length, enrichedTickets: tickets.filter(t => t.actions.length > 0).length,
      coverageLimited: tickets.length === 5000,
      totalCandidates: candidates.length,
      openCandidates: candidates.filter(row => row.stillOpen).length,
      closedCandidates: candidates.filter(row => !row.stillOpen).length,
      openWithProduct: results.filter(row => row.stillOpen && row.area === "Produto").length,
      openWithSupport: results.filter(row => row.stillOpen && row.area === "Suporte").length,
      authorizedOpenWithProduct: candidates.filter(row => row.stillOpen && row.area === "Produto").length,
      authorizedOpenWithSupport: candidates.filter(row => row.stillOpen && row.area === "Suporte").length,
      disclaimer: "Abrange todos os tickets sincronizados do cliente até o limite informado. Solicitações identificadas são candidatas textuais; verifique autoria, contexto e cobertura antes de concluir autorização. Equipes não classificadas aparecem em Outros.",
      items: results,
    });
  } catch {
    return response.status(503).json({ message: "Não foi possível consultar o histórico sincronizado de ações." });
  }
});
