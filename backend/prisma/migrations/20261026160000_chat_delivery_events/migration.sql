CREATE TABLE "ChatDeliveryEvent" (
  "id" BIGSERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "channelId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatDeliveryEvent_userId_id_idx" ON "ChatDeliveryEvent"("userId", "id");
CREATE INDEX "ChatDeliveryEvent_createdAt_idx" ON "ChatDeliveryEvent"("createdAt");
