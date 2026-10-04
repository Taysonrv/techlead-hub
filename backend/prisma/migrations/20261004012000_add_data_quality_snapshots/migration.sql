CREATE TABLE "DataQualitySnapshot" (
  "id" SERIAL NOT NULL,
  "scopeKey" VARCHAR(80) NOT NULL,
  "snapshotDate" DATE NOT NULL,
  "metrics" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataQualitySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataQualitySnapshot_scopeKey_snapshotDate_key"
ON "DataQualitySnapshot"("scopeKey", "snapshotDate");

CREATE INDEX "DataQualitySnapshot_snapshotDate_idx"
ON "DataQualitySnapshot"("snapshotDate");
