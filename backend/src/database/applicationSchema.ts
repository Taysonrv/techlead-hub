import {
  prisma,
} from "./prisma";

/**
 * Estruturas internas evolutivas do desktop. Usamos DDL idempotente
 * porque a instalação distribuída não possui o Prisma CLI em runtime.
 */
export async function ensureApplicationSchema() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "AzureWorkItem"
      ADD COLUMN IF NOT EXISTS "participantClients" TEXT,
      ADD COLUMN IF NOT EXISTS "participantMovideskTickets" TEXT
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppNotificationRead" (
      "userId" INTEGER NOT NULL,
      "notificationKey" VARCHAR(500) NOT NULL,
      "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AppNotificationRead_pkey"
        PRIMARY KEY ("userId", "notificationKey"),
      CONSTRAINT "AppNotificationRead_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NotificationPreference" (
      "userId" INTEGER NOT NULL PRIMARY KEY,
      "appVersion" BOOLEAN NOT NULL DEFAULT TRUE,
      "simerVersion" BOOLEAN NOT NULL DEFAULT TRUE,
      "azureCompleted" BOOLEAN NOT NULL DEFAULT TRUE,
      "azureUpdated" BOOLEAN NOT NULL DEFAULT TRUE,
      "desktopAlerts" BOOLEAN NOT NULL DEFAULT TRUE,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "NotificationPreference_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AzureWorkItemHistory" (
      "id" SERIAL PRIMARY KEY,
      "workItemId" INTEGER NOT NULL,
      "syncRunId" INTEGER,
      "field" VARCHAR(80) NOT NULL,
      "oldValue" TEXT,
      "newValue" TEXT,
      "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AzureWorkItemHistory_workItemId_fkey"
        FOREIGN KEY ("workItemId") REFERENCES "AzureWorkItem"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "AzureWorkItemHistory_syncRunId_fkey"
        FOREIGN KEY ("syncRunId") REFERENCES "AzureSyncRun"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AzureWorkItemHistory_workItemId_changedAt_idx"
    ON "AzureWorkItemHistory" ("workItemId", "changedAt" DESC)
  `);
}
