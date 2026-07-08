import type {
  BoutiqueConfigurationValues,
  CoveragePolicyValues,
  ShiftTemplateValues,
} from './types';

/** Friday index per JS Date.getDay(): 0=Sun..6=Sat. Friday = 5. */
export const FRIDAY_DAY_OF_WEEK = 5;

/** Safe defaults used when a boutique has no configuration row yet. */
export const DEFAULT_BOUTIQUE_CONFIGURATION: BoutiqueConfigurationValues = {
  timezone: 'Asia/Riyadh',
  normalOpenTime: '09:30',
  normalCloseTime: '22:00',
  fridayOpenTime: '16:00',
  fridayCloseTime: '22:00',
  weeklyOffPolicy: 'FLEXIBLE',
  preferredWeeklyOffRecoveryDay: 'FRIDAY',
  allowWeeklyOffDeferral: true,
  maxDeferredWeeklyOffPerWeek: 1,
  allowExternalSupport: true,
  externalSupportPriority: 'AFTER_BRIDGE',
  allowOvertime: false,
  maxOvertimeHoursPerEmployeePerDay: 2,
  allowBridgeShift: true,
  maxBridgeDaysPerEmployeePerWeek: 2,
  planningStrategy: 'MAXIMUM_COVERAGE',
};

/** Default shift templates seeded per boutique. */
export const DEFAULT_SHIFT_TEMPLATES: ShiftTemplateValues[] = [
  {
    code: 'MORNING',
    name: 'Morning',
    type: 'MORNING',
    startTime: '09:30',
    endTime: '17:30',
    secondStartTime: null,
    secondEndTime: null,
    isDefault: true,
    isActive: true,
    sortOrder: 1,
  },
  {
    code: 'EVENING',
    name: 'Evening',
    type: 'EVENING',
    startTime: '14:00',
    endTime: '22:00',
    secondStartTime: null,
    secondEndTime: null,
    isDefault: true,
    isActive: true,
    sortOrder: 2,
  },
  {
    code: 'BRIDGE',
    name: 'Bridge',
    type: 'BRIDGE',
    startTime: '09:30',
    endTime: '14:30',
    secondStartTime: '17:30',
    secondEndTime: '22:00',
    isDefault: false,
    isActive: true,
    sortOrder: 3,
  },
];

/**
 * Default coverage policy for every day of the week.
 * Saturday..Thursday: AM 2, PM 2. Friday: AM 0, PM 2 (PM-only day).
 */
export function defaultCoveragePolicy(): CoveragePolicyValues[] {
  const days = [0, 1, 2, 3, 4, 5, 6];
  return days.map((dayOfWeek) => {
    const isFriday = dayOfWeek === FRIDAY_DAY_OF_WEEK;
    return {
      dayOfWeek,
      minMorning: isFriday ? 0 : 2,
      minEvening: 2,
      minTotal: null,
      isFridayOverride: isFriday,
      isActive: true,
    };
  });
}
