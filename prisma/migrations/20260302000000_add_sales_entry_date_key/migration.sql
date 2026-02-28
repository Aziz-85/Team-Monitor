-- SalesEntry: add dateKey (YYYY-MM-DD Riyadh) and unique by (boutiqueId, dateKey, userId).
-- Sync and safe delete use dateKey only to avoid timezone bugs.

-- Add column nullable first
ALTER TABLE "SalesEntry" ADD COLUMN "dateKey" TEXT;

-- Backfill from date (stored as date-only; TO_CHAR gives YYYY-MM-DD)
UPDATE "SalesEntry" SET "dateKey" = TO_CHAR("date", 'YYYY-MM-DD') WHERE "dateKey" IS NULL;

-- Enforce NOT NULL
ALTER TABLE "SalesEntry" ALTER COLUMN "dateKey" SET NOT NULL;

-- Replace unique: drop old, create new
DROP INDEX IF EXISTS "SalesEntry_boutiqueId_date_userId_key";
CREATE UNIQUE INDEX "SalesEntry_boutiqueId_dateKey_userId_key" ON "SalesEntry"("boutiqueId", "dateKey", "userId");

-- Index for dateKey filters
CREATE INDEX "SalesEntry_dateKey_idx" ON "SalesEntry"("dateKey");
