'use client';

import { SalesDailyClient } from '@/app/(dashboard)/sales/daily/SalesDailyClient';

/** Panel wrapper for the Daily Sales Ledger UI. */
export function DailySalesLedgerPanel({
  canAdminUnlockLedger = false,
  canManageDailyTotal = false,
}: {
  canAdminUnlockLedger?: boolean;
  canManageDailyTotal?: boolean;
}) {
  return (
    <div className="min-h-0">
      <SalesDailyClient
        embedded
        canAdminUnlockLedger={canAdminUnlockLedger}
        canManageDailyTotal={canManageDailyTotal}
      />
    </div>
  );
}
