/**
 * Boutique Configuration types — the foundation layer that describes how a boutique operates.
 * This module intentionally does NOT drive schedule generation yet; planners will consume
 * `getBoutiqueConfiguration()` in a future phase.
 */

export type WeeklyOffPolicy = 'FIXED' | 'FLEXIBLE' | 'DEFERRED_ALLOWED';

export type ExternalSupportPriority =
  | 'BEFORE_WEEKLY_OFF_MOVE'
  | 'AFTER_WEEKLY_OFF_MOVE'
  | 'AFTER_BRIDGE'
  | 'LAST_RESORT';

export type PlanningStrategy =
  | 'MAXIMUM_COVERAGE'
  | 'LOWEST_COST'
  | 'LEAST_BRIDGE'
  | 'LEAST_OVERTIME'
  | 'BALANCED';

export type ShiftTemplateType = 'MORNING' | 'EVENING' | 'BRIDGE' | 'CUSTOM';

export type SpecialPeriodType =
  | 'RAMADAN'
  | 'EID_AL_FITR'
  | 'EID_AL_ADHA'
  | 'NATIONAL_DAY'
  | 'FOUNDING_DAY'
  | 'SEASON'
  | 'CUSTOM';

export type BoutiqueConfigurationValues = {
  timezone: string;
  normalOpenTime: string;
  normalCloseTime: string;
  fridayOpenTime: string;
  fridayCloseTime: string;
  weeklyOffPolicy: WeeklyOffPolicy;
  preferredWeeklyOffRecoveryDay: string;
  allowWeeklyOffDeferral: boolean;
  maxDeferredWeeklyOffPerWeek: number;
  allowExternalSupport: boolean;
  externalSupportPriority: ExternalSupportPriority;
  allowOvertime: boolean;
  maxOvertimeHoursPerEmployeePerDay: number;
  allowBridgeShift: boolean;
  maxBridgeDaysPerEmployeePerWeek: number;
  planningStrategy: PlanningStrategy;
};

export type ShiftTemplateValues = {
  id?: string;
  code: string;
  name: string;
  type: ShiftTemplateType;
  startTime: string;
  endTime: string;
  secondStartTime: string | null;
  secondEndTime: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type CoveragePolicyValues = {
  id?: string;
  dayOfWeek: number;
  minMorning: number;
  minEvening: number;
  minTotal: number | null;
  isFridayOverride: boolean;
  isActive: boolean;
};

export type SpecialPeriodValues = {
  id?: string;
  name: string;
  type: SpecialPeriodType;
  startDate: string; // ISO date (YYYY-MM-DD)
  endDate: string; // ISO date (YYYY-MM-DD)
  openTime: string;
  closeTime: string;
  secondOpenTime: string | null;
  secondCloseTime: string | null;
  minMorningCoverage: number | null;
  minEveningCoverage: number | null;
  minTotalCoverage: number | null;
  suspendWeeklyOff: boolean;
  allowExternalSupport: boolean;
  notes: string | null;
  isActive: boolean;
};

export type OperatingHours = {
  openTime: string;
  closeTime: string;
  secondOpenTime: string | null;
  secondCloseTime: string | null;
  source: 'NORMAL' | 'FRIDAY' | 'SPECIAL_PERIOD';
};

export type ResolvedBoutiqueConfiguration = {
  boutiqueId: string;
  config: BoutiqueConfigurationValues;
  activeSpecialPeriod: SpecialPeriodValues | null;
  operatingHours: OperatingHours;
  shiftTemplates: ShiftTemplateValues[];
  coveragePolicy: CoveragePolicyValues[];
  weeklyOffPolicy: {
    policy: WeeklyOffPolicy;
    preferredRecoveryDay: string;
    allowDeferral: boolean;
    maxDeferredPerWeek: number;
  };
  externalSupportPolicy: {
    allow: boolean;
    priority: ExternalSupportPriority;
  };
  overtimePolicy: {
    allow: boolean;
    maxHoursPerEmployeePerDay: number;
  };
  planningStrategy: PlanningStrategy;
  usingDefaults: boolean;
};
