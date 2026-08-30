import {
  createHash,
  randomUUID,
} from "node:crypto";

import jwt, {
  type SignOptions,
} from "jsonwebtoken";

/* =========================================================
   TIPOS
========================================================= */

export type AuthTokenPayload = {
  sub: string;

  sid: string;

  username: string;

  role:
    | "ADMIN"
    | "COORDENADOR"
    | "ANALISTA";
};

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

function getJwtSecret() {
  const secret =
    process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET não está configurado."
    );
  }

  if (
    secret.length <
    32
  ) {
    throw new Error(
      "JWT_SECRET deve possuir pelo menos 32 caracteres."
    );
  }

  return secret;
}

function getJwtExpiresIn():
  SignOptions["expiresIn"] {
  return (
    process.env.JWT_EXPIRES_IN ??
    "8h"
  ) as SignOptions["expiresIn"];
}

/* =========================================================
   SESSÃO
========================================================= */

export function createSessionToken() {
  return randomUUID();
}

export function hashSessionToken(
  token: string
) {
  return createHash(
    "sha256"
  )
    .update(token)
    .digest("hex");
}

export function getSessionExpiration() {
  const configuredDays =
    Number(
      process.env
        .SESSION_EXPIRES_DAYS ??
        7
    );

  const days =
    Number.isFinite(
      configuredDays
    ) &&
    configuredDays > 0
      ? configuredDays
      : 7;

  const expiration =
    new Date();

  expiration.setDate(
    expiration.getDate() +
      days
  );

  return expiration;
}

/* =========================================================
   JWT
========================================================= */

export function createAccessToken(
  payload: AuthTokenPayload
) {
  return jwt.sign(
    payload,
    getJwtSecret(),
    {
      expiresIn:
        getJwtExpiresIn(),

      issuer:
        "techlead-hub",

      audience:
        "techlead-hub-desktop",
    }
  );
}

export function verifyAccessToken(
  token: string
) {
  return jwt.verify(
    token,
    getJwtSecret(),
    {
      issuer:
        "techlead-hub",

      audience:
        "techlead-hub-desktop",
    }
  ) as AuthTokenPayload;
}