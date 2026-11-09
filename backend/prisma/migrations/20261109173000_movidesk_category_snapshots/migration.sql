-- Historical category observations; timestamps identify collection, not the exact remote edit.
CREATE TABLE "MovideskCategorySnapshot" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "sequenceKey" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "category" VARCHAR(128) NOT NULL,
    "previousCategory" VARCHAR(128),
    "source" VARCHAR(40) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceLastUpdate" TIMESTAMP(3),
    CONSTRAINT "MovideskCategorySnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MovideskCategorySnapshot_ticketId_sequenceKey_key" ON "MovideskCategorySnapshot"("ticketId","sequenceKey");
CREATE INDEX "MovideskCategorySnapshot_ticketId_observedAt_idx" ON "MovideskCategorySnapshot"("ticketId","observedAt");
CREATE INDEX "MovideskCategorySnapshot_kind_category_idx" ON "MovideskCategorySnapshot"("kind","category");
ALTER TABLE "MovideskCategorySnapshot"
    ADD CONSTRAINT "MovideskCategorySnapshot_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
