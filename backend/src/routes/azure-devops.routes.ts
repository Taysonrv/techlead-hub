import {
  Router,
} from "express";

import {
  AzureDevOpsController,
} from "../controllers/AzureDevOpsController";

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
  azureDevOpsController.syncWorkItems,
);

azureDevOpsRoutes.post(
  "/sync/full",
  azureDevOpsController.syncFull,
);

azureDevOpsRoutes.post(
  "/sync/incremental",
  azureDevOpsController.syncIncremental,
);

/* =========================================================
   WIKI
========================================================= */

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
