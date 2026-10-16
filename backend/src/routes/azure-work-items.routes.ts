import {
  Router,
} from "express";

import {
  AzureWorkItemController,
} from "../controllers/AzureWorkItemController";
import { requireAnyPermission } from "../middlewares/routinePermissionMiddleware";
import { prisma } from "../database/prisma";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware";
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

// Acompanhamento local individual. Não modifica seguidores do Azure.
azureWorkItemRoutes.get("/following", azureReadAccess, async (request: AuthenticatedRequest, response) => {
  const userId = request.auth?.userId;
  if (!userId) return response.status(401).json({ message: "Autenticação necessária." });
  const rows = await prisma.$queryRaw<Array<{ workItemId: number; followedAt: Date }>>`
    SELECT "workItemId", "followedAt" FROM "AzureWorkItemFollow"
    WHERE "userId" = ${userId} ORDER BY "followedAt" DESC
  `;
  const records = rows.length ? await prisma.azureWorkItem.findMany({
    where: scopedAzureWhere({ id: { in: rows.map(row => row.workItemId) } }),
    select: { id: true, title: true, state: true, workItemType: true, azureChangedAt: true },
  }) : [];
  const info = new Map(records.map(item => [item.id, item]));
  return response.json({ items: rows.map(row => ({ ...row, workItem: info.get(row.workItemId) ?? null })) });
});

azureWorkItemRoutes.put("/:id/follow", azureReadAccess, async (request: AuthenticatedRequest, response) => {
  const userId = request.auth?.userId;
  const id = Number(request.params.id);
  if (!userId) return response.status(401).json({ message: "Autenticação necessária." });
  if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ message: "Task inválida." });
  const item = await prisma.azureWorkItem.findFirst({ where: scopedAzureWhere({ id }), select: { id: true, revision: true } });
  if (!item) return response.status(404).json({ message: "Task não encontrada no escopo SIMER." });
  await prisma.$executeRaw`
    INSERT INTO "AzureWorkItemFollow" ("userId", "workItemId", "lastSeenRevision")
    VALUES (${userId}, ${id}, ${item.revision}) ON CONFLICT ("userId","workItemId") DO NOTHING
  `;
  return response.json({ following: true, workItemId: id });
});

azureWorkItemRoutes.delete("/:id/follow", azureReadAccess, async (request: AuthenticatedRequest, response) => {
  const userId = request.auth?.userId;
  const id = Number(request.params.id);
  if (!userId) return response.status(401).json({ message: "Autenticação necessária." });
  if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ message: "Task inválida." });
  await prisma.$executeRaw`DELETE FROM "AzureWorkItemFollow" WHERE "userId" = ${userId} AND "workItemId" = ${id}`;
  return response.json({ following: false, workItemId: id });
});

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

azureWorkItemRoutes.get(
  "/:id",
  azureReadAccess,
  controller.detail,
);

export {
  azureWorkItemRoutes,
};
