-- CreateTable
CREATE TABLE "CalendarMeeting" (
  "id" SERIAL NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
  "location" VARCHAR(240),
  "meetingUrl" TEXT,
  "externalAttendees" JSONB,
  "status" VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
  "externalProvider" VARCHAR(40),
  "externalEventId" VARCHAR(240),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" INTEGER NOT NULL,
  CONSTRAINT "CalendarMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarMeetingParticipant" (
  "meetingId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarMeetingParticipant_pkey" PRIMARY KEY ("meetingId","userId")
);

-- CreateIndex
CREATE INDEX "CalendarMeeting_startAt_idx" ON "CalendarMeeting"("startAt");

-- CreateIndex
CREATE INDEX "CalendarMeeting_endAt_idx" ON "CalendarMeeting"("endAt");

-- CreateIndex
CREATE INDEX "CalendarMeeting_createdById_startAt_idx" ON "CalendarMeeting"("createdById","startAt");

-- CreateIndex
CREATE INDEX "CalendarMeeting_status_startAt_idx" ON "CalendarMeeting"("status","startAt");

-- CreateIndex
CREATE INDEX "CalendarMeetingParticipant_userId_meetingId_idx" ON "CalendarMeetingParticipant"("userId","meetingId");

-- AddForeignKey
ALTER TABLE "CalendarMeeting" ADD CONSTRAINT "CalendarMeeting_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarMeetingParticipant" ADD CONSTRAINT "CalendarMeetingParticipant_meetingId_fkey"
FOREIGN KEY ("meetingId") REFERENCES "CalendarMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarMeetingParticipant" ADD CONSTRAINT "CalendarMeetingParticipant_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
