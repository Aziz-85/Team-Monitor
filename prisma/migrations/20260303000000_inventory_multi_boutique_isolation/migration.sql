-- Inventory multi-boutique isolation: require boutiqueId, per-boutique uniques, backfill default.
-- Default boutique: bout_dhhrn_001 (match SystemConfig DEFAULT_BOUTIQUE_ID fallback).

-- 1) InventoryDailyExclusion: add boutiqueId, backfill, NOT NULL, new unique
ALTER TABLE "InventoryDailyExclusion" ADD COLUMN "boutiqueId" TEXT;
UPDATE "InventoryDailyExclusion" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
ALTER TABLE "InventoryDailyExclusion" ALTER COLUMN "boutiqueId" SET NOT NULL;
DROP INDEX IF EXISTS "InventoryDailyExclusion_date_empId_key";
CREATE UNIQUE INDEX "InventoryDailyExclusion_boutiqueId_date_empId_key" ON "InventoryDailyExclusion"("boutiqueId", "date", "empId");
CREATE INDEX IF NOT EXISTS "InventoryDailyExclusion_boutiqueId_idx" ON "InventoryDailyExclusion"("boutiqueId");
CREATE INDEX IF NOT EXISTS "InventoryDailyExclusion_boutiqueId_date_idx" ON "InventoryDailyExclusion"("boutiqueId", "date");

-- 2) InventoryAbsent: add boutiqueId, backfill, NOT NULL, new unique
ALTER TABLE "InventoryAbsent" ADD COLUMN "boutiqueId" TEXT;
UPDATE "InventoryAbsent" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
ALTER TABLE "InventoryAbsent" ALTER COLUMN "boutiqueId" SET NOT NULL;
DROP INDEX IF EXISTS "InventoryAbsent_date_empId_key";
CREATE UNIQUE INDEX "InventoryAbsent_boutiqueId_date_empId_key" ON "InventoryAbsent"("boutiqueId", "date", "empId");
CREATE INDEX IF NOT EXISTS "InventoryAbsent_boutiqueId_idx" ON "InventoryAbsent"("boutiqueId");
CREATE INDEX IF NOT EXISTS "InventoryAbsent_boutiqueId_date_idx" ON "InventoryAbsent"("boutiqueId", "date");

-- 3) InventoryDailyWaitingQueue: add boutiqueId, backfill, NOT NULL, index
ALTER TABLE "InventoryDailyWaitingQueue" ADD COLUMN "boutiqueId" TEXT;
UPDATE "InventoryDailyWaitingQueue" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
ALTER TABLE "InventoryDailyWaitingQueue" ALTER COLUMN "boutiqueId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "InventoryDailyWaitingQueue_boutiqueId_idx" ON "InventoryDailyWaitingQueue"("boutiqueId");
CREATE INDEX IF NOT EXISTS "InventoryDailyWaitingQueue_boutiqueId_lastSkippedDate_idx" ON "InventoryDailyWaitingQueue"("boutiqueId", "lastSkippedDate");

-- 4) InventoryRotationConfig: backfill, NOT NULL, replace unique
UPDATE "InventoryRotationConfig" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
ALTER TABLE "InventoryRotationConfig" ALTER COLUMN "boutiqueId" SET NOT NULL;
DROP INDEX IF EXISTS "InventoryRotationConfig_key_key";
CREATE UNIQUE INDEX "InventoryRotationConfig_boutiqueId_key_key" ON "InventoryRotationConfig"("boutiqueId", "key");

-- 5) InventoryDailyRun: backfill, NOT NULL, replace unique
UPDATE "InventoryDailyRun" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
ALTER TABLE "InventoryDailyRun" ALTER COLUMN "boutiqueId" SET NOT NULL;
DROP INDEX IF EXISTS "InventoryDailyRun_date_key";
CREATE UNIQUE INDEX "InventoryDailyRun_boutiqueId_date_key" ON "InventoryDailyRun"("boutiqueId", "date");

-- 6) InventoryZone: backfill, NOT NULL, replace unique
UPDATE "InventoryZone" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
ALTER TABLE "InventoryZone" ALTER COLUMN "boutiqueId" SET NOT NULL;
DROP INDEX IF EXISTS "InventoryZone_code_key";
CREATE UNIQUE INDEX "InventoryZone_boutiqueId_code_key" ON "InventoryZone"("boutiqueId", "code");

-- 7) InventoryWeeklyZoneRun: add boutiqueId from zone, NOT NULL, index
ALTER TABLE "InventoryWeeklyZoneRun" ADD COLUMN "boutiqueId" TEXT;
UPDATE "InventoryWeeklyZoneRun" SET "boutiqueId" = (SELECT z."boutiqueId" FROM "InventoryZone" z WHERE z."id" = "InventoryWeeklyZoneRun"."zoneId");
UPDATE "InventoryWeeklyZoneRun" SET "boutiqueId" = 'bout_dhhrn_001' WHERE "boutiqueId" IS NULL;
ALTER TABLE "InventoryWeeklyZoneRun" ALTER COLUMN "boutiqueId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "InventoryWeeklyZoneRun_boutiqueId_idx" ON "InventoryWeeklyZoneRun"("boutiqueId");
