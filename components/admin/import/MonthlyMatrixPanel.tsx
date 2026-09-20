'use client';

import { MonthlySalesMatrixClient } from '@/app/(dashboard)/sales/monthly-matrix/MonthlySalesMatrixClient';
import { SecureMonthlyMatrixEditClient } from '@/app/(dashboard)/admin/sales/monthly-matrix-secure-edit/SecureMonthlyMatrixEditClient';

/**
 * Keep the read-only matrix for operational roles, while administrators get the
 * audited editor in the same Monthly tab. The editor API independently enforces
 * ADMIN/SUPER_ADMIN, so this UI switch is not the security boundary.
 */
export function MonthlyMatrixPanel({ canEdit = false }: { canEdit?: boolean }) {
  return (
    <div className="min-h-0">
      {canEdit ? <SecureMonthlyMatrixEditClient embedded /> : <MonthlySalesMatrixClient />}
    </div>
  );
}
