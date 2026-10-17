CREATE TABLE IF NOT EXISTS "AzureWorkItemFollow" (
  "userId" INTEGER NOT NULL,
  "workItemId" INTEGER NOT NULL,
  "followedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenRevision" INTEGER,
  CONSTRAINT "AzureWorkItemFollow_pkey" PRIMARY KEY ("userId","workItemId"),
  CONSTRAINT "AzureWorkItemFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AzureWorkItemFollow_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "AzureWorkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AzureWorkItemFollow_workItemId_idx" ON "AzureWorkItemFollow"("workItemId");
