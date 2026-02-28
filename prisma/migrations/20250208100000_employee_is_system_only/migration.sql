-- AlterTable
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "isSystemOnly" BOOLEAN NOT NULL DEFAULT false;

-- Mark admin account as system-only (excluded from roster and employee lists)
UPDATE "Employee" SET "isSystemOnly" = true WHERE "empId" = 'admin';
