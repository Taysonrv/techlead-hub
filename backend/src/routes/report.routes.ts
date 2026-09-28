import {
  Router,
} from "express";

import {
  ReportController,
} from "../controllers/ReportController";
import { requirePermission } from "../middlewares/roleMiddleware";

const reportRoutes =
  Router();

const controller =
  new ReportController();

reportRoutes.use(requirePermission("reports"));

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
