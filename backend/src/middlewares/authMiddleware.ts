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
   REQUEST AUTENTICADA
========================================================= */

export type AuthenticatedRequest =
  Request & {
    auth?: {
      userId:
        number;

      sessionToken:
        string;

      username:
        string;

      role:
        | "ADMIN"
        | "COORDENADOR"
        | "ANALISTA";
    };
  };

/* =========================================================
   MIDDLEWARE
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
    const authorization =
      request.headers
        .authorization;

    if (
      !authorization
    ) {
      return response
        .status(401)
        .json({
          message:
            "Autenticação necessária.",
        });
    }

    const [
      scheme,
      token,
    ] =
      authorization.split(
        " "
      );

    if (
      scheme !==
        "Bearer" ||
      !token
    ) {
      return response
        .status(401)
        .json({
          message:
            "Token de autenticação inválido.",
        });
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
      !Number.isInteger(
        userId
      )
    ) {
      return response
        .status(401)
        .json({
          message:
            "Token de autenticação inválido.",
        });
    }

    /* =====================================================
       SESSÃO
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

        include: {
          user: true,
        },
      });

    if (
      !session ||
      session.userId !==
        userId ||
      session.revokedAt ||
      session.expiresAt <=
        new Date() ||
      !session.user.active
    ) {
      return response
        .status(401)
        .json({
          message:
            "Sessão expirada ou inválida.",
        });
    }

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
    return response
      .status(401)
      .json({
        message:
          "Sessão expirada ou inválida.",
      });
  }
}