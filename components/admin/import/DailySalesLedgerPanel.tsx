'use client';

import { SalesDailyClient } from '@/app/(dashboard)/sales/daily/SalesDailyClient';

/** Panel wrapper for the Daily Sales Ledger UI. */
export function DailySalesLedgerPanel({ canAdminUnlockLedger = false }: { canAdminUnlockLedger?: boolean }) {
  return (
    <div className="min-h-0">
      <SalesDailyClient embedded canAdminUnlockLedger={canAdminUnlockLedger} />
    </div>
  );
}
