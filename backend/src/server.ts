import app from "./app";

import {
  prisma,
} from "./database/prisma";

import {
  AzureDevOpsSyncScheduler,
} from "./jobs/AzureDevOpsSyncScheduler";

import {
  ensureApplicationSchema,
} from "./database/applicationSchema";

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const DEFAULT_PORT =
  3333;

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

const azureSyncScheduler =
  new AzureDevOpsSyncScheduler();

let server:
  ReturnType<typeof app.listen>;

async function start() {
  await ensureApplicationSchema();

  server = app.listen(
    PORT,
    () => {
      console.log(
        `🚀 TechLead Hub rodando na porta ${PORT}`,
      );

      /*
       * O scheduler inicia somente depois que o servidor
       * HTTP está efetivamente ouvindo.
       */
      azureSyncScheduler.start();
    },
  );
}

void start().catch((error) => {
  console.error("[server] Não foi possível preparar o banco:", error);
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

  azureSyncScheduler.stop();

  try {
    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        server?.close(
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
