ALTER TABLE "ImportRun"
  ADD COLUMN "fileHash" VARCHAR(64),
  ADD COLUMN "errorDetails" JSONB;

CREATE INDEX "ImportRun_fileHash_idx" ON "ImportRun"("fileHash");
