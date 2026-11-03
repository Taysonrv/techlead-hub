ALTER TABLE "Ticket" ADD COLUMN "ticketType" INTEGER;

-- Existing records retain NULL until their next Movidesk sync or explicit reconciliation.
-- Never infer the type from the customer name or from action visibility.
