-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COORDENADOR', 'ANALISTA');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PROCESSING', 'SUCCESS', 'PARTIAL', 'ERROR');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "importRunId" INTEGER;

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ANALISTA',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "deviceName" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" SERIAL NOT NULL,
    "batch" TEXT NOT NULL,
    "source" TEXT,
    "fileName" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "insertedRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_active_idx" ON "User"("active");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_revokedAt_idx" ON "UserSession"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRun_batch_key" ON "ImportRun"("batch");

-- CreateIndex
CREATE INDEX "ImportRun_status_idx" ON "ImportRun"("status");

-- CreateIndex
CREATE INDEX "ImportRun_userId_idx" ON "ImportRun"("userId");

-- CreateIndex
CREATE INDEX "ImportRun_startedAt_idx" ON "ImportRun"("startedAt");

-- CreateIndex
CREATE INDEX "ImportRun_finishedAt_idx" ON "ImportRun"("finishedAt");

-- CreateIndex
CREATE INDEX "Ticket_ownerTeam_idx" ON "Ticket"("ownerTeam");

-- CreateIndex
CREATE INDEX "Ticket_baseStatus_idx" ON "Ticket"("baseStatus");

-- CreateIndex
CREATE INDEX "Ticket_importedAt_idx" ON "Ticket"("importedAt");

-- CreateIndex
CREATE INDEX "Ticket_importBatch_idx" ON "Ticket"("importBatch");

-- CreateIndex
CREATE INDEX "Ticket_importRunId_idx" ON "Ticket"("importRunId");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRun" ADD CONSTRAINT "ImportRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
