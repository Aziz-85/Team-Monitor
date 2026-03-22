import {
  isDateKeyAllowedForHistoricalCorrection,
  isDateKeyAllowedForHistoricalInitial,
  isMonthBeforeCurrentMonthRiyadh,
} from '@/lib/historical-sales-import/historicalDatePolicy';

describe('historicalDatePolicy', () => {
  it('compares month keys lexicographically', () => {
    expect(isMonthBeforeCurrentMonthRiyadh('2020-01')).toBe(true);
    expect(isMonthBeforeCurrentMonthRiyadh('2099-12')).toBe(false);
  });

  it('allows only past months and not future calendar days', () => {
    expect(isDateKeyAllowedForHistoricalInitial('2020-06-15')).toBe(true);
    expect(isDateKeyAllowedForHistoricalInitial('not-a-date')).toBe(false);
  });

  it('matches initial and correction period rule', () => {
    expect(isDateKeyAllowedForHistoricalCorrection('2021-01-10')).toBe(
      isDateKeyAllowedForHistoricalInitial('2021-01-10')
    );
  });
});
