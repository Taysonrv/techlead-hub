import { prisma } from "../database/prisma";
import { Prisma } from "@prisma/client";
import { ticketOperationalScope } from "../domain/OperationalScope";
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
  jobFunction: true,
  movideskOwnerName: true,
  permissions: true,
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

  async updateUserPermissions(adminUserId: number, targetUserId: number, permissions: unknown) {
    await this.ensureAdmin(adminUserId);
    const targetUser = await this.getTargetUser(targetUserId);
    if (targetUser.role === "ADMIN") {
      throw new AuthError("Administradores possuem acesso integral e não usam restrições por rotina.", 400);
    }
    if (!Array.isArray(permissions) || permissions.some((item) => typeof item !== "string")) {
      throw new AuthError("Lista de permissões inválida.", 400);
    }
    const allowedPermissions = new Set([
      "dashboard","tickets","my-operation","known-problems","attention","data-quality","clients","analysts",
      "simer-map","performance","reports","corrections","evolutions","support","versions","knowledge",
      "services","technical-leadership","coordination","imports",
    ]);
    const normalized = [...new Set(permissions.map((item) => item.trim()).filter(Boolean))];
    const invalid = normalized.filter((item) => !allowedPermissions.has(item));
    if (invalid.length) {
      throw new AuthError(`Permissões inválidas: ${invalid.join(", ")}.`, 400);
    }
    return prisma.user.update({
      where: { id: targetUserId },
      data: { permissions: normalized },
      select: USER_ADMIN_SELECT,
    });
  }

  async ticketOwnershipByFunction(adminUserId: number) {
    await this.ensureAdmin(adminUserId);
    const [users, owners] = await Promise.all([
      prisma.user.findMany({ where: { active: true, approvalStatus: "APPROVED" }, select: { id: true, name: true, jobFunction: true, movideskOwnerName: true } }),
      prisma.ticket.groupBy({ by: ["owner"], where: { AND: [ticketOperationalScope(), { isDeleted: false }] }, _count: { _all: true } }),
    ]);
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
    const byOwner = new Map(users.filter(user => user.movideskOwnerName).map(user => [normalize(user.movideskOwnerName!), user]));
    const byFunction = new Map<string, { function: string; tickets: number; owners: number }>();
    const unmatched: { owner: string; tickets: number }[] = [];
    for (const item of owners) {
      if (!item.owner?.trim()) continue;
      const owner = byOwner.get(normalize(item.owner));
      if (!owner) { unmatched.push({ owner: item.owner, tickets: item._count._all }); continue; }
      const key = owner.jobFunction || "SEM_FUNCAO";
      const row = byFunction.get(key) || { function: key, tickets: 0, owners: 0 };
      row.tickets += item._count._all;
      byFunction.set(key, row);
    }
    for (const user of users) if (user.movideskOwnerName) {
      const key = user.jobFunction || "SEM_FUNCAO";
      const row = byFunction.get(key) || { function: key, tickets: 0, owners: 0 };
      row.owners++;
      byFunction.set(key, row);
    }
    return {
      byFunction: [...byFunction.values()].sort((a,b) => b.tickets-a.tickets),
      unmatched: unmatched.sort((a,b) => b.tickets-a.tickets).slice(0,30),
      linkedUsers: users.filter(user => user.movideskOwnerName).length,
      totalUsers: users.length,
      note: "Contagem por responsável atual do Movidesk, dentro do escopo operacional SIMER; não representa autoria ou histórico de atribuições.",
    };
  }

  async updateMovideskOwnerName(adminUserId: number, targetUserId: number, value: unknown) {
    await this.ensureAdmin(adminUserId);
    await this.getTargetUser(targetUserId);
    if (value !== null && (typeof value !== "string" || value.trim().length > 200)) {
      throw new AuthError("Responsável Movidesk inválido (máximo 200 caracteres).", 400);
    }
    const name = typeof value === "string" ? value.trim() : "";
    if (name) {
      const existing = await prisma.user.findFirst({
        where: { movideskOwnerName: { equals: name, mode: "insensitive" }, id: { not: targetUserId } },
        select: { id: true },
      });
      if (existing) throw new AuthError("Este responsável Movidesk já está vinculado a outro usuário.", 409);
    }
    return prisma.user.update({
      where: { id: targetUserId },
      data: { movideskOwnerName: name || null },
      select: USER_ADMIN_SELECT,
    });
  }

  /** Função organizacional, separada de perfil e permissões. */
  async updateUserJobFunction(adminUserId: number, targetUserId: number, value: unknown) {
    await this.ensureAdmin(adminUserId);
    await this.getTargetUser(targetUserId);
    const allowed = ["COORDENADOR", "LIDER", "SUPORTE_SIMER_N1", "SUPORTE_SIMER_N2", "SUPORTE_SIMER_N3", "BANCO_DE_DADOS"] as const;
    if (value !== null && (typeof value !== "string" || !allowed.includes(value as typeof allowed[number]))) {
      throw new AuthError("Função inválida. Selecione uma das funções disponíveis.", 400);
    }
    return prisma.user.update({
      where: { id: targetUserId },
      data: { jobFunction: value as string | null },
      select: USER_ADMIN_SELECT,
    });
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
     ALTERAR PERFIL DE ACESSO
  ======================================================= */

  async updateUserRole(
    adminUserId: number,
    targetUserId: number,
    role: string
  ) {
    await this.ensureAdmin(adminUserId);

    const allowedRoles = [
      "ADMIN",
      "COORDENADOR",
      "ANALISTA",
    ] as const;

    if (
      !allowedRoles.includes(
        role as typeof allowedRoles[number]
      )
    ) {
      throw new AuthError(
        "Perfil de acesso inválido.",
        400
      );
    }

    const targetUser =
      await this.getTargetUser(targetUserId);

    if (
      targetUser.approvalStatus !== "APPROVED" ||
      !targetUser.active
    ) {
      throw new AuthError(
        "Somente usuários aprovados e ativos podem ter o perfil alterado.",
        409
      );
    }

    if (
      targetUser.id === adminUserId &&
      role !== "ADMIN"
    ) {
      throw new AuthError(
        "Você não pode remover o próprio acesso administrativo.",
        400
      );
    }

    if (
      targetUser.role === "ADMIN" &&
      role !== "ADMIN"
    ) {
      const activeAdminCount =
        await prisma.user.count({
          where: {
            role: "ADMIN",
            active: true,
            approvalStatus: "APPROVED",
          },
        });

      if (activeAdminCount <= 1) {
        throw new AuthError(
          "O sistema deve manter pelo menos um administrador ativo.",
          409
        );
      }
    }

    if (targetUser.role === role) {
      throw new AuthError(
        "O usuário já possui este perfil de acesso.",
        409
      );
    }

    return prisma.user.update({
      where: {
        id: targetUserId,
      },
      data: {
        role: role as "ADMIN" | "COORDENADOR" | "ANALISTA",
        // Não herdar permissões específicas do perfil anterior ao trocar de função.
        permissions: role === "ADMIN" ? [] : Prisma.DbNull,
      },
      select: USER_ADMIN_SELECT,
    });
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