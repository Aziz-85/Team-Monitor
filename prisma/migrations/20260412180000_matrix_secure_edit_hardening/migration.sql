-- Matrix secure edit: versioning, snapshots, batch rollback columns

ALTER TABLE "SalesMatrixEditCellAudit" ADD COLUMN "saveBatchId" TEXT;
ALTER TABLE "SalesMatrixEditCellAudit" ADD COLUMN "rolledBackAt" TIMESTAMP(3);

CREATE INDEX "SalesMatrixEditCellAudit_saveBatchId_idx" ON "SalesMatrixEditCellAudit"("saveBatchId");

CREATE TABLE "SalesMatrixEditVersion" (
    "boutiqueId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesMatrixEditVersion_pkey" PRIMARY KEY ("boutiqueId","month")
);

ALTER TABLE "SalesMatrixEditVersion" ADD CONSTRAINT "SalesMatrixEditVersion_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SalesMatrixSnapshot" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "grandTotalSar" INTEGER NOT NULL,
    "saveBatchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesMatrixSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesMatrixSnapshot_saveBatchId_key" ON "SalesMatrixSnapshot"("saveBatchId");

CREATE INDEX "SalesMatrixSnapshot_boutiqueId_month_createdAt_idx" ON "SalesMatrixSnapshot"("boutiqueId", "month", "createdAt");

ALTER TABLE "SalesMatrixSnapshot" ADD CONSTRAINT "SalesMatrixSnapshot_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesMatrixSnapshot" ADD CONSTRAINT "SalesMatrixSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
