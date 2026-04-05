-- Experimental sales test module (isolated from SalesEntry)

CREATE TABLE "SalesTestEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "boutiqueId" TEXT,
    "boutiqueLabel" TEXT,
    "todaySalesSar" INTEGER NOT NULL DEFAULT 0,
    "dailyTargetSar" INTEGER NOT NULL DEFAULT 0,
    "mtdSalesSar" INTEGER NOT NULL DEFAULT 0,
    "mtdTargetSar" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER,
    "transactions" INTEGER,
    "stockAvailabilityPct" INTEGER,
    "campaignActive" BOOLEAN NOT NULL DEFAULT false,
    "campaignNotes" TEXT,
    "yesterdaySalesSar" INTEGER,
    "sameDayLastWeekSalesSar" INTEGER,
    "lastMonthMtdSalesSar" INTEGER,
    "timePatternNote" TEXT,
    "promotionImpactNote" TEXT,
    "monthTrendJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTestEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesTestEmployeeLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "salesSar" INTEGER NOT NULL DEFAULT 0,
    "targetSar" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesTestEmployeeLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesTestBranchLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "branchLabel" TEXT NOT NULL,
    "salesSar" INTEGER NOT NULL DEFAULT 0,
    "targetSar" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesTestBranchLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesTestEntry_userId_dateKey_key" ON "SalesTestEntry"("userId", "dateKey");
CREATE INDEX "SalesTestEntry_userId_dateKey_idx" ON "SalesTestEntry"("userId", "dateKey");
CREATE INDEX "SalesTestEmployeeLine_entryId_idx" ON "SalesTestEmployeeLine"("entryId");
CREATE INDEX "SalesTestBranchLine_entryId_idx" ON "SalesTestBranchLine"("entryId");

ALTER TABLE "SalesTestEntry" ADD CONSTRAINT "SalesTestEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTestEntry" ADD CONSTRAINT "SalesTestEntry_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesTestEmployeeLine" ADD CONSTRAINT "SalesTestEmployeeLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "SalesTestEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTestBranchLine" ADD CONSTRAINT "SalesTestBranchLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "SalesTestEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
