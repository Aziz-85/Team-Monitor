-- Secure editable monthly matrix: unlock sessions + cell audit + activity log

CREATE TABLE "SalesMatrixEditUnlockSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SalesMatrixEditUnlockSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesMatrixEditCellAudit" (
    "id" TEXT NOT NULL,
    "unlockSessionId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "oldAmount" INTEGER NOT NULL,
    "newAmount" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sourcePage" TEXT NOT NULL DEFAULT 'monthly-matrix-secure-edit',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesMatrixEditCellAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesMatrixEditActivityLog" (
    "id" TEXT NOT NULL,
    "unlockSessionId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "month" TEXT,
    "eventType" TEXT NOT NULL,
    "detail" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesMatrixEditActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesMatrixEditUnlockSession_userId_boutiqueId_month_idx" ON "SalesMatrixEditUnlockSession"("userId", "boutiqueId", "month");
CREATE INDEX "SalesMatrixEditUnlockSession_expiresAt_idx" ON "SalesMatrixEditUnlockSession"("expiresAt");

CREATE INDEX "SalesMatrixEditCellAudit_boutiqueId_month_createdAt_idx" ON "SalesMatrixEditCellAudit"("boutiqueId", "month", "createdAt");
CREATE INDEX "SalesMatrixEditCellAudit_unlockSessionId_idx" ON "SalesMatrixEditCellAudit"("unlockSessionId");
CREATE INDEX "SalesMatrixEditCellAudit_actorUserId_createdAt_idx" ON "SalesMatrixEditCellAudit"("actorUserId", "createdAt");

CREATE INDEX "SalesMatrixEditActivityLog_actorUserId_createdAt_idx" ON "SalesMatrixEditActivityLog"("actorUserId", "createdAt");
CREATE INDEX "SalesMatrixEditActivityLog_boutiqueId_createdAt_idx" ON "SalesMatrixEditActivityLog"("boutiqueId", "createdAt");
CREATE INDEX "SalesMatrixEditActivityLog_eventType_createdAt_idx" ON "SalesMatrixEditActivityLog"("eventType", "createdAt");

ALTER TABLE "SalesMatrixEditUnlockSession" ADD CONSTRAINT "SalesMatrixEditUnlockSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesMatrixEditUnlockSession" ADD CONSTRAINT "SalesMatrixEditUnlockSession_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesMatrixEditCellAudit" ADD CONSTRAINT "SalesMatrixEditCellAudit_unlockSessionId_fkey" FOREIGN KEY ("unlockSessionId") REFERENCES "SalesMatrixEditUnlockSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesMatrixEditCellAudit" ADD CONSTRAINT "SalesMatrixEditCellAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesMatrixEditActivityLog" ADD CONSTRAINT "SalesMatrixEditActivityLog_unlockSessionId_fkey" FOREIGN KEY ("unlockSessionId") REFERENCES "SalesMatrixEditUnlockSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesMatrixEditActivityLog" ADD CONSTRAINT "SalesMatrixEditActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
