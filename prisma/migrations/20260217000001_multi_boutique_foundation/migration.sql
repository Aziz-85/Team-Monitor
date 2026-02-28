-- Phase 1: Multi-Boutique Foundation (non-destructive)
-- TASK A: Create foundation tables
-- TASK B: Add boutiqueId (nullable) to operational tables

-- CreateTable: Organization
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateTable: Region
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

CREATE INDEX "Region_organizationId_idx" ON "Region"("organizationId");

ALTER TABLE "Region" ADD CONSTRAINT "Region_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Boutique
CREATE TABLE "Boutique" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT,

    CONSTRAINT "Boutique_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Boutique_code_key" ON "Boutique"("code");

CREATE INDEX "Boutique_regionId_idx" ON "Boutique"("regionId");

ALTER TABLE "Boutique" ADD CONSTRAINT "Boutique_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: BoutiqueGroup
CREATE TABLE "BoutiqueGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "BoutiqueGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BoutiqueGroupMember
CREATE TABLE "BoutiqueGroupMember" (
    "id" TEXT NOT NULL,
    "boutiqueGroupId" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,

    CONSTRAINT "BoutiqueGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoutiqueGroupMember_boutiqueGroupId_boutiqueId_key" ON "BoutiqueGroupMember"("boutiqueGroupId", "boutiqueId");

CREATE INDEX "BoutiqueGroupMember_boutiqueId_idx" ON "BoutiqueGroupMember"("boutiqueId");

ALTER TABLE "BoutiqueGroupMember" ADD CONSTRAINT "BoutiqueGroupMember_boutiqueGroupId_fkey" FOREIGN KEY ("boutiqueGroupId") REFERENCES "BoutiqueGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoutiqueGroupMember" ADD CONSTRAINT "BoutiqueGroupMember_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: UserBoutiqueMembership
CREATE TABLE "UserBoutiqueMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "UserBoutiqueMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBoutiqueMembership_userId_boutiqueId_key" ON "UserBoutiqueMembership"("userId", "boutiqueId");

CREATE INDEX "UserBoutiqueMembership_boutiqueId_idx" ON "UserBoutiqueMembership"("boutiqueId");

ALTER TABLE "UserBoutiqueMembership" ADD CONSTRAINT "UserBoutiqueMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBoutiqueMembership" ADD CONSTRAINT "UserBoutiqueMembership_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: SystemConfig
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" TEXT,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- TASK B: Add boutiqueId (nullable) to operational tables

ALTER TABLE "ScheduleEditAudit" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "ScheduleEditAudit_boutiqueId_idx" ON "ScheduleEditAudit"("boutiqueId");

ALTER TABLE "ShiftOverride" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "ShiftOverride_boutiqueId_idx" ON "ShiftOverride"("boutiqueId");

ALTER TABLE "CoverageRule" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "CoverageRule_boutiqueId_idx" ON "CoverageRule"("boutiqueId");

ALTER TABLE "ScheduleLock" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "ScheduleLock_boutiqueId_idx" ON "ScheduleLock"("boutiqueId");

ALTER TABLE "ScheduleWeekStatus" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "ScheduleWeekStatus_boutiqueId_idx" ON "ScheduleWeekStatus"("boutiqueId");

ALTER TABLE "Task" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "Task_boutiqueId_idx" ON "Task"("boutiqueId");

ALTER TABLE "PlannerImportBatch" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "PlannerImportBatch_boutiqueId_idx" ON "PlannerImportBatch"("boutiqueId");

ALTER TABLE "PlannerImportRow" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "PlannerImportRow_boutiqueId_idx" ON "PlannerImportRow"("boutiqueId");

ALTER TABLE "AuditLog" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "AuditLog_boutiqueId_idx" ON "AuditLog"("boutiqueId");

ALTER TABLE "ApprovalRequest" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "ApprovalRequest_boutiqueId_idx" ON "ApprovalRequest"("boutiqueId");

ALTER TABLE "InventoryRotationConfig" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "InventoryRotationConfig_boutiqueId_idx" ON "InventoryRotationConfig"("boutiqueId");

ALTER TABLE "InventoryDailyRun" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "InventoryDailyRun_boutiqueId_idx" ON "InventoryDailyRun"("boutiqueId");

ALTER TABLE "InventoryZone" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "InventoryZone_boutiqueId_idx" ON "InventoryZone"("boutiqueId");

ALTER TABLE "BoutiqueMonthlyTarget" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "BoutiqueMonthlyTarget_boutiqueId_idx" ON "BoutiqueMonthlyTarget"("boutiqueId");

ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "EmployeeMonthlyTarget_boutiqueId_idx" ON "EmployeeMonthlyTarget"("boutiqueId");

ALTER TABLE "SalesTargetAudit" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "SalesTargetAudit_boutiqueId_idx" ON "SalesTargetAudit"("boutiqueId");

ALTER TABLE "SalesEntry" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "SalesEntry_boutiqueId_idx" ON "SalesEntry"("boutiqueId");

ALTER TABLE "SalesEditGrant" ADD COLUMN "boutiqueId" TEXT;
CREATE INDEX "SalesEditGrant_boutiqueId_idx" ON "SalesEditGrant"("boutiqueId");
