import {
  Router,
} from "express";

import {
  SyncCenterController,
} from "../controllers/SyncCenterController";

const syncCenterRoutes =
  Router();

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

export {
  syncCenterRoutes,
};
