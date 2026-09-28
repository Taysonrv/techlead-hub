import {
  Router,
} from "express";

import {
  AzureSyncController,
} from "../controllers/AzureSyncController";
import { requirePermission } from "../middlewares/roleMiddleware";

/* =========================================================
   ROUTER
========================================================= */

const azureSyncRoutes =
  Router();

azureSyncRoutes.use(requirePermission("imports"));

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
