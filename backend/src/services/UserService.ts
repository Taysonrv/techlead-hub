import { prisma } from "../database/prisma";
import { AuthError } from "./AuthService";

/* =========================================================
   SELECT PADRÃO
========================================================= */

const USER_ADMIN_SELECT = {
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
  createdAt: true,
  updatedAt: true,
} as const;

/* =========================================================
   SERVICE
========================================================= */

export class UserService {
  /* =======================================================
     VALIDA ADMINISTRADOR
  ======================================================= */

  async ensureAdmin(userId: number) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AuthError(
        "Usuário não autenticado.",
        401
      );
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },

      select: {
        id: true,
        role: true,
        active: true,
        approvalStatus: true,
      },
    });

    if (
      !user ||
      !user.active ||
      user.approvalStatus !== "APPROVED"
    ) {
      throw new AuthError(
        "Usuário não autenticado ou sem acesso.",
        401
      );
    }

    if (user.role !== "ADMIN") {
      throw new AuthError(
        "Você não possui permissão para administrar usuários.",
        403
      );
    }

    return user;
  }

  /* =======================================================
     LISTAR TODOS OS USUÁRIOS
  ======================================================= */

  async listUsers(adminUserId: number) {
    await this.ensureAdmin(adminUserId);

    return prisma.user.findMany({
      select: USER_ADMIN_SELECT,

      orderBy: [
        {
          approvalStatus: "asc",
        },
        {
          name: "asc",
        },
      ],
    });
  }

  /* =======================================================
     LISTAR CADASTROS PENDENTES
  ======================================================= */

  async listPendingUsers(adminUserId: number) {
    await this.ensureAdmin(adminUserId);

    return prisma.user.findMany({
      where: {
        approvalStatus: "PENDING",
      },

      select: USER_ADMIN_SELECT,

      orderBy: {
        createdAt: "asc",
      },
    });
  }

  /* =======================================================
     APROVAR USUÁRIO
  ======================================================= */

  async approveUser(
    adminUserId: number,
    targetUserId: number
  ) {
    await this.ensureAdmin(adminUserId);

    const targetUser =
      await this.getTargetUser(targetUserId);

    if (targetUser.id === adminUserId) {
      throw new AuthError(
        "Não é necessário aprovar sua própria conta.",
        400
      );
    }

    if (targetUser.role === "ADMIN") {
      throw new AuthError(
        "Contas administrativas não podem ser alteradas por esta operação.",
        403
      );
    }

    if (
      targetUser.approvalStatus === "APPROVED" &&
      targetUser.active
    ) {
      throw new AuthError(
        "Este usuário já está aprovado e ativo.",
        409
      );
    }

    return prisma.user.update({
      where: {
        id: targetUserId,
      },

      data: {
        approvalStatus: "APPROVED",
        active: true,
        approvedAt: new Date(),
        approvedById: adminUserId,
      },

      select: USER_ADMIN_SELECT,
    });
  }

  /* =======================================================
     REJEITAR USUÁRIO
  ======================================================= */

  async rejectUser(
    adminUserId: number,
    targetUserId: number
  ) {
    await this.ensureAdmin(adminUserId);

    const targetUser =
      await this.getTargetUser(targetUserId);

    if (targetUser.id === adminUserId) {
      throw new AuthError(
        "Você não pode rejeitar sua própria conta.",
        400
      );
    }

    if (targetUser.role === "ADMIN") {
      throw new AuthError(
        "Contas administrativas não podem ser rejeitadas por esta operação.",
        403
      );
    }

    if (
      targetUser.approvalStatus === "REJECTED"
    ) {
      throw new AuthError(
        "Este usuário já foi rejeitado.",
        409
      );
    }

    const now = new Date();

    const updatedUser =
      await prisma.$transaction(
        async (transaction) => {
          const user =
            await transaction.user.update({
              where: {
                id: targetUserId,
              },

              data: {
                approvalStatus: "REJECTED",
                active: false,
                approvedAt: null,
                approvedById: adminUserId,
              },

              select: USER_ADMIN_SELECT,
            });

          /*
           * Se o usuário já possuía sessões anteriores,
           * todas são revogadas imediatamente.
           */
          await transaction.userSession.updateMany({
            where: {
              userId: targetUserId,
              revokedAt: null,
            },

            data: {
              revokedAt: now,
            },
          });

          return user;
        }
      );

    return updatedUser;
  }

  /* =======================================================
     ATIVAR USUÁRIO
  ======================================================= */

  async activateUser(
    adminUserId: number,
    targetUserId: number
  ) {
    await this.ensureAdmin(adminUserId);

    const targetUser =
      await this.getTargetUser(targetUserId);

    if (targetUser.id === adminUserId) {
      throw new AuthError(
        "Sua conta administrativa já é gerenciada pelo fluxo de autenticação.",
        400
      );
    }

    if (targetUser.role === "ADMIN") {
      throw new AuthError(
        "Contas administrativas não podem ser alteradas por esta operação.",
        403
      );
    }

    if (
      targetUser.approvalStatus !== "APPROVED"
    ) {
      throw new AuthError(
        "Somente usuários aprovados podem ser ativados.",
        409
      );
    }

    if (targetUser.active) {
      throw new AuthError(
        "Este usuário já está ativo.",
        409
      );
    }

    return prisma.user.update({
      where: {
        id: targetUserId,
      },

      data: {
        active: true,
      },

      select: USER_ADMIN_SELECT,
    });
  }

  /* =======================================================
     DESATIVAR USUÁRIO
  ======================================================= */

  async deactivateUser(
    adminUserId: number,
    targetUserId: number
  ) {
    await this.ensureAdmin(adminUserId);

    const targetUser =
      await this.getTargetUser(targetUserId);

    if (targetUser.id === adminUserId) {
      throw new AuthError(
        "Você não pode desativar sua própria conta administrativa.",
        400
      );
    }

    if (targetUser.role === "ADMIN") {
      throw new AuthError(
        "Contas administrativas não podem ser desativadas por esta operação.",
        403
      );
    }

    if (!targetUser.active) {
      throw new AuthError(
        "Este usuário já está inativo.",
        409
      );
    }

    const now = new Date();

    const updatedUser =
      await prisma.$transaction(
        async (transaction) => {
          const user =
            await transaction.user.update({
              where: {
                id: targetUserId,
              },

              data: {
                active: false,
              },

              select: USER_ADMIN_SELECT,
            });

          /*
           * Desativação deve derrubar sessões existentes.
           */
          await transaction.userSession.updateMany({
            where: {
              userId: targetUserId,
              revokedAt: null,
            },

            data: {
              revokedAt: now,
            },
          });

          return user;
        }
      );

    return updatedUser;
  }

  /* =======================================================
     BUSCA USUÁRIO ALVO
  ======================================================= */

  private async getTargetUser(
    userId: number
  ) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AuthError(
        "Usuário inválido.",
        400
      );
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },

      select: {
        id: true,
        role: true,
        active: true,
        approvalStatus: true,
      },
    });

    if (!user) {
      throw new AuthError(
        "Usuário não encontrado.",
        404
      );
    }

    return user;
  }
}