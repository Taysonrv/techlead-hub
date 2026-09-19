import {
  prisma,
} from "./database/prisma";

import {
  AzureDevOpsSyncScheduler,
} from "./jobs/AzureDevOpsSyncScheduler";

import {
  ensureApplicationSchema,
} from "./database/applicationSchema";
import { systemConfigurationService } from "./services/SystemConfigurationService";
import type { Server } from "node:http";
import type { Express } from "express";

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const DEFAULT_PORT =
  3333;

const HOST =
  process.env.HOST?.trim() ||
  "127.0.0.1";

const rawPort =
  process.env.PORT?.trim();

const parsedPort =
  rawPort &&
  /^\d+$/.test(
    rawPort,
  )
    ? Number(
        rawPort,
      )
    : DEFAULT_PORT;

const PORT =
  Number.isSafeInteger(
    parsedPort,
  ) &&
  parsedPort > 0 &&
  parsedPort <= 65535
    ? parsedPort
    : DEFAULT_PORT;

/* =========================================================
   SERVIDOR
========================================================= */

let azureSyncScheduler: AzureDevOpsSyncScheduler | undefined;

let server: Server | undefined;

async function start() {
  let databaseReady = false;
  try {
    await ensureApplicationSchema();
    await systemConfigurationService.loadIntoEnvironment();
    databaseReady = true;
    process.env.APP_DATABASE_READY = "true";
  } catch (error) {
    process.env.APP_DATABASE_READY = "false";
    console.error("[server] Banco indisponível na inicialização; API subirá em modo degradado:", error);
  }

  /*
   * O HTTP permanece disponível mesmo se o banco estiver temporariamente
   * indisponível. Isso permite health-check, diagnóstico e recuperação sem
   * transformar uma indisponibilidade do PostgreSQL em falha de processo.
   */
  const appModule = await import("./app.js");
  const exported = appModule.default as unknown as { default?: Express };
  const app = (exported.default ?? exported) as Express;
  azureSyncScheduler = databaseReady ? new AzureDevOpsSyncScheduler() : undefined;

  server = app.listen(
    PORT,
    HOST,
    () => {
      console.log(
        `🚀 TechLead Hub rodando em http://${HOST}:${PORT}`,
      );

      /*
       * O scheduler inicia somente depois que o servidor
       * HTTP está efetivamente ouvindo.
       */
      azureSyncScheduler?.start();
      if (!databaseReady) console.warn("[server] Scheduler Azure não iniciado enquanto o banco estiver indisponível.");
    },
  );
}

void start().catch((error) => {
  console.error("[server] Falha fatal ao iniciar o servidor:", error);
  process.exit(1);
});

/* =========================================================
   ENCERRAMENTO SEGURO
========================================================= */

let shuttingDown =
  false;

async function shutdown(
  signal:
    string,
): Promise<void> {
  if (
    shuttingDown
  ) {
    return;
  }

  shuttingDown =
    true;

  console.log(
    `[server] Encerramento solicitado (${signal}).`,
  );

  azureSyncScheduler?.stop();

  try {
    if (server) {
      const currentServer = server;
      await new Promise<void>(
        (
          resolve,
          reject,
        ) => {
          currentServer.close(
          (error) => {
            if (
              error
            ) {
              reject(
                error,
              );

              return;
            }

            resolve();
          },
          );
        },
      );
    }
  } catch (
    error
  ) {
    console.error(
      "[server] Erro ao encerrar o servidor HTTP:",
      error,
    );
  }

  try {
    await prisma.$disconnect();
  } catch (
    error
  ) {
    console.error(
      "[server] Erro ao desconectar o Prisma:",
      error,
    );
  }

  console.log(
    "[server] TechLead Hub encerrado.",
  );

  process.exit(
    0,
  );
}

process.on(
  "SIGINT",
  () => {
    void shutdown(
      "SIGINT",
    );
  },
);

process.on(
  "SIGTERM",
  () => {
    void shutdown(
      "SIGTERM",
    );
  },
);

process.on(
  "uncaughtException",
  (
    error,
  ) => {
    console.error(
      "[server] Exceção não tratada:",
      error,
    );

    void shutdown(
      "uncaughtException",
    );
  },
);

process.on(
  "unhandledRejection",
  (
    reason,
  ) => {
    console.error(
      "[server] Promise rejeitada sem tratamento:",
      reason,
    );

    void shutdown(
      "unhandledRejection",
    );
  },
);
