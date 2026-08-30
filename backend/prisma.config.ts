// Configuração central do Prisma.
// Carrega as variáveis definidas no arquivo .env do backend.

import "dotenv/config";

import {
  defineConfig,
} from "prisma/config";

export default defineConfig({
  schema:
    "prisma/schema.prisma",

  migrations: {
    path:
      "prisma/migrations",

    seed:
      "tsx prisma/seed.ts",
  },

  datasource: {
    url:
      process.env[
        "DATABASE_URL"
      ],
  },
});