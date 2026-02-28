-- CreateEnum
CREATE TYPE "ScheduleLockScope" AS ENUM ('DAY', 'WEEK');

-- CreateTable
CREATE TABLE "ScheduleLock" (
    "id" TEXT NOT NULL,
    "scopeType" "ScheduleLockScope" NOT NULL,
    "scopeValue" TEXT NOT NULL,
    "lockedByUserId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleLock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduleLock_scopeType_scopeValue_key" ON "ScheduleLock"("scopeType", "scopeValue");

-- Migrate data from ScheduleDayLock
INSERT INTO "ScheduleLock" ("id", "scopeType", "scopeValue", "lockedByUserId", "lockedAt")
SELECT "id", 'DAY'::"ScheduleLockScope", to_char("date", 'YYYY-MM-DD'), "lockedByUserId", "lockedAt"
FROM "ScheduleDayLock";

-- Migrate data from ScheduleWeekLock (generate new id to avoid PK conflict)
INSERT INTO "ScheduleLock" ("id", "scopeType", "scopeValue", "lockedByUserId", "lockedAt")
SELECT (gen_random_uuid())::text, 'WEEK'::"ScheduleLockScope", "weekStart", "lockedByUserId", "lockedAt"
FROM "ScheduleWeekLock";

-- DropTable
DROP TABLE "ScheduleDayLock";
DROP TABLE "ScheduleWeekLock";
