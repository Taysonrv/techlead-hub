CREATE TABLE "ChatOnlineEvent" (
  "id" BIGSERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ChatOnlineEvent_occurredAt_idx" ON "ChatOnlineEvent" ("occurredAt" DESC);
