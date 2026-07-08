import type { ShiftSegment } from '@/lib/schedule/generateSchedule/types';
import type { PlanAction } from '@/lib/services/schedulePlanner';

export type ScheduleNextWeekType =
  | 'NORMAL_4'
  | 'NORMAL_4_WITH_LEAVE'
  | 'CRITICAL_3_AVAILABLE'
  | 'NORMAL_5_PLUS'
  | 'RAMADAN'
  | 'WITH_EXTERNAL_SUPPORT'
  | 'IMPOSSIBLE_WITHOUT_SUPPORT';

export type SlotKind = 'AM' | 'PM' | 'BRIDGE';

export type PersonKind = 'AM' | 'PM' | 'Bridge' | 'External';

export type ScheduleNextEmployee = {
  empId: string;
  name: string;
  weeklyOffDay: number | 'NONE';
  unavailableDates: Set<string>;
  onLeaveAllWeek: boolean;
};

export type ExternalSupportDraft = {
  empId: string;
  employeeName: string;
  date: string;
  shift: string;
  sourceBoutiqueId?: string;
  segments?: ShiftSegment[];
};

export type ScheduleNextDayConfig = {
  date: string;
  dayName: string;
  dayOfWeek: number;
  isRamadan: boolean;
  isFriday: boolean;
};

export type ScheduleNextInput = {
  weekStart: string;
  days: ScheduleNextDayConfig[];
  employees: ScheduleNextEmployee[];
  externalSupport: ExternalSupportDraft[];
  weeklyOffMoves: WeeklyOffMove[];
};

export type WeeklyOffMove = {
  empId: string;
  name: string;
  fromDayOfWeek: number;
  toDayOfWeek: number;
  fromDate: string;
  toDate: string;
};

export type WeekClassification = {
  weekType: ScheduleNextWeekType;
  availableEmployeeCount: number;
  leaveCount: number;
  hasExternalSupport: boolean;
  isRamadan: boolean;
  isNormalWeek: boolean;
  fridayMode: 'pm_only' | 'full_day';
  minDailyAvailable: number;
};

export type AllocationStage =
  | 'NORMAL'
  | 'BRIDGE'
  | 'WEEKLY_OFF_MOVE'
  | 'WEEKLY_OFF_DEFERRAL'
  | 'BEST_ACHIEVABLE';

export const ALLOCATION_STAGE_ORDER: AllocationStage[] = [
  'NORMAL',
  'BRIDGE',
  'WEEKLY_OFF_MOVE',
  'WEEKLY_OFF_DEFERRAL',
  'BEST_ACHIEVABLE',
];

export type DaySlotAssignment = {
  empId: string;
  name: string;
  kind: PersonKind;
  segments: ShiftSegment[];
  movedWeeklyOff?: boolean;
  compensationRequired?: boolean;
  slotKind: SlotKind;
};

export type ProposalRowStatus = 'OK' | 'Needs AM' | 'Needs PM' | 'Incomplete' | 'Needs Support';

export type ScheduleNextProposalRow = {
  date: string;
  dayName: string;
  dayOfWeek: number;
  morning: Array<{
    empId: string;
    name: string;
    kind: PersonKind;
    segments: ShiftSegment[];
    movedWeeklyOff?: boolean;
    compensationRequired?: boolean;
  }>;
  afternoon: Array<{
    empId: string;
    name: string;
    kind: PersonKind;
    segments: ShiftSegment[];
    movedWeeklyOff?: boolean;
    compensationRequired?: boolean;
  }>;
  externalCoverage: Array<{
    empId: string;
    name: string;
    kind: PersonKind;
    segments: ShiftSegment[];
  }>;
  amCount: number;
  pmCount: number;
  status: ProposalRowStatus;
};

export type ScheduleNextProposalStatus = 'ACCEPTABLE' | 'INCOMPLETE' | 'NEEDS_SUPPORT';

export type ScheduleNextProposal = {
  proposalId: string;
  status: ScheduleNextProposalStatus;
  weekStart: string;
  rows: ScheduleNextProposalRow[];
  weeklyOffMoves: WeeklyOffMove[];
  summary: {
    coverageValid: boolean;
    bridgeCount: number;
    compensationHours: number;
    overtimeHours: number;
    externalSupportHours: number;
    weeklyOffMoves: number;
  };
  employeeSummary: Array<{
    empId: string;
    name: string;
    totalHours: number;
    bridgeCount: number;
    compensationHours: number;
  }>;
  explanation: string[];
  actions: PlanAction[];
  weekType: ScheduleNextWeekType;
};

export type BuildProposalOptions = {
  seed?: number;
  rejectedProposalIds?: string[];
};

export type CoverageCheckResult = {
  valid: boolean;
  issues: Array<{
    date: string;
    dayName: string;
    type: string;
    message: string;
    amCount: number;
    pmCount: number;
  }>;
  dayCounts: Array<{ date: string; amCount: number; pmCount: number }>;
};

export const BRIDGE_SEGMENTS_NORMAL: ShiftSegment[] = [
  { periodIndex: 0, startTime: '09:30', endTime: '14:30' },
  { periodIndex: 1, startTime: '17:30', endTime: '22:30' },
];

export const BRIDGE_WORKING_HOURS = 10;
export const BRIDGE_COMPENSATION_HOURS = 2;

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
