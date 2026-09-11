import {
  Router,
} from "express";

import {
  AzureDevOpsController,
} from "../controllers/AzureDevOpsController";
import { requireRoles } from "../middlewares/roleMiddleware";

const azureDevOpsRoutes =
  Router();

const azureDevOpsController =
  new AzureDevOpsController();

/* =========================================================
   STATUS / DIAGNÓSTICO
========================================================= */

azureDevOpsRoutes.get(
  "/status",
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
  requireRoles("ADMIN", "COORDENADOR"),
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
  requireRoles("ADMIN", "COORDENADOR"),
  azureDevOpsController.syncWorkItems,
);

azureDevOpsRoutes.post(
  "/sync/full",
  requireRoles("ADMIN", "COORDENADOR"),
  azureDevOpsController.syncFull,
);

azureDevOpsRoutes.post(
  "/sync/incremental",
  requireRoles("ADMIN", "COORDENADOR"),
  azureDevOpsController.syncIncremental,
);

/* =========================================================
   WIKI
========================================================= */

azureDevOpsRoutes.get(
  "/wiki",
  azureDevOpsController.wikiList,
);

azureDevOpsRoutes.get(
  "/wiki/search",
  azureDevOpsController.wikiSearch,
);

azureDevOpsRoutes.get(
  "/wiki/pages/:pageId",
  azureDevOpsController.wikiPage,
);

export {
  azureDevOpsRoutes,
};
