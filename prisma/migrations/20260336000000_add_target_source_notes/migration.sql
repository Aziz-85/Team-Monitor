-- AlterTable BoutiqueMonthlyTarget: add optional source and notes (for Target Management import)
ALTER TABLE "BoutiqueMonthlyTarget" ADD COLUMN "source" TEXT;
ALTER TABLE "BoutiqueMonthlyTarget" ADD COLUMN "notes" TEXT;

-- AlterTable EmployeeMonthlyTarget: add optional source and notes
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN "source" TEXT;
ALTER TABLE "EmployeeMonthlyTarget" ADD COLUMN "notes" TEXT;
