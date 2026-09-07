import {
  Router,
} from "express";

import {
  HealthController,
} from "../controllers/HealthController";

import {
  ReadinessController,
} from "../controllers/ReadinessController";

import {
  DashboardController,
} from "../controllers/DashboardController";

import {
  authMiddleware,
} from "../middlewares/authMiddleware";

import importRoutes from "./import.routes";

import authRoutes from "./auth.routes";

import userRoutes from "./user.routes";

import {
  azureDevOpsRoutes,
} from "./azure-devops.routes";

import {
  azureWorkItemRoutes,
} from "./azure-work-items.routes";

import {
  azureSyncRoutes,
} from "./azure-sync.routes";

/* =========================================================
   ROUTER
========================================================= */

const routes =
  Router();

const health =
  new HealthController();

const readiness =
  new ReadinessController();

const dashboard =
  new DashboardController();

/* =========================================================
   ROTAS PÚBLICAS
========================================================= */

routes.get(
  "/health",
  health.index,
);

routes.get(
  "/health/ready",
  readiness.index,
);

routes.use(
  "/api/auth",
  authRoutes,
);

/* =========================================================
   ÁREA AUTENTICADA

   Todas as rotas registradas abaixo deste ponto passam pelo
   authMiddleware.
========================================================= */

routes.use(
  "/api",
  authMiddleware,
);

/* =========================================================
   ADMINISTRAÇÃO DE USUÁRIOS
========================================================= */

routes.use(
  "/api/users",
  userRoutes,
);

/* =========================================================
   DASHBOARD
========================================================= */

routes.get(
  "/api/dashboard/summary",
  dashboard.summary,
);

routes.get(
  "/api/dashboard/categories",
  dashboard.categories,
);

routes.get(
  "/api/dashboard/attention",
  dashboard.attention,
);

routes.get(
  "/api/dashboard/owners",
  dashboard.owners,
);

routes.get(
  "/api/dashboard/clients",
  dashboard.clients,
);

routes.get(
  "/api/dashboard/trends",
  dashboard.trends,
);

routes.get(
  "/api/dashboard/tickets",
  dashboard.tickets,
);

/* =========================================================
   IMPORTAÇÃO DE DADOS
========================================================= */

routes.use(
  "/api",
  importRoutes,
);

/* =========================================================
   AZURE DEVOPS - INTEGRAÇÃO / SINCRONIZAÇÃO

   Rotas existentes responsáveis pelas operações de
   integração com o Azure DevOps.
========================================================= */

routes.use(
  "/api/azure-devops",
  azureDevOpsRoutes,
);

/* =========================================================
   AZURE DEVOPS - MONITORAMENTO DA SINCRONIZAÇÃO

   Consulta configuração e histórico persistido em
   AzureSyncRun.

   Não dispara sincronização.

   Endpoint:
   GET /api/azure-sync/status
========================================================= */

routes.use(
  "/api/azure-sync",
  azureSyncRoutes,
);

/* =========================================================
   AZURE DEVOPS - CONSULTA LOCAL

   Consulta os Work Items previamente sincronizados no
   PostgreSQL. Nenhuma chamada ao Azure é realizada por
   estas rotas.
========================================================= */

routes.use(
  "/api/azure-work-items",
  azureWorkItemRoutes,
);

/* =========================================================
   EXPORT
========================================================= */

export default routes;
