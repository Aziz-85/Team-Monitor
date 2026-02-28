-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable Leave: add status with default APPROVED
ALTER TABLE "Leave" ADD COLUMN "status" "LeaveStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable EmployeeMonthlyTarget: add snapshot fields for leave-adjusted distribution
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN "scheduledDaysInMonth" INTEGER;
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN "leaveDaysInMonth" INTEGER;
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN "presentDaysInMonth" INTEGER;
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN "presenceFactor" DOUBLE PRECISION;
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN "effectiveWeightAtGeneration" DOUBLE PRECISION;
