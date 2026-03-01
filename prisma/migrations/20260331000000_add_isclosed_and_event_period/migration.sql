-- AlterTable OfficialHoliday: add isClosed (default true for backward compatibility)
ALTER TABLE "OfficialHoliday" ADD COLUMN IF NOT EXISTS "isClosed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable EventPeriod
CREATE TABLE "EventPeriod" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "suspendWeeklyOff" BOOLEAN NOT NULL,
    "forceWork" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventPeriod_boutiqueId_startDate_endDate_idx" ON "EventPeriod"("boutiqueId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "EventPeriod" ADD CONSTRAINT "EventPeriod_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
