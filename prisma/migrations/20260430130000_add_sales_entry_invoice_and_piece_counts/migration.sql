-- SalesEntry: optional invoice and piece counts (ledger sync does not populate these).

ALTER TABLE "SalesEntry" ADD COLUMN "invoiceCount" INTEGER,
ADD COLUMN "pieceCount" INTEGER;
