import {
  allocateProportionalSar,
  buildSmartDowWeights,
  buildWeekdayProfileFromHistory,
  listRemainingDateKeysInMonth,
  riyadhSatBasedDow,
} from '@/lib/analytics/smartBranchOutlook';

describe('smartBranchOutlook', () => {
  it('allocateProportionalSar preserves total', () => {
    const parts = allocateProportionalSar(100, [1, 3]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts[1]).toBeGreaterThanOrEqual(parts[0]);
  });

  it('listRemainingDateKeysInMonth lists from date onward', () => {
    const keys = listRemainingDateKeysInMonth('2026-03', '2026-03-30');
    expect(keys).toEqual(['2026-03-30', '2026-03-31']);
  });

  it('buildSmartDowWeights uses equal weights when history thin', () => {
    const profile = buildWeekdayProfileFromHistory([
      { dateKey: '2026-01-01', amountSar: 1000 },
      { dateKey: '2026-01-02', amountSar: 2000 },
    ]);
    expect(profile.totalSampleDays).toBe(2);
    const w = buildSmartDowWeights(profile);
    expect(w.usedEqualWeightFallback).toBe(true);
    expect(w.weightsBySatDow.every((x) => x === 1)).toBe(true);
  });

  it('riyadhSatBasedDow is stable for a known Thursday UTC', () => {
    expect(riyadhSatBasedDow('2026-03-05')).toBeGreaterThanOrEqual(0);
    expect(riyadhSatBasedDow('2026-03-05')).toBeLessThanOrEqual(6);
  });
});
