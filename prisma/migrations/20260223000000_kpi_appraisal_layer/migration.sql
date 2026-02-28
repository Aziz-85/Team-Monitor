-- CreateTable
CREATE TABLE "KpiTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "cellMapJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiUpload" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "empId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT,
    "uploadedById" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeKpiSnapshot" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "empId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "overallOutOf5" DOUBLE PRECISION NOT NULL,
    "salesKpiOutOf5" DOUBLE PRECISION NOT NULL,
    "skillsOutOf5" DOUBLE PRECISION NOT NULL,
    "companyOutOf5" DOUBLE PRECISION NOT NULL,
    "sectionsJson" JSONB NOT NULL,
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeKpiSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiAuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "boutiqueId" TEXT,
    "empId" TEXT,
    "periodKey" TEXT,
    "metadata" JSONB,

    CONSTRAINT "KpiAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KpiTemplate_code_key" ON "KpiTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeKpiSnapshot_uploadId_key" ON "EmployeeKpiSnapshot"("uploadId");

-- CreateIndex
CREATE INDEX "KpiUpload_boutiqueId_idx" ON "KpiUpload"("boutiqueId");

-- CreateIndex
CREATE INDEX "KpiUpload_empId_periodKey_idx" ON "KpiUpload"("empId", "periodKey");

-- CreateIndex
CREATE INDEX "KpiUpload_uploadedById_idx" ON "KpiUpload"("uploadedById");

-- CreateIndex
CREATE INDEX "KpiUpload_templateId_idx" ON "KpiUpload"("templateId");

-- CreateIndex
CREATE INDEX "EmployeeKpiSnapshot_boutiqueId_idx" ON "EmployeeKpiSnapshot"("boutiqueId");

-- CreateIndex
CREATE INDEX "EmployeeKpiSnapshot_empId_periodKey_idx" ON "EmployeeKpiSnapshot"("empId", "periodKey");

-- CreateIndex
CREATE INDEX "KpiAuditLog_actorId_createdAt_idx" ON "KpiAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "KpiAuditLog_action_createdAt_idx" ON "KpiAuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "KpiUpload" ADD CONSTRAINT "KpiUpload_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "KpiTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiUpload" ADD CONSTRAINT "KpiUpload_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiUpload" ADD CONSTRAINT "KpiUpload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeKpiSnapshot" ADD CONSTRAINT "EmployeeKpiSnapshot_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "KpiUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
