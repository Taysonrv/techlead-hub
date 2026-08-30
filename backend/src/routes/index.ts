import { Router } from "express";

import { HealthController } from "../controllers/HealthController";
import { DashboardController } from "../controllers/DashboardController";

import importRoutes from "./import.routes";
import authRoutes from "./auth.routes";

const routes = Router();

const health =
  new HealthController();

const dashboard =
  new DashboardController();

/* =========================================================
   HEALTH CHECK
========================================================= */

routes.get(
  "/health",
  health.index
);

/* =========================================================
   AUTENTICAÇÃO
========================================================= */

routes.use(
  "/api/auth",
  authRoutes
);

/* =========================================================
   DASHBOARD
========================================================= */

routes.get(
  "/api/dashboard/summary",
  dashboard.summary
);

routes.get(
  "/api/dashboard/categories",
  dashboard.categories
);

routes.get(
  "/api/dashboard/attention",
  dashboard.attention
);

routes.get(
  "/api/dashboard/owners",
  dashboard.owners
);

routes.get(
  "/api/dashboard/clients",
  dashboard.clients
);

routes.get(
  "/api/dashboard/trends",
  dashboard.trends
);

routes.get(
  "/api/dashboard/tickets",
  dashboard.tickets
);

/* =========================================================
   IMPORTAÇÃO DE DADOS
========================================================= */

routes.use(
  "/api",
  importRoutes
);

/* =========================================================
   EXPORT
========================================================= */

export default routes;