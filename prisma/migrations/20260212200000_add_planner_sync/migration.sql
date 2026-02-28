-- AlterTable
ALTER TABLE "Task" ADD COLUMN "publishToPlanner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "plannerTaskId" TEXT;
ALTER TABLE "Task" ADD COLUMN "plannerPlanId" TEXT;
ALTER TABLE "Task" ADD COLUMN "plannerBucketId" TEXT;
ALTER TABLE "Task" ADD COLUMN "plannerEtag" TEXT;
ALTER TABLE "Task" ADD COLUMN "plannerLastSeenAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "plannerLastPushedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "syncStatus" TEXT;
ALTER TABLE "Task" ADD COLUMN "syncError" TEXT;
ALTER TABLE "Task" ADD COLUMN "syncLockKey" TEXT;
ALTER TABLE "Task" ADD COLUMN "syncUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Task_plannerTaskId_key" ON "Task"("plannerTaskId");
