'use client';

import { MonthlySalesMatrixClient } from '@/app/(dashboard)/sales/monthly-matrix/MonthlySalesMatrixClient';

/** Panel wrapper for the existing Monthly Matrix UI (no logic change). */
export function MonthlyMatrixPanel() {
  return (
    <div className="min-h-0">
      <MonthlySalesMatrixClient />
    </div>
  );
}
