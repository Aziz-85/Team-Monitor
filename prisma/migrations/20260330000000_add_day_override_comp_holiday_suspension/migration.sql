-- CreateEnum
CREATE TYPE "DayOverrideMode" AS ENUM ('FORCE_WORK', 'FORCE_OFF');

-- CreateEnum
CREATE TYPE "CompDayType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "EmployeeDayOverride" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "mode" "DayOverrideMode" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDayOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompDayLedger" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" "CompDayType" NOT NULL,
    "units" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompDayLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialHoliday" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficialHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyOffSuspensionPeriod" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyOffSuspensionPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDayOverride_boutiqueId_employeeId_date_key" ON "EmployeeDayOverride"("boutiqueId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "EmployeeDayOverride_boutiqueId_date_idx" ON "EmployeeDayOverride"("boutiqueId", "date");

-- CreateIndex
CREATE INDEX "EmployeeDayOverride_employeeId_date_idx" ON "EmployeeDayOverride"("employeeId", "date");

-- CreateIndex
CREATE INDEX "CompDayLedger_boutiqueId_employeeId_date_idx" ON "CompDayLedger"("boutiqueId", "employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OfficialHoliday_boutiqueId_date_key" ON "OfficialHoliday"("boutiqueId", "date");

-- CreateIndex
CREATE INDEX "OfficialHoliday_boutiqueId_date_idx" ON "OfficialHoliday"("boutiqueId", "date");

-- CreateIndex
CREATE INDEX "WeeklyOffSuspensionPeriod_boutiqueId_idx" ON "WeeklyOffSuspensionPeriod"("boutiqueId");

-- CreateIndex
CREATE INDEX "WeeklyOffSuspensionPeriod_boutiqueId_startDate_endDate_idx" ON "WeeklyOffSuspensionPeriod"("boutiqueId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "EmployeeDayOverride" ADD CONSTRAINT "EmployeeDayOverride_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDayOverride" ADD CONSTRAINT "EmployeeDayOverride_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("empId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompDayLedger" ADD CONSTRAINT "CompDayLedger_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompDayLedger" ADD CONSTRAINT "CompDayLedger_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("empId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialHoliday" ADD CONSTRAINT "OfficialHoliday_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyOffSuspensionPeriod" ADD CONSTRAINT "WeeklyOffSuspensionPeriod_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
