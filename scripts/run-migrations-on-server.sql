-- ============================================================
-- تشغيل على السيرفر: نفّذ هذا الملف بالترتيب (مرة واحدة فقط)
-- مثلاً: psql -h HOST -U USER -d DB_NAME -f run-migrations-on-server.sql
-- ============================================================

-- 1) جداول الأهداف والمبيعات
-- ---------------------------
CREATE TABLE IF NOT EXISTS "BoutiqueMonthlyTarget" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BoutiqueMonthlyTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BoutiqueMonthlyTarget_month_key" ON "BoutiqueMonthlyTarget"("month");
CREATE INDEX IF NOT EXISTS "BoutiqueMonthlyTarget_month_idx" ON "BoutiqueMonthlyTarget"("month");

CREATE TABLE IF NOT EXISTS "EmployeeMonthlyTarget" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sourceBoutiqueTargetId" TEXT,
    "generatedAt" TIMESTAMP(3),
    "generatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeMonthlyTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeMonthlyTarget_month_userId_key" ON "EmployeeMonthlyTarget"("month", "userId");
CREATE INDEX IF NOT EXISTS "EmployeeMonthlyTarget_month_idx" ON "EmployeeMonthlyTarget"("month");
CREATE INDEX IF NOT EXISTS "EmployeeMonthlyTarget_userId_idx" ON "EmployeeMonthlyTarget"("userId");
CREATE INDEX IF NOT EXISTS "EmployeeMonthlyTarget_sourceBoutiqueTargetId_idx" ON "EmployeeMonthlyTarget"("sourceBoutiqueTargetId");

CREATE TABLE IF NOT EXISTS "SalesEntry" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "month" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesEntry_userId_date_key" ON "SalesEntry"("userId", "date");
CREATE INDEX IF NOT EXISTS "SalesEntry_month_idx" ON "SalesEntry"("month");
CREATE INDEX IF NOT EXISTS "SalesEntry_userId_idx" ON "SalesEntry"("userId");

-- Foreign keys (تتخطى إذا الجداول جديدة والمراجع موجودة)
ALTER TABLE "BoutiqueMonthlyTarget" DROP CONSTRAINT IF EXISTS "BoutiqueMonthlyTarget_createdById_fkey";
ALTER TABLE "BoutiqueMonthlyTarget" ADD CONSTRAINT "BoutiqueMonthlyTarget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeeMonthlyTarget" DROP CONSTRAINT IF EXISTS "EmployeeMonthlyTarget_userId_fkey";
ALTER TABLE "EmployeeMonthlyTarget" ADD CONSTRAINT "EmployeeMonthlyTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeMonthlyTarget" DROP CONSTRAINT IF EXISTS "EmployeeMonthlyTarget_sourceBoutiqueTargetId_fkey";
ALTER TABLE "EmployeeMonthlyTarget" ADD CONSTRAINT "EmployeeMonthlyTarget_sourceBoutiqueTargetId_fkey" FOREIGN KEY ("sourceBoutiqueTargetId") REFERENCES "BoutiqueMonthlyTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeMonthlyTarget" DROP CONSTRAINT IF EXISTS "EmployeeMonthlyTarget_generatedById_fkey";
ALTER TABLE "EmployeeMonthlyTarget" ADD CONSTRAINT "EmployeeMonthlyTarget_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesEntry" DROP CONSTRAINT IF EXISTS "SalesEntry_userId_fkey";
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesEntry" DROP CONSTRAINT IF EXISTS "SalesEntry_createdById_fkey";
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) نوع وأعمدة دور الهدف + جدول التدقيق
-- ---------------------------------------
DO $$ BEGIN
  CREATE TYPE "SalesTargetRole" AS ENUM ('MANAGER', 'ASSISTANT_MANAGER', 'HIGH_JEWELLERY_EXPERT', 'SENIOR_SALES_ADVISOR', 'SALES_ADVISOR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "salesTargetRole" "SalesTargetRole";

ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN IF NOT EXISTS "roleAtGeneration" TEXT;
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN IF NOT EXISTS "weightAtGeneration" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "SalesTargetAudit" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "detailsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesTargetAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SalesTargetAudit_monthKey_createdAt_idx" ON "SalesTargetAudit"("monthKey", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesTargetAudit_action_createdAt_idx" ON "SalesTargetAudit"("action", "createdAt");

-- 3) طريقة التوزيع
-- ----------------
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN IF NOT EXISTS "distributionMethod" TEXT;

-- 4) حالة الإجازة + لقطة الأيام (EmployeeMonthlyTarget)
-- -----------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Leave" ADD COLUMN IF NOT EXISTS "status" "LeaveStatus" DEFAULT 'APPROVED';
UPDATE "Leave" SET "status" = 'APPROVED' WHERE "status" IS NULL;
ALTER TABLE "Leave" ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN IF NOT EXISTS "scheduledDaysInMonth" INTEGER;
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN IF NOT EXISTS "leaveDaysInMonth" INTEGER;
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN IF NOT EXISTS "presentDaysInMonth" INTEGER;
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN IF NOT EXISTS "presenceFactor" DOUBLE PRECISION;
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN IF NOT EXISTS "effectiveWeightAtGeneration" DOUBLE PRECISION;

-- 5) جدول صلاحية تعديل المبيعات
-- ------------------------------
CREATE TABLE IF NOT EXISTS "SalesEditGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    CONSTRAINT "SalesEditGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesEditGrant_userId_date_key" ON "SalesEditGrant"("userId", "date");
CREATE INDEX IF NOT EXISTS "SalesEditGrant_date_idx" ON "SalesEditGrant"("date");
ALTER TABLE "SalesEditGrant" DROP CONSTRAINT IF EXISTS "SalesEditGrant_userId_fkey";
ALTER TABLE "SalesEditGrant" ADD CONSTRAINT "SalesEditGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) أوزان أدوار الأهداف (قابلة للتعديل من الأدمن)
-- -------------------------------------------------
CREATE TABLE IF NOT EXISTS "SalesTargetRoleWeight" (
    "role" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "SalesTargetRoleWeight_pkey" PRIMARY KEY ("role")
);
INSERT INTO "SalesTargetRoleWeight" ("role", "weight")
SELECT 'MANAGER', 0.5 WHERE NOT EXISTS (SELECT 1 FROM "SalesTargetRoleWeight" WHERE "role" = 'MANAGER');
INSERT INTO "SalesTargetRoleWeight" ("role", "weight")
SELECT 'ASSISTANT_MANAGER', 0.75 WHERE NOT EXISTS (SELECT 1 FROM "SalesTargetRoleWeight" WHERE "role" = 'ASSISTANT_MANAGER');
INSERT INTO "SalesTargetRoleWeight" ("role", "weight")
SELECT 'HIGH_JEWELLERY_EXPERT', 2.0 WHERE NOT EXISTS (SELECT 1 FROM "SalesTargetRoleWeight" WHERE "role" = 'HIGH_JEWELLERY_EXPERT');
INSERT INTO "SalesTargetRoleWeight" ("role", "weight")
SELECT 'SENIOR_SALES_ADVISOR', 1.5 WHERE NOT EXISTS (SELECT 1 FROM "SalesTargetRoleWeight" WHERE "role" = 'SENIOR_SALES_ADVISOR');
INSERT INTO "SalesTargetRoleWeight" ("role", "weight")
SELECT 'SALES_ADVISOR', 1.0 WHERE NOT EXISTS (SELECT 1 FROM "SalesTargetRoleWeight" WHERE "role" = 'SALES_ADVISOR');
