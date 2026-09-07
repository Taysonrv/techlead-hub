import {
  Router,
} from "express";

import {
  AzureWorkItemController,
} from "../controllers/AzureWorkItemController";

const azureWorkItemRoutes =
  Router();

const controller =
  new AzureWorkItemController();

azureWorkItemRoutes.get(
  "/",
  controller.list,
);

azureWorkItemRoutes.get(
  "/summary",
  controller.summary,
);

azureWorkItemRoutes.get(
  "/filters",
  controller.filters,
);

/*
 * Deve permanecer antes de "/:id", pois "versions" não é
 * um identificador numérico de Work Item.
 */
azureWorkItemRoutes.get(
  "/versions/summary",
  controller.versionsSummary,
);

azureWorkItemRoutes.get(
  "/productivity/analysts",
  controller.analystProductivity,
);

azureWorkItemRoutes.get(
  "/:id",
  controller.detail,
);

export {
  azureWorkItemRoutes,
};
