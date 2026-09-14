ALTER TABLE "UserSession"
  ADD COLUMN IF NOT EXISTS "deviceId" TEXT,
  ADD COLUMN IF NOT EXISTS "clientType" TEXT NOT NULL DEFAULT 'WEB',
  ADD COLUMN IF NOT EXISTS "appVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "avatarData" BYTEA,
  ADD COLUMN IF NOT EXISTS "avatarMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "avatarUpdatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "UserSession_userId_clientType_revokedAt_idx"
  ON "UserSession"("userId", "clientType", "revokedAt");
CREATE INDEX IF NOT EXISTS "UserSession_lastActivityAt_idx"
  ON "UserSession"("lastActivityAt");

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
);

CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);
