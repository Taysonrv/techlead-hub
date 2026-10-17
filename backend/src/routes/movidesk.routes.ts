import { Router } from "express";
import { MovideskController } from "../controllers/MovideskController";
import { requirePermission } from "../middlewares/roleMiddleware";
import { prisma } from "../database/prisma";
import { SIMER_CLIENTS, SIMER_CLIENT_SCOPE_NAMES, resolveSimerClient } from "../domain/OperationalScope";

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
movideskRoutes.get("/closure-requests/clients", requirePermission("attention"), (_request, response) => {
  // Fonte única de verdade utilizada pela operação SIMER; não listar contatos.
  return response.json({ clients: [...SIMER_CLIENTS] });
});

movideskRoutes.get("/closure-requests", requirePermission("attention"), async (request, response) => {
  const client = typeof request.query.client === "string" ? request.query.client.trim() : "Bom Jesus";
  const allClients = client === "__all__";
  const canonical = allClients ? null : resolveSimerClient(client);
  const allowedNames = allClients
    ? SIMER_CLIENT_SCOPE_NAMES
    : SIMER_CLIENT_SCOPE_NAMES.filter((name) => resolveSimerClient(name) === canonical);
  if (!allClients && (!canonical || client.length > 120)) {
    return response.status(400).json({ message: "Informe um cliente válido." });
  }
  try {
    const tickets = await prisma.ticket.findMany({
      where: { client: { in: allowedNames, mode: "insensitive" }, isDeleted: false },
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
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ").trim().toLowerCase();
    // Somente pedidos explícitos sobre ESTE atendimento; explicações sobre
    // concluir processos, finalizar chamados antigos ou cancelar documentos
    // não caracterizam autorização de baixa do ticket atual.
    const explicit = [
      /\b(?:pode|podem|podemos|poderia|poderiam|autorizo|autorizamos|solicito|solicitamos|peco|pedimos)\b.{0,32}\b(?:encerrar|encerramento|fechar|fechamento|baixar|baixa|cancelar|cancelamento|concluir|finalizar)\b.{0,35}\b(?:este|esse|o|do|deste|desse)?\s*(?:ticket|tkt|chamado|atendimento|solicitacao)\b/,
      /\b(?:este|esse|o|deste|desse)\s+(?:ticket|tkt|chamado|atendimento|solicitacao)\b.{0,35}\b(?:pode|podem|deve|favor|solicito)\b.{0,22}\b(?:ser\s+)?(?:encerrado|fechado|baixado|cancelado|concluido|finalizado|encerrar|fechar|baixar|cancelar|concluir|finalizar)\b/,
      /\b(?:solicito|solicitamos|peco|pedimos)\s+(?:o|a)?\s*(?:encerramento|fechamento|baixa|cancelamento|conclusao|finalizacao)\s+(?:do|deste|desse)\s+(?:ticket|tkt|chamado|atendimento)\b/,
      /\b(?:podem|pode)\s+(?:dar\s+)?(?:baixa|encerrar|fechar|cancelar|concluir|finalizar)\s+(?:o|este|esse)?\s*(?:ticket|tkt|chamado|atendimento)\b/,
      /\b(?:nao precisamos mais|nao e mais necessario|nao ha mais necessidade|podem desconsiderar)\b.{0,35}\b(?:este|esse|o)\s+(?:ticket|tkt|chamado|atendimento)\b/,
      /\b(?:pode|podem)\s+(?:dar\s+)?(?:baixa|encerrar|fechar|cancelar|concluir|finalizar)\s+(?:por ai|por aqui|mesmo|entao)\b/,
      /\b(?:solicito|solicitamos)\s+(?:o|a)?\s*(?:encerramento|fechamento|baixa)\s+(?:do|da)\s+(?:ticket|chamado|atendimento)\b/,
    ];
    const negative = [
      /\b(?:nao|nunca|sem)\s+(?:pode|podemos|consigo|conseguimos|autoriza|autorizamos)\s+(?:baixar|cancelar|encerrar|fechar|concluir|finalizar)\b/,
      /\b(?:cancelar|baixar|encerrar|fechar|concluir)\s+(?:a|o|uma|um)\s+(?:nota|nf-e|nfe|pedido|contrato|titulo|romaneio|documento|op|receita|boleto|parcela|lancamento)\b/,
      /\b(?:ticket|chamado|atendimento)\s*(?:n[ºo.]?\s*)?\d{4,}\b.{0,90}\b(?:foi|esta|ficou|ja foi)\s+(?:encerrado|finalizado|fechado)\b/,
      /\b(?:ticket|chamado|atendimento)\b.{0,35}\b(?:foi|ja havia sido|ja foi)\s+(?:encerrado|finalizado|fechado)\b.{0,90}\b(?:problema persiste|continua ocorrendo|persiste|voltou a ocorrer)\b/,
    ];
    const evidenceFor = (description: string) => {
      const original = description.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
      const normalized = normalizeText(original);
      if (negative.some(pattern => pattern.test(normalized))) return null;
      const match = explicit.map(pattern => pattern.exec(normalized)).find(Boolean);
      if (!match || match.index === undefined) return null;
      // Preservar trecho relevante mesmo em interações extensas. Em textos
      // com acentos, o índice normalizado pode deslocar alguns caracteres;
      // o texto de evidência é apenas indicativo e não substitui o original.
      const from = Math.max(0, match.index - 65);
      const to = Math.min(original.length, match.index + match[0].length + 90);
      return (from ? "…" : "") + original.slice(from, to) + (to < original.length ? "…" : "");
    };
    const results = tickets.map((ticket) => {
      const matches = ticket.actions.map((action) => ({
        action, evidence: evidenceFor(action.description ?? ""),
      })).filter((record) => record.evidence !== null);
      const chosen = matches[0];
      const action = chosen?.action;
      const evidence = chosen?.evidence ?? "";
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
      client: allClients ? "Toda a carteira SIMER" : canonical, checkedTickets: tickets.length, enrichedTickets: tickets.filter(t => t.actions.length > 0).length,
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
