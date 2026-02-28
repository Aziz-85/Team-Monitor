-- AlterTable: add operationalBoutiqueId to UserPreference for single-boutique operational scope
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "operationalBoutiqueId" TEXT;
