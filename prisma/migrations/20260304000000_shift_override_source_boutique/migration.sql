-- ShiftOverride: add sourceBoutiqueId for guest coverage display grouping (source boutique name)
ALTER TABLE "ShiftOverride" ADD COLUMN IF NOT EXISTS "sourceBoutiqueId" TEXT;

-- Backfill: set sourceBoutiqueId from employee's boutique where employee is from another boutique (guest)
UPDATE "ShiftOverride" o
SET "sourceBoutiqueId" = e."boutiqueId"
FROM "Employee" e
WHERE o."empId" = e."empId"
  AND o."boutiqueId" IS NOT NULL
  AND e."boutiqueId" IS NOT NULL
  AND e."boutiqueId" <> o."boutiqueId"
  AND o."sourceBoutiqueId" IS NULL;

CREATE INDEX IF NOT EXISTS "ShiftOverride_sourceBoutiqueId_idx" ON "ShiftOverride"("sourceBoutiqueId");
