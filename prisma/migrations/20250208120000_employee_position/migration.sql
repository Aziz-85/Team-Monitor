-- CreateEnum
CREATE TYPE "EmployeePosition" AS ENUM ('BOUTIQUE_MANAGER', 'ASSISTANT_MANAGER', 'SENIOR_SALES', 'SALES');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "position" "EmployeePosition";
