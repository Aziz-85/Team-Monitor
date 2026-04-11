-- Canonical SalesEntry admin import audit + rollback support (distinct from ledger SalesImportBatch).

CREATE TABLE "SalesEntryImportBatch" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,
    "monthKey" TEXT,
    "importMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "summaryJson" JSONB,

    CONSTRAINT "SalesEntryImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesEntryImportBatchLine" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "salesEntryId" TEXT,
    "action" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "incomingAmount" INTEGER NOT NULL,
    "amountAfter" INTEGER,
    "amountBefore" INTEGER,
    "sourceBefore" TEXT,
    "rowLabel" TEXT,

    CONSTRAINT "SalesEntryImportBatchLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SalesEntry" ADD COLUMN "entryImportBatchId" TEXT;

CREATE INDEX "SalesEntryImportBatch_uploadedAt_idx" ON "SalesEntryImportBatch"("uploadedAt");
CREATE INDEX "SalesEntryImportBatch_status_idx" ON "SalesEntryImportBatch"("status");
CREATE INDEX "SalesEntryImportBatch_fileSha256_idx" ON "SalesEntryImportBatch"("fileSha256");

CREATE INDEX "SalesEntryImportBatchLine_batchId_idx" ON "SalesEntryImportBatchLine"("batchId");
CREATE INDEX "SalesEntryImportBatchLine_stableKey_idx" ON "SalesEntryImportBatchLine"("stableKey");
CREATE INDEX "SalesEntryImportBatchLine_boutiqueId_dateKey_userId_idx" ON "SalesEntryImportBatchLine"("boutiqueId", "dateKey", "userId");

CREATE INDEX "SalesEntry_entryImportBatchId_idx" ON "SalesEntry"("entryImportBatchId");

ALTER TABLE "SalesEntryImportBatch" ADD CONSTRAINT "SalesEntryImportBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesEntryImportBatchLine" ADD CONSTRAINT "SalesEntryImportBatchLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SalesEntryImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_entryImportBatchId_fkey" FOREIGN KEY ("entryImportBatchId") REFERENCES "SalesEntryImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
