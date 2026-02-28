-- CreateTable
CREATE TABLE "InventoryDailyWaitingQueue" (
    "id" TEXT NOT NULL,
    "empId" TEXT NOT NULL,
    "reason" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSkippedDate" DATE NOT NULL,
    CONSTRAINT "InventoryDailyWaitingQueue_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InventoryDailyWaitingQueue"
ADD CONSTRAINT "InventoryDailyWaitingQueue_empId_fkey"
FOREIGN KEY ("empId") REFERENCES "Employee"("empId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "InventoryDailyWaitingQueue_empId_idx" ON "InventoryDailyWaitingQueue"("empId");
CREATE INDEX "InventoryDailyWaitingQueue_expiresAt_idx" ON "InventoryDailyWaitingQueue"("expiresAt");

