/**
 * Dynamic daily target = ceil(remaining monthly goal / days remaining including today).
 */

import {
  dailyRequiredTargetSar,
  remainingMonthTargetSar,
  computeReportingAndPaceSnapshot,
} from '@/lib/targets/requiredPaceTargets';

describe('dynamic daily target (remaining month ÷ remaining days)', () => {
  it('recalculates when MTD changes', () => {
    const monthTarget = 310_000;
    const daysRemaining = 10;

    const remBehind = remainingMonthTargetSar(monthTarget, 100_000);
    expect(remBehind).toBe(210_000);
    expect(dailyRequiredTargetSar(remBehind, daysRemaining)).toBe(21_000);

    const remCatchUp = remainingMonthTargetSar(monthTarget, 250_000);
    expect(remCatchUp).toBe(60_000);
    expect(dailyRequiredTargetSar(remCatchUp, daysRemaining)).toBe(6_000);
  });

  it('returns 0 when monthly goal already met', () => {
    expect(remainingMonthTargetSar(100_000, 100_000)).toBe(0);
    expect(dailyRequiredTargetSar(0, 5)).toBe(0);
    expect(remainingMonthTargetSar(100_000, 120_000)).toBe(0);
  });

  it('ceils fractional daily required', () => {
    expect(dailyRequiredTargetSar(100, 3)).toBe(34);
  });

  it('pace snapshot uses dynamic daily, not flat calendar allocation, when behind', () => {
    const snap = computeReportingAndPaceSnapshot({
      monthTarget: 310_000,
      mtdAchieved: 100_000,
      daysInMonth: 31,
      monthKey: '2026-07',
      todayDateKey: '2026-07-22',
      todayDayOfMonth: 22,
      todayInSelectedMonth: true,
      weekInMonth: null,
    });
    // Flat calendar ≈ 10000/day; catch-up pace is higher when behind.
    expect(snap.reportingDailyAllocationSar).toBe(10_000);
    expect(snap.remainingMonthTargetSar).toBe(210_000);
    expect(snap.paceDailyRequiredSar).toBeGreaterThan(snap.reportingDailyAllocationSar);
    expect(snap.paceDailyRequiredSar).toBe(Math.ceil(210_000 / 10)); // Jul 22–31 = 10 days
  });
});
