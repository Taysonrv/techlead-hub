-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "cause" TEXT,
ADD COLUMN     "contact" TEXT,
ADD COLUMN     "deliveredVersion" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "firstResponseDate" TIMESTAMP(3),
ADD COLUMN     "firstResponseDueDate" TIMESTAMP(3),
ADD COLUMN     "importBatch" TEXT,
ADD COLUMN     "importSource" TEXT,
ADD COLUMN     "importedAt" TIMESTAMP(3),
ADD COLUMN     "justification" TEXT,
ADD COLUMN     "taskNumber" INTEGER,
ADD COLUMN     "taskStatus" TEXT;

-- CreateIndex
CREATE INDEX "Ticket_client_idx" ON "Ticket"("client");

-- CreateIndex
CREATE INDEX "Ticket_contact_idx" ON "Ticket"("contact");

-- CreateIndex
CREATE INDEX "Ticket_owner_idx" ON "Ticket"("owner");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_category_idx" ON "Ticket"("category");

-- CreateIndex
CREATE INDEX "Ticket_urgency_idx" ON "Ticket"("urgency");

-- CreateIndex
CREATE INDEX "Ticket_createdDate_idx" ON "Ticket"("createdDate");
