import {
  prisma,
} from "./prisma";

/**
 * Estruturas internas evolutivas do desktop. Usamos DDL idempotente
 * porque a instalação distribuída não possui o Prisma CLI em runtime.
 */
export async function ensureApplicationSchema() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "avatarData" BYTEA,
      ADD COLUMN IF NOT EXISTS "avatarMimeType" TEXT,
      ADD COLUMN IF NOT EXISTS "avatarUpdatedAt" TIMESTAMP(3)
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "UserSession"
      ADD COLUMN IF NOT EXISTS "deviceId" TEXT,
      ADD COLUMN IF NOT EXISTS "clientType" TEXT NOT NULL DEFAULT 'WEB',
      ADD COLUMN IF NOT EXISTS "appVersion" TEXT,
      ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserSession_userId_clientType_revokedAt_idx"
    ON "UserSession" ("userId", "clientType", "revokedAt")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserSession_lastActivityAt_idx"
    ON "UserSession" ("lastActivityAt")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ChatPresence" (
      "userId" INTEGER PRIMARY KEY,
      "status" VARCHAR(20) NOT NULL DEFAULT 'ONLINE',
      "statusMessage" VARCHAR(160),
      "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ChatPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ChatTyping" (
      "channelId" INTEGER NOT NULL,
      "userId" INTEGER NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ChatTyping_pkey" PRIMARY KEY ("channelId", "userId"),
      CONSTRAINT "ChatTyping_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ChatTyping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ChatPresence_lastSeenAt_idx" ON "ChatPresence" ("lastSeenAt" DESC)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ChatTyping_expiresAt_idx" ON "ChatTyping" ("expiresAt")`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" SERIAL PRIMARY KEY,
      "userId" INTEGER,
      "action" VARCHAR(100) NOT NULL,
      "entity" VARCHAR(100),
      "entityId" VARCHAR(120),
      "metadata" JSONB,
      "ipAddress" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog" ("userId", "createdAt" DESC)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog" ("action", "createdAt" DESC)`);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ImportRun"
      ADD COLUMN IF NOT EXISTS "fileHash" VARCHAR(64),
      ADD COLUMN IF NOT EXISTS "errorDetails" JSONB
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ImportRun_fileHash_idx"
    ON "ImportRun" ("fileHash")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SystemSetting" (
      "key" VARCHAR(120) PRIMARY KEY,
      "value" TEXT NOT NULL,
      "encrypted" BOOLEAN NOT NULL DEFAULT TRUE,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedById" INTEGER,
      CONSTRAINT "SystemSetting_updatedById_fkey"
        FOREIGN KEY ("updatedById") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MicrosoftUserConnection" (
      "userId" INTEGER PRIMARY KEY,
      "refreshToken" TEXT NOT NULL,
      "account" TEXT,
      "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MicrosoftUserConnection_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);


  /*
   * Campos enriquecidos do payload JSON do Movidesk.
   * Apenas amplia a estrutura; nenhum valor existente é recalculado.
   */
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Ticket"
      ADD COLUMN IF NOT EXISTS "serviceFirstLevel" TEXT,
      ADD COLUMN IF NOT EXISTS "serviceSecondLevel" TEXT,
      ADD COLUMN IF NOT EXISTS "serviceThirdLevel" TEXT,
      ADD COLUMN IF NOT EXISTS "businessArea" TEXT,
      ADD COLUMN IF NOT EXISTS "origin" INTEGER,
      ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS "createdBy" TEXT,
      ADD COLUMN IF NOT EXISTS "lastActionDate" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "lastUpdate" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "canceledDate" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "reopenedDate" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "actionCount" INTEGER,
      ADD COLUMN IF NOT EXISTS "resolvedInFirstCall" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "stoppedWorkingMinutes" INTEGER,
      ADD COLUMN IF NOT EXISTS "slaAgreement" TEXT,
      ADD COLUMN IF NOT EXISTS "slaAgreementRule" TEXT,
      ADD COLUMN IF NOT EXISTS "slaSolutionTimeMinutes" INTEGER,
      ADD COLUMN IF NOT EXISTS "slaResponseTimeMinutes" INTEGER,
      ADD COLUMN IF NOT EXISTS "slaSolutionDueDate" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "slaResponseDueDate" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "slaRealResponseDate" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "slaPaused" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "taskTitle" TEXT,
      ADD COLUMN IF NOT EXISTS "taskType" TEXT,
      ADD COLUMN IF NOT EXISTS "taskUrl" TEXT,
      ADD COLUMN IF NOT EXISTS "registeredVersion" TEXT,
      ADD COLUMN IF NOT EXISTS "causeDetail" TEXT,
      ADD COLUMN IF NOT EXISTS "rawData" JSONB
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Ticket_serviceFirstLevel_idx" ON "Ticket" ("serviceFirstLevel")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Ticket_serviceSecondLevel_idx" ON "Ticket" ("serviceSecondLevel")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Ticket_serviceThirdLevel_idx" ON "Ticket" ("serviceThirdLevel")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Ticket_businessArea_idx" ON "Ticket" ("businessArea")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Ticket_taskType_idx" ON "Ticket" ("taskType")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Ticket_registeredVersion_idx" ON "Ticket" ("registeredVersion")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Ticket_lastUpdate_idx" ON "Ticket" ("lastUpdate")`);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "AzureWorkItem"
      ADD COLUMN IF NOT EXISTS "participantClients" TEXT,
      ADD COLUMN IF NOT EXISTS "participantMovideskTickets" TEXT,
      ADD COLUMN IF NOT EXISTS "registeredVersion" TEXT
  `);


  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AzureWorkItem_registeredVersion_idx"
    ON "AzureWorkItem" ("registeredVersion")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AzureWorkItem_participantClients_idx"
    ON "AzureWorkItem" ("participantClients")
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
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SimerMapNode" (
      "id" SERIAL PRIMARY KEY,
      "sourceFile" VARCHAR(260) NOT NULL,
      "mapName" VARCHAR(260) NOT NULL,
      "nodeText" TEXT NOT NULL,
      "path" TEXT NOT NULL,
      "depth" INTEGER NOT NULL DEFAULT 0,
      "parentPath" TEXT,
      "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SimerMapNode_mapName_idx" ON "SimerMapNode" ("mapName")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SimerMapNode_sourceFile_idx" ON "SimerMapNode" ("sourceFile")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SimerMapNode_nodeText_idx" ON "SimerMapNode" ("nodeText")`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "SimerMapNode" ADD COLUMN IF NOT EXISTS "nodeId" VARCHAR(120)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "SimerMapNode" ADD COLUMN IF NOT EXISTS "parentNodeId" VARCHAR(120)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "SimerMapNode" ADD COLUMN IF NOT EXISTS "icon" VARCHAR(120)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "SimerMapNode" ADD COLUMN IF NOT EXISTS "link" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "SimerMapNode" ADD COLUMN IF NOT EXISTS "nodeKind" VARCHAR(80)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SimerMapNode_nodeId_idx" ON "SimerMapNode" ("nodeId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SimerMapNode_kind_idx" ON "SimerMapNode" ("nodeKind")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SimerMapNode_link_idx" ON "SimerMapNode" ("link")`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SystemRuleProcess" (
      "id" SERIAL PRIMARY KEY,
      "sourceFile" VARCHAR(500) NOT NULL,
      "name" VARCHAR(300) NOT NULL,
      "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SystemRuleProcess_source_name_key" UNIQUE ("sourceFile","name")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SystemRuleNode" (
      "id" SERIAL PRIMARY KEY,
      "processId" INTEGER NOT NULL REFERENCES "SystemRuleProcess"("id") ON DELETE CASCADE,
      "externalId" VARCHAR(120) NOT NULL,
      "name" TEXT NOT NULL,
      "kind" VARCHAR(40) NOT NULL,
      "documentation" TEXT,
      "lane" VARCHAR(250),
      "x" DOUBLE PRECISION,
      "y" DOUBLE PRECISION,
      CONSTRAINT "SystemRuleNode_process_external_key" UNIQUE ("processId","externalId")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SystemRuleTransition" (
      "id" SERIAL PRIMARY KEY,
      "processId" INTEGER NOT NULL REFERENCES "SystemRuleProcess"("id") ON DELETE CASCADE,
      "externalId" VARCHAR(120) NOT NULL,
      "fromId" VARCHAR(120) NOT NULL,
      "toId" VARCHAR(120) NOT NULL,
      "name" TEXT,
      "condition" TEXT
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SystemRuleNode_name_idx" ON "SystemRuleNode" (name)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SystemRuleNode_process_idx" ON "SystemRuleNode" ("processId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SystemRuleTransition_process_idx" ON "SystemRuleTransition" ("processId")`);
}
