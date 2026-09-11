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
  "/filters",
  controller.filters,
);

reportRoutes.get(
  "/:scope.xlsx",
  controller.excelFile,
);

reportRoutes.get(
  "/:scope.pdf",
  controller.pdfFile,
);

export {
  reportRoutes,
};
