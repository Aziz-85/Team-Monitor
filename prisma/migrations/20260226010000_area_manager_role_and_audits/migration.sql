-- Add AREA_MANAGER role (global employees, transfers, cross-boutique targets)
ALTER TYPE "Role" ADD VALUE 'AREA_MANAGER';

-- Create enum for target audit scope
CREATE TYPE "TargetAuditScope" AS ENUM ('BOUTIQUE_MONTHLY', 'EMPLOYEE_MONTHLY');

-- CreateTable EmployeeTransferAudit
CREATE TABLE "EmployeeTransferAudit" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fromBoutiqueId" TEXT NOT NULL,
    "toBoutiqueId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeTransferAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable TargetChangeAudit
CREATE TABLE "TargetChangeAudit" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "employeeId" TEXT,
    "month" TEXT NOT NULL,
    "scope" "TargetAuditScope" NOT NULL,
    "fromAmount" INTEGER NOT NULL,
    "toAmount" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetChangeAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeTransferAudit_employeeId_createdAt_idx" ON "EmployeeTransferAudit"("employeeId", "createdAt");
CREATE INDEX "EmployeeTransferAudit_actorUserId_createdAt_idx" ON "EmployeeTransferAudit"("actorUserId", "createdAt");
CREATE INDEX "TargetChangeAudit_boutiqueId_month_createdAt_idx" ON "TargetChangeAudit"("boutiqueId", "month", "createdAt");
CREATE INDEX "TargetChangeAudit_employeeId_month_createdAt_idx" ON "TargetChangeAudit"("employeeId", "month", "createdAt");
CREATE INDEX "TargetChangeAudit_actorUserId_createdAt_idx" ON "TargetChangeAudit"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "EmployeeTransferAudit" ADD CONSTRAINT "EmployeeTransferAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeTransferAudit" ADD CONSTRAINT "EmployeeTransferAudit_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("empId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TargetChangeAudit" ADD CONSTRAINT "TargetChangeAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
