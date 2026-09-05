-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "responseSlaIndicator" TEXT,
ADD COLUMN     "solutionSlaIndicator" TEXT;

-- CreateIndex
CREATE INDEX "Ticket_dueDate_idx" ON "Ticket"("dueDate");

-- CreateIndex
CREATE INDEX "Ticket_firstResponseDate_idx" ON "Ticket"("firstResponseDate");

-- CreateIndex
CREATE INDEX "Ticket_resolvedDate_idx" ON "Ticket"("resolvedDate");

-- CreateIndex
CREATE INDEX "Ticket_closedDate_idx" ON "Ticket"("closedDate");

-- CreateIndex
CREATE INDEX "Ticket_solutionSlaIndicator_idx" ON "Ticket"("solutionSlaIndicator");

-- CreateIndex
CREATE INDEX "Ticket_responseSlaIndicator_idx" ON "Ticket"("responseSlaIndicator");

-- CreateIndex
CREATE INDEX "Ticket_taskNumber_idx" ON "Ticket"("taskNumber");

-- CreateIndex
CREATE INDEX "Ticket_taskStatus_idx" ON "Ticket"("taskStatus");
