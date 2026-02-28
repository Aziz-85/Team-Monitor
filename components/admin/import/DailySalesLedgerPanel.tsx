'use client';

import { SalesDailyClient } from '@/app/(dashboard)/sales/daily/SalesDailyClient';

/** Panel wrapper for the existing Daily Sales Ledger UI (no logic change). */
export function DailySalesLedgerPanel() {
  return (
    <div className="min-h-0">
      <SalesDailyClient />
    </div>
  );
}
