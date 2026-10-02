CREATE TABLE "MovideskOwnerHistory" (
  "id" SERIAL NOT NULL,
  "ticketId" INTEGER NOT NULL,
  "sequenceKey" TEXT NOT NULL,
  "ownerTeam" TEXT,
  "ownerId" TEXT,
  "ownerName" TEXT,
  "changedById" TEXT,
  "changedByName" TEXT,
  "changedDate" TIMESTAMP(3),
  "permanencyTimeFullSeconds" DOUBLE PRECISION,
  "permanencyTimeWorkingSeconds" DOUBLE PRECISION,
  "rawData" JSONB,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MovideskOwnerHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MovideskStatusHistory" (
  "id" SERIAL NOT NULL,
  "ticketId" INTEGER NOT NULL,
  "sequenceKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "justification" TEXT,
  "changedById" TEXT,
  "changedByName" TEXT,
  "changedDate" TIMESTAMP(3),
  "permanencyTimeFullSeconds" DOUBLE PRECISION,
  "permanencyTimeWorkingSeconds" DOUBLE PRECISION,
  "rawData" JSONB,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MovideskStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MovideskOwnerHistory_ticketId_sequenceKey_key" ON "MovideskOwnerHistory"("ticketId", "sequenceKey");
CREATE INDEX "MovideskOwnerHistory_ticketId_changedDate_idx" ON "MovideskOwnerHistory"("ticketId", "changedDate");
CREATE INDEX "MovideskOwnerHistory_ownerName_idx" ON "MovideskOwnerHistory"("ownerName");
CREATE INDEX "MovideskOwnerHistory_ownerTeam_idx" ON "MovideskOwnerHistory"("ownerTeam");

CREATE UNIQUE INDEX "MovideskStatusHistory_ticketId_sequenceKey_key" ON "MovideskStatusHistory"("ticketId", "sequenceKey");
CREATE INDEX "MovideskStatusHistory_ticketId_changedDate_idx" ON "MovideskStatusHistory"("ticketId", "changedDate");
CREATE INDEX "MovideskStatusHistory_status_idx" ON "MovideskStatusHistory"("status");
CREATE INDEX "MovideskStatusHistory_changedByName_idx" ON "MovideskStatusHistory"("changedByName");

ALTER TABLE "MovideskOwnerHistory" ADD CONSTRAINT "MovideskOwnerHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovideskStatusHistory" ADD CONSTRAINT "MovideskStatusHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
