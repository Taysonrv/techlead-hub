CREATE TYPE "ChatChannelType" AS ENUM ('DIRECT', 'TEAM', 'CLIENT', 'CONTEXT');

CREATE TABLE "ChatChannel" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "type" "ChatChannelType" NOT NULL DEFAULT 'TEAM',
  "description" VARCHAR(500),
  "contextType" VARCHAR(40),
  "contextId" VARCHAR(120),
  "clientName" VARCHAR(160),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatChannelMember" (
  "channelId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "lastReadAt" TIMESTAMP(3),
  "mutedAt" TIMESTAMP(3),
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatChannelMember_pkey" PRIMARY KEY ("channelId", "userId")
);

CREATE TABLE "ChatMessage" (
  "id" SERIAL NOT NULL,
  "channelId" INTEGER NOT NULL,
  "authorId" INTEGER NOT NULL,
  "parentId" INTEGER,
  "content" VARCHAR(4000) NOT NULL,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatChannel_type_archivedAt_idx" ON "ChatChannel"("type", "archivedAt");
CREATE INDEX "ChatChannel_contextType_contextId_idx" ON "ChatChannel"("contextType", "contextId");
CREATE INDEX "ChatChannelMember_userId_lastReadAt_idx" ON "ChatChannelMember"("userId", "lastReadAt");
CREATE INDEX "ChatMessage_channelId_createdAt_idx" ON "ChatMessage"("channelId", "createdAt");
CREATE INDEX "ChatMessage_authorId_createdAt_idx" ON "ChatMessage"("authorId", "createdAt");
CREATE INDEX "ChatMessage_parentId_idx" ON "ChatMessage"("parentId");

ALTER TABLE "ChatChannelMember" ADD CONSTRAINT "ChatChannelMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatChannelMember" ADD CONSTRAINT "ChatChannelMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
