-- CreateEnum
CREATE TYPE "BoutiqueShiftTemplateType" AS ENUM ('MORNING', 'EVENING', 'BRIDGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BoutiqueSpecialPeriodType" AS ENUM ('RAMADAN', 'EID_AL_FITR', 'EID_AL_ADHA', 'NATIONAL_DAY', 'FOUNDING_DAY', 'SEASON', 'CUSTOM');

-- CreateTable
CREATE TABLE "BoutiqueConfiguration" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "normalOpenTime" TEXT NOT NULL DEFAULT '09:30',
    "normalCloseTime" TEXT NOT NULL DEFAULT '22:00',
    "fridayOpenTime" TEXT NOT NULL DEFAULT '16:00',
    "fridayCloseTime" TEXT NOT NULL DEFAULT '22:00',
    "weeklyOffPolicy" TEXT NOT NULL DEFAULT 'FLEXIBLE',
    "preferredWeeklyOffRecoveryDay" TEXT NOT NULL DEFAULT 'FRIDAY',
    "allowWeeklyOffDeferral" BOOLEAN NOT NULL DEFAULT true,
    "maxDeferredWeeklyOffPerWeek" INTEGER NOT NULL DEFAULT 1,
    "allowExternalSupport" BOOLEAN NOT NULL DEFAULT true,
    "externalSupportPriority" TEXT NOT NULL DEFAULT 'AFTER_BRIDGE',
    "allowOvertime" BOOLEAN NOT NULL DEFAULT false,
    "maxOvertimeHoursPerEmployeePerDay" INTEGER NOT NULL DEFAULT 2,
    "allowBridgeShift" BOOLEAN NOT NULL DEFAULT true,
    "maxBridgeDaysPerEmployeePerWeek" INTEGER NOT NULL DEFAULT 2,
    "planningStrategy" TEXT NOT NULL DEFAULT 'MAXIMUM_COVERAGE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoutiqueConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoutiqueShiftTemplate" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BoutiqueShiftTemplateType" NOT NULL DEFAULT 'CUSTOM',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "secondStartTime" TEXT,
    "secondEndTime" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoutiqueShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoutiqueSpecialOperatingPeriod" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BoutiqueSpecialPeriodType" NOT NULL DEFAULT 'CUSTOM',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "secondOpenTime" TEXT,
    "secondCloseTime" TEXT,
    "minMorningCoverage" INTEGER,
    "minEveningCoverage" INTEGER,
    "minTotalCoverage" INTEGER,
    "suspendWeeklyOff" BOOLEAN NOT NULL DEFAULT false,
    "allowExternalSupport" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoutiqueSpecialOperatingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoutiqueCoveragePolicy" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "minMorning" INTEGER NOT NULL DEFAULT 2,
    "minEvening" INTEGER NOT NULL DEFAULT 2,
    "minTotal" INTEGER,
    "isFridayOverride" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoutiqueCoveragePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoutiqueConfiguration_boutiqueId_key" ON "BoutiqueConfiguration"("boutiqueId");

-- CreateIndex
CREATE INDEX "BoutiqueConfiguration_boutiqueId_idx" ON "BoutiqueConfiguration"("boutiqueId");

-- CreateIndex
CREATE INDEX "BoutiqueShiftTemplate_boutiqueId_idx" ON "BoutiqueShiftTemplate"("boutiqueId");

-- CreateIndex
CREATE UNIQUE INDEX "BoutiqueShiftTemplate_boutiqueId_code_key" ON "BoutiqueShiftTemplate"("boutiqueId", "code");

-- CreateIndex
CREATE INDEX "BoutiqueSpecialOperatingPeriod_boutiqueId_idx" ON "BoutiqueSpecialOperatingPeriod"("boutiqueId");

-- CreateIndex
CREATE INDEX "BoutiqueSpecialOperatingPeriod_boutiqueId_startDate_endDate_idx" ON "BoutiqueSpecialOperatingPeriod"("boutiqueId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "BoutiqueCoveragePolicy_boutiqueId_idx" ON "BoutiqueCoveragePolicy"("boutiqueId");

-- CreateIndex
CREATE UNIQUE INDEX "BoutiqueCoveragePolicy_boutiqueId_dayOfWeek_key" ON "BoutiqueCoveragePolicy"("boutiqueId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "BoutiqueConfiguration" ADD CONSTRAINT "BoutiqueConfiguration_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoutiqueShiftTemplate" ADD CONSTRAINT "BoutiqueShiftTemplate_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoutiqueSpecialOperatingPeriod" ADD CONSTRAINT "BoutiqueSpecialOperatingPeriod_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoutiqueCoveragePolicy" ADD CONSTRAINT "BoutiqueCoveragePolicy_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
