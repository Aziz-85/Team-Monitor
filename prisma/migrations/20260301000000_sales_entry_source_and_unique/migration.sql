-- SalesEntry: add source (LEDGER only for sync), unique by (boutiqueId, date, userId).
-- Safe deletes will target source='LEDGER' only. Existing rows backfilled as LEDGER.

ALTER TABLE "SalesEntry" ADD COLUMN "source" TEXT;

UPDATE "SalesEntry" SET "source" = 'LEDGER' WHERE "source" IS NULL;

ALTER TABLE "SalesEntry" ALTER COLUMN "source" SET DEFAULT 'LEDGER';

DROP INDEX IF EXISTS "SalesEntry_userId_date_key";

CREATE UNIQUE INDEX "SalesEntry_boutiqueId_date_userId_key" ON "SalesEntry"("boutiqueId", "date", "userId");
