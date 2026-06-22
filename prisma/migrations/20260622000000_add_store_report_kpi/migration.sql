-- CreateTable
CREATE TABLE "StoreReportKpi" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "footfall" INTEGER,
    "conversionRate" DOUBLE PRECISION,
    "crmRate" DOUBLE PRECISION,
    "discountRate" DOUBLE PRECISION,
    "pipelineAmount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreReportKpi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreReportKpi_boutiqueId_idx" ON "StoreReportKpi"("boutiqueId");

-- CreateIndex
CREATE INDEX "StoreReportKpi_month_idx" ON "StoreReportKpi"("month");

-- CreateIndex
CREATE UNIQUE INDEX "StoreReportKpi_boutiqueId_month_key" ON "StoreReportKpi"("boutiqueId", "month");

-- AddForeignKey
ALTER TABLE "StoreReportKpi" ADD CONSTRAINT "StoreReportKpi_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
