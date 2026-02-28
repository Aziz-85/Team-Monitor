/*
  Warnings:

  - Added the required column `updatedAt` to the `ScheduleWeekStatus` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ScheduleLock_scopeType_scopeValue_key";

-- AlterTable
ALTER TABLE "ScheduleWeekStatus" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
