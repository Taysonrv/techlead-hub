CREATE TABLE "ChatAttachment" (
  "id" SERIAL NOT NULL,
  "channelId" INTEGER NOT NULL,
  "messageId" INTEGER NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "size" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "storage" VARCHAR(32) NOT NULL DEFAULT 'DATABASE',
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatAttachment_messageId_key" ON "ChatAttachment"("messageId");
CREATE INDEX "ChatAttachment_channelId_createdAt_idx" ON "ChatAttachment"("channelId", "createdAt");
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
