'use client';

import { SalesImportClient } from '@/app/(dashboard)/sales/import/SalesImportClient';

/** Panel wrapper for the existing Import Sales UI (no logic change). */
export function ImportSalesPanel() {
  return (
    <div className="min-h-0">
      <SalesImportClient embedded />
    </div>
  );
}
