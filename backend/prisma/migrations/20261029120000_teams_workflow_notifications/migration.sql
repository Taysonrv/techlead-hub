CREATE TABLE "TeamsWorkflowOutbox" (
    "id" TEXT NOT NULL,
    "eventKey" VARCHAR(180) NOT NULL,
    "eventType" VARCHAR(40) NOT NULL,
    "movideskId" INTEGER NOT NULL,
    "azureWorkItemId" INTEGER,
    "payload" JSONB NOT NULL,
    "status" "TeamsAlertStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastHttpStatus" INTEGER,
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamsWorkflowOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamsWorkflowOutbox_eventKey_key" ON "TeamsWorkflowOutbox"("eventKey");
CREATE INDEX "TeamsWorkflowOutbox_status_nextAttemptAt_idx" ON "TeamsWorkflowOutbox"("status", "nextAttemptAt");
CREATE INDEX "TeamsWorkflowOutbox_lockedUntil_idx" ON "TeamsWorkflowOutbox"("lockedUntil");
CREATE INDEX "TeamsWorkflowOutbox_eventType_createdAt_idx" ON "TeamsWorkflowOutbox"("eventType", "createdAt");
CREATE INDEX "TeamsWorkflowOutbox_movideskId_idx" ON "TeamsWorkflowOutbox"("movideskId");
CREATE INDEX "TeamsWorkflowOutbox_azureWorkItemId_idx" ON "TeamsWorkflowOutbox"("azureWorkItemId");
