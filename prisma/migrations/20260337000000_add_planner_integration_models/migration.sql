-- CreateEnum
CREATE TYPE "PlannerIntegrationMode" AS ENUM ('GRAPH_DIRECT', 'POWER_AUTOMATE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PlannerSyncDirection" AS ENUM ('IMPORT_ONLY', 'EXPORT_ONLY', 'TWO_WAY');

-- CreateEnum
CREATE TYPE "PlannerTaskLinkSyncStatus" AS ENUM ('LINKED', 'PENDING', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "PlannerSyncLogDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "PlannerSyncLogStatus" AS ENUM ('SUCCESS', 'ERROR', 'SKIPPED');

-- CreateTable
CREATE TABLE "PlannerIntegration" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'MICROSOFT_PLANNER',
    "mode" "PlannerIntegrationMode" NOT NULL DEFAULT 'MANUAL',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "syncDirection" "PlannerSyncDirection" NOT NULL DEFAULT 'IMPORT_ONLY',
    "tenantId" TEXT,
    "planExternalId" TEXT,
    "planName" TEXT,
    "webhookSecret" TEXT,
    "graphConnectionStatus" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerTaskLink" (
    "id" TEXT NOT NULL,
    "localTaskId" TEXT NOT NULL,
    "externalTaskId" TEXT NOT NULL,
    "externalPlanId" TEXT,
    "externalBucketId" TEXT,
    "sourceMode" "PlannerIntegrationMode" NOT NULL DEFAULT 'MANUAL',
    "syncStatus" "PlannerTaskLinkSyncStatus" NOT NULL DEFAULT 'LINKED',
    "lastInboundSyncAt" TIMESTAMP(3),
    "lastOutboundSyncAt" TIMESTAMP(3),
    "lastSyncHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerTaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerUserMap" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT,
    "microsoftUserId" TEXT,
    "microsoftEmail" TEXT,
    "microsoftDisplayName" TEXT,
    "employeeId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerUserMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerBucketMap" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalBucketId" TEXT NOT NULL,
    "externalBucketName" TEXT NOT NULL,
    "localTaskType" TEXT,
    "localZone" TEXT,
    "localPriority" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerBucketMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerSyncLog" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT,
    "direction" "PlannerSyncLogDirection" NOT NULL,
    "mode" "PlannerIntegrationMode" NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "PlannerSyncLogStatus" NOT NULL,
    "relatedLocalTaskId" TEXT,
    "relatedExternalTaskId" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannerSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerInboundEvent" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT,
    "sourceMode" "PlannerIntegrationMode" NOT NULL,
    "externalEventId" TEXT,
    "eventHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannerInboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlannerIntegration_boutiqueId_idx" ON "PlannerIntegration"("boutiqueId");

-- CreateIndex
CREATE INDEX "PlannerIntegration_enabled_mode_idx" ON "PlannerIntegration"("enabled", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerTaskLink_localTaskId_key" ON "PlannerTaskLink"("localTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerTaskLink_externalTaskId_key" ON "PlannerTaskLink"("externalTaskId");

-- CreateIndex
CREATE INDEX "PlannerTaskLink_externalPlanId_idx" ON "PlannerTaskLink"("externalPlanId");

-- CreateIndex
CREATE INDEX "PlannerTaskLink_syncStatus_idx" ON "PlannerTaskLink"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerUserMap_boutiqueId_microsoftUserId_key" ON "PlannerUserMap"("boutiqueId", "microsoftUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerUserMap_boutiqueId_employeeId_key" ON "PlannerUserMap"("boutiqueId", "employeeId");

-- CreateIndex
CREATE INDEX "PlannerUserMap_boutiqueId_idx" ON "PlannerUserMap"("boutiqueId");

-- CreateIndex
CREATE INDEX "PlannerUserMap_microsoftEmail_idx" ON "PlannerUserMap"("microsoftEmail");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerBucketMap_integrationId_externalBucketId_key" ON "PlannerBucketMap"("integrationId", "externalBucketId");

-- CreateIndex
CREATE INDEX "PlannerBucketMap_integrationId_idx" ON "PlannerBucketMap"("integrationId");

-- CreateIndex
CREATE INDEX "PlannerSyncLog_integrationId_idx" ON "PlannerSyncLog"("integrationId");

-- CreateIndex
CREATE INDEX "PlannerSyncLog_createdAt_idx" ON "PlannerSyncLog"("createdAt");

-- CreateIndex
CREATE INDEX "PlannerSyncLog_status_createdAt_idx" ON "PlannerSyncLog"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerInboundEvent_eventHash_key" ON "PlannerInboundEvent"("eventHash");

-- CreateIndex
CREATE INDEX "PlannerInboundEvent_integrationId_idx" ON "PlannerInboundEvent"("integrationId");

-- CreateIndex
CREATE INDEX "PlannerInboundEvent_processed_createdAt_idx" ON "PlannerInboundEvent"("processed", "createdAt");

-- AddForeignKey
ALTER TABLE "PlannerTaskLink" ADD CONSTRAINT "PlannerTaskLink_localTaskId_fkey" FOREIGN KEY ("localTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerUserMap" ADD CONSTRAINT "PlannerUserMap_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("empId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerBucketMap" ADD CONSTRAINT "PlannerBucketMap_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "PlannerIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerSyncLog" ADD CONSTRAINT "PlannerSyncLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "PlannerIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerInboundEvent" ADD CONSTRAINT "PlannerInboundEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "PlannerIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
