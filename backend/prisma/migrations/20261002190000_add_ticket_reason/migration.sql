-- Separate Movidesk "Motivo" from "Causa" for coordination analytics.
ALTER TABLE "Ticket" ADD COLUMN "reason" TEXT;
CREATE INDEX "Ticket_reason_idx" ON "Ticket"("reason");
