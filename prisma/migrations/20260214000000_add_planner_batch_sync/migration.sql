-- Add Task fields for manual batch sync (no drops)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "taskKey" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completionSource" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "importedCompletionAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Task_taskKey_key" ON "Task"("taskKey") WHERE "taskKey" IS NOT NULL;

-- Planner import audit
CREATE TABLE IF NOT EXISTS "PlannerImportBatch" (
    "id" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plannerFileName" TEXT,
    "totalsJson" JSONB NOT NULL,
    "notes" TEXT,
    "suspiciousCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlannerImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PlannerImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "taskKey" TEXT,
    "title" TEXT NOT NULL,
    "assignee" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "completedAtRaw" TEXT,
    "flagsJson" JSONB,

    CONSTRAINT "PlannerImportRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlannerImportBatch_periodType_periodKey_idx" ON "PlannerImportBatch"("periodType", "periodKey");
CREATE INDEX IF NOT EXISTS "PlannerImportRow_batchId_idx" ON "PlannerImportRow"("batchId");
CREATE INDEX IF NOT EXISTS "PlannerImportRow_taskKey_idx" ON "PlannerImportRow"("taskKey");

ALTER TABLE "PlannerImportRow" DROP CONSTRAINT IF EXISTS "PlannerImportRow_batchId_fkey";
ALTER TABLE "PlannerImportRow" ADD CONSTRAINT "PlannerImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PlannerImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
