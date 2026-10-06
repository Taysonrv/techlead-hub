import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

const DATABASE_BACKOFF_MS = [15_000, 30_000, 60_000] as const;
let databaseUnavailableUntil = 0;
let databaseFailureCount = 0;
let databaseCircuitOpen = false;
let recoveryProbe: Promise<boolean> | null = null;

function databaseErrorText(error: unknown) {
  if (error instanceof Error) return `${error.name} ${error.message}`.toLowerCase();
  return String(error ?? "").toLowerCase();
}

export function isDatabaseConnectivityError(error: unknown) {
  const value = error as { code?: string } | null;
  const text = databaseErrorText(error);
  return value?.code === "P1001" ||
    text.includes("can't reach database server") ||
    text.includes("server has closed the connection") ||
    text.includes("connectionreset") ||
    text.includes("connection reset") ||
    text.includes("forçado o cancelamento de uma conexão");
}

export function reportDatabaseFailure(error: unknown) {
  if (!isDatabaseConnectivityError(error)) return false;
  databaseFailureCount += 1;
  const delay = DATABASE_BACKOFF_MS[Math.min(databaseFailureCount - 1, DATABASE_BACKOFF_MS.length - 1)];
  databaseUnavailableUntil = Math.max(databaseUnavailableUntil, Date.now() + delay);
  process.env.APP_DATABASE_READY = "false";
  if (!databaseCircuitOpen) {
    databaseCircuitOpen = true;
    console.warn(`[database] PostgreSQL indisponível; circuito aberto e jobs de background serão pausados. | retry=${Math.round(delay / 1000)}s`);
  }
  return true;
}

export function databaseCircuitStatus() {
  return {
    open: databaseCircuitOpen,
    ready: process.env.APP_DATABASE_READY !== "false" && !databaseCircuitOpen,
    retryAfterMs: Math.max(0, databaseUnavailableUntil - Date.now()),
  };
}

export async function ensureDatabaseAvailable() {
  if (!databaseCircuitOpen && process.env.APP_DATABASE_READY !== "false") return true;
  if (Date.now() < databaseUnavailableUntil) return false;
  if (recoveryProbe) return recoveryProbe;

  recoveryProbe = (async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseFailureCount = 0;
      databaseUnavailableUntil = 0;
      process.env.APP_DATABASE_READY = "true";
      if (databaseCircuitOpen) console.log("[database] PostgreSQL disponível novamente; circuito fechado e processamentos liberados.");
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
