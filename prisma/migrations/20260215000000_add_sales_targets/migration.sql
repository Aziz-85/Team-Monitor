-- CreateTable
CREATE TABLE "BoutiqueMonthlyTarget" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoutiqueMonthlyTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeMonthlyTarget" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sourceBoutiqueTargetId" TEXT,
    "generatedAt" TIMESTAMP(3),
    "generatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeMonthlyTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesEntry" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "month" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoutiqueMonthlyTarget_month_key" ON "BoutiqueMonthlyTarget"("month");

-- CreateIndex
CREATE INDEX "BoutiqueMonthlyTarget_month_idx" ON "BoutiqueMonthlyTarget"("month");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeMonthlyTarget_month_userId_key" ON "EmployeeMonthlyTarget"("month", "userId");

-- CreateIndex
CREATE INDEX "EmployeeMonthlyTarget_month_idx" ON "EmployeeMonthlyTarget"("month");

-- CreateIndex
CREATE INDEX "EmployeeMonthlyTarget_userId_idx" ON "EmployeeMonthlyTarget"("userId");

-- CreateIndex
CREATE INDEX "EmployeeMonthlyTarget_sourceBoutiqueTargetId_idx" ON "EmployeeMonthlyTarget"("sourceBoutiqueTargetId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesEntry_userId_date_key" ON "SalesEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "SalesEntry_month_idx" ON "SalesEntry"("month");

-- CreateIndex
CREATE INDEX "SalesEntry_userId_idx" ON "SalesEntry"("userId");

-- AddForeignKey
ALTER TABLE "BoutiqueMonthlyTarget" ADD CONSTRAINT "BoutiqueMonthlyTarget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeMonthlyTarget" ADD CONSTRAINT "EmployeeMonthlyTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeMonthlyTarget" ADD CONSTRAINT "EmployeeMonthlyTarget_sourceBoutiqueTargetId_fkey" FOREIGN KEY ("sourceBoutiqueTargetId") REFERENCES "BoutiqueMonthlyTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeMonthlyTarget" ADD CONSTRAINT "EmployeeMonthlyTarget_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
