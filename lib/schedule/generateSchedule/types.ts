/**
 * Dynamic schedule generation — operating periods, time slots, fairness.
 */

export type OperatingPeriod = {
  startTime: string;
  endTime: string;
  minCoverage: number;
};

export type TimeSlot = {
  id: string;
  date: string;
  periodIndex: number;
  startTime: string;
  endTime: string;
  minCoverage: number;
};

export type ShiftSegment = {
  startTime: string;
  endTime: string;
  periodIndex: number;
};

export type ShiftKind = 'AM' | 'PM' | 'Split' | 'Off' | 'Leave' | 'Support';

export type EmployeeDayAssignment = {
  empId: string;
  name: string;
  date: string;
  isExternalSupport: boolean;
  segments: ShiftSegment[];
  shiftKind: ShiftKind;
  totalHours: number;
  splitDay: boolean;
  reasons: string[];
};

export type GenerateScheduleSettings = {
  normalMode: { maxDailyHours: number };
  ramadanMode: { maxDailyHours: number };
  splitShiftAllowed: boolean;
  maxSplitDaysPerEmployeePerWeek: number;
  weeklyOffDaysPerEmployee: number;
  externalSupportEmployeesAllowed: boolean;
  slotIntervalMinutes: number;
};

export const DEFAULT_GENERATE_SETTINGS: GenerateScheduleSettings = {
  normalMode: { maxDailyHours: 8 },
  ramadanMode: { maxDailyHours: 6 },
  splitShiftAllowed: true,
  maxSplitDaysPerEmployeePerWeek: 2,
  weeklyOffDaysPerEmployee: 1,
  externalSupportEmployeesAllowed: true,
  slotIntervalMinutes: 30,
};

export type DayOperatingConfig = {
  date: string;
  dayOfWeek: number;
  operatingPeriods: OperatingPeriod[];
  isRamadan: boolean;
};

export type EmployeeCandidate = {
  empId: string;
  name: string;
  isExternalSupport: boolean;
  weeklyOffDay: number | 'NONE';
  sourceBoutiqueId?: string;
};

export type Unavailability = {
  empId: string;
  date: string;
  kind: 'weekly_off' | 'leave' | 'holiday' | 'absent';
};

export type HistoricalEmployeeStats = {
  empId: string;
  priorWeekHours: number;
  priorWeekPmHours: number;
  priorWeekFridayHours: number;
  priorWeekSplitDays: number;
};

export type GenerateScheduleInput = {
  weekStart: string;
  days: DayOperatingConfig[];
  regularEmployees: EmployeeCandidate[];
  externalSupportEmployees: EmployeeCandidate[];
  unavailability: Unavailability[];
  settings: GenerateScheduleSettings;
  historicalStats: HistoricalEmployeeStats[];
  /** Existing grid shifts — used when preserveExisting is true. */
  currentShifts?: Array<{ empId: string; date: string; shift: string; availability: string }>;
  /** When false (default for Generate Schedule), build fresh from scratch. */
  preserveExisting?: boolean;
};

export type SlotViolation = {
  date: string;
  slotId: string;
  startTime: string;
  endTime: string;
  coverage: number;
  minCoverage: number;
};

export type EmployeeWeekSummary = {
  empId: string;
  name: string;
  totalHours: number;
  splitDays: number;
  overtimeHours: number;
};

export type GridShiftProposal = {
  empId: string;
  date: string;
  shift: 'MORNING' | 'EVENING' | 'SPLIT' | 'NONE';
  shiftKind: ShiftKind;
  segments: ShiftSegment[];
  totalHours: number;
  reason: string;
};

export type GenerateScheduleResult = {
  weekStart: string;
  mode: 'normal' | 'ramadan';
  assignments: EmployeeDayAssignment[];
  proposals: GridShiftProposal[];
  warnings: string[];
  coverageValid: boolean;
  slotViolations: SlotViolation[];
  fairnessScore: number;
  employeeSummaries: EmployeeWeekSummary[];
  scenariosTried: number;
};

export type DaySlotBundle = {
  date: string;
  dayOfWeek: number;
  isRamadan: boolean;
  operatingPeriods: OperatingPeriod[];
  slots: TimeSlot[];
};

/** Internal working state per employee-day while solving. */
export type WorkingDayShift = {
  empId: string;
  name: string;
  date: string;
  isExternalSupport: boolean;
  segments: ShiftSegment[];
  reasons: string[];
};
