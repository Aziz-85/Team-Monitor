-- CreateEnum
CREATE TYPE "PlannerTaskFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PlannerTaskEventStatus" AS ENUM ('COMPLETED', 'UPDATED', 'REOPENED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "PlannerTaskMapping" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT,
    "plannerTaskId" TEXT,
    "plannerBucketId" TEXT,
    "plannerBucketName" TEXT,
    "plannerTaskTitle" TEXT NOT NULL,
    "internalTaskKey" TEXT NOT NULL,
    "taskType" "PlannerTaskFrequency" NOT NULL,
    "branchCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerTaskMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerTaskEvent" (
    "id" TEXT NOT NULL,
    "plannerTaskId" TEXT,
    "plannerTaskTitle" TEXT,
    "internalTaskKey" TEXT,
    "taskType" "PlannerTaskFrequency",
    "branchCode" TEXT,
    "bucketName" TEXT,
    "assignedToName" TEXT,
    "assignedToEmail" TEXT,
    "completedByName" TEXT,
    "completedByEmail" TEXT,
    "status" "PlannerTaskEventStatus" NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "payloadJson" JSONB,
    "source" TEXT NOT NULL DEFAULT 'POWER_AUTOMATE',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerTaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerTaskCompletion" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT,
    "internalTaskKey" TEXT NOT NULL,
    "taskType" "PlannerTaskFrequency" NOT NULL,
    "branchCode" TEXT,
    "plannerTaskId" TEXT,
    "plannerTaskTitle" TEXT,
    "completedByUserId" TEXT,
    "completedByName" TEXT,
    "completedByEmail" TEXT,
    "completedByIdentityKey" TEXT NOT NULL,
    "completedOnDateKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PLANNER',
    "rawEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerTaskCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlannerTaskMapping_boutiqueId_isActive_idx" ON "PlannerTaskMapping"("boutiqueId", "isActive");

-- CreateIndex
CREATE INDEX "PlannerTaskMapping_plannerTaskId_idx" ON "PlannerTaskMapping"("plannerTaskId");

-- CreateIndex
CREATE INDEX "PlannerTaskMapping_plannerBucketId_idx" ON "PlannerTaskMapping"("plannerBucketId");

-- CreateIndex
CREATE INDEX "PlannerTaskMapping_internalTaskKey_taskType_idx" ON "PlannerTaskMapping"("internalTaskKey", "taskType");

-- CreateIndex
CREATE INDEX "PlannerTaskMapping_branchCode_idx" ON "PlannerTaskMapping"("branchCode");

-- CreateIndex
CREATE INDEX "PlannerTaskEvent_plannerTaskId_idx" ON "PlannerTaskEvent"("plannerTaskId");

-- CreateIndex
CREATE INDEX "PlannerTaskEvent_eventAt_idx" ON "PlannerTaskEvent"("eventAt");

-- CreateIndex
CREATE INDEX "PlannerTaskEvent_status_eventAt_idx" ON "PlannerTaskEvent"("status", "eventAt");

-- CreateIndex
CREATE INDEX "PlannerTaskEvent_internalTaskKey_taskType_idx" ON "PlannerTaskEvent"("internalTaskKey", "taskType");

-- CreateIndex
CREATE INDEX "PlannerTaskEvent_branchCode_eventAt_idx" ON "PlannerTaskEvent"("branchCode", "eventAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerTaskCompletion_internalTaskKey_completedByIdentityKey_completedOnDateKey_key" ON "PlannerTaskCompletion"("internalTaskKey", "completedByIdentityKey", "completedOnDateKey");

-- CreateIndex
CREATE INDEX "PlannerTaskCompletion_boutiqueId_completedOnDateKey_idx" ON "PlannerTaskCompletion"("boutiqueId", "completedOnDateKey");

-- CreateIndex
CREATE INDEX "PlannerTaskCompletion_completedOnDateKey_taskType_idx" ON "PlannerTaskCompletion"("completedOnDateKey", "taskType");

-- CreateIndex
CREATE INDEX "PlannerTaskCompletion_internalTaskKey_idx" ON "PlannerTaskCompletion"("internalTaskKey");

-- CreateIndex
CREATE INDEX "PlannerTaskCompletion_completedByUserId_idx" ON "PlannerTaskCompletion"("completedByUserId");

-- CreateIndex
CREATE INDEX "PlannerTaskCompletion_branchCode_completedOnDateKey_idx" ON "PlannerTaskCompletion"("branchCode", "completedOnDateKey");

-- CreateIndex
CREATE INDEX "PlannerTaskCompletion_plannerTaskId_idx" ON "PlannerTaskCompletion"("plannerTaskId");

-- AddForeignKey
ALTER TABLE "PlannerTaskCompletion" ADD CONSTRAINT "PlannerTaskCompletion_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerTaskCompletion" ADD CONSTRAINT "PlannerTaskCompletion_rawEventId_fkey" FOREIGN KEY ("rawEventId") REFERENCES "PlannerTaskEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

