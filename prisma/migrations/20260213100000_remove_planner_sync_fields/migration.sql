-- Drop unique index on plannerTaskId then drop Planner sync columns from Task
DROP INDEX IF EXISTS "Task_plannerTaskId_key";

ALTER TABLE "Task" DROP COLUMN IF EXISTS "publishToPlanner";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "plannerTaskId";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "plannerPlanId";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "plannerBucketId";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "plannerEtag";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "plannerLastSyncedAt";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "plannerLastSeenAt";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "plannerLastPushedAt";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "syncStatus";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "syncError";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "syncLockKey";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "syncUpdatedAt";
