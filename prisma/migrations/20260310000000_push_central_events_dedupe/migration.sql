-- AlterTable MobileDevicePushToken: expoPushToken unique, platform, deviceHint, appVersion, lastSeenAt, revokedAt
ALTER TABLE "MobileDevicePushToken" DROP CONSTRAINT IF EXISTS "MobileDevicePushToken_userId_expoPushToken_key";
ALTER TABLE "MobileDevicePushToken" ADD COLUMN IF NOT EXISTS "platform" TEXT;
UPDATE "MobileDevicePushToken" SET "platform" = 'android' WHERE "platform" IS NULL;
ALTER TABLE "MobileDevicePushToken" ALTER COLUMN "platform" SET NOT NULL;
ALTER TABLE "MobileDevicePushToken" ADD COLUMN IF NOT EXISTS "deviceHint" TEXT;
ALTER TABLE "MobileDevicePushToken" ADD COLUMN IF NOT EXISTS "appVersion" TEXT;
ALTER TABLE "MobileDevicePushToken" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MobileDevicePushToken" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);
ALTER TABLE "MobileDevicePushToken" DROP COLUMN IF EXISTS "deviceId";
ALTER TABLE "MobileDevicePushToken" DROP COLUMN IF EXISTS "updatedAt";
CREATE UNIQUE INDEX IF NOT EXISTS "MobileDevicePushToken_expoPushToken_key" ON "MobileDevicePushToken"("expoPushToken");

-- AlterTable NotificationPreference: scheduleEnabled, tasksEnabled, quietHours
ALTER TABLE "NotificationPreference" RENAME COLUMN "scheduleNotifications" TO "scheduleEnabled";
ALTER TABLE "NotificationPreference" RENAME COLUMN "taskNotifications" TO "tasksEnabled";
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "quietHoursStart" TEXT;
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "quietHoursEnd" TEXT;

-- Drop PushScheduleChangeDedupe
DROP TABLE IF EXISTS "PushScheduleChangeDedupe";

-- CreateTable NotificationEventLog
CREATE TABLE IF NOT EXISTS "NotificationEventLog" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boutiqueId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEventLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationEventLog_eventKey_key" ON "NotificationEventLog"("eventKey");
CREATE INDEX IF NOT EXISTS "NotificationEventLog_userId_type_createdAt_idx" ON "NotificationEventLog"("userId", "type", "createdAt");
