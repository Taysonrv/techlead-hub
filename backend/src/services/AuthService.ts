import {
  createHash,
  randomBytes,
} from "node:crypto";

import bcrypt from "bcryptjs";

import {
  prisma,
} from "../database/prisma";

import {
  createAccessToken,
  createSessionToken,
  getSessionExpiration,
  hashSessionToken,
} from "../utils/auth";

/* =========================================================
   TIPOS
========================================================= */

type LoginInput = {
  username: string;
  password: string;

  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  clientType?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;
  forceTransfer?: boolean;
};

const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1_000;

type ChangePasswordInput = {
  userId: number;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type SetupInput = {
  name: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type RegisterInput = {
  name: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type RequestPasswordResetInput = {
  email: string;
};

type ValidatePasswordResetTokenInput = {
  token: string;
};

type ResetPasswordInput = {
  token: string;
  newPassword: string;
  confirmPassword: string;
};

type PasswordResetDelivery = {
  userId: number;
  name: string;
  email: string;
  token: string;
  expiresAt: Date;
};

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const PASSWORD_SALT_ROUNDS =
  12;

const MIN_PASSWORD_LENGTH =
  10;

const DEFAULT_PASSWORD_RESET_EXPIRES_MINUTES =
  30;

/* =========================================================
   SELECT PADRÃO DO USUÁRIO
========================================================= */

const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  active: true,

  approvalStatus: true,
  approvedAt: true,
  approvedById: true,

  mustChangePassword: true,
  lastLoginAt: true,
  avatarUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/* =========================================================
   SERVICE
========================================================= */

export class AuthService {
  /* =======================================================
     STATUS DA CONFIGURAÇÃO INICIAL
  ======================================================= */

  async getSetupStatus() {
    const userCount =
      await prisma.user.count();

    return {
      setupRequired:
        userCount === 0,
    };
  }

  /* =======================================================
     CONFIGURAÇÃO DO PRIMEIRO ADMINISTRADOR
  ======================================================= */

  async setupFirstAdmin({
    name,
    username,
    email,
    password,
    confirmPassword,
  }: SetupInput) {
    const normalizedName =
      normalizeName(name);

    const normalizedUsername =
      normalizeUsername(username);

    const normalizedEmail =
      normalizeEmail(email);

    if (!normalizedName) {
      throw new AuthError(
        "Informe o nome do usuário.",
        400
      );
    }

    if (!normalizedUsername) {
      throw new AuthError(
        "Informe o usuário.",
        400
      );
    }

    validateUsername(
      normalizedUsername
    );

    validateCorporateEmail(
      normalizedEmail
    );

    validatePassword({
      password,
      confirmPassword,
    });

    const passwordHash =
      await bcrypt.hash(
        password,
        PASSWORD_SALT_ROUNDS
      );

    try {
      const user =
        await prisma.$transaction(
          async (
            transaction
          ) => {
            const existingUsers =
              await transaction
                .user
                .count();

            if (
              existingUsers >
              0
            ) {
              throw new AuthError(
                "A configuração inicial já foi concluída.",
                409
              );
            }

            return transaction
              .user
              .create({
                data: {
                  name:
                    normalizedName,

                  username:
                    normalizedUsername,

                  email:
                    normalizedEmail,

                  passwordHash,

                  role:
                    "ADMIN",

                  active:
                    true,

                  approvalStatus:
                    "APPROVED",

                  approvedAt:
                    new Date(),

                  mustChangePassword:
                    false,
                },

                select:
                  USER_PUBLIC_SELECT,
              });
          }
        );

      return user;
    } catch (error) {
      if (
        error instanceof
        AuthError
      ) {
        throw error;
      }

      if (
        isPrismaUniqueConstraintError(
          error
        )
      ) {
        throw new AuthError(
          "O usuário ou e-mail informado já está cadastrado.",
          409
        );
      }

      throw error;
    }
  }

  /* =======================================================
     CADASTRO PÚBLICO

     Todo novo cadastro:
     - ANALISTA
     - inativo
     - aguardando aprovação

     O cliente não controla role, active ou approvalStatus.
  ======================================================= */

  async register({
    name,
    username,
    email,
    password,
    confirmPassword,
  }: RegisterInput) {
    const normalizedName =
      normalizeName(name);

    const normalizedUsername =
      normalizeUsername(
        username
      );

    const normalizedEmail =
      normalizeEmail(
        email
      );

    if (!normalizedName) {
      throw new AuthError(
        "Informe seu nome completo.",
        400
      );
    }

    if (!normalizedUsername) {
      throw new AuthError(
        "Informe o usuário.",
        400
      );
    }

    validateUsername(
      normalizedUsername
    );

    validateCorporateEmail(
      normalizedEmail
    );

    validatePassword({
      password,
      confirmPassword,
    });

    const existingUser =
      await prisma.user.findFirst({
        where: {
          OR: [
            {
              username: {
                equals:
                  normalizedUsername,

                mode:
                  "insensitive",
              },
            },
            {
              email: {
                equals:
                  normalizedEmail,

                mode:
                  "insensitive",
              },
            },
          ],
        },
      });

    if (existingUser) {
      throw new AuthError(
        "O usuário ou e-mail informado já está cadastrado.",
        409
      );
    }

    const passwordHash =
      await bcrypt.hash(
        password,
        PASSWORD_SALT_ROUNDS
      );

    try {
      const user =
        await prisma.user.create({
          data: {
            name:
              normalizedName,

            username:
              normalizedUsername,

            email:
              normalizedEmail,

            passwordHash,

            role:
              "ANALISTA",

            active:
              false,

            approvalStatus:
              "PENDING",

            mustChangePassword:
              false,
          },

          select:
            USER_PUBLIC_SELECT,
        });

      return user;
    } catch (error) {
      if (
        isPrismaUniqueConstraintError(
          error
        )
      ) {
        throw new AuthError(
          "O usuário ou e-mail informado já está cadastrado.",
          409
        );
      }

      throw error;
    }
  }

  /* =======================================================
     LOGIN

     Aceita:
     - username
     - e-mail
  ======================================================= */

  async login({
    username,
    password,
    deviceName,
    userAgent,
    ipAddress,
    clientType,
    deviceId,
    appVersion,
    forceTransfer,
  }: LoginInput) {
    const identifier =
      normalizeLoginIdentifier(
        username
      );

    if (
      !identifier ||
      !password
    ) {
      throw new AuthError(
        "Usuário/e-mail e senha são obrigatórios.",
        400
      );
    }

    const user =
      await prisma.user.findFirst({
        where: {
          OR: [
            {
              username: {
                equals:
                  identifier,

                mode:
                  "insensitive",
              },
            },
            {
              email: {
                equals:
                  identifier,

                mode:
                  "insensitive",
              },
            },
          ],
        },
      });

    if (!user) {
      throw new AuthError(
        "Usuário ou senha inválidos.",
        401
      );
    }

    /*
     * Primeiro validamos a senha.
     *
     * Assim não revelamos o estado de uma conta para alguém
     * que não conhece suas credenciais.
     */
    const passwordMatches =
      await bcrypt.compare(
        password,
        user.passwordHash
      );

    if (!passwordMatches) {
      throw new AuthError(
        "Usuário ou senha inválidos.",
        401
      );
    }

    /* =====================================================
       APROVAÇÃO ADMINISTRATIVA
    ===================================================== */

    if (
      user.approvalStatus ===
      "PENDING"
    ) {
      throw new AuthError(
        "Seu cadastro está aguardando aprovação de um administrador.",
        403
      );
    }

    if (
      user.approvalStatus ===
      "REJECTED"
    ) {
      throw new AuthError(
        "Seu cadastro não foi autorizado. Entre em contato com um administrador.",
        403
      );
    }

    if (!user.active) {
      throw new AuthError(
        "Seu acesso está desativado. Entre em contato com um administrador.",
        403
      );
    }

    const normalizedClientType = clientType?.trim().toUpperCase() === "DESKTOP" ? "DESKTOP" : "WEB";
    const serverVersion = process.env.APP_VERSION?.trim();
    const clientMajor = appVersion?.match(/^(\d+)\./)?.[1];
    const serverMajor = serverVersion?.match(/^(\d+)\./)?.[1];
    if (clientMajor && serverMajor && clientMajor !== serverMajor) {
      throw new AuthError(`Esta versão do aplicativo não é compatível com o servidor ${serverVersion}. Atualize o TechLead Hub.`, 426, "INCOMPATIBLE_VERSION");
    }
    const now = new Date();
    const activeSince = new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS);
    const conflictingSessions = await prisma.userSession.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: now },
        lastActivityAt: { gt: activeSince },
        clientType: { not: normalizedClientType },
      },
      select: { id: true, clientType: true, deviceName: true, lastActivityAt: true },
    });

    const conflictingSession = conflictingSessions[0];
    if (conflictingSession && !forceTransfer) {
      throw new AuthError(
        `Este usuário já possui uma sessão ativa na versão ${conflictingSession.clientType === "DESKTOP" ? "Desktop" : "Web"}.`,
        409,
        "SESSION_CONFLICT",
      );
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.userSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          OR: [
            { lastActivityAt: { lte: activeSince } },
            ...(forceTransfer ? [{ clientType: { not: normalizedClientType } }] : []),
          ],
        },
        data: { revokedAt: now },
      });
      if (forceTransfer && conflictingSession) {
        await transaction.auditLog.create({
          data: {
            userId: user.id,
            action: "SESSION_TRANSFERRED",
            entity: "UserSession",
            metadata: { from: conflictingSession.clientType, to: normalizedClientType },
            ipAddress: sanitizeOptionalText(ipAddress),
          },
        });
      }
    });

    /* =====================================================
       CRIA SESSÃO
    ===================================================== */

    const sessionToken =
      createSessionToken();

    const tokenHash =
      hashSessionToken(
        sessionToken
      );

    const expiresAt =
      getSessionExpiration();

    await prisma.userSession.create({
      data: {
        userId:
          user.id,

        tokenHash,

        expiresAt,

        deviceName:
          sanitizeOptionalText(
            deviceName
          ),
        deviceId: sanitizeOptionalText(deviceId),
        clientType: normalizedClientType,
        appVersion: sanitizeOptionalText(appVersion),
        lastActivityAt: now,

        userAgent:
          sanitizeOptionalText(
            userAgent
          ),

        ipAddress:
          sanitizeOptionalText(
            ipAddress
          ),
      },
    });

    /* =====================================================
       CRIA JWT
    ===================================================== */

    let accessToken:
      string;

    try {
      accessToken =
        createAccessToken({
          sub:
            String(
              user.id
            ),

          sid:
            sessionToken,

          username:
            user.username,

          role:
            user.role,
        });
    } catch (error) {
      await prisma.userSession
        .updateMany({
          where: {
            tokenHash,

            revokedAt:
              null,
          },

          data: {
            revokedAt:
              new Date(),
          },
        });

      throw error;
    }

    const loginDate =
      new Date();

    const updatedUser =
      await prisma.user.update({
        where: {
          id:
            user.id,
        },

        data: {
          lastLoginAt:
            loginDate,
        },

        select:
          USER_PUBLIC_SELECT,
      });

    return {
      accessToken,

      tokenType:
        "Bearer",

      expiresAt:
        expiresAt.toISOString(),

      user:
        updatedUser,
    };
  }

  /* =======================================================
     USUÁRIO ATUAL
  ======================================================= */

  async getCurrentUser(
    userId:
      number
  ) {
    if (
      !Number.isInteger(
        userId
      ) ||
      userId <= 0
    ) {
      throw new AuthError(
        "Usuário inválido.",
        401
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id:
            userId,
        },

        select:
          USER_PUBLIC_SELECT,
      });

    if (
      !user ||
      !user.active ||
      user.approvalStatus !==
        "APPROVED"
    ) {
      throw new AuthError(
        "Usuário não encontrado, inativo ou não autorizado.",
        401
      );
    }

    return user;
  }

  /* =======================================================
     ALTERAÇÃO DE SENHA
  ======================================================= */

  async changePassword({
    userId,
    currentPassword,
    newPassword,
    confirmPassword,
  }: ChangePasswordInput) {
    if (!currentPassword) {
      throw new AuthError(
        "Informe a senha atual.",
        400
      );
    }

    validatePassword({
      password:
        newPassword,

      confirmPassword,
    });

    if (
      currentPassword ===
      newPassword
    ) {
      throw new AuthError(
        "A nova senha deve ser diferente da senha atual.",
        400
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id:
            userId,
        },
      });

    if (
      !user ||
      !user.active ||
      user.approvalStatus !==
        "APPROVED"
    ) {
      throw new AuthError(
        "Usuário não encontrado, inativo ou não autorizado.",
        401
      );
    }

    const currentPasswordMatches =
      await bcrypt.compare(
        currentPassword,
        user.passwordHash
      );

    if (
      !currentPasswordMatches
    ) {
      throw new AuthError(
        "A senha atual está incorreta.",
        400
      );
    }

    const newPasswordMatchesCurrentHash =
      await bcrypt.compare(
        newPassword,
        user.passwordHash
      );

    if (
      newPasswordMatchesCurrentHash
    ) {
      throw new AuthError(
        "A nova senha deve ser diferente da senha atual.",
        400
      );
    }

    const newPasswordHash =
      await bcrypt.hash(
        newPassword,
        PASSWORD_SALT_ROUNDS
      );

    const updatedUser =
      await prisma.user.update({
        where: {
          id:
            userId,
        },

        data: {
          passwordHash:
            newPasswordHash,

          mustChangePassword:
            false,
        },

        select:
          USER_PUBLIC_SELECT,
      });

    return updatedUser;
  }

  /* =======================================================
     SOLICITAÇÃO DE RECUPERAÇÃO DE SENHA
  ======================================================= */

  async requestPasswordReset({
    email,
  }: RequestPasswordResetInput) {
    const normalizedEmail =
      normalizeEmail(
        email
      );

    if (!normalizedEmail) {
      throw new AuthError(
        "Informe o e-mail corporativo.",
        400
      );
    }

    if (
      !isValidEmail(
        normalizedEmail
      )
    ) {
      return {
        accepted:
          true,

        delivery:
          null as
            PasswordResetDelivery |
            null,
      };
    }

    const user =
      await prisma.user.findFirst({
        where: {
          email: {
            equals:
              normalizedEmail,

            mode:
              "insensitive",
          },
        },
      });

    if (
      !user ||
      !user.active ||
      user.approvalStatus !==
        "APPROVED" ||
      !user.email
    ) {
      return {
        accepted:
          true,

        delivery:
          null as
            PasswordResetDelivery |
            null,
      };
    }

    const token =
      createPasswordResetToken();

    const tokenHash =
      hashPasswordResetToken(
        token
      );

    const expiresAt =
      getPasswordResetExpiration();

    const now =
      new Date();

    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: {
          userId:
            user.id,

          usedAt:
            null,
        },

        data: {
          usedAt:
            now,
        },
      }),

      prisma.passwordResetToken.create({
        data: {
          userId:
            user.id,

          tokenHash,

          expiresAt,
        },
      }),
    ]);

    const delivery:
      PasswordResetDelivery = {
        userId:
          user.id,

        name:
          user.name,

        email:
          user.email,

        token,

        expiresAt,
      };

    return {
      accepted:
        true,

      delivery,
    };
  }

  /* =======================================================
     VALIDA TOKEN DE RECUPERAÇÃO
  ======================================================= */

  async validatePasswordResetToken({
    token,
  }: ValidatePasswordResetTokenInput) {
    const normalizedToken =
      token.trim();

    if (!normalizedToken) {
      return {
        valid:
          false,
      };
    }

    const tokenHash =
      hashPasswordResetToken(
        normalizedToken
      );

    const resetToken =
      await prisma.passwordResetToken
        .findUnique({
          where: {
            tokenHash,
          },

          include: {
            user: true,
          },
        });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt <=
        new Date() ||
      !resetToken.user.active ||
      resetToken.user
        .approvalStatus !==
        "APPROVED"
    ) {
      return {
        valid:
          false,
      };
    }

    return {
      valid:
        true,

      expiresAt:
        resetToken
          .expiresAt
          .toISOString(),
    };
  }

  /* =======================================================
     REDEFINIÇÃO DE SENHA
  ======================================================= */

  async resetPassword({
    token,
    newPassword,
    confirmPassword,
  }: ResetPasswordInput) {
    const normalizedToken =
      token.trim();

    if (!normalizedToken) {
      throw new AuthError(
        "O token de recuperação é obrigatório.",
        400
      );
    }

    validatePassword({
      password:
        newPassword,

      confirmPassword,
    });

    const tokenHash =
      hashPasswordResetToken(
        normalizedToken
      );

    const resetToken =
      await prisma.passwordResetToken
        .findUnique({
          where: {
            tokenHash,
          },

          include: {
            user: true,
          },
        });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt <=
        new Date()
    ) {
      throw new AuthError(
        "Este link de recuperação é inválido ou expirou.",
        400
      );
    }

    if (
      !resetToken.user.active ||
      resetToken.user
        .approvalStatus !==
        "APPROVED"
    ) {
      throw new AuthError(
        "Não foi possível redefinir a senha desta conta.",
        403
      );
    }

    const matchesCurrentPassword =
      await bcrypt.compare(
        newPassword,
        resetToken
          .user
          .passwordHash
      );

    if (
      matchesCurrentPassword
    ) {
      throw new AuthError(
        "A nova senha deve ser diferente da senha atual.",
        400
      );
    }

    const newPasswordHash =
      await bcrypt.hash(
        newPassword,
        PASSWORD_SALT_ROUNDS
      );

    const now =
      new Date();

    const userId =
      resetToken.userId;

    const updatedUser =
      await prisma.$transaction(
        async (
          transaction
        ) => {
          const consumed =
            await transaction
              .passwordResetToken
              .updateMany({
                where: {
                  id:
                    resetToken.id,

                  usedAt:
                    null,

                  expiresAt: {
                    gt:
                      now,
                  },
                },

                data: {
                  usedAt:
                    now,
                },
              });

          if (
            consumed.count !==
            1
          ) {
            throw new AuthError(
              "Este link de recuperação é inválido ou expirou.",
              400
            );
          }

          const user =
            await transaction
              .user
              .update({
                where: {
                  id:
                    userId,
                },

                data: {
                  passwordHash:
                    newPasswordHash,

                  mustChangePassword:
                    false,
                },

                select:
                  USER_PUBLIC_SELECT,
              });

          await transaction
            .passwordResetToken
            .updateMany({
              where: {
                userId,

                usedAt:
                  null,
              },

              data: {
                usedAt:
                  now,
              },
            });

          await transaction
            .userSession
            .updateMany({
              where: {
                userId,

                revokedAt:
                  null,
              },

              data: {
                revokedAt:
                  now,
              },
            });

          return user;
        }
      );

    return updatedUser;
  }

  /* =======================================================
     LOGOUT
  ======================================================= */

  async logout(
    sessionToken:
      string
  ) {
    const normalizedToken =
      sessionToken.trim();

    if (!normalizedToken) {
      return;
    }

    const tokenHash =
      hashSessionToken(
        normalizedToken
      );

    await prisma.userSession.updateMany({
      where: {
        tokenHash,

        revokedAt:
          null,
      },

      data: {
        revokedAt:
          new Date(),
      },
    });
  }

  async heartbeat(sessionToken: string) {
    const tokenHash = hashSessionToken(sessionToken.trim());
    const session = await prisma.userSession.findUnique({
      where: { tokenHash },
      select: { id: true, revokedAt: true, expiresAt: true, user: { select: { id: true, username: true, role: true, active: true, approvalStatus: true } } },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now || !session.user.active || session.user.approvalStatus !== "APPROVED") {
      throw new AuthError("Sessão expirada ou inválida.", 401);
    }
    const expiresAt = getSessionExpiration();
    await prisma.userSession.update({ where: { id: session.id }, data: { lastActivityAt: now, expiresAt } });
    const accessToken = createAccessToken({ sub: String(session.user.id), sid: sessionToken, username: session.user.username, role: session.user.role });
    return { active: true, accessToken, expiresAt: expiresAt.toISOString(), serverTime: now.toISOString() };
  }

  async getAvatar(userId: number) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarData: true, avatarMimeType: true, avatarUpdatedAt: true } });
    if (!user?.avatarData || !user.avatarMimeType) return null;
    return { data: Buffer.from(user.avatarData), mimeType: user.avatarMimeType, updatedAt: user.avatarUpdatedAt };
  }

  async saveAvatar(userId: number, file: { buffer: Buffer; mimetype: string; size: number }) {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.mimetype)) throw new AuthError("Utilize uma imagem JPG, PNG ou WebP.", 400);
    if (!file.size || file.size > 2 * 1024 * 1024) throw new AuthError("A foto deve possuir no máximo 2 MB.", 400);
    const updatedAt = new Date();
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { avatarData: file.buffer, avatarMimeType: file.mimetype, avatarUpdatedAt: updatedAt } }),
      prisma.auditLog.create({ data: { userId, action: "PROFILE_AVATAR_UPDATED", entity: "User", entityId: String(userId), metadata: { mimeType: file.mimetype, size: file.size } } }),
    ]);
    return { avatarUpdatedAt: updatedAt };
  }

  async deleteAvatar(userId: number) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { avatarData: null, avatarMimeType: null, avatarUpdatedAt: null } }),
      prisma.auditLog.create({ data: { userId, action: "PROFILE_AVATAR_REMOVED", entity: "User", entityId: String(userId) } }),
    ]);
  }
}

