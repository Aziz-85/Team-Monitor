-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canEditSchedule" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScheduleEditAudit" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "editorId" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changesJson" JSONB NOT NULL,
    "source" TEXT,

    CONSTRAINT "ScheduleEditAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduleEditAudit_weekStart_editedAt_idx" ON "ScheduleEditAudit"("weekStart", "editedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScheduleEditAudit_editorId_editedAt_idx" ON "ScheduleEditAudit"("editorId", "editedAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScheduleEditAudit_editorId_fkey'
  ) THEN
    ALTER TABLE "ScheduleEditAudit" ADD CONSTRAINT "ScheduleEditAudit_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
