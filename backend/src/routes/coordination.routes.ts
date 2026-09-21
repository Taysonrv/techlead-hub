import { Router } from "express";
import { requireRoles } from "../middlewares/roleMiddleware";
import { coordinationService } from "../services/CoordinationService";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";

const coordinationRoutes = Router();
coordinationRoutes.use(requireRoles("ADMIN", "COORDENADOR"));
coordinationRoutes.get("/details", async (req: AuthenticatedRequest, res) => {
  try {
    const kind = String(req.query.kind ?? "backlog");
    const analyst = typeof req.query.analyst === "string" ? req.query.analyst : undefined;
    const serviceModule = typeof req.query.serviceModule === "string" ? req.query.serviceModule : undefined;
    const serviceClient = typeof req.query.serviceClient === "string" ? req.query.serviceClient : undefined;
    const parsedLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
    res.json(await coordinationService.details(kind, analyst, limit, serviceModule, serviceClient));
  } catch (error) {
    console.error("[coordination] Falha ao carregar detalhes:", error);
    res.status(500).json({ error: "Não foi possível carregar os detalhes da coordenação." });
  }
});

coordinationRoutes.get("/services", async (req: AuthenticatedRequest, res) => {
  try {
    const client = typeof req.query.client === "string" ? req.query.client.trim() : undefined;
    const analyst = typeof req.query.analyst === "string" ? req.query.analyst.trim() : undefined;
    const parsedMonths = Number(req.query.months ?? 6);
    const months = Number.isFinite(parsedMonths) ? parsedMonths : 6;
    res.json(await coordinationService.serviceIntelligence({ client, analyst, months }));
  } catch (error) {
    console.error("[coordination] Falha ao montar inteligência de serviços:", error);
    res.status(500).json({ error: "Não foi possível gerar a inteligência de serviços." });
  }
});

coordinationRoutes.get("/summary", async (req: AuthenticatedRequest, res) => {
  try { res.json(await coordinationService.summary(req.auth!.userId)); }
  catch (error) { console.error("[coordination] Falha ao montar visão:", error); res.status(500).json({ error: "Não foi possível gerar a visão de coordenação." }); }
});
export { coordinationRoutes };
