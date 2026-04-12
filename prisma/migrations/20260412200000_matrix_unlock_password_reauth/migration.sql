-- Secure matrix unlock: record re-auth method (password) instead of shared passcode

ALTER TABLE "SalesMatrixEditUnlockSession" ADD COLUMN "unlockAuthMethod" TEXT NOT NULL DEFAULT 'PASSWORD_REAUTH';
