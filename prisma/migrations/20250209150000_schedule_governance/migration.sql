-- CreateEnum
CREATE TYPE "ScheduleWeekStatusEnum" AS ENUM ('DRAFT', 'APPROVED');

-- CreateTable
CREATE TABLE "ScheduleWeekStatus" (
    "weekStart" TEXT NOT NULL,
    "status" "ScheduleWeekStatusEnum" NOT NULL DEFAULT 'DRAFT',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleWeekStatus_pkey" PRIMARY KEY ("weekStart")
);

-- CreateTable
CREATE TABLE "ScheduleDayLock" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "lockedByUserId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "ScheduleDayLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleWeekLock" (
    "weekStart" TEXT NOT NULL,
    "lockedByUserId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "ScheduleWeekLock_pkey" PRIMARY KEY ("weekStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleDayLock_date_key" ON "ScheduleDayLock"("date");
