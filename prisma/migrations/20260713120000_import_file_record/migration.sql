-- Phase 4: unified import file fingerprint for duplicate detection.

CREATE TABLE "ImportFileRecord" (
    "id" TEXT NOT NULL,
    "importType" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "boutiqueId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "batchId" TEXT,
    "batchEntityType" TEXT,

    CONSTRAINT "ImportFileRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImportFileRecord_importType_scopeKey_fileSha256_key"
  ON "ImportFileRecord"("importType", "scopeKey", "fileSha256");

CREATE INDEX "ImportFileRecord_fileSha256_idx" ON "ImportFileRecord"("fileSha256");
CREATE INDEX "ImportFileRecord_uploadedAt_idx" ON "ImportFileRecord"("uploadedAt");
CREATE INDEX "ImportFileRecord_status_idx" ON "ImportFileRecord"("status");

ALTER TABLE "ImportFileRecord"
  ADD CONSTRAINT "ImportFileRecord_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportFileRecord"
  ADD CONSTRAINT "ImportFileRecord_boutiqueId_fkey"
  FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE SET NULL ON UPDATE CASCADE;
