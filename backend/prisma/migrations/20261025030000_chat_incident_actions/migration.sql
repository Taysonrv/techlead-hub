CREATE TABLE "ChatIncidentAction" (
  "id" SERIAL NOT NULL,
  "channelId" INTEGER NOT NULL,
  "authorId" INTEGER NOT NULL,
  "kind" VARCHAR(24) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "details" VARCHAR(2000),
  "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  "assigneeId" INTEGER,
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "ChatIncidentAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChatIncidentAction_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE,
  CONSTRAINT "ChatIncidentAction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ChatIncidentAction_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX "ChatIncidentAction_channelId_createdAt_idx" ON "ChatIncidentAction"("channelId","createdAt");
CREATE INDEX "ChatIncidentAction_assigneeId_status_idx" ON "ChatIncidentAction"("assigneeId","status");
