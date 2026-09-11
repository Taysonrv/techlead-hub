CREATE TABLE IF NOT EXISTS "SystemSetting" (
    "key" VARCHAR(120) NOT NULL,
    "value" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT TRUE,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" INTEGER,
    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "SystemSetting_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SystemSetting_updatedById_idx"
ON "SystemSetting"("updatedById");
