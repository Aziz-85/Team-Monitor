-- CreateTable
CREATE TABLE "EmployeeTeamAssignment" (
    "id" TEXT NOT NULL,
    "empId" TEXT NOT NULL,
    "team" "Team" NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeTeamAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeTeamAssignment_empId_effectiveFrom_idx" ON "EmployeeTeamAssignment"("empId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "EmployeeTeamAssignment" ADD CONSTRAINT "EmployeeTeamAssignment_empId_fkey" FOREIGN KEY ("empId") REFERENCES "Employee"("empId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTeamAssignment" ADD CONSTRAINT "EmployeeTeamAssignment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
