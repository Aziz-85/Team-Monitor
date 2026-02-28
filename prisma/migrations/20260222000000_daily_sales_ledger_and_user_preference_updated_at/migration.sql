-- UserPreference: add updatedAt (Phase 2 scope persistence)
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Daily Sales Ledger (Phase 2): enums
CREATE TYPE "SalesEntryStatus" AS ENUM ('DRAFT', 'LOCKED');
CREATE TYPE "SalesLineSource" AS ENUM ('MANUAL', 'EXCEL_IMPORT');

-- BoutiqueSalesSummary
CREATE TABLE "BoutiqueSalesSummary" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalSar" INTEGER NOT NULL,
    "status" "SalesEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "enteredById" TEXT NOT NULL,
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoutiqueSalesSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoutiqueSalesSummary_boutiqueId_date_key" ON "BoutiqueSalesSummary"("boutiqueId", "date");
CREATE INDEX "BoutiqueSalesSummary_boutiqueId_date_idx" ON "BoutiqueSalesSummary"("boutiqueId", "date");
CREATE INDEX "BoutiqueSalesSummary_date_idx" ON "BoutiqueSalesSummary"("date");

ALTER TABLE "BoutiqueSalesSummary" ADD CONSTRAINT "BoutiqueSalesSummary_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoutiqueSalesSummary" ADD CONSTRAINT "BoutiqueSalesSummary_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoutiqueSalesSummary" ADD CONSTRAINT "BoutiqueSalesSummary_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BoutiqueSalesLine
CREATE TABLE "BoutiqueSalesLine" (
    "id" TEXT NOT NULL,
    "summaryId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amountSar" INTEGER NOT NULL,
    "source" "SalesLineSource" NOT NULL DEFAULT 'MANUAL',
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoutiqueSalesLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoutiqueSalesLine_summaryId_employeeId_key" ON "BoutiqueSalesLine"("summaryId", "employeeId");
CREATE INDEX "BoutiqueSalesLine_employeeId_idx" ON "BoutiqueSalesLine"("employeeId");
CREATE INDEX "BoutiqueSalesLine_summaryId_idx" ON "BoutiqueSalesLine"("summaryId");

ALTER TABLE "BoutiqueSalesLine" ADD CONSTRAINT "BoutiqueSalesLine_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "BoutiqueSalesSummary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SalesImportBatch
CREATE TABLE "SalesImportBatch" (
    "id" TEXT NOT NULL,
    "summaryId" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedById" TEXT NOT NULL,
    "totalsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesImportBatch_boutiqueId_date_idx" ON "SalesImportBatch"("boutiqueId", "date");
CREATE INDEX "SalesImportBatch_summaryId_idx" ON "SalesImportBatch"("summaryId");

ALTER TABLE "SalesImportBatch" ADD CONSTRAINT "SalesImportBatch_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "BoutiqueSalesSummary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesImportBatch" ADD CONSTRAINT "SalesImportBatch_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SalesLedgerAudit
CREATE TABLE "SalesLedgerAudit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boutiqueId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "SalesLedgerAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesLedgerAudit_boutiqueId_date_idx" ON "SalesLedgerAudit"("boutiqueId", "date");
CREATE INDEX "SalesLedgerAudit_createdAt_idx" ON "SalesLedgerAudit"("createdAt");
