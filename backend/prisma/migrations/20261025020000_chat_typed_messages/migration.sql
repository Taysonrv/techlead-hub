-- Evolução aditiva e retrocompatível: mensagens antigas continuam TEXT.
ALTER TABLE "ChatMessage"
  ADD COLUMN "kind" VARCHAR(24) NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "clientMessageId" VARCHAR(80);

CREATE UNIQUE INDEX "ChatMessage_channelId_authorId_clientMessageId_key"
  ON "ChatMessage"("channelId", "authorId", "clientMessageId");
