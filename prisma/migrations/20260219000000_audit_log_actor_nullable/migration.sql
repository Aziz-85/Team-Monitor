-- AlterTable: Allow deleting User by making AuditLog.actorUserId nullable and ON DELETE SET NULL
ALTER TABLE "AuditLog" ALTER COLUMN "actorUserId" DROP NOT NULL;

-- Drop existing FK and re-add with ON DELETE SET NULL
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_actorUserId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
