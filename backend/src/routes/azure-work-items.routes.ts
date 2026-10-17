import {
  Router,
} from "express";
import { AzureFollowService } from "../services/AzureFollowService";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";

import {
  AzureWorkItemController,
} from "../controllers/AzureWorkItemController";
import { requireAnyPermission } from "../middlewares/routinePermissionMiddleware";
import { prisma } from "../database/prisma";
import { scopedAzureWhere } from "../domain/OperationalScope";
import { CorrectionMonthlyReportController } from "../controllers/CorrectionMonthlyReportController";

const azureWorkItemRoutes =
  Router();

const controller =
  new AzureWorkItemController();
const correctionReportController = new CorrectionMonthlyReportController();

const azureReadAccess = requireAnyPermission(
  "corrections", "evolutions", "support", "versions", "tickets",
  "my-operation", "data-quality", "performance", "coordination",
);

azureWorkItemRoutes.get(
  "/",
  azureReadAccess,
  controller.list,
);

azureWorkItemRoutes.get(
  "/summary",
  azureReadAccess,
  controller.summary,
);

azureWorkItemRoutes.get(
  "/filters",
  azureReadAccess,
  controller.filters,
);

/*
 * Deve permanecer antes de "/:id", pois "versions" não é
 * um identificador numérico de Work Item.
 */
azureWorkItemRoutes.get(
  "/corrections/monthly-report",
  requireAnyPermission("corrections", "coordination"),
  correctionReportController.get,
);

azureWorkItemRoutes.get(
  "/versions/summary",
  requireAnyPermission("versions"),
  controller.versionsSummary,
);

azureWorkItemRoutes.get(
  "/productivity/analysts",
  requireAnyPermission("performance", "coordination", "analysts"),
  controller.analystProductivity,
);


// Acompanhamento por usuário autenticado; sempre respeita a carteira SIMER.
const followService = new AzureFollowService();
azureWorkItemRoutes.get("/following/mine", azureReadAccess, async (req: AuthenticatedRequest, res) => {
  if (!req.auth?.userId) { res.status(401).json({message:"Autenticação necessária."}); return; }
  const items = await followService.list(req.auth.userId);
  res.json({items});
});
azureWorkItemRoutes.get("/:id/follow", azureReadAccess, async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!req.auth?.userId) { res.status(401).json({message:"Autenticação necessária."}); return; }
  if (!Number.isSafeInteger(id) || id<=0) { res.status(400).json({message:"ID inválido."}); return; }
  const value = await followService.get(req.auth.userId,id);
  if (!value) { res.status(404).json({message:"Tarefa fora da carteira ou inexistente."}); return; }
  res.json(value);
});
for (const [method, following] of [["put",true],["delete",false]] as const) {
  azureWorkItemRoutes[method]("/:id/follow", azureReadAccess, async (req: AuthenticatedRequest,res) => {
    const id = Number(req.params.id);
    if (!req.auth?.userId) { res.status(401).json({message:"Autenticação necessária."}); return; }
    if (!Number.isSafeInteger(id) || id<=0) { res.status(400).json({message:"ID inválido."}); return; }
    const value = await followService.set(req.auth.userId,id,following);
    if (!value) { res.status(404).json({message:"Tarefa fora da carteira ou inexistente."}); return; }
    res.json(value);
  });
}

azureWorkItemRoutes.get(
  "/:id",
  azureReadAccess,
  controller.detail,
);

export {
  azureWorkItemRoutes,
};
