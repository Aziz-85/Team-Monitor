'use client';

import { SalesImportIssuesClient } from '@/app/(dashboard)/sales/import-issues/SalesImportIssuesClient';

/** Panel wrapper for the existing Import Issues UI (no logic change). */
export function ImportIssuesPanel({ canResolve }: { canResolve: boolean }) {
  return (
    <div className="min-h-0 p-4">
      <SalesImportIssuesClient canResolve={canResolve} />
    </div>
  );
}
