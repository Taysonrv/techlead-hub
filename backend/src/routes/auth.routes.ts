import {
  Router,
} from "express";

import {
  AuthController,
} from "../controllers/AuthController";

import {
  authMiddleware,
} from "../middlewares/authMiddleware";

/* =========================================================
   ROUTER
========================================================= */

const authRoutes =
  Router();

const auth =
  new AuthController();

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
  auth.login.bind(
    auth
  )
);

/* =========================================================
   RECUPERAÇÃO DE SENHA
========================================================= */

authRoutes.post(
  "/forgot-password",
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