CREATE TABLE "TeamResultsMeeting" (
  "id" SERIAL NOT NULL,
  "meetingDate" DATE NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "goals" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "highlights" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "actions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" INTEGER NOT NULL,
  "updatedById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamResultsMeeting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeamResultsMeeting_meetingDate_key" ON "TeamResultsMeeting"("meetingDate");
CREATE INDEX "TeamResultsMeeting_updatedAt_idx" ON "TeamResultsMeeting"("updatedAt");
