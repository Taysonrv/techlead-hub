
import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  (
    process.env.NODE_TEST_CONTEXT
      ? "postgresql://test:test@127.0.0.1:5432/techlead_test"
      : undefined
  );

if (!databaseUrl) {
  throw new Error(
    "[database] DATABASE_URL não configurada. Verifique as variáveis de ambiente."
  );
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  adapter,
  log:
    process.env.NODE_ENV === "development"
      ? ["warn", "error"]
      : ["error"],
});


const DATABASE_BACKOFF_MS = [15_000, 30_000, 60_000] as const;

let databaseUnavailableUntil = 0;
let databaseFailureCount = 0;
let databaseCircuitOpen = false;
let recoveryProbe: Promise<boolean> | null = null;

function databaseErrorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.toLowerCase();
  }

  return String(error ?? "").toLowerCase();
}

export function isDatabaseConnectivityError(error: unknown): boolean {
  const value = error as { code?: string } | null;
  const text = databaseErrorText(error);

  const errorCode = value?.code;

  return (
    errorCode === "P1001" ||
    errorCode === "P2024" ||
    errorCode === "P2028" &&
      text.includes("unable to start a transaction") ||
    // Erros de conectividade do driver PostgreSQL (pg).
    errorCode === "ECONNREFUSED" ||
    errorCode === "ECONNRESET" ||
    errorCode === "ETIMEDOUT" ||
    errorCode === "EHOSTUNREACH" ||
    errorCode === "ENETUNREACH" ||
    text.includes("can't reach database server") ||
    text.includes("server has closed the connection") ||
    text.includes("connectionreset") ||
    text.includes("connection reset") ||
    text.includes("connection terminated unexpectedly") ||
    text.includes("connection terminated") ||
    text.includes("connection timeout") ||
    text.includes("connection refused") ||
    text.includes("forçado o cancelamento de uma conexão")
  );
}

export function reportDatabaseFailure(error: unknown): boolean {
  if (!isDatabaseConnectivityError(error)) {
    return false;
  }

  databaseFailureCount += 1;

  const backoffIndex = Math.min(
    databaseFailureCount - 1,
    DATABASE_BACKOFF_MS.length - 1
  );

  const delay = DATABASE_BACKOFF_MS[backoffIndex] ?? 60_000;

  databaseUnavailableUntil = Math.max(
    databaseUnavailableUntil,
    Date.now() + delay
  );

  process.env.APP_DATABASE_READY = "false";

  if (!databaseCircuitOpen) {
    databaseCircuitOpen = true;

    console.warn(
      "[database] PostgreSQL indisponível; circuito aberto e " +
      "jobs de background serão pausados. | " +
      `retry=${Math.round(delay / 1000)}s`
    );
  }

  return true;
}

export function databaseCircuitStatus() {
  return {
    open: databaseCircuitOpen,
    ready:
      process.env.APP_DATABASE_READY !== "false" &&
      !databaseCircuitOpen,
    retryAfterMs: Math.max(
      0,
      databaseUnavailableUntil - Date.now()
    ),
  };
}

export async function ensureDatabaseAvailable(): Promise<boolean> {
  if (
    !databaseCircuitOpen &&
    process.env.APP_DATABASE_READY !== "false"
  ) {
    return true;
  }

  if (Date.now() < databaseUnavailableUntil) {
    return false;
  }

  if (recoveryProbe) {
    return recoveryProbe;
  }

  recoveryProbe = (async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      databaseFailureCount = 0;
      databaseUnavailableUntil = 0;

      process.env.APP_DATABASE_READY = "true";

      if (databaseCircuitOpen) {
        console.log(
          "[database] PostgreSQL disponível novamente; " +
          "circuito fechado e processamentos liberados."
        );
      }

      databaseCircuitOpen = false;

      return true;
    } catch (error) {
      reportDatabaseFailure(error);

      return false;
    } finally {
      recoveryProbe = null;
    }
  })();

  return recoveryProbe;
}

export { prisma };
