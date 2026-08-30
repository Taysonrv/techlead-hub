import type {
  Request,
  Response,
} from "express";

import {
  AuthError,
  AuthService,
} from "../services/AuthService";

import type {
  AuthenticatedRequest,
} from "../middlewares/authMiddleware";

/* =========================================================
   SERVICE
========================================================= */

const authService =
  new AuthService();

/* =========================================================
   CONTROLLER
========================================================= */

export class AuthController {
  /* =======================================================
     STATUS DA CONFIGURAÇÃO INICIAL

     GET /auth/setup-status
  ======================================================= */

  async setupStatus(
    _request:
      Request,

    response:
      Response
  ) {
    try {
      const result =
        await authService
          .getSetupStatus();

      return response
        .status(200)
        .json(result);
    } catch (error) {
      return handleAuthError(
        error,
        response
      );
    }
  }

  /* =======================================================
     CONFIGURAÇÃO DO PRIMEIRO ADMINISTRADOR

     POST /auth/setup

     Esta operação somente funcionará quando não existir
     nenhum usuário cadastrado.
  ======================================================= */

  async setup(
    request:
      Request,

    response:
      Response
  ) {
    try {
      const {
        name,
        username,
        email,
        password,
        confirmPassword,
      } =
        request.body ?? {};

      const user =
        await authService
          .setupFirstAdmin({
            name:
              toStringValue(
                name
              ),

            username:
              toStringValue(
                username
              ),

            email:
              toStringValue(
                email
              ),

            password:
              toStringValue(
                password
              ),

            confirmPassword:
              toStringValue(
                confirmPassword
              ),
          });

      return response
        .status(201)
        .json({
          message:
            "Configuração inicial concluída com sucesso.",

          user,
        });
    } catch (error) {
      return handleAuthError(
        error,
        response
      );
    }
  }

  /* =======================================================
     LOGIN

     POST /auth/login

     O campo "username" pode receber:
     - nome de usuário
     - e-mail corporativo
  ======================================================= */

  async login(
    request:
      Request,

    response:
      Response
  ) {
    try {
      const {
        username,
        password,
        deviceName,
      } =
        request.body ?? {};

      const result =
        await authService.login({
          username:
            toStringValue(
              username
            ),

          password:
            toStringValue(
              password
            ),

          deviceName:
            toOptionalStringValue(
              deviceName
            ),

          userAgent:
            request.get(
              "user-agent"
            ) ??
            null,

          ipAddress:
            request.ip ??
            null,
        });

      return response
        .status(200)
        .json(result);
    } catch (error) {
      return handleAuthError(
        error,
        response
      );
    }
  }

  /* =======================================================
     USUÁRIO AUTENTICADO

     GET /auth/me
  ======================================================= */

  async me(
    request:
      AuthenticatedRequest,

    response:
      Response
  ) {
    try {
      const userId =
        request.auth
          ?.userId;

      if (!userId) {
        return response
          .status(401)
          .json({
            message:
              "Usuário não autenticado.",
          });
      }

      const user =
        await authService
          .getCurrentUser(
            userId
          );

      return response
        .status(200)
        .json({
          user,
        });
    } catch (error) {
      return handleAuthError(
        error,
        response
      );
    }
  }

  /* =======================================================
     ALTERAÇÃO DE SENHA

     POST /auth/change-password

     Utilizada pelo usuário autenticado que conhece
     a senha atual.
  ======================================================= */

  async changePassword(
    request:
      AuthenticatedRequest,

    response:
      Response
  ) {
    try {
      const userId =
        request.auth
          ?.userId;

      if (!userId) {
        return response
          .status(401)
          .json({
            message:
              "Usuário não autenticado.",
          });
      }

      const {
        currentPassword,
        newPassword,
        confirmPassword,
      } =
        request.body ?? {};

      const user =
        await authService
          .changePassword({
            userId,

            currentPassword:
              toStringValue(
                currentPassword
              ),

            newPassword:
              toStringValue(
                newPassword
              ),

            confirmPassword:
              toStringValue(
                confirmPassword
              ),
          });

      return response
        .status(200)
        .json({
          message:
            "Senha alterada com sucesso.",

          user,
        });
    } catch (error) {
      return handleAuthError(
        error,
        response
      );
    }
  }

  /* =======================================================
     SOLICITAÇÃO DE RECUPERAÇÃO DE SENHA

     POST /auth/forgot-password

     IMPORTANTE:
     A resposta é sempre genérica.

     Isso impede que alguém descubra se determinado
     endereço possui ou não uma conta no TechLead Hub.

     O token nunca é devolvido pela API.
  ======================================================= */

