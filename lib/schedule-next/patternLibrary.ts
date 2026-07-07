import { isFridayDay } from './weekClassifier';
import type { ScheduleNextDayConfig, ScheduleNextWeekType, SlotKind, WeekClassification } from './types';

export type DayPattern = {
  slots: SlotKind[];
  label: string;
};

function fridayPattern(classification: WeekClassification): DayPattern {
  if (classification.fridayMode === 'full_day') {
    return { slots: ['AM', 'AM', 'PM', 'PM'], label: 'Ramadan Friday AM+PM' };
  }
  return { slots: ['PM', 'PM'], label: 'Friday PM only' };
}

function weekdayPattern(availableCount: number, classification: WeekClassification): DayPattern {
  if (classification.isRamadan) {
    if (availableCount >= 4) return { slots: ['AM', 'AM', 'PM', 'PM'], label: 'Ramadan 4+ staff' };
    if (availableCount === 3) return { slots: ['AM', 'PM', 'BRIDGE'], label: 'Ramadan 3 staff bridge' };
    return { slots: ['PM'], label: 'Ramadan understaffed' };
  }
  if (availableCount >= 4) {
    return { slots: ['AM', 'AM', 'PM', 'PM'], label: '4+ staff AM/PM' };
  }
  if (availableCount === 3) {
    return { slots: ['AM', 'PM', 'BRIDGE'], label: '3 staff AM+PM+Bridge' };
  }
  return { slots: [], label: 'Needs external support' };
}

export function patternForDay(
  day: ScheduleNextDayConfig,
  availableCount: number,
  classification: WeekClassification
): DayPattern {
  if (isFridayDay(day.dayOfWeek) && !day.isRamadan) {
    return fridayPattern(classification);
  }
  return weekdayPattern(availableCount, classification);
}

export function patternKeyForWeekType(weekType: ScheduleNextWeekType): string {
  switch (weekType) {
    case 'NORMAL_4':
      return 'A';
    case 'NORMAL_4_WITH_LEAVE':
      return 'B-mixed';
    case 'CRITICAL_3_AVAILABLE':
      return 'B';
    case 'NORMAL_5_PLUS':
      return 'A-rotate';
    case 'RAMADAN':
      return 'ramadan';
    case 'WITH_EXTERNAL_SUPPORT':
      return 'external';
    case 'IMPOSSIBLE_WITHOUT_SUPPORT':
      return 'impossible';
    default:
      return 'unknown';
  }
}
