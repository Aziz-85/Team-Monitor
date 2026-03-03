-- CreateTable
CREATE TABLE "BoutiqueKey" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "keyNumber" INTEGER NOT NULL,

    CONSTRAINT "BoutiqueKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyHandover" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "fromEmployeeId" TEXT,
    "toEmployeeId" TEXT NOT NULL,
    "handoverAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeyHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoutiqueKey_boutiqueId_keyNumber_key" ON "BoutiqueKey"("boutiqueId", "keyNumber");

-- CreateIndex
CREATE INDEX "BoutiqueKey_boutiqueId_idx" ON "BoutiqueKey"("boutiqueId");

-- CreateIndex
CREATE INDEX "KeyHandover_boutiqueId_handoverAt_idx" ON "KeyHandover"("boutiqueId", "handoverAt");

-- CreateIndex
CREATE INDEX "KeyHandover_keyId_idx" ON "KeyHandover"("keyId");

-- AddForeignKey
ALTER TABLE "BoutiqueKey" ADD CONSTRAINT "BoutiqueKey_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyHandover" ADD CONSTRAINT "KeyHandover_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "BoutiqueKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyHandover" ADD CONSTRAINT "KeyHandover_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
