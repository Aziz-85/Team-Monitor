/**
 * Default operating periods by day-of-week (0=Sun … 6=Sat).
 * Friday is not special-cased in code — only via these configs.
 */

import { isDateInRamadanRange } from '@/lib/time/ramadan';
import type { DayOperatingConfig, OperatingPeriod } from './types';

const NORMAL_SAT_THU: OperatingPeriod[] = [
  { startTime: '09:30', endTime: '22:30', minCoverage: 2 },
];

const NORMAL_FRI: OperatingPeriod[] = [{ startTime: '16:00', endTime: '22:30', minCoverage: 2 }];

const RAMADAN_SAT_THU: OperatingPeriod[] = [
  { startTime: '11:30', endTime: '17:30', minCoverage: 2 },
  { startTime: '20:30', endTime: '02:30', minCoverage: 2 },
];

const RAMADAN_FRI: OperatingPeriod[] = [
  { startTime: '11:30', endTime: '17:30', minCoverage: 2 },
  { startTime: '20:30', endTime: '02:30', minCoverage: 2 },
];

/** Friday = 5 (JS getUTCDay). */
export const FRIDAY_DOW = 5;

export function operatingPeriodsForDay(dayOfWeek: number, isRamadan: boolean): OperatingPeriod[] {
  if (isRamadan) {
    return dayOfWeek === FRIDAY_DOW ? [...RAMADAN_FRI] : [...RAMADAN_SAT_THU];
  }
  return dayOfWeek === FRIDAY_DOW ? [...NORMAL_FRI] : [...NORMAL_SAT_THU];
}

export function buildWeekOperatingConfigs(
  weekDates: string[],
  ramadanRange: { start: string; end: string } | null
): DayOperatingConfig[] {
  return weekDates.map((date) => {
    const d = new Date(date + 'T12:00:00Z');
    const dayOfWeek = d.getUTCDay();
    const isRamadanDay = ramadanRange ? isDateInRamadanRange(d, ramadanRange) : false;
    return {
      date,
      dayOfWeek,
      isRamadan: isRamadanDay,
      operatingPeriods: operatingPeriodsForDay(dayOfWeek, isRamadanDay),
    };
  });
}

export function weekModeFromDays(days: DayOperatingConfig[]): 'normal' | 'ramadan' {
  return days.some((d) => d.isRamadan) ? 'ramadan' : 'normal';
}
