-- CreateEnum
CREATE TYPE "SalesTargetRole" AS ENUM ('MANAGER', 'ASSISTANT_MANAGER', 'HIGH_JEWELLERY_EXPERT', 'SENIOR_SALES_ADVISOR', 'SALES_ADVISOR');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "salesTargetRole" "SalesTargetRole";

-- AlterTable
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN "roleAtGeneration" TEXT,
ADD COLUMN "weightAtGeneration" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SalesTargetAudit" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "detailsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesTargetAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesTargetAudit_monthKey_createdAt_idx" ON "SalesTargetAudit"("monthKey", "createdAt");

-- CreateIndex
CREATE INDEX "SalesTargetAudit_action_createdAt_idx" ON "SalesTargetAudit"("action", "createdAt");
