-- CreateTable
CREATE TABLE "SalesEditGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "SalesEditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesEditGrant_userId_date_key" ON "SalesEditGrant"("userId", "date");

-- CreateIndex
CREATE INDEX "SalesEditGrant_date_idx" ON "SalesEditGrant"("date");

-- AddForeignKey
ALTER TABLE "SalesEditGrant" ADD CONSTRAINT "SalesEditGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
