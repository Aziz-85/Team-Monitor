-- Trusted browser devices for skipping TOTP (Release 1 modern auth).
-- Raw trust tokens are never stored; only tokenHash.

CREATE TABLE "TrustedAuthDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceName" TEXT,
    "browser" TEXT,
    "operatingSystem" TEXT,
    "userAgentHash" TEXT,
    "firstIp" TEXT,
    "lastIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "TrustedAuthDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrustedAuthDevice_tokenHash_key" ON "TrustedAuthDevice"("tokenHash");
CREATE INDEX "TrustedAuthDevice_userId_expiresAt_idx" ON "TrustedAuthDevice"("userId", "expiresAt");
CREATE INDEX "TrustedAuthDevice_userId_revokedAt_idx" ON "TrustedAuthDevice"("userId", "revokedAt");

ALTER TABLE "TrustedAuthDevice" ADD CONSTRAINT "TrustedAuthDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
