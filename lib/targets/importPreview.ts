export type ImportRowAction = 'INSERT' | 'UPDATE' | 'NO_CHANGE' | 'SKIPPED' | 'ERROR';

export type ImportPreviewTotals = {
  totalRows: number;
  willInsert: number;
  willUpdate: number;
  noChange: number;
  skipped: number;
  errors: number;
};

export function resolveTargetWriteAction(
  newAmount: number,
  existing: { amount: number } | null | undefined
): { action: Exclude<ImportRowAction, 'ERROR'>; reason?: string } {
  if (existing) {
    if (existing.amount === newAmount) {
      return { action: 'NO_CHANGE', reason: 'Target unchanged' };
    }
    return { action: 'UPDATE' };
  }
  if (newAmount === 0) {
    return { action: 'SKIPPED', reason: 'Zero target' };
  }
  return { action: 'INSERT' };
}

export function computePreviewTotals(
  previewRows: { action: ImportRowAction }[]
): ImportPreviewTotals {
  return {
    totalRows: previewRows.length,
    willInsert: previewRows.filter((row) => row.action === 'INSERT').length,
    willUpdate: previewRows.filter((row) => row.action === 'UPDATE').length,
    noChange: previewRows.filter((row) => row.action === 'NO_CHANGE').length,
    skipped: previewRows.filter((row) => row.action === 'SKIPPED').length,
    errors: previewRows.filter((row) => row.action === 'ERROR').length,
  };
}

export function previewStatusLabel(action: ImportRowAction, reason: string | null): string {
  if (action === 'ERROR') return reason ?? 'Error';
  if (action === 'SKIPPED') return reason ?? 'Skipped';
  if (action === 'NO_CHANGE') return reason ?? 'No change';
  if (action === 'INSERT') return 'Will insert';
  return 'Will update';
}
