import "dotenv/config";

import {
  PrismaClient,
  UserRole,
} from "@prisma/client";

import bcrypt from "bcryptjs";

const prisma =
  new PrismaClient();

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const PASSWORD_SALT_ROUNDS =
  12;

const SEED_DEMO_TICKETS =
  process.env
    .SEED_DEMO_TICKETS ===
  "true";

const RESET_ADMIN_PASSWORD =
  process.env
    .RESET_ADMIN_PASSWORD ===
  "true";

/* =========================================================
   ADMINISTRADOR INICIAL
========================================================= */

async function seedAdminUser() {
  const name =
    process.env
      .SEED_ADMIN_NAME
      ?.trim() ||
    "Administrador TechLead Hub";

  const username =
    process.env
      .SEED_ADMIN_USERNAME
      ?.trim()
      .toLowerCase() ||
    "admin";

  const email =
    process.env
      .SEED_ADMIN_EMAIL
      ?.trim()
      .toLowerCase() ||
    null;

  const password =
    process.env
      .SEED_ADMIN_PASSWORD;

  if (!password) {
    throw new Error(
      [
        "SEED_ADMIN_PASSWORD não foi configurada.",
        "",
        "Configure a senha inicial no arquivo .env antes de executar o seed.",
        "",
        'Exemplo:',
        'SEED_ADMIN_PASSWORD="uma-senha-forte"',
      ].join("\n")
    );
  }

  if (
    password.length <
    10
  ) {
    throw new Error(
      "SEED_ADMIN_PASSWORD deve possuir pelo menos 10 caracteres."
    );
  }

  console.log(
    "Verificando usuário administrador..."
  );

  const existingUser =
    await prisma.user.findUnique({
      where: {
        username,
      },
    });

  /* =======================================================
     USUÁRIO JÁ EXISTE
  ======================================================= */

  if (existingUser) {
    const updateData = {
      name,
      email,
      role:
        UserRole.ADMIN,
      active: true,
    };

    if (
      RESET_ADMIN_PASSWORD
    ) {
      const passwordHash =
        await bcrypt.hash(
          password,
          PASSWORD_SALT_ROUNDS
        );

      await prisma.user.update({
        where: {
          id:
            existingUser.id,
        },

        data: {
          ...updateData,

          passwordHash,

          mustChangePassword:
            true,
        },
      });

      console.log(
        `Administrador "${username}" atualizado e senha redefinida.`
      );

      return;
    }

    await prisma.user.update({
      where: {
        id:
          existingUser.id,
      },

      data:
        updateData,
    });

    console.log(
      `Administrador "${username}" já existe. Dados cadastrais sincronizados.`
    );

    return;
  }

  /* =======================================================
     CRIAÇÃO
  ======================================================= */

  const passwordHash =
    await bcrypt.hash(
      password,
      PASSWORD_SALT_ROUNDS
    );

  const user =
    await prisma.user.create({
      data: {
        name,

        username,

        email,

        passwordHash,

        role:
          UserRole.ADMIN,

        active:
          true,

        mustChangePassword:
          true,
      },

      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
      },
    });

  console.log(
    `Administrador criado com sucesso: ${user.username} (#${user.id}).`
  );
}

/* =========================================================
   TICKETS DE DEMONSTRAÇÃO

   IMPORTANTE:
   Nunca apagamos os tickets existentes.

   Os dados abaixo somente serão criados quando:
   SEED_DEMO_TICKETS=true
========================================================= */

