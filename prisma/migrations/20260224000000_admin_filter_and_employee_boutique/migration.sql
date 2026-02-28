-- UserPreference: admin filter (separate from operational scope)
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "adminFilterJson" TEXT;

-- Employee: current boutique assignment (canonical)
ALTER TABLE "Employee" ADD COLUMN "boutiqueId" TEXT;
UPDATE "Employee" SET "boutiqueId" = COALESCE(
  (SELECT TRIM(BOTH '"' FROM "valueJson") FROM "SystemConfig" WHERE "key" = 'DEFAULT_BOUTIQUE_ID' LIMIT 1),
  'bout_dhhrn_001'
) WHERE "boutiqueId" IS NULL;
ALTER TABLE "Employee" ALTER COLUMN "boutiqueId" SET DEFAULT 'bout_dhhrn_001';
ALTER TABLE "Employee" ALTER COLUMN "boutiqueId" SET NOT NULL;
CREATE INDEX "Employee_boutiqueId_idx" ON "Employee"("boutiqueId");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
