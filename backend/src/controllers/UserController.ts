import type {
  Response,
} from "express";

import type {
  AuthenticatedRequest,
} from "../middlewares/authMiddleware";

import {
  AuthError,
} from "../services/AuthService";

import {
  UserService,
} from "../services/UserService";

/* =========================================================
   SERVICE
========================================================= */

const userService =
  new UserService();

/* =========================================================
   CONTROLLER
========================================================= */

export class UserController {
  /* =======================================================
     LISTAR USUÁRIOS

     GET /api/users
  ======================================================= */

  async index(
    request: AuthenticatedRequest,
    response: Response
  ) {
    try {
      const adminUserId =
        getAuthenticatedUserId(request);

      const users =
        await userService.listUsers(
          adminUserId
        );

      return response
        .status(200)
        .json({
          users,
        });
    } catch (error) {
      return handleUserError(
        error,
        response
      );
    }
  }

  /* =======================================================
     LISTAR PENDENTES

     GET /api/users/pending
  ======================================================= */

  async pending(
    request: AuthenticatedRequest,
    response: Response
  ) {
    try {
      const adminUserId =
        getAuthenticatedUserId(request);

      const users =
        await userService.listPendingUsers(
          adminUserId
        );

      return response
        .status(200)
        .json({
          users,
        });
    } catch (error) {
      return handleUserError(
        error,
        response
      );
    }
  }

  /* =======================================================
     APROVAR USUÁRIO

     PATCH /api/users/:id/approve
  ======================================================= */

  async approve(
    request: AuthenticatedRequest,
    response: Response
  ) {
    try {
      const adminUserId =
        getAuthenticatedUserId(request);

      const targetUserId =
        getUserIdFromParams(
          request.params.id
        );

      const user =
        await userService.approveUser(
          adminUserId,
          targetUserId
        );

      return response
        .status(200)
        .json({
          message:
            "Usuário aprovado com sucesso.",

          user,
        });
    } catch (error) {
      return handleUserError(
        error,
        response
      );
    }
  }

  /* =======================================================
     REJEITAR USUÁRIO

     PATCH /api/users/:id/reject
  ======================================================= */

  async reject(
    request: AuthenticatedRequest,
    response: Response
  ) {
    try {
      const adminUserId =
        getAuthenticatedUserId(request);

      const targetUserId =
        getUserIdFromParams(
          request.params.id
        );

      const user =
        await userService.rejectUser(
          adminUserId,
          targetUserId
        );

      return response
        .status(200)
        .json({
          message:
            "Cadastro rejeitado com sucesso.",

          user,
        });
    } catch (error) {
      return handleUserError(
        error,
        response
      );
    }
  }

  /* =======================================================
     ATIVAR USUÁRIO

     PATCH /api/users/:id/activate
  ======================================================= */

  async activate(
    request: AuthenticatedRequest,
    response: Response
  ) {
    try {
      const adminUserId =
        getAuthenticatedUserId(request);

      const targetUserId =
        getUserIdFromParams(
          request.params.id
        );

      const user =
        await userService.activateUser(
          adminUserId,
          targetUserId
        );

      return response
        .status(200)
        .json({
          message:
            "Usuário ativado com sucesso.",

          user,
        });
    } catch (error) {
      return handleUserError(
        error,
        response
      );
    }
  }

  /* =======================================================
     DESATIVAR USUÁRIO

     PATCH /api/users/:id/deactivate
  ======================================================= */

  async deactivate(
    request: AuthenticatedRequest,
    response: Response
  ) {
    try {
      const adminUserId =
        getAuthenticatedUserId(request);

      const targetUserId =
        getUserIdFromParams(
          request.params.id
        );

      const user =
        await userService.deactivateUser(
          adminUserId,
          targetUserId
        );

      return response
        .status(200)
        .json({
          message:
            "Usuário desativado com sucesso.",

          user,
        });
    } catch (error) {
      return handleUserError(
        error,
        response
      );
    }
  }
}

/* =========================================================
   HELPERS
========================================================= */

function getAuthenticatedUserId(
  request: AuthenticatedRequest
) {
  const userId =
    request.auth?.userId;

  if (
    !userId ||
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    throw new AuthError(
      "Usuário não autenticado.",
      401
    );
  }

  return userId;
}

function getUserIdFromParams(
  value: unknown
) {
  const normalized =
    Array.isArray(value)
      ? value[0]
      : value;

  const userId =
    Number(normalized);

  if (
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    throw new AuthError(
      "Identificador do usuário inválido.",
      400
    );
  }

  return userId;
}

/* =========================================================
   TRATAMENTO DE ERRO
========================================================= */

function handleUserError(
  error: unknown,
  response: Response
) {
  if (
    error instanceof AuthError
  ) {
    return response
      .status(error.statusCode)
      .json({
        message: error.message,
      });
  }

  console.error(
    "[users] Erro interno:",
    error
  );

  return response
    .status(500)
    .json({
      message:
        "Não foi possível concluir a operação de administração de usuários.",
    });
}