-- CreateTable
CREATE TABLE "ReleaseNote" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReleaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeployRecord" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appVersion" TEXT NOT NULL,
    "gitHash" TEXT NOT NULL,
    "buildDate" TIMESTAMP(3) NOT NULL,
    "environment" TEXT NOT NULL,
    "serverHost" TEXT,
    "serverIp" TEXT,
    "deployedByUserId" TEXT,
    "deploySource" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "DeployRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseNote_version_key" ON "ReleaseNote"("version");

-- CreateIndex
CREATE INDEX "ReleaseNote_version_idx" ON "ReleaseNote"("version");

-- CreateIndex
CREATE INDEX "ReleaseNote_isPublished_idx" ON "ReleaseNote"("isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "DeployRecord_appVersion_gitHash_environment_key" ON "DeployRecord"("appVersion", "gitHash", "environment");

-- CreateIndex
CREATE INDEX "DeployRecord_createdAt_idx" ON "DeployRecord"("createdAt");

-- CreateIndex
CREATE INDEX "DeployRecord_environment_idx" ON "DeployRecord"("environment");

-- AddForeignKey
ALTER TABLE "ReleaseNote" ADD CONSTRAINT "ReleaseNote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeployRecord" ADD CONSTRAINT "DeployRecord_deployedByUserId_fkey" FOREIGN KEY ("deployedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
