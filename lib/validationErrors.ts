/**
 * Centralized validation error keys and default messages for Schedule and coverage.
 * Use these keys with i18n (schedule.* / errors.*) so EN/AR stay in sync.
 * No silent failures: surface these to the user via toast or inline error.
 */

export const SCHEDULE_VALIDATION = {
  FRIDAY_AM_NOT_ALLOWED: 'schedule.fridayPmOnly',
  AM_GT_PM: 'schedule.warningAmGtPm',
  MIN_AM: 'schedule.warningMinAm',
  MIN_AM_TWO: 'schedule.minAmTwo',
  MIN_PM: 'schedule.warningMinPm',
  RASHID_OVERFLOW: 'schedule.warningRashidOverflow',
  INVALID_OVERRIDE_STATE: 'schedule.invalidOverrideState',
} as const;

/** API-facing message when Friday AM shift is submitted (EN; API may not have locale). */
export const API_ERROR_MESSAGES = {
  FRIDAY_PM_ONLY: 'Friday is PM-only. AM is not allowed.',
  OVERRIDE_SHIFT_INVALID: 'overrideShift must be MORNING, EVENING, NONE, COVER_RASHID_AM, or COVER_RASHID_PM',
  EMPID_DATE_REQUIRED: 'empId and date required',
  WEEK_START_REQUIRED: 'weekStart required (YYYY-MM-DD)',
  MONTH_REQUIRED: 'month required (YYYY-MM)',
} as const;
