-- AlterTable Employee: add optional weekly off override (null = use weeklyOffDay; -1 = no weekly off "بدون"; 0..6 = override day)
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "weeklyOffOverrideDay" INTEGER;
