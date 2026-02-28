-- Backfill User.boutiqueId from Employee then SystemConfig then first Boutique; then enforce NOT NULL
-- 1) From Employee
UPDATE "User" u
SET "boutiqueId" = e."boutiqueId"
FROM "Employee" e
WHERE e."empId" = u."empId" AND u."boutiqueId" IS NULL;

-- 2) From SystemConfig DEFAULT_BOUTIQUE_ID
UPDATE "User"
SET "boutiqueId" = (SELECT TRIM(BOTH '"' FROM "valueJson") FROM "SystemConfig" WHERE "key" = 'DEFAULT_BOUTIQUE_ID' LIMIT 1)
WHERE "boutiqueId" IS NULL;

-- 3) Fallback: first Boutique (if any user still null)
UPDATE "User"
SET "boutiqueId" = (SELECT id FROM "Boutique" LIMIT 1)
WHERE "boutiqueId" IS NULL;

-- 4) Enforce NOT NULL
ALTER TABLE "User" ALTER COLUMN "boutiqueId" SET NOT NULL;
