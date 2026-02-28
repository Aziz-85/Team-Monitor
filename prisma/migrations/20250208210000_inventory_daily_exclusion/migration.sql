-- AlterEnum
ALTER TYPE "InventoryDailyRunSkipReason" ADD VALUE 'EXCLUDED_TODAY';

-- CreateTable
CREATE TABLE "InventoryDailyExclusion" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "empId" TEXT NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryDailyExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDailyExclusion_date_empId_key" ON "InventoryDailyExclusion"("date", "empId");

-- AddForeignKey
ALTER TABLE "InventoryDailyExclusion" ADD CONSTRAINT "InventoryDailyExclusion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
