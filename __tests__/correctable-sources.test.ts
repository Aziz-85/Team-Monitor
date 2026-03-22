import { isCorrectableSalesEntrySource } from '@/lib/historical-sales-import/correctableSources';

describe('correctableSources', () => {
  it('blocks MANUAL only', () => {
    expect(isCorrectableSalesEntrySource('MANUAL')).toBe(false);
    expect(isCorrectableSalesEntrySource('manual')).toBe(false);
    expect(isCorrectableSalesEntrySource('LEDGER')).toBe(true);
    expect(isCorrectableSalesEntrySource('HISTORICAL_IMPORT')).toBe(true);
    expect(isCorrectableSalesEntrySource(null)).toBe(true);
  });
});
