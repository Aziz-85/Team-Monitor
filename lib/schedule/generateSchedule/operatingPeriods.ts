/**
 * Default operating periods by day-of-week (0=Sun … 6=Sat).
 * Period templates are defined in policyEngine.ts — this module applies them per day.
 */

import { isDateInRamadanRange } from '@/lib/time/ramadan';
import type { DayOperatingConfig } from './types';
import {
  FRIDAY_DOW,
  operatingPeriodsForPolicy,
  type SchedulePolicyMode,
} from '@/lib/schedule/policyEngine';

export { FRIDAY_DOW };

export function operatingPeriodsForDay(dayOfWeek: number, isRamadan: boolean) {
  const mode: SchedulePolicyMode = isRamadan ? 'ramadan' : 'normal';
  return operatingPeriodsForPolicy(dayOfWeek, mode);
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
