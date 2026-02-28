-- One-off: add UserPreference.adminFilterJson if missing (from migration 20260224000000).
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "adminFilterJson" TEXT;
