-- AlterTable UserBoutiqueMembership: add permission flags (MANAGER-scoped)
ALTER TABLE "UserBoutiqueMembership" ADD COLUMN IF NOT EXISTS "canManageTasks" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserBoutiqueMembership" ADD COLUMN IF NOT EXISTS "canManageLeaves" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserBoutiqueMembership" ADD COLUMN IF NOT EXISTS "canManageSales" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserBoutiqueMembership" ADD COLUMN IF NOT EXISTS "canManageInventory" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable LeaveRequest (boutique-scoped leave with approval workflow)
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "type" "LeaveType" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeaveRequest_boutiqueId_idx" ON "LeaveRequest"("boutiqueId");
CREATE INDEX IF NOT EXISTS "LeaveRequest_userId_idx" ON "LeaveRequest"("userId");
CREATE INDEX IF NOT EXISTS "LeaveRequest_startDate_idx" ON "LeaveRequest"("startDate");
CREATE INDEX IF NOT EXISTS "LeaveRequest_endDate_idx" ON "LeaveRequest"("endDate");
CREATE INDEX IF NOT EXISTS "LeaveRequest_status_idx" ON "LeaveRequest"("status");

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
