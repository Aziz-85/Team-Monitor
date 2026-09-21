import { isValidSalesDateKey, validateBoutiqueSalesRange } from '@/lib/sales/boutiqueDateRange';

describe('boutique sales date range validation', () => {
  it('accepts an inclusive range across months or years', () => {
    expect(validateBoutiqueSalesRange('2025-09-01', '2026-01-31')).toBeNull();
    expect(validateBoutiqueSalesRange('2025-09-01', '2025-09-01')).toBeNull();
  });

  it('rejects invalid calendar dates and reversed ranges', () => {
    expect(isValidSalesDateKey('2025-02-29')).toBe(false);
    expect(isValidSalesDateKey('2024-02-29')).toBe(true);
    expect(validateBoutiqueSalesRange('2025-09-31', '2025-10-01')).not.toBeNull();
    expect(validateBoutiqueSalesRange('2025-10-01', '2025-09-01')).not.toBeNull();
  });
});
