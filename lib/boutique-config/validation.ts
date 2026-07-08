import type {
  ExternalSupportPriority,
  PlanningStrategy,
  ShiftTemplateType,
  SpecialPeriodType,
  WeeklyOffPolicy,
} from './types';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const WEEKLY_OFF_POLICIES: WeeklyOffPolicy[] = ['FIXED', 'FLEXIBLE', 'DEFERRED_ALLOWED'];
export const EXTERNAL_SUPPORT_PRIORITIES: ExternalSupportPriority[] = [
  'BEFORE_WEEKLY_OFF_MOVE',
  'AFTER_WEEKLY_OFF_MOVE',
  'AFTER_BRIDGE',
  'LAST_RESORT',
];
export const PLANNING_STRATEGIES: PlanningStrategy[] = [
  'MAXIMUM_COVERAGE',
  'LOWEST_COST',
  'LEAST_BRIDGE',
  'LEAST_OVERTIME',
  'BALANCED',
];
export const SHIFT_TEMPLATE_TYPES: ShiftTemplateType[] = ['MORNING', 'EVENING', 'BRIDGE', 'CUSTOM'];
export const SPECIAL_PERIOD_TYPES: SpecialPeriodType[] = [
  'RAMADAN',
  'EID_AL_FITR',
  'EID_AL_ADHA',
  'NATIONAL_DAY',
  'FOUNDING_DAY',
  'SEASON',
  'CUSTOM',
];

/** Valid HH:mm 24-hour time string. */
export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

/** Minutes since midnight for an HH:mm string. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * End must be strictly after start unless midnight crossing is explicitly allowed.
 * Returns true when the range is acceptable.
 */
export function isValidTimeRange(start: string, end: string, allowCrossMidnight = false): boolean {
  if (!isValidTime(start) || !isValidTime(end)) return false;
  if (allowCrossMidnight) return true;
  return toMinutes(end) > toMinutes(start);
}

export function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Validates a YYYY-MM-DD date string and returns the Date, or null when invalid. */
export function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ValidationError = { field: string; message: string };
