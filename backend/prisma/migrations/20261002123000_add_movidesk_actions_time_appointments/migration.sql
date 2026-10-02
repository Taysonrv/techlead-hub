-- Structured Movidesk ticket enrichment: actions and time appointments.
CREATE TABLE "MovideskTicketAction" (
  "id" SERIAL NOT NULL,
  "ticketId" INTEGER NOT NULL,
  "movideskActionId" INTEGER NOT NULL,
  "type" INTEGER,
  "origin" INTEGER,
  "description" TEXT,
  "status" TEXT,
  "justification" TEXT,
  "createdDate" TIMESTAMP(3),
  "createdById" TEXT,
  "createdByName" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "rawData" JSONB,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MovideskTicketAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MovideskTimeAppointment" (
  "id" SERIAL NOT NULL,
  "actionId" INTEGER NOT NULL,
  "movideskAppointmentId" INTEGER NOT NULL,
  "activity" TEXT,
  "date" TIMESTAMP(3),
  "periodStart" TEXT,
  "periodEnd" TEXT,
  "workTime" TEXT,
  "accountedTime" DECIMAL(18,6),
  "workTypeName" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdByTeamId" INTEGER,
  "createdByTeamName" TEXT,
  "rawData" JSONB,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MovideskTimeAppointment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MovideskTicketAction_ticketId_movideskActionId_key" ON "MovideskTicketAction"("ticketId", "movideskActionId");
CREATE INDEX "MovideskTicketAction_ticketId_createdDate_idx" ON "MovideskTicketAction"("ticketId", "createdDate");
CREATE INDEX "MovideskTicketAction_createdByName_idx" ON "MovideskTicketAction"("createdByName");
CREATE INDEX "MovideskTicketAction_status_idx" ON "MovideskTicketAction"("status");

CREATE UNIQUE INDEX "MovideskTimeAppointment_actionId_movideskAppointmentId_key" ON "MovideskTimeAppointment"("actionId", "movideskAppointmentId");
CREATE INDEX "MovideskTimeAppointment_actionId_date_idx" ON "MovideskTimeAppointment"("actionId", "date");
CREATE INDEX "MovideskTimeAppointment_createdByName_idx" ON "MovideskTimeAppointment"("createdByName");
CREATE INDEX "MovideskTimeAppointment_createdByTeamName_idx" ON "MovideskTimeAppointment"("createdByTeamName");
CREATE INDEX "MovideskTimeAppointment_activity_idx" ON "MovideskTimeAppointment"("activity");

ALTER TABLE "MovideskTicketAction" ADD CONSTRAINT "MovideskTicketAction_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovideskTimeAppointment" ADD CONSTRAINT "MovideskTimeAppointment_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "MovideskTicketAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
