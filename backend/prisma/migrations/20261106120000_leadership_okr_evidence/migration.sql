CREATE TABLE "LeadershipOkrEvidence" (
  "id" SERIAL PRIMARY KEY,
  "deliverable" VARCHAR(40) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT NOT NULL,
  "evidenceUrl" VARCHAR(1000),
  "owner" VARCHAR(200) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PLANNED',
  "dueDate" DATE,
  "createdById" INTEGER NOT NULL,
  "updatedById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "LeadershipOkrEvidence_deliverable_status_idx" ON "LeadershipOkrEvidence" ("deliverable", "status");
CREATE INDEX "LeadershipOkrEvidence_dueDate_idx" ON "LeadershipOkrEvidence" ("dueDate");
