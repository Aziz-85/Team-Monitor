-- Delegation overlay: temporary role/permission grants
CREATE TYPE "DelegationGrantType" AS ENUM ('ROLE_BOOST', 'PERMISSION_FLAGS');

CREATE TABLE "DelegationGrant" (
    "id" TEXT NOT NULL,
    "boutiqueId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "type" "DelegationGrantType" NOT NULL,
    "roleBoost" "Role",
    "flags" JSONB,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelegationGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DelegationGrant_boutiqueId_targetUserId_startsAt_endsAt_idx" ON "DelegationGrant"("boutiqueId", "targetUserId", "startsAt", "endsAt");
CREATE INDEX "DelegationGrant_boutiqueId_endsAt_idx" ON "DelegationGrant"("boutiqueId", "endsAt");

ALTER TABLE "DelegationGrant" ADD CONSTRAINT "DelegationGrant_boutiqueId_fkey" FOREIGN KEY ("boutiqueId") REFERENCES "Boutique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DelegationGrant" ADD CONSTRAINT "DelegationGrant_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DelegationGrant" ADD CONSTRAINT "DelegationGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DelegationGrant" ADD CONSTRAINT "DelegationGrant_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DelegationAuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boutiqueId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "DelegationAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DelegationAuditLog_boutiqueId_createdAt_idx" ON "DelegationAuditLog"("boutiqueId", "createdAt");
CREATE INDEX "DelegationAuditLog_targetUserId_createdAt_idx" ON "DelegationAuditLog"("targetUserId", "createdAt");
