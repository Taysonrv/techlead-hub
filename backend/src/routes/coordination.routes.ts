import { Router } from "express";
import { requireRoles } from "../middlewares/roleMiddleware";
import { coordinationService } from "../services/CoordinationService";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";

const coordinationRoutes = Router();
coordinationRoutes.use(requireRoles("ADMIN", "COORDENADOR"));
coordinationRoutes.get("/summary", async (req: AuthenticatedRequest, res) => {
  try { res.json(await coordinationService.summary(req.auth!.userId)); }
  catch (error) { console.error("[coordination] Falha ao montar visão:", error); res.status(500).json({ error: "Não foi possível gerar a visão de coordenação." }); }
});
export { coordinationRoutes };
