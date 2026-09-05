import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  prisma,
} from "../database/prisma";

import {
  hashSessionToken,
  verifyAccessToken,
} from "../utils/auth";

/* =========================================================
   TIPOS
========================================================= */

export type AuthenticatedUserRole =
  | "ADMIN"
  | "COORDENADOR"
  | "ANALISTA";

export type AuthenticatedRequest =
  Request & {
    auth?: {
      userId: number;

      sessionToken: string;

      username: string;

      role:
        AuthenticatedUserRole;
    };
  };

/* =========================================================
   RESPOSTAS
========================================================= */

function unauthorized(
  response: Response,
  message =
    "Sessão expirada ou inválida."
) {
  return response
    .status(401)
    .json({
      message,
    });
}

/* =========================================================
   MIDDLEWARE DE AUTENTICAÇÃO
========================================================= */

export async function authMiddleware(
  request:
    AuthenticatedRequest,

  response:
    Response,

  next:
    NextFunction
) {
  try {
    /* =====================================================
       AUTHORIZATION HEADER
    ===================================================== */

    const authorization =
      request.headers
        .authorization;

    if (!authorization) {
      return unauthorized(
        response,
        "Autenticação necessária."
      );
    }

    /*
     * Aceita somente:
     *
     * Authorization: Bearer <token>
     */

    const match =
      authorization.match(
        /^Bearer\s+(.+)$/i
      );

    const token =
      match?.[1]?.trim();

    if (!token) {
      return unauthorized(
        response,
        "Token de autenticação inválido."
      );
    }

    /* =====================================================
       JWT
    ===================================================== */

    const payload =
      verifyAccessToken(
        token
      );

    const userId =
      Number(
        payload.sub
      );

    if (
      !Number.isSafeInteger(
        userId
      ) ||
      userId <= 0
    ) {
      return unauthorized(
        response,
        "Token de autenticação inválido."
      );
    }

    /*
     * sid representa a sessão persistida no banco.
     *
     * Não basta possuir um JWT válido. A sessão também
     * precisa continuar válida no PostgreSQL.
     */

    if (
      typeof payload.sid !==
        "string" ||
      !payload.sid.trim()
    ) {
      return unauthorized(
        response,
        "Token de autenticação inválido."
      );
    }

    /* =====================================================
       SESSÃO + ESTADO ATUAL DO USUÁRIO
    ===================================================== */

    const tokenHash =
      hashSessionToken(
        payload.sid
      );

    const session =
      await prisma.userSession.findUnique({
        where: {
          tokenHash,
        },

        select: {
          userId: true,

          revokedAt: true,

          expiresAt: true,

          user: {
            select: {
              id: true,

              username: true,

              role: true,

              active: true,

              approvalStatus:
                true,
            },
          },
        },
      });

    if (!session) {
      return unauthorized(
        response
      );
    }

    /* =====================================================
       CONSISTÊNCIA JWT x SESSÃO
    ===================================================== */

    if (
      session.userId !==
        userId ||
      session.user.id !==
        userId
    ) {
      return unauthorized(
        response
      );
    }

    /* =====================================================
       SESSÃO REVOGADA
    ===================================================== */

    if (
      session.revokedAt
    ) {
      return unauthorized(
        response
      );
    }

    /* =====================================================
       EXPIRAÇÃO
    ===================================================== */

    const now =
      new Date();

    if (
      session.expiresAt <=
      now
    ) {
      return unauthorized(
        response
      );
    }

    /* =====================================================
       USUÁRIO ATIVO
    ===================================================== */

    if (
      !session.user.active
    ) {
      return unauthorized(
        response
      );
    }

    /* =====================================================
       APROVAÇÃO ADMINISTRATIVA
    ===================================================== */

    if (
      session.user
        .approvalStatus !==
      "APPROVED"
    ) {
      return unauthorized(
        response
      );
    }

    /* =====================================================
       REQUEST AUTENTICADA

       O perfil é obtido do banco e não do JWT.

       Assim, uma eventual mudança de perfil passa a valer
       imediatamente para a sessão existente.
    ===================================================== */

    request.auth = {
      userId,

      sessionToken:
        payload.sid,

      username:
        session.user
          .username,

      role:
        session.user.role,
    };

    return next();
  } catch {
    /*
     * Não expomos detalhes de JWT, sessão ou banco para
     * o cliente.
     */

    return unauthorized(
      response
    );
  }
}