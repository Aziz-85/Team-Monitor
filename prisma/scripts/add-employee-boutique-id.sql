-- One-off: add Employee.boutiqueId if missing (when migration 20260224000000 was not applied).
-- Run with: psql $DATABASE_URL -f prisma/scripts/add-employee-boutique-id.sql

-- Add column if not exists (PostgreSQL 9.5+)
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "boutiqueId" TEXT;

-- Backfill: default from SystemConfig or fallback
UPDATE "Employee" SET "boutiqueId" = COALESCE(
  (SELECT TRIM(BOTH '"' FROM "valueJson") FROM "SystemConfig" WHERE "key" = 'DEFAULT_BOUTIQUE_ID' LIMIT 1),
  'bout_dhhrn_001'
) WHERE "boutiqueId" IS NULL;

-- Enforce default and NOT NULL
ALTER TABLE "Employee" ALTER COLUMN "boutiqueId" SET DEFAULT 'bout_dhhrn_001';
ALTER TABLE "Employee" ALTER COLUMN "boutiqueId" SET NOT NULL;

-- Index (ignore if exists)
CREATE INDEX IF NOT EXISTS "Employee_boutiqueId_idx" ON "Employee"("boutiqueId");

-- FK only if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Employee_boutiqueId_fkey'
  ) THEN
    ALTER TABLE "Employee"
      ADD CONSTRAINT "Employee_boutiqueId_fkey"
      FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
