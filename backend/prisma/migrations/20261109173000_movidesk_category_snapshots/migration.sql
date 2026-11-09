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

-- Seed the first OBSERVED state of pre-existing tickets.
-- This is not their category at ticket opening and has no historical changedAt.
INSERT INTO "MovideskCategorySnapshot"
  ("ticketId", "sequenceKey", "kind", "category", "previousCategory", "source", "observedAt", "sourceLastUpdate")
SELECT "id", md5('HUB_LEGACY|' || "id"::text), 'BASELINE', "category", NULL, 'HUB_LEGACY', CURRENT_TIMESTAMP, NULL
FROM "Ticket"
WHERE "category" IS NOT NULL AND length(trim("category")) > 0
ON CONFLICT ("ticketId", "sequenceKey") DO NOTHING;
