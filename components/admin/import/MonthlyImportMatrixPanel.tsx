'use client';

import { ImportMatrixClient } from '@/app/(dashboard)/sales/import-matrix/ImportMatrixClient';

/** Panel wrapper for the existing Monthly Import (Matrix) UI (no logic change). */
export function MonthlyImportMatrixPanel() {
  return (
    <div className="min-h-0">
      <ImportMatrixClient />
    </div>
  );
}
