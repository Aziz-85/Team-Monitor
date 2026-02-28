-- Sales Ledger (row-level) + EmployeeAssignment + ImportIssue
-- Enums
CREATE TYPE "SalesTxnType" AS ENUM ('SALE', 'RETURN', 'EXCHANGE');
CREATE TYPE "SalesTxnSource" AS ENUM ('EXCEL_IMPORT', 'MANUAL');
CREATE TYPE "ImportIssueSeverity" AS ENUM ('WARN', 'BLOCK');
CREATE TYPE "ImportIssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- EmployeeAssignment (historical employee-boutique for transfers + import validation)
CREATE TABLE "EmployeeAssignment" (
    "id" TEXT NOT NULL,
    "empId" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "EmployeeAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeAssignment_empId_idx" ON "EmployeeAssignment"("empId");
CREATE INDEX "EmployeeAssignment_boutiqueId_idx" ON "EmployeeAssignment"("boutiqueId");
CREATE INDEX "EmployeeAssignment_empId_fromDate_toDate_idx" ON "EmployeeAssignment"("empId", "fromDate", "toDate");

ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_empId_fkey" FOREIGN KEY ("empId") REFERENCES "Employee"("empId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SalesLedgerBatch (ledger imports with periodKey + fileHash dedup)
CREATE TABLE "SalesLedgerBatch" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT,
    "importedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesLedgerBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesLedgerBatch_boutiqueId_periodKey_fileHash_key" ON "SalesLedgerBatch"("boutiqueId", "periodKey", "fileHash");
CREATE INDEX "SalesLedgerBatch_boutiqueId_periodKey_idx" ON "SalesLedgerBatch"("boutiqueId", "periodKey");
CREATE INDEX "SalesLedgerBatch_importedById_idx" ON "SalesLedgerBatch"("importedById");

ALTER TABLE "SalesLedgerBatch" ADD CONSTRAINT "SalesLedgerBatch_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesLedgerBatch" ADD CONSTRAINT "SalesLedgerBatch_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SalesTransaction (row-level ledger, halalas, guest coverage fields)
CREATE TABLE "SalesTransaction" (
    "id" TEXT NOT NULL,
    "txnDate" DATE NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "SalesTxnType" NOT NULL,
    "source" "SalesTxnSource" NOT NULL DEFAULT 'EXCEL_IMPORT',
    "referenceNo" TEXT,
    "lineNo" TEXT,
    "grossAmount" INTEGER NOT NULL,
    "netAmount" INTEGER NOT NULL,
    "originalTxnId" TEXT,
    "importBatchId" TEXT,
    "isGuestCoverage" BOOLEAN NOT NULL DEFAULT false,
    "coverageSourceBoutiqueId" TEXT,
    "coverageShift" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesTransaction_boutiqueId_idx" ON "SalesTransaction"("boutiqueId");
CREATE INDEX "SalesTransaction_employeeId_idx" ON "SalesTransaction"("employeeId");
CREATE INDEX "SalesTransaction_txnDate_idx" ON "SalesTransaction"("txnDate");
CREATE INDEX "SalesTransaction_boutiqueId_txnDate_idx" ON "SalesTransaction"("boutiqueId", "txnDate");
CREATE INDEX "SalesTransaction_type_idx" ON "SalesTransaction"("type");
CREATE INDEX "SalesTransaction_importBatchId_idx" ON "SalesTransaction"("importBatchId");

ALTER TABLE "SalesTransaction" ADD CONSTRAINT "SalesTransaction_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTransaction" ADD CONSTRAINT "SalesTransaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("empId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesTransaction" ADD CONSTRAINT "SalesTransaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "SalesLedgerBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ImportIssue
CREATE TABLE "ImportIssue" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "severity" "ImportIssueSeverity" NOT NULL,
    "status" "ImportIssueStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "rowIndex" INTEGER,
    "metadata" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportIssue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportIssue_batchId_idx" ON "ImportIssue"("batchId");
CREATE INDEX "ImportIssue_status_idx" ON "ImportIssue"("status");
CREATE INDEX "ImportIssue_batchId_status_idx" ON "ImportIssue"("batchId", "status");

ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SalesLedgerBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
