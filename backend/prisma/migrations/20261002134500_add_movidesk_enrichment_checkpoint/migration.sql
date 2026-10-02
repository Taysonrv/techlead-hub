CREATE TABLE "MovideskTicketEnrichment" (
  "id" SERIAL NOT NULL,
  "ticketId" INTEGER NOT NULL,
  "sourceLastUpdate" TIMESTAMP(3),
  "enrichedAt" TIMESTAMP(3) NOT NULL,
  "actionsCount" INTEGER NOT NULL DEFAULT 0,
  "timeAppointmentsCount" INTEGER NOT NULL DEFAULT 0,
  "ownerHistoriesCount" INTEGER NOT NULL DEFAULT 0,
  "statusHistoriesCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "errorAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MovideskTicketEnrichment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MovideskTicketEnrichment_ticketId_key" ON "MovideskTicketEnrichment"("ticketId");
CREATE INDEX "MovideskTicketEnrichment_sourceLastUpdate_idx" ON "MovideskTicketEnrichment"("sourceLastUpdate");
CREATE INDEX "MovideskTicketEnrichment_enrichedAt_idx" ON "MovideskTicketEnrichment"("enrichedAt");
CREATE INDEX "MovideskTicketEnrichment_errorAt_idx" ON "MovideskTicketEnrichment"("errorAt");
ALTER TABLE "MovideskTicketEnrichment" ADD CONSTRAINT "MovideskTicketEnrichment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