  async forgotPassword(
    request:
      Request,

    response:
      Response
  ) {
    try {
      const {
        email,
      } =
        request.body ?? {};

      const result =
        await authService
          .requestPasswordReset({
            email:
              toStringValue(
                email
              ),
          });

      /*
       * ATENÇÃO:
       *
       * result.delivery contém internamente:
       *
       * - nome
       * - e-mail
       * - token
       * - expiração
       *
       * Esses dados NÃO podem ser enviados ao frontend.
       *
       * Na próxima etapa, o MailService utilizará
       * result.delivery para enviar o link ao usuário.
       */

      if (
        result.delivery
      ) {
        /*
         * Nenhum token é exibido em log.
         *
         * O envio será conectado ao MailService.
         */
        console.info(
          `[auth] Solicitação de recuperação criada para o usuário ${result.delivery.userId}.`
        );
      }

      return response
        .status(200)
        .json({
          message:
            "Se existir uma conta ativa vinculada ao e-mail informado, as instruções para redefinição da senha serão enviadas.",
        });
    } catch (error) {
      return handleAuthError(
        error,
        response
      );
    }
  }

  /* =======================================================
     VALIDA TOKEN DE RECUPERAÇÃO

     GET /auth/reset-password/validate?token=...
  ======================================================= */

  async validateResetPasswordToken(
    request:
      Request,

    response:
      Response
  ) {
    try {
      const token =
        getQueryStringValue(
          request.query.token
        );

      const result =
        await authService
          .validatePasswordResetToken({
            token,
          });

      /*
       * Este endpoint pode informar somente se o token
       * recebido é válido.

       * Nenhuma informação do usuário é retornada.
       */
      return response
        .status(200)
        .json(result);
    } catch (error) {
      return handleAuthError(
        error,
        response
      );
    }
  }

  /* =======================================================
     REDEFINIÇÃO DE SENHA

     POST /auth/reset-password
  ======================================================= */

  async resetPassword(
    request:
      Request,

    response:
      Response
  ) {
    try {
      const {
        token,
        newPassword,
        confirmPassword,
      } =
        request.body ?? {};

      await authService
        .resetPassword({
          token:
            toStringValue(
              token
            ),

          newPassword:
            toStringValue(
              newPassword
            ),

          confirmPassword:
            toStringValue(
              confirmPassword
            ),
        });

      /*
       * Não devolvemos o usuário porque a recuperação
       * encerra todas as sessões existentes.
       *
       * Depois da redefinição, o usuário deve autenticar
       * novamente.
       */
      return response
        .status(200)
        .json({
          message:
            "Senha redefinida com sucesso. Faça login novamente para continuar.",
        });
    } catch (error) {
      return handleAuthError(
        error,
        response
      );
    }
  }

  /* =======================================================
     LOGOUT

     POST /auth/logout
  ======================================================= */

  async logout(
    request:
      AuthenticatedRequest,

    response:
      Response
  ) {
    try {
      const sessionToken =
        request.auth
          ?.sessionToken;

      if (
        sessionToken
      ) {
        await authService
          .logout(
            sessionToken
          );
      }

      /*
       * Logout é idempotente.
       *
       * Mesmo que a sessão já tenha sido encerrada,
       * a API responde com sucesso.
       */
      return response
        .status(200)
        .json({
          message:
            "Logout realizado com sucesso.",
        });
    } catch (error) {
      return handleAuthError(
        error,
        response
      );
    }
  }
}

/* =========================================================
   HELPERS DE ENTRADA
========================================================= */

function toStringValue(
  value:
    unknown
) {
  return typeof value ===
    "string"
      ? value
      : "";
}

function toOptionalStringValue(
  value:
    unknown
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized ||
    null;
}

function getQueryStringValue(
  value:
    unknown
) {
  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  if (
    Array.isArray(
      value
    )
  ) {
    const firstValue =
      value[0];

    return typeof firstValue ===
      "string"
        ? firstValue
        : "";
  }

  return "";
}

/* =========================================================
   TRATAMENTO DE ERRO
========================================================= */

function handleAuthError(
  error:
    unknown,

  response:
    Response
) {
  if (
    error instanceof
    AuthError
  ) {
    return response
      .status(
        error.statusCode
      )
      .json({
        message:
          error.message,
      });
  }

  console.error(
    "[auth] Erro interno:",
    error
  );

  return response
    .status(500)
    .json({
      message:
        "Não foi possível concluir a operação de autenticação.",
    });
}