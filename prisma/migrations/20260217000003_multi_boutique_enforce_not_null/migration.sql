-- Phase 1 (Task C + D): Seed default boutique (idempotent) + backfill + enforce NOT NULL.
-- Safe to run: uses ON CONFLICT / WHERE boutiqueId IS NULL so no duplicates.

-- Seed Organization, Region, Boutique (fixed ids for deterministic backfill)
INSERT INTO "Organization" (id, code, name)
VALUES ('org_kooheji_001', 'KOOHEJI', 'Kooheji')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "Region" (id, code, name, "organizationId")
VALUES ('reg_eastern_001', 'EASTERN', 'Eastern', 'org_kooheji_001')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "Boutique" (id, code, name, "regionId")
VALUES ('bout_dhhrn_001', 'DHHRN', 'Dhahran Mall', 'reg_eastern_001')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "SystemConfig" (id, key, "valueJson")
VALUES (gen_random_uuid()::text, 'DEFAULT_BOUTIQUE_ID', '"bout_dhhrn_001"')
ON CONFLICT (key) DO UPDATE SET "valueJson" = EXCLUDED."valueJson";

-- UserBoutiqueMembership: one row per user for default boutique (role from User)
INSERT INTO "UserBoutiqueMembership" (id, "userId", "boutiqueId", role)
SELECT gen_random_uuid()::text, u.id, 'bout_dhhrn_001', u.role
FROM "User" u
ON CONFLICT ("userId", "boutiqueId") DO UPDATE SET role = EXCLUDED.role;

-- Backfill: set boutiqueId = default where null
UPDATE "ScheduleEditAudit" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "ShiftOverride" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "CoverageRule" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "ScheduleLock" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "ScheduleWeekStatus" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "Task" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "PlannerImportBatch" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "PlannerImportRow" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "AuditLog" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "ApprovalRequest" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "InventoryRotationConfig" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "InventoryDailyRun" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "InventoryZone" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "BoutiqueMonthlyTarget" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "EmployeeMonthlyTarget" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "SalesTargetAudit" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "SalesEntry" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
UPDATE "SalesEditGrant" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;

-- Enforce NOT NULL
ALTER TABLE "ScheduleEditAudit" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "ShiftOverride" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "CoverageRule" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "ScheduleLock" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "ScheduleWeekStatus" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "PlannerImportBatch" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "PlannerImportRow" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "ApprovalRequest" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "InventoryRotationConfig" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "InventoryDailyRun" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "InventoryZone" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "BoutiqueMonthlyTarget" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "EmployeeMonthlyTarget" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "SalesTargetAudit" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "SalesEntry" ALTER COLUMN "boutiqueId" SET NOT NULL;
ALTER TABLE "SalesEditGrant" ALTER COLUMN "boutiqueId" SET NOT NULL;
