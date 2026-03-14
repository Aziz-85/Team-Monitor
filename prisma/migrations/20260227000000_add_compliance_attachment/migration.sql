-- AlterTable ComplianceItem: add attachment fields for electronic copy of license/document
ALTER TABLE "ComplianceItem" ADD COLUMN "attachmentFileName" TEXT;
ALTER TABLE "ComplianceItem" ADD COLUMN "attachmentStoragePath" TEXT;
