CREATE TYPE "InfrastructureOperationType" AS ENUM ('RESTART', 'DEPLOY', 'BACKUP', 'HEALTH_CHECK');
CREATE TYPE "InfrastructureOperationStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK');
CREATE TYPE "InfrastructureHealthStatus" AS ENUM ('HEALTHY', 'WARNING', 'DOWN', 'UNKNOWN', 'DISABLED');

CREATE TABLE "InfrastructureOperation" (
  "id" TEXT NOT NULL, "appId" TEXT NOT NULL, "operationType" "InfrastructureOperationType" NOT NULL,
  "status" "InfrastructureOperationStatus" NOT NULL DEFAULT 'PENDING', "requestedByUserId" TEXT NOT NULL,
  "requestedByName" TEXT NOT NULL, "requestId" TEXT NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "durationMs" INTEGER, "summary" TEXT, "errorCode" TEXT,
  "errorMessageSanitized" TEXT, "metadataJson" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InfrastructureOperation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InfrastructureHealthCheck" (
  "id" TEXT NOT NULL, "appId" TEXT NOT NULL, "status" "InfrastructureHealthStatus" NOT NULL,
  "httpStatus" INTEGER, "responseMs" INTEGER, "summary" TEXT, "requestId" TEXT, "metadataJson" JSONB,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InfrastructureHealthCheck_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InfrastructureBackupRecord" (
  "id" TEXT NOT NULL, "appId" TEXT NOT NULL, "status" "InfrastructureOperationStatus" NOT NULL,
  "requestId" TEXT, "fileName" TEXT, "sizeBytes" BIGINT, "checksum" TEXT, "summary" TEXT, "errorCode" TEXT,
  "metadataJson" JSONB, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InfrastructureBackupRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InfrastructureOperation_requestId_key" ON "InfrastructureOperation"("requestId");
CREATE INDEX "InfrastructureOperation_appId_createdAt_idx" ON "InfrastructureOperation"("appId", "createdAt");
CREATE INDEX "InfrastructureOperation_status_createdAt_idx" ON "InfrastructureOperation"("status", "createdAt");
CREATE INDEX "InfrastructureHealthCheck_appId_checkedAt_idx" ON "InfrastructureHealthCheck"("appId", "checkedAt");
CREATE INDEX "InfrastructureHealthCheck_status_checkedAt_idx" ON "InfrastructureHealthCheck"("status", "checkedAt");
CREATE UNIQUE INDEX "InfrastructureBackupRecord_requestId_key" ON "InfrastructureBackupRecord"("requestId");
CREATE INDEX "InfrastructureBackupRecord_appId_createdAt_idx" ON "InfrastructureBackupRecord"("appId", "createdAt");
CREATE INDEX "InfrastructureBackupRecord_status_createdAt_idx" ON "InfrastructureBackupRecord"("status", "createdAt");
ALTER TABLE "InfrastructureOperation" ADD CONSTRAINT "InfrastructureOperation_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
