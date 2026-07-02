/**
 * Centralized schedule policy resolution for Schedule Engine v3.
 * All scheduling rules (hours, coverage periods, split, overtime, support) resolve here.
 */

import type {
  DayOperatingConfig,
  GenerateScheduleInput,
  GenerateScheduleSettings,
  OperatingPeriod,
} from '@/lib/schedule/generateSchedule/types';

export type SchedulePolicyMode = 'normal' | 'ramadan';

export type FridayMode = 'pm_only' | 'full_day' | 'dynamic';

export type ExternalSupportPriority = 'high' | 'medium' | 'low' | 'none';

export type OvertimePriority = 'last_resort' | 'normal' | 'disabled';

export type SchedulePolicy = {
  mode: SchedulePolicyMode;
  maxDailyHours: number;
  slotIntervalMinutes: number;
  split: {
    allowed: boolean;
    maxDaysPerEmployeePerWeek: number;
  };
  overtime: {
    allowed: boolean;
    maxHoursPerDay: number | null;
    priority: OvertimePriority;
  };
  externalSupport: {
    allowed: boolean;
    priority: ExternalSupportPriority;
  };
  friday: {
    mode: FridayMode;
  };
  coverage: {
    defaultMinCoverage: number;
    periods: {
      normalSatThu: OperatingPeriod[];
      normalFri: OperatingPeriod[];
      ramadanSatThu: OperatingPeriod[];
      ramadanFri: OperatingPeriod[];
    };
  };
};

export const NORMAL_MAX_DAILY_HOURS = 8;
export const RAMADAN_MAX_DAILY_HOURS = 6;
export const SLOT_INTERVAL_MINUTES = 30;
export const DEFAULT_MIN_COVERAGE = 2;
export const MAX_SPLIT_DAYS = 2;

/** Friday = 5 (JS getUTCDay). Re-exported from policy engine as single source. */
export const FRIDAY_DOW = 5;

const DEFAULT_WEEKLY_OFF_DAYS_PER_EMPLOYEE = 1;

const NORMAL_SAT_THU: OperatingPeriod[] = [
  { startTime: '09:30', endTime: '22:30', minCoverage: DEFAULT_MIN_COVERAGE },
];

const NORMAL_FRI_PM_ONLY: OperatingPeriod[] = [
  { startTime: '16:00', endTime: '22:30', minCoverage: DEFAULT_MIN_COVERAGE },
];

const RAMADAN_SAT_THU: OperatingPeriod[] = [
  { startTime: '11:30', endTime: '17:30', minCoverage: DEFAULT_MIN_COVERAGE },
  { startTime: '20:30', endTime: '02:30', minCoverage: DEFAULT_MIN_COVERAGE },
];

const RAMADAN_FRI_AM_PM: OperatingPeriod[] = [
  { startTime: '11:30', endTime: '17:30', minCoverage: DEFAULT_MIN_COVERAGE },
  { startTime: '20:30', endTime: '02:30', minCoverage: DEFAULT_MIN_COVERAGE },
];

const PERIOD_TEMPLATES = {
  normalSatThu: NORMAL_SAT_THU,
  normalFri: NORMAL_FRI_PM_ONLY,
  ramadanSatThu: RAMADAN_SAT_THU,
  ramadanFri: RAMADAN_FRI_AM_PM,
} as const;

function clonePeriods(periods: readonly OperatingPeriod[]): OperatingPeriod[] {
  return periods.map((p) => ({ ...p }));
}

function weekModeFromDays(days: DayOperatingConfig[]): SchedulePolicyMode {
  return days.some((d) => d.isRamadan) ? 'ramadan' : 'normal';
}

function resolveFridayMode(days: DayOperatingConfig[], mode: SchedulePolicyMode): FridayMode {
  if (days.length === 0) {
    return mode === 'ramadan' ? 'full_day' : 'pm_only';
  }

  const hasRamadanDay = days.some((d) => d.isRamadan);
  const hasNormalDay = days.some((d) => !d.isRamadan);
  if (hasRamadanDay && hasNormalDay) {
    return 'dynamic';
  }

  const friday = days.find((d) => d.dayOfWeek === FRIDAY_DOW);
  if (friday?.isRamadan) return 'full_day';
  if (friday && !friday.isRamadan) return 'pm_only';
  return mode === 'ramadan' ? 'full_day' : 'pm_only';
}

function maxDailyHoursForMode(mode: SchedulePolicyMode): number {
  return mode === 'ramadan' ? RAMADAN_MAX_DAILY_HOURS : NORMAL_MAX_DAILY_HOURS;
}

export function operatingPeriodsForPolicy(
  dayOfWeek: number,
  mode: SchedulePolicyMode
): OperatingPeriod[] {
  if (mode === 'ramadan') {
    return dayOfWeek === FRIDAY_DOW
      ? clonePeriods(PERIOD_TEMPLATES.ramadanFri)
      : clonePeriods(PERIOD_TEMPLATES.ramadanSatThu);
  }
  return dayOfWeek === FRIDAY_DOW
    ? clonePeriods(PERIOD_TEMPLATES.normalFri)
    : clonePeriods(PERIOD_TEMPLATES.normalSatThu);
}

export function getSchedulePolicy(
  input: Pick<GenerateScheduleInput, 'days'> & { settings?: GenerateScheduleSettings }
): SchedulePolicy {
  const settings = input.settings;
  const mode = weekModeFromDays(input.days);

  return {
    mode,
    maxDailyHours: maxDailyHoursForMode(mode),
    slotIntervalMinutes: settings?.slotIntervalMinutes ?? SLOT_INTERVAL_MINUTES,
    split: {
      allowed: settings?.splitShiftAllowed ?? true,
      maxDaysPerEmployeePerWeek:
        settings?.maxSplitDaysPerEmployeePerWeek ?? MAX_SPLIT_DAYS,
    },
    overtime: {
      allowed: true,
      maxHoursPerDay: null,
      priority: 'last_resort',
    },
    externalSupport: {
      allowed: settings?.externalSupportEmployeesAllowed ?? true,
      priority: 'high',
    },
    friday: {
      mode: resolveFridayMode(input.days, mode),
    },
    coverage: {
      defaultMinCoverage: DEFAULT_MIN_COVERAGE,
      periods: {
        normalSatThu: clonePeriods(PERIOD_TEMPLATES.normalSatThu),
        normalFri: clonePeriods(PERIOD_TEMPLATES.normalFri),
        ramadanSatThu: clonePeriods(PERIOD_TEMPLATES.ramadanSatThu),
        ramadanFri: clonePeriods(PERIOD_TEMPLATES.ramadanFri),
      },
    },
  };
}

export function generateSettingsFromPolicy(policy: SchedulePolicy): GenerateScheduleSettings {
  return {
    normalMode: { maxDailyHours: NORMAL_MAX_DAILY_HOURS },
    ramadanMode: { maxDailyHours: RAMADAN_MAX_DAILY_HOURS },
    splitShiftAllowed: policy.split.allowed,
    maxSplitDaysPerEmployeePerWeek: policy.split.maxDaysPerEmployeePerWeek,
    weeklyOffDaysPerEmployee: DEFAULT_WEEKLY_OFF_DAYS_PER_EMPLOYEE,
    externalSupportEmployeesAllowed: policy.externalSupport.allowed,
    slotIntervalMinutes: policy.slotIntervalMinutes,
  };
}

export function getDefaultGenerateSettings(): GenerateScheduleSettings {
  return generateSettingsFromPolicy(getSchedulePolicy({ days: [] }));
}
