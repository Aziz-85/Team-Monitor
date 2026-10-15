-- A completion belongs to one scheduled occurrence, not permanently to a task/user pair.
ALTER TABLE "TaskCompletion" ADD COLUMN "dueDate" DATE;

-- Preserve legacy completions as occurrences on the day they were recorded.
UPDATE "TaskCompletion"
SET "dueDate" = ("completedAt" AT TIME ZONE 'Asia/Riyadh')::date
WHERE "dueDate" IS NULL;

ALTER TABLE "TaskCompletion" ALTER COLUMN "dueDate" SET NOT NULL;

DROP INDEX IF EXISTS "TaskCompletion_taskId_userId_key";
CREATE UNIQUE INDEX "TaskCompletion_taskId_userId_dueDate_key"
ON "TaskCompletion"("taskId", "userId", "dueDate");
CREATE INDEX "TaskCompletion_dueDate_idx" ON "TaskCompletion"("dueDate");
