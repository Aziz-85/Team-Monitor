import {
  computePreviewTotals,
  resolveTargetWriteAction,
} from '@/lib/targets/importPreview';

describe('importPreview helpers', () => {
  it('marks zero inserts as skipped when no existing row', () => {
    expect(resolveTargetWriteAction(0, null)).toEqual({ action: 'SKIPPED', reason: 'Zero target' });
  });

  it('marks matching zero as no change', () => {
    expect(resolveTargetWriteAction(0, { amount: 0 })).toEqual({
      action: 'NO_CHANGE',
      reason: 'Target unchanged',
    });
  });

  it('marks non-zero inserts and updates', () => {
    expect(resolveTargetWriteAction(2_200_000, null)).toEqual({ action: 'INSERT' });
    expect(resolveTargetWriteAction(2_200_000, { amount: 1_500_000 })).toEqual({ action: 'UPDATE' });
  });

  it('computes preview totals', () => {
    const totals = computePreviewTotals([
      { action: 'INSERT' },
      { action: 'UPDATE' },
      { action: 'NO_CHANGE' },
      { action: 'SKIPPED' },
      { action: 'ERROR' },
    ]);
    expect(totals).toEqual({
      totalRows: 5,
      willInsert: 1,
      willUpdate: 1,
      noChange: 1,
      skipped: 1,
      errors: 1,
    });
  });
});