/* =========================================================
   VALIDAÇÕES
========================================================= */

function validatePassword({
  password,
  confirmPassword,
}: {
  password: string;
  confirmPassword: string;
}) {
  if (!password) {
    throw new AuthError(
      "Informe a senha.",
      400
    );
  }

  if (!confirmPassword) {
    throw new AuthError(
      "Confirme a senha.",
      400
    );
  }

  if (
    password !==
    confirmPassword
  ) {
    throw new AuthError(
      "A confirmação da senha não confere.",
      400
    );
  }

  if (
    password.length <
    MIN_PASSWORD_LENGTH
  ) {
    throw new AuthError(
      `A senha deve possuir pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      400
    );
  }
}

function validateUsername(
  username:
    string
) {
  if (
    username.length <
    3
  ) {
    throw new AuthError(
      "O usuário deve possuir pelo menos 3 caracteres.",
      400
    );
  }

  if (
    !/^[a-z0-9._-]+$/i.test(
      username
    )
  ) {
    throw new AuthError(
      "O usuário possui caracteres inválidos.",
      400
    );
  }
}

function validateCorporateEmail(
  email:
    string
) {
  if (!email) {
    throw new AuthError(
      "Informe o e-mail corporativo.",
      400
    );
  }

  if (
    !isValidEmail(
      email
    )
  ) {
    throw new AuthError(
      "Informe um e-mail válido.",
      400
    );
  }

  const allowedDomains =
    getAllowedEmailDomains();

  if (
    allowedDomains.length ===
    0
  ) {
    return;
  }

  const domain =
    email
      .split("@")
      .pop()
      ?.toLowerCase();

  if (
    !domain ||
    !allowedDomains.includes(
      domain
    )
  ) {
    throw new AuthError(
      `Utilize um e-mail corporativo autorizado (${allowedDomains
        .map(
          (
            allowedDomain
          ) =>
            `@${allowedDomain}`
        )
        .join(", ")}).`,
      400
    );
  }
}

/* =========================================================
   NORMALIZAÇÃO
========================================================= */

function normalizeName(
  value:
    string
) {
  return value
    .trim()
    .replace(
      /\s+/g,
      " "
    );
}

function normalizeUsername(
  value:
    string
) {
  return value
    .trim()
    .toLowerCase();
}

function normalizeEmail(
  value:
    string
) {
  return value
    .trim()
    .toLowerCase();
}

function normalizeLoginIdentifier(
  value:
    string
) {
  return value
    .trim()
    .toLowerCase();
}

function sanitizeOptionalText(
  value:
    string |
    null |
    undefined
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

/* =========================================================
   E-MAIL
========================================================= */

function isValidEmail(
  email:
    string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

function getAllowedEmailDomains() {
  const configured =
    process.env
      .ALLOWED_EMAIL_DOMAINS ??
    "";

  return configured
    .split(",")
    .map(
      (
        domain
      ) =>
        domain
          .trim()
          .toLowerCase()
          .replace(
            /^@/,
            ""
          )
    )
    .filter(
      Boolean
    );
}

/* =========================================================
   TOKEN DE RECUPERAÇÃO
========================================================= */

function createPasswordResetToken() {
  return randomBytes(
    32
  ).toString(
    "hex"
  );
}

function hashPasswordResetToken(
  token:
    string
) {
  return createHash(
    "sha256"
  )
    .update(
      token
    )
    .digest(
      "hex"
    );
}

function getPasswordResetExpiration() {
  const configuredMinutes =
    Number(
      process.env
        .PASSWORD_RESET_EXPIRES_MINUTES ??
      DEFAULT_PASSWORD_RESET_EXPIRES_MINUTES
    );

  const minutes =
    Number.isFinite(
      configuredMinutes
    ) &&
    configuredMinutes > 0
      ? configuredMinutes
      : DEFAULT_PASSWORD_RESET_EXPIRES_MINUTES;

  return new Date(
    Date.now() +
      minutes *
        60 *
        1000
  );
}

/* =========================================================
   PRISMA
========================================================= */

function isPrismaUniqueConstraintError(
  error:
    unknown
) {
  if (
    typeof error !==
      "object" ||
    error ===
      null
  ) {
    return false;
  }

  if (
    !(
      "code" in
      error
    )
  ) {
    return false;
  }

  return (
    error as {
      code?:
        unknown;
    }
  ).code ===
    "P2002";
}

/* =========================================================
   ERRO DE AUTENTICAÇÃO
========================================================= */

export class AuthError
  extends Error {
  statusCode:
    number;
  code?: string;

  constructor(
    message:
      string,

    statusCode = 400,
    code?: string,
  ) {
    super(
      message
    );

    this.name =
      "AuthError";

    this.statusCode =
      statusCode;
    this.code = code;
  }
}
