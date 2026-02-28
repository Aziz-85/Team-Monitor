-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "module" TEXT,
ADD COLUMN "targetEmployeeId" TEXT,
ADD COLUMN "targetDate" DATE,
ADD COLUMN "weekStart" DATE;

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_module_createdAt_idx" ON "AuditLog"("module", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetDate_createdAt_idx" ON "AuditLog"("targetDate", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetEmployeeId_createdAt_idx" ON "AuditLog"("targetEmployeeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_weekStart_createdAt_idx" ON "AuditLog"("weekStart", "createdAt");
