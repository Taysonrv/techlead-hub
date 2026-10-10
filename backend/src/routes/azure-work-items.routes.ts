import {
  Router,
} from "express";

import {
  AzureWorkItemController,
} from "../controllers/AzureWorkItemController";
import { requireAnyPermission } from "../middlewares/routinePermissionMiddleware";
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

azureWorkItemRoutes.get(
  "/:id",
  azureReadAccess,
  controller.detail,
);

export {
  azureWorkItemRoutes,
};
