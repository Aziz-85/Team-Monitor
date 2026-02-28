-- AlterTable
ALTER TABLE "ScheduleLock" ADD COLUMN "reason" TEXT,
ADD COLUMN "revokedByUserId" TEXT,
ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Drop the old unique constraint
ALTER TABLE "ScheduleLock" DROP CONSTRAINT IF EXISTS "ScheduleLock_scopeType_scopeValue_key";

-- CreateIndex
CREATE INDEX "ScheduleLock_scopeType_scopeValue_isActive_idx" ON "ScheduleLock"("scopeType", "scopeValue", "isActive");

-- Set all existing locks as active
UPDATE "ScheduleLock" SET "isActive" = true WHERE "isActive" IS NULL;
