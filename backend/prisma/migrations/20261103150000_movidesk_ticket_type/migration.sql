ALTER TABLE "Ticket" ADD COLUMN "ticketType" INTEGER;

-- Existing records retain NULL until their next Movidesk sync or explicit reconciliation.
-- Never infer the type from the customer name or from action visibility.

-- Recover the type already stored in historical JSON payloads when available.
UPDATE "Ticket"
SET "ticketType" = ("rawData"->>'type')::INTEGER
WHERE "rawData" IS NOT NULL
  AND ("rawData"->>'type') IN ('1', '2');
