-- LeaveRequest: new status flow + escalation fields
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3);
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "escalatedById" TEXT;

-- Backfill status: map old PENDING -> SUBMITTED, APPROVED -> APPROVED_MANAGER, REJECTED stays
UPDATE "LeaveRequest" SET status = 'SUBMITTED' WHERE status = 'PENDING';
UPDATE "LeaveRequest" SET status = 'APPROVED_MANAGER' WHERE status = 'APPROVED';
-- Default for new rows is DRAFT; existing rows already have status set
ALTER TABLE "LeaveRequest" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
