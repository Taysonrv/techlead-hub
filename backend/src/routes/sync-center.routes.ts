import {
  Router,
} from "express";

import {
  SyncCenterController,
} from "../controllers/SyncCenterController";
import { requirePermission } from "../middlewares/roleMiddleware";

const syncCenterRoutes =
  Router();

syncCenterRoutes.use(requirePermission("imports"));

const controller =
  new SyncCenterController();

syncCenterRoutes.get(
  "/summary",
  controller.summary,
);

syncCenterRoutes.get(
  "/history",
  controller.history,
);

syncCenterRoutes.get(
  "/movidesk/:runId/errors",
  controller.errors,
);

export {
  syncCenterRoutes,
};
