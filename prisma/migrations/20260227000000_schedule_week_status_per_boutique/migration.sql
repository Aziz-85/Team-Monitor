-- ScheduleWeekStatus: per-boutique (id PK + unique(weekStart, boutiqueId))
-- So approving/locking a week in one boutique does not affect another.

-- Add new primary key column
ALTER TABLE "ScheduleWeekStatus" ADD COLUMN "id" TEXT;

-- Backfill id (one row per weekStart today; preserve existing data)
UPDATE "ScheduleWeekStatus" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;

ALTER TABLE "ScheduleWeekStatus" ALTER COLUMN "id" SET NOT NULL;

-- Drop old primary key
ALTER TABLE "ScheduleWeekStatus" DROP CONSTRAINT "ScheduleWeekStatus_pkey";

-- Add new primary key
ALTER TABLE "ScheduleWeekStatus" ADD CONSTRAINT "ScheduleWeekStatus_pkey" PRIMARY KEY ("id");

-- One status row per (weekStart, boutiqueId)
CREATE UNIQUE INDEX "ScheduleWeekStatus_weekStart_boutiqueId_key" ON "ScheduleWeekStatus"("weekStart", "boutiqueId");
