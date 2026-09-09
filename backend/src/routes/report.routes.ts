import {
  Router,
} from "express";

import {
  ReportController,
} from "../controllers/ReportController";

const reportRoutes =
  Router();

const controller =
  new ReportController();

reportRoutes.get(
  "/executive.xlsx",
  controller.executiveExcel,
);

export {
  reportRoutes,
};
