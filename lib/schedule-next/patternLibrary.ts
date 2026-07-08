import { isFridayDay } from './weekClassifier';
import type {
  AllocationStage,
  ScheduleNextDayConfig,
  ScheduleNextWeekType,
  SlotKind,
  WeekClassification,
} from './types';

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
    if (availableCount >= 1) return { slots: ['PM'], label: 'Ramadan understaffed' };
    return { slots: [], label: 'No staff' };
  }
  if (availableCount >= 4) {
    return { slots: ['AM', 'AM', 'PM', 'PM'], label: '4+ staff AM/PM' };
  }
  if (availableCount === 3) {
    return { slots: ['AM', 'PM', 'BRIDGE'], label: '3 staff AM+PM+Bridge' };
  }
  // Under minimum coverage — normal stage defers to later strategies.
  return { slots: [], label: 'Needs external support' };
}

/** Guaranteed non-empty slot plan when at least one employee is available. */
export function bestAchievableSlots(
  day: ScheduleNextDayConfig,
  availableCount: number,
  classification: WeekClassification
): SlotKind[] {
  if (availableCount <= 0) return [];
  if (isFridayDay(day.dayOfWeek) && !day.isRamadan) {
    return Array(Math.min(availableCount, 2)).fill('PM') as SlotKind[];
  }
  if (classification.isRamadan) {
    if (availableCount >= 4) return ['AM', 'AM', 'PM', 'PM'];
    if (availableCount === 3) return ['AM', 'PM', 'BRIDGE'];
    if (availableCount === 2) return ['AM', 'PM'];
    return ['PM'];
  }
  if (availableCount >= 4) return ['AM', 'AM', 'PM', 'PM'];
  if (availableCount === 3) return ['AM', 'PM', 'BRIDGE'];
  if (availableCount === 2) return ['AM', 'PM'];
  return ['BRIDGE'];
}

function bridgeStageSlots(day: ScheduleNextDayConfig, availableCount: number): SlotKind[] {
  if (availableCount <= 0) return [];
  if (isFridayDay(day.dayOfWeek) && !day.isRamadan) {
    return Array(Math.min(availableCount, 2)).fill('PM') as SlotKind[];
  }
  if (availableCount >= 3) return ['AM', 'PM', 'BRIDGE'];
  if (availableCount === 2) return ['AM', 'BRIDGE'];
  return ['BRIDGE'];
}

export function slotsForAllocationStage(
  stage: AllocationStage,
  day: ScheduleNextDayConfig,
  availableCount: number,
  classification: WeekClassification
): SlotKind[] {
  switch (stage) {
    case 'NORMAL':
      return patternForDay(day, availableCount, classification).slots;
    case 'BRIDGE':
      return bridgeStageSlots(day, availableCount);
    case 'WEEKLY_OFF_MOVE':
      return patternForDay(day, availableCount, classification).slots;
    case 'WEEKLY_OFF_DEFERRAL':
      return bestAchievableSlots(day, availableCount, classification);
    case 'BEST_ACHIEVABLE':
      return bestAchievableSlots(day, availableCount, classification);
    default:
      return [];
  }
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
