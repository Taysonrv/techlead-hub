import {
  Router,
} from "express";

import {
  AzureSyncController,
} from "../controllers/AzureSyncController";

/* =========================================================
   ROUTER
========================================================= */

const azureSyncRoutes =
  Router();

const controller =
  new AzureSyncController();

/* =========================================================
   STATUS / MONITORAMENTO

   Rota final:
   GET /api/azure-sync/status
========================================================= */

azureSyncRoutes.get(
  "/status",
  controller.status,
);

export {
  azureSyncRoutes,
};
