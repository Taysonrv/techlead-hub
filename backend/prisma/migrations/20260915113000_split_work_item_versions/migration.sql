ALTER TABLE "AzureWorkItem"
  ADD COLUMN IF NOT EXISTS "registeredVersion" TEXT;

UPDATE "AzureWorkItem"
SET "registeredVersion" = "deliveredVersion"
WHERE "registeredVersion" IS NULL
  AND "deliveredVersion" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "AzureWorkItem_registeredVersion_idx"
  ON "AzureWorkItem" ("registeredVersion");
