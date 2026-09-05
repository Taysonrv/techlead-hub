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

/*
 * Health check do processo HTTP.
 */
routes.get(
  "/health",
  health.index
);

/*
 * Readiness check do PostgreSQL.
 *
 * Permanece público porque o Electron precisa validar o banco
 * antes de existir uma sessão autenticada.
 *
 * O endpoint não retorna dados da aplicação.
 */
routes.get(
  "/health/ready",
  readiness.index
);

/*
 * O auth.routes define internamente quais operações de
 * autenticação são públicas e quais exigem sessão.
 */
routes.use(
  "/api/auth",
  authRoutes
);

/* =========================================================
   ÁREA AUTENTICADA
========================================================= */

/*
 * Toda rota /api registrada abaixo desta linha exige:
 * - JWT válido;
 * - sessão persistida e não revogada;
 * - sessão não expirada;
 * - usuário ativo;
 * - approvalStatus APPROVED.
 */
routes.use(
  "/api",
  authMiddleware
);

/* =========================================================
   ADMINISTRAÇÃO DE USUÁRIOS
========================================================= */

routes.use(
  "/api/users",
  userRoutes
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
