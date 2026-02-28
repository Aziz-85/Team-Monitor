-- AlterEnum
ALTER TYPE "InventoryDailyRunSkipReason" ADD VALUE 'ABSENT';

-- CreateTable
CREATE TABLE "InventoryAbsent" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "empId" TEXT NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAbsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAbsent_date_empId_key" ON "InventoryAbsent"("date", "empId");

-- AddForeignKey
ALTER TABLE "InventoryAbsent" ADD CONSTRAINT "InventoryAbsent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
