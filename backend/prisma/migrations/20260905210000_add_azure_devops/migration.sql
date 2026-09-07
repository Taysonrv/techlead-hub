-- CreateEnum
CREATE TYPE "AzureSyncStatus" AS ENUM ('PROCESSING', 'SUCCESS', 'PARTIAL', 'ERROR');

-- CreateTable
CREATE TABLE "AzureSyncRun" (
    "id" SERIAL NOT NULL,
    "batch" TEXT NOT NULL,
    "status" "AzureSyncStatus" NOT NULL DEFAULT 'PROCESSING',
    "source" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "insertedItems" INTEGER NOT NULL DEFAULT 0,
    "updatedItems" INTEGER NOT NULL DEFAULT 0,
    "skippedItems" INTEGER NOT NULL DEFAULT 0,
    "errorItems" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AzureSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AzureWorkItem" (
    "id" INTEGER NOT NULL,
    "revision" INTEGER,
    "workItemType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "reason" TEXT,
    "assignedToName" TEXT,
    "assignedToEmail" TEXT,
    "assignedToId" TEXT,
    "createdByName" TEXT,
    "createdByEmail" TEXT,
    "changedByName" TEXT,
    "changedByEmail" TEXT,
    "areaPath" TEXT,
    "iterationPath" TEXT,
    "nodeName" TEXT,
    "boardColumn" TEXT,
    "client" TEXT,
    "criticality" TEXT,
    "origin" TEXT,
    "detectedIn" TEXT,
    "module" TEXT,
    "process" TEXT,
    "movideskTicket" INTEGER,
    "deliveredVersion" TEXT,
    "prioritized" BOOLEAN,
    "blockedProcess" BOOLEAN,
    "impactScale" TEXT,
    "defectType" TEXT,
    "branchType" TEXT,
    "correctionType" TEXT,
    "rdmNumber" TEXT,
    "slaLimit" TIMESTAMP(3),
    "parentId" INTEGER,
    "description" TEXT,
    "workaround" TEXT,
    "technicalSolution" TEXT,
    "tags" TEXT,
    "azureCreatedAt" TIMESTAMP(3),
    "azureChangedAt" TIMESTAMP(3),
    "azureClosedAt" TIMESTAMP(3),
    "stateChangedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "remoteUrl" TEXT,
    "rawFields" JSONB,
    "rawRelations" JSONB,
    "syncRunId" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AzureWorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AzureSyncRun_batch_key" ON "AzureSyncRun"("batch");

-- CreateIndex
CREATE INDEX "AzureSyncRun_status_idx" ON "AzureSyncRun"("status");

-- CreateIndex
CREATE INDEX "AzureSyncRun_source_idx" ON "AzureSyncRun"("source");

-- CreateIndex
CREATE INDEX "AzureSyncRun_userId_idx" ON "AzureSyncRun"("userId");

-- CreateIndex
CREATE INDEX "AzureSyncRun_startedAt_idx" ON "AzureSyncRun"("startedAt");

-- CreateIndex
CREATE INDEX "AzureSyncRun_finishedAt_idx" ON "AzureSyncRun"("finishedAt");

-- CreateIndex
CREATE INDEX "AzureWorkItem_workItemType_idx" ON "AzureWorkItem"("workItemType");

-- CreateIndex
CREATE INDEX "AzureWorkItem_state_idx" ON "AzureWorkItem"("state");

-- CreateIndex
CREATE INDEX "AzureWorkItem_reason_idx" ON "AzureWorkItem"("reason");

-- CreateIndex
CREATE INDEX "AzureWorkItem_assignedToName_idx" ON "AzureWorkItem"("assignedToName");

-- CreateIndex
CREATE INDEX "AzureWorkItem_assignedToEmail_idx" ON "AzureWorkItem"("assignedToEmail");

-- CreateIndex
CREATE INDEX "AzureWorkItem_areaPath_idx" ON "AzureWorkItem"("areaPath");

-- CreateIndex
CREATE INDEX "AzureWorkItem_iterationPath_idx" ON "AzureWorkItem"("iterationPath");

-- CreateIndex
CREATE INDEX "AzureWorkItem_boardColumn_idx" ON "AzureWorkItem"("boardColumn");

-- CreateIndex
CREATE INDEX "AzureWorkItem_client_idx" ON "AzureWorkItem"("client");

-- CreateIndex
CREATE INDEX "AzureWorkItem_criticality_idx" ON "AzureWorkItem"("criticality");

-- CreateIndex
CREATE INDEX "AzureWorkItem_origin_idx" ON "AzureWorkItem"("origin");

-- CreateIndex
CREATE INDEX "AzureWorkItem_detectedIn_idx" ON "AzureWorkItem"("detectedIn");

-- CreateIndex
CREATE INDEX "AzureWorkItem_module_idx" ON "AzureWorkItem"("module");

-- CreateIndex
CREATE INDEX "AzureWorkItem_process_idx" ON "AzureWorkItem"("process");

-- CreateIndex
CREATE INDEX "AzureWorkItem_movideskTicket_idx" ON "AzureWorkItem"("movideskTicket");

-- CreateIndex
CREATE INDEX "AzureWorkItem_deliveredVersion_idx" ON "AzureWorkItem"("deliveredVersion");

-- CreateIndex
CREATE INDEX "AzureWorkItem_prioritized_idx" ON "AzureWorkItem"("prioritized");

-- CreateIndex
CREATE INDEX "AzureWorkItem_blockedProcess_idx" ON "AzureWorkItem"("blockedProcess");

-- CreateIndex
CREATE INDEX "AzureWorkItem_defectType_idx" ON "AzureWorkItem"("defectType");

-- CreateIndex
CREATE INDEX "AzureWorkItem_branchType_idx" ON "AzureWorkItem"("branchType");

-- CreateIndex
CREATE INDEX "AzureWorkItem_correctionType_idx" ON "AzureWorkItem"("correctionType");

-- CreateIndex
CREATE INDEX "AzureWorkItem_parentId_idx" ON "AzureWorkItem"("parentId");

-- CreateIndex
CREATE INDEX "AzureWorkItem_azureCreatedAt_idx" ON "AzureWorkItem"("azureCreatedAt");

-- CreateIndex
CREATE INDEX "AzureWorkItem_azureChangedAt_idx" ON "AzureWorkItem"("azureChangedAt");

-- CreateIndex
CREATE INDEX "AzureWorkItem_azureClosedAt_idx" ON "AzureWorkItem"("azureClosedAt");

-- CreateIndex
CREATE INDEX "AzureWorkItem_stateChangedAt_idx" ON "AzureWorkItem"("stateChangedAt");

-- CreateIndex
CREATE INDEX "AzureWorkItem_syncRunId_idx" ON "AzureWorkItem"("syncRunId");

-- CreateIndex
CREATE INDEX "AzureWorkItem_syncedAt_idx" ON "AzureWorkItem"("syncedAt");

-- CreateIndex
CREATE INDEX "Ticket_deliveredVersion_idx" ON "Ticket"("deliveredVersion");

-- AddForeignKey
ALTER TABLE "AzureSyncRun" ADD CONSTRAINT "AzureSyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AzureWorkItem" ADD CONSTRAINT "AzureWorkItem_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "AzureSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