async function seedDemoTickets() {
  if (
    !SEED_DEMO_TICKETS
  ) {
    console.log(
      "Tickets de demonstração ignorados."
    );

    return;
  }

  console.log(
    "Criando/atualizando tickets de demonstração..."
  );

  const tickets = [
    {
      movideskId:
        1001,

      protocol:
        "MOVI202608000001",

      subject:
        "Erro ao emitir nota fiscal",

      status:
        "Em Atendimento",

      baseStatus:
        "InAttendance",

      category:
        "Faturamento",

      urgency:
        "Alta",

      service:
        "ERP > Fiscal",

      owner:
        "João Silva",

      ownerTeam:
        "Suporte",

      client:
        "Cooperativa Alfa",

      createdDate:
        new Date(
          "2026-08-10T08:30:00"
        ),

      resolvedDate:
        null,

      closedDate:
        null,

      lifetimeMinutes:
        1250,

      stoppedMinutes:
        0,

      importSource:
        "seed",

      importedAt:
        new Date(),
    },

    {
      movideskId:
        1002,

      protocol:
        "MOVI202608000002",

      subject:
        "Dúvida sobre cadastro de produto",

      status:
        "Resolvido",

      baseStatus:
        "Resolved",

      category:
        "Cadastro",

      urgency:
        "Média",

      service:
        "ERP > Cadastros",

      owner:
        "Maria Oliveira",

      ownerTeam:
        "Suporte",

      client:
        "Cooperativa Beta",

      createdDate:
        new Date(
          "2026-08-08T09:10:00"
        ),

      resolvedDate:
        new Date(
          "2026-08-08T14:20:00"
        ),

      closedDate:
        null,

      lifetimeMinutes:
        310,

      stoppedMinutes:
        20,

      importSource:
        "seed",

      importedAt:
        new Date(),
    },

    {
      movideskId:
        1003,

      protocol:
        "MOVI202608000003",

      subject:
        "Sistema apresentando lentidão",

      status:
        "Em Atendimento",

      baseStatus:
        "InAttendance",

      category:
        "Performance",

      urgency:
        "Crítica",

      service:
        "ERP > Sistema",

      owner:
        "Carlos Santos",

      ownerTeam:
        "Infraestrutura",

      client:
        "Cooperativa Gama",

      createdDate:
        new Date(
          "2026-08-11T07:45:00"
        ),

      resolvedDate:
        null,

      closedDate:
        null,

      lifetimeMinutes:
        890,

      stoppedMinutes:
        0,

      importSource:
        "seed",

      importedAt:
        new Date(),
    },

    {
      movideskId:
        1004,

      protocol:
        "MOVI202608000004",

      subject:
        "Erro na integração com sistema externo",

      status:
        "Parado",

      baseStatus:
        "Stopped",

      category:
        "Integração",

      urgency:
        "Alta",

      service:
        "Integrações",

      owner:
        "João Silva",

      ownerTeam:
        "Desenvolvimento",

      client:
        "Cooperativa Delta",

      createdDate:
        new Date(
          "2026-08-05T10:00:00"
        ),

      resolvedDate:
        null,

      closedDate:
        null,

      lifetimeMinutes:
        5600,

      stoppedMinutes:
        2400,

      importSource:
        "seed",

      importedAt:
        new Date(),
    },

    {
      movideskId:
        1005,

      protocol:
        "MOVI202608000005",

      subject:
        "Solicitação de melhoria no relatório",

      status:
        "Novo",

      baseStatus:
        "New",

      category:
        "Melhoria",

      urgency:
        "Baixa",

      service:
        "Relatórios",

      owner:
        null,

      ownerTeam:
        "Produto",

      client:
        "Cooperativa Épsilon",

      createdDate:
        new Date(
          "2026-08-12T11:30:00"
        ),

      resolvedDate:
        null,

      closedDate:
        null,

      lifetimeMinutes:
        180,

      stoppedMinutes:
        0,

      importSource:
        "seed",

      importedAt:
        new Date(),
    },
  ];

  for (
    const ticket
    of tickets
  ) {
    await prisma.ticket.upsert({
      where: {
        movideskId:
          ticket.movideskId,
      },

      update:
        ticket,

      create:
        ticket,
    });
  }

  console.log(
    `${tickets.length} tickets de demonstração sincronizados.`
  );
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  console.log(
    "========================================"
  );

  console.log(
    " TechLead Hub - Database Seed"
  );

  console.log(
    "========================================"
  );

  await seedAdminUser();

  await seedDemoTickets();

  console.log(
    "Seed concluído com sucesso."
  );
}

/* =========================================================
   EXECUÇÃO
========================================================= */

main()
  .catch(
    (error) => {
      console.error(
        "Erro ao executar seed:",
        error
      );

      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    }
  );