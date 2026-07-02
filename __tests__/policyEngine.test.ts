/**
 * Policy Engine — centralized schedule policy resolution.
 */

import {
  FRIDAY_DOW,
  MAX_SPLIT_DAYS,
  NORMAL_MAX_DAILY_HOURS,
  RAMADAN_MAX_DAILY_HOURS,
  SLOT_INTERVAL_MINUTES,
  getDefaultGenerateSettings,
  getSchedulePolicy,
  generateSettingsFromPolicy,
  operatingPeriodsForPolicy,
} from '@/lib/schedule/policyEngine';
import type { DayOperatingConfig } from '@/lib/schedule/generateSchedule/types';

function makeDay(date: string, dayOfWeek: number, isRamadan: boolean): DayOperatingConfig {
  return {
    date,
    dayOfWeek,
    isRamadan,
    operatingPeriods: operatingPeriodsForPolicy(dayOfWeek, isRamadan ? 'ramadan' : 'normal'),
  };
}

describe('getSchedulePolicy', () => {
  it('returns normal mode defaults for a non-Ramadan week', () => {
    const days = [
      makeDay('2026-06-15', 1, false),
      makeDay('2026-06-19', FRIDAY_DOW, false),
    ];
    const policy = getSchedulePolicy({ days });

    expect(policy.mode).toBe('normal');
    expect(policy.maxDailyHours).toBe(NORMAL_MAX_DAILY_HOURS);
    expect(policy.slotIntervalMinutes).toBe(SLOT_INTERVAL_MINUTES);
    expect(policy.split.allowed).toBe(true);
    expect(policy.split.maxDaysPerEmployeePerWeek).toBe(MAX_SPLIT_DAYS);
    expect(policy.friday.mode).toBe('pm_only');
    expect(policy.externalSupport.allowed).toBe(true);
    expect(policy.overtime.allowed).toBe(true);
    expect(policy.overtime.priority).toBe('last_resort');
    expect(policy.coverage.defaultMinCoverage).toBe(2);
  });

  it('returns ramadan mode with 6h max and full-day Friday', () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      makeDay(`2026-03-${10 + i}`, (i + 1) % 7, true)
    );
    const policy = getSchedulePolicy({ days });

    expect(policy.mode).toBe('ramadan');
    expect(policy.maxDailyHours).toBe(RAMADAN_MAX_DAILY_HOURS);
    expect(policy.friday.mode).toBe('full_day');
    expect(policy.coverage.periods.ramadanFri).toHaveLength(2);
  });

  it('generateSettingsFromPolicy matches engine defaults', () => {
    const defaults = getDefaultGenerateSettings();
    const policy = getSchedulePolicy({ days: [] });
    const fromPolicy = generateSettingsFromPolicy(policy);

    expect(fromPolicy.normalMode.maxDailyHours).toBe(defaults.normalMode.maxDailyHours);
    expect(fromPolicy.ramadanMode.maxDailyHours).toBe(defaults.ramadanMode.maxDailyHours);
    expect(fromPolicy.splitShiftAllowed).toBe(defaults.splitShiftAllowed);
    expect(fromPolicy.slotIntervalMinutes).toBe(defaults.slotIntervalMinutes);
  });

  it('Friday normal week uses PM-only operating periods', () => {
    const periods = operatingPeriodsForPolicy(FRIDAY_DOW, 'normal');
    expect(periods).toHaveLength(1);
    expect(periods[0].startTime).toBe('16:00');
  });

  it('Friday Ramadan uses AM + PM periods', () => {
    const periods = operatingPeriodsForPolicy(FRIDAY_DOW, 'ramadan');
    expect(periods).toHaveLength(2);
  });
});
