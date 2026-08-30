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

   O próprio AuthService impede que /setup seja utilizado
   depois que o primeiro usuário já tiver sido criado.
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

   Rotas públicas.

   A segurança é baseada em token temporário aleatório
   cujo valor original não é armazenado no banco.
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

   Rotas abaixo exigem JWT + sessão válida.
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