-- CreateTable: ScopeSetting (per-scope sales completeness config)
CREATE TABLE "ScopeSetting" (
    "id" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "maxSalesGapDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopeSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScopeSetting_scopeId_key" ON "ScopeSetting"("scopeId");
