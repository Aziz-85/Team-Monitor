-- Platform owner dual-mode access
ALTER TABLE "User" ADD COLUMN "isPlatformOwner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN "activeMode" TEXT NOT NULL DEFAULT 'BRANCH_MANAGER';
ALTER TABLE "Session" ADD COLUMN "platformModeLastActiveAt" TIMESTAMP(3);
