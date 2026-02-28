-- AlterTable Boutique: add isActive (soft disable)
ALTER TABLE "Boutique" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "Boutique_isActive_idx" ON "Boutique"("isActive");

-- AlterTable BoutiqueGroup: add optional code and isActive
ALTER TABLE "BoutiqueGroup" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "BoutiqueGroup" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS "BoutiqueGroup_code_key" ON "BoutiqueGroup"("code") WHERE "code" IS NOT NULL;

-- AlterTable UserBoutiqueMembership: add canAccess
ALTER TABLE "UserBoutiqueMembership" ADD COLUMN IF NOT EXISTS "canAccess" BOOLEAN NOT NULL DEFAULT true;
