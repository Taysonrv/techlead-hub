import {
  Router,
} from "express";

import {
  AuthController,
} from "../controllers/AuthController";

import {
  authMiddleware,
} from "../middlewares/authMiddleware";

import {
  createRateLimitMiddleware,
} from "../middlewares/rateLimitMiddleware";

/* =========================================================
   ROUTER
========================================================= */

const authRoutes =
  Router();

const auth =
  new AuthController();

const loginRateLimit =
  createRateLimitMiddleware({
    windowMs: 15 * 60 * 1_000,
    maxAttempts: 10,
    message:
      "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
  });

const accountRateLimit =
  createRateLimitMiddleware({
    windowMs: 15 * 60 * 1_000,
    maxAttempts: 5,
    message:
      "Muitas solicitações. Aguarde alguns minutos e tente novamente.",
  });

/* =========================================================
   CONFIGURAÇÃO INICIAL

   Rotas públicas.
========================================================= */

authRoutes.get(
  "/setup-status",
  auth.setupStatus.bind(
    auth
  )
);

authRoutes.post(
  "/setup",
  accountRateLimit,
  auth.setup.bind(
    auth
  )
);

/* =========================================================
   CADASTRO DE USUÁRIO

   Rota pública.

   Todo novo usuário é criado:
   - como ANALISTA
   - inativo
   - aguardando aprovação administrativa
========================================================= */

authRoutes.post(
  "/register",
  accountRateLimit,
  auth.register.bind(
    auth
  )
);

/* =========================================================
   LOGIN

   Rota pública.
========================================================= */

authRoutes.post(
  "/login",
  loginRateLimit,
  auth.login.bind(
    auth
  )
);

/* =========================================================
   RECUPERAÇÃO DE SENHA
========================================================= */

authRoutes.post(
  "/forgot-password",
  accountRateLimit,
  auth.forgotPassword.bind(
    auth
  )
);

authRoutes.get(
  "/reset-password/validate",
  auth.validateResetPasswordToken.bind(
    auth
  )
);

authRoutes.post(
  "/reset-password",
  accountRateLimit,
  auth.resetPassword.bind(
    auth
  )
);

/* =========================================================
   USUÁRIO AUTENTICADO
========================================================= */

authRoutes.get(
  "/me",
  authMiddleware,
  auth.me.bind(
    auth
  )
);

authRoutes.post(
  "/change-password",
  authMiddleware,
  auth.changePassword.bind(
    auth
  )
);

authRoutes.post(
  "/logout",
  authMiddleware,
  auth.logout.bind(
    auth
  )
);

/* =========================================================
   EXPORT
========================================================= */

export default authRoutes;
