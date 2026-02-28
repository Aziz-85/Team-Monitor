-- Add User.boutiqueId (nullable first; backfill in next migration then enforce NOT NULL)
ALTER TABLE "User" ADD COLUMN "boutiqueId" TEXT;

CREATE INDEX "User_boutiqueId_idx" ON "User"("boutiqueId");

ALTER TABLE "User" ADD CONSTRAINT "User_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
