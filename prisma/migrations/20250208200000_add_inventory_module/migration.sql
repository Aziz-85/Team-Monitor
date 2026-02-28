-- AlterTable
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "isBoutiqueManager" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "excludeFromDailyInventory" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "InventoryDailyRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'UNASSIGNED');
CREATE TYPE "InventoryDailyRunSkipReason" AS ENUM ('LEAVE', 'OFF', 'INACTIVE', 'EXCLUDED');
CREATE TYPE "InventoryWeeklyZoneRunStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "InventoryRotationConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "monthRebalanceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryRotationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryRotationMember" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "empId" TEXT NOT NULL,
    "baseOrderIndex" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryRotationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryDailyRun" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "assignedEmpId" TEXT,
    "status" "InventoryDailyRunStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "completedByEmpId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryDailyRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryDailyRunSkip" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "empId" TEXT NOT NULL,
    "skipReason" "InventoryDailyRunSkipReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryDailyRunSkip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryZone" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InventoryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryZoneAssignment" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "empId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryZoneAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryWeeklyZoneRun" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "zoneId" TEXT NOT NULL,
    "empId" TEXT NOT NULL,
    "status" "InventoryWeeklyZoneRunStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryWeeklyZoneRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryRotationConfig_key_key" ON "InventoryRotationConfig"("key");
CREATE UNIQUE INDEX "InventoryRotationMember_configId_empId_key" ON "InventoryRotationMember"("configId", "empId");
CREATE UNIQUE INDEX "InventoryDailyRun_date_key" ON "InventoryDailyRun"("date");
CREATE UNIQUE INDEX "InventoryZone_code_key" ON "InventoryZone"("code");
CREATE UNIQUE INDEX "InventoryWeeklyZoneRun_weekStart_zoneId_key" ON "InventoryWeeklyZoneRun"("weekStart", "zoneId");

-- AddForeignKey
ALTER TABLE "InventoryRotationMember" ADD CONSTRAINT "InventoryRotationMember_configId_fkey" FOREIGN KEY ("configId") REFERENCES "InventoryRotationConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryRotationMember" ADD CONSTRAINT "InventoryRotationMember_empId_fkey" FOREIGN KEY ("empId") REFERENCES "Employee"("empId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryDailyRunSkip" ADD CONSTRAINT "InventoryDailyRunSkip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "InventoryDailyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryZoneAssignment" ADD CONSTRAINT "InventoryZoneAssignment_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "InventoryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryZoneAssignment" ADD CONSTRAINT "InventoryZoneAssignment_empId_fkey" FOREIGN KEY ("empId") REFERENCES "Employee"("empId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryWeeklyZoneRun" ADD CONSTRAINT "InventoryWeeklyZoneRun_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "InventoryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
