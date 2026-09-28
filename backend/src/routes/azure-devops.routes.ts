import {
  Router,
} from "express";

import {
  AzureDevOpsController,
} from "../controllers/AzureDevOpsController";
import { requirePermission } from "../middlewares/roleMiddleware";

const azureDevOpsRoutes =
  Router();

const azureDevOpsController =
  new AzureDevOpsController();

/* =========================================================
   STATUS / DIAGNÓSTICO
========================================================= */

azureDevOpsRoutes.get(
  "/status",
  requirePermission("imports"),
  azureDevOpsController.status,
);

/* =========================================================
   WORK ITEMS
========================================================= */

azureDevOpsRoutes.get(
  "/work-items/discover",
  azureDevOpsController.discoverWorkItems,
);

azureDevOpsRoutes.post(
  "/work-items/batch",
  requirePermission("imports"),
  azureDevOpsController.batchWorkItems,
);

azureDevOpsRoutes.get(
  "/work-items/:id",
  azureDevOpsController.workItem,
);

/* =========================================================
   SINCRONIZAÇÃO
========================================================= */

azureDevOpsRoutes.post(
  "/sync/work-items",
  requirePermission("imports"),
  azureDevOpsController.syncWorkItems,
);

azureDevOpsRoutes.post(
  "/sync/full",
  requirePermission("imports"),
  azureDevOpsController.syncFull,
);

azureDevOpsRoutes.post(
  "/sync/incremental",
  requirePermission("imports"),
  azureDevOpsController.syncIncremental,
);

/* =========================================================
   WIKI
========================================================= */

azureDevOpsRoutes.get(
  "/wiki",
  requirePermission("knowledge"),
  azureDevOpsController.wikiList,
);

azureDevOpsRoutes.get(
  "/wiki/search",
  requirePermission("knowledge"),
  azureDevOpsController.wikiSearch,
);

azureDevOpsRoutes.get(
  "/wiki/pages/:pageId",
  requirePermission("knowledge"),
  azureDevOpsController.wikiPage,
);

export {
  azureDevOpsRoutes,
};
