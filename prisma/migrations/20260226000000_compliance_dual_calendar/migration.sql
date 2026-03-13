-- AlterTable ComplianceItem: add dual calendar support (Hijri/Gregorian)
-- expiryDateGregorian is used for all calculations; expiryDateHijri for display when dateType=HIJRI

ALTER TABLE "ComplianceItem" ADD COLUMN "dateType" TEXT NOT NULL DEFAULT 'GREGORIAN';
ALTER TABLE "ComplianceItem" ADD COLUMN "expiryDateGregorian" DATE;
ALTER TABLE "ComplianceItem" ADD COLUMN "expiryDateHijri" TEXT;

-- Copy existing expiryDate to expiryDateGregorian
UPDATE "ComplianceItem" SET "expiryDateGregorian" = "expiryDate";

-- Make expiryDateGregorian NOT NULL after backfill
ALTER TABLE "ComplianceItem" ALTER COLUMN "expiryDateGregorian" SET NOT NULL;

-- Drop old column and index
DROP INDEX IF EXISTS "ComplianceItem_expiryDate_idx";
ALTER TABLE "ComplianceItem" DROP COLUMN "expiryDate";

-- Create new index
CREATE INDEX "ComplianceItem_expiryDateGregorian_idx" ON "ComplianceItem"("expiryDateGregorian");
