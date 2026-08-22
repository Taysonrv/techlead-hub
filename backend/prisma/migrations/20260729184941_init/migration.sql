-- CreateTable
CREATE TABLE "Ticket" (
    "id" SERIAL NOT NULL,
    "movideskId" INTEGER NOT NULL,
    "protocol" TEXT,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "baseStatus" TEXT,
    "category" TEXT,
    "urgency" TEXT,
    "service" TEXT,
    "owner" TEXT,
    "ownerTeam" TEXT,
    "client" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lifetimeMinutes" INTEGER,
    "stoppedMinutes" INTEGER,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_movideskId_key" ON "Ticket"("movideskId");
