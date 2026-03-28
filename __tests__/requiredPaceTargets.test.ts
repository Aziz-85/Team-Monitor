import {
  remainingMonthTargetSar,
  dailyRequiredTargetSar,
  weeklyRequiredTargetSarSum,
} from '@/lib/targets/requiredPaceTargets';

describe('requiredPaceTargets — acceptance', () => {
  it('TC1: ahead of monthly target → zero remaining and zero daily/weekly required', () => {
    const rem = remainingMonthTargetSar(350_000, 595_165);
    expect(rem).toBe(0);
    expect(dailyRequiredTargetSar(rem, 16)).toBe(0);
    expect(
      weeklyRequiredTargetSarSum({
        monthKey: '2026-03',
        fromDateKey: '2026-03-27',
        weekEndExclusive: new Date('2026-04-01T12:00:00.000Z'),
        remainingMonthSarAtStart: rem,
      })
    ).toBe(0);
  });

  it('TC2: partial month → daily required = ceil(remaining / days left)', () => {
    expect(remainingMonthTargetSar(350_000, 150_000)).toBe(200_000);
    expect(dailyRequiredTargetSar(200_000, 16)).toBe(12_500);
  });
});

describe('weeklyRequiredTargetSarSum', () => {
  it('sums sequential daily-required amounts for remaining week days in month', () => {
    const monthKey = '2026-03';
    const from = '2026-03-27';
    const weekEndExclusive = new Date('2026-03-29T12:00:00.000Z');
    const sum = weeklyRequiredTargetSarSum({
      monthKey,
      fromDateKey: from,
      weekEndExclusive,
      remainingMonthSarAtStart: 30_000,
    });
    expect(sum).toBeGreaterThan(0);
    const d0 = dailyRequiredTargetSar(30_000, 5);
    const rem1 = Math.max(0, 30_000 - d0);
    const d1 = dailyRequiredTargetSar(rem1, 4);
    expect(sum).toBe(d0 + d1);
  });
});
