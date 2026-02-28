-- CreateTable
CREATE TABLE "EmployeeTeamHistory" (
    "id" TEXT NOT NULL,
    "empId" TEXT NOT NULL,
    "team" "Team" NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeTeamHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeTeamHistory_empId_effectiveFrom_idx" ON "EmployeeTeamHistory"("empId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "EmployeeTeamHistory" ADD CONSTRAINT "EmployeeTeamHistory_empId_fkey" FOREIGN KEY ("empId") REFERENCES "Employee"("empId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTeamHistory" ADD CONSTRAINT "EmployeeTeamHistory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: one row per employee with effectiveFrom = past date and team = current employee.team
-- Use first user as createdByUserId for seed rows (required FK)
INSERT INTO "EmployeeTeamHistory" ("id", "empId", "team", "effectiveFrom", "createdByUserId", "createdAt")
SELECT
  'seed-team-' || "empId",
  "empId",
  "team",
  '2020-01-01'::date,
  (SELECT "id" FROM "User" LIMIT 1),
  NOW()
FROM "Employee"
WHERE EXISTS (SELECT 1 FROM "User" LIMIT 1);
