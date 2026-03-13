-- CreateTable
CREATE TABLE "ComplianceItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "expiryDate" DATE NOT NULL,
    "notes" TEXT,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceItem_boutiqueId_idx" ON "ComplianceItem"("boutiqueId");

-- CreateIndex
CREATE INDEX "ComplianceItem_expiryDate_idx" ON "ComplianceItem"("expiryDate");

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
