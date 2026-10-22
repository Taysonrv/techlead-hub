CREATE TYPE "TeamsAlertStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DEAD');

CREATE TABLE "TeamsAlertOutbox" (
    "id" TEXT NOT NULL,
    "movideskId" INTEGER NOT NULL,
    "eventType" VARCHAR(40) NOT NULL DEFAULT 'NEW_TICKET',
    "subject" TEXT NOT NULL,
    "client" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "urgency" TEXT,
    "status" "TeamsAlertStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastHttpStatus" INTEGER,
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamsAlertOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamsAlertOutbox_movideskId_eventType_key" ON "TeamsAlertOutbox"("movideskId", "eventType");
CREATE INDEX "TeamsAlertOutbox_status_nextAttemptAt_idx" ON "TeamsAlertOutbox"("status", "nextAttemptAt");
CREATE INDEX "TeamsAlertOutbox_lockedUntil_idx" ON "TeamsAlertOutbox"("lockedUntil");
