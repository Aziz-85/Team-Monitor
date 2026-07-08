/**
 * Schedule Editor policy resolution — maps Boutique Configuration into editor-ready
 * operating periods, coverage mins, and policy flags for a schedule week.
 *
 * All Schedule Editor scheduling inputs must flow through this module (via
 * getScheduleGridForWeek with useBoutiqueConfiguration).
 */

import type { OperatingPeriod } from '@/lib/schedule/generateSchedule/types';
import { FRIDAY_DAY_OF_WEEK } from './defaults';
import { getBoutiqueConfiguration } from './getBoutiqueConfiguration';
import type {
  ResolvedBoutiqueConfiguration,
  ShiftTemplateValues,
  WeeklyOffPolicy,
} from './types';
import { getRamadanRange, isDateInRamadanRange } from '@/lib/time/ramadan';

const NORMAL_MAX_DAILY_HOURS = 8;
const RAMADAN_MAX_DAILY_HOURS = 6;

export type EditorDayPolicy = {
  date: string;
  dayOfWeek: number;
  isRamadan: boolean;
  fridayPmOnly: boolean;
  operatingPeriods: OperatingPeriod[];
  maxDailyHours: number;
  minMorning: number;
  minEvening: number;
  allowExternalSupport: boolean;
};

export type EditorWeekPolicy = {
  boutiqueId: string;
  usingDefaults: boolean;
  allowExternalSupport: boolean;
  allowOvertime: boolean;
  maxOvertimeHoursPerDay: number;
  allowBridgeShift: boolean;
  maxBridgeDaysPerWeek: number;
  weeklyOffPolicy: WeeklyOffPolicy;
  allowWeeklyOffDeferral: boolean;
  maxDeferredWeeklyOffPerWeek: number;
  shiftTemplates: ShiftTemplateValues[];
  days: EditorDayPolicy[];
};

function coverageForDay(
  resolved: ResolvedBoutiqueConfiguration,
  dayOfWeek: number
): { minMorning: number; minEvening: number } {
  const dayPolicy = resolved.coveragePolicy.find((p) => p.dayOfWeek === dayOfWeek && p.isActive);
  let minMorning = dayPolicy?.minMorning ?? 0;
  let minEvening = dayPolicy?.minEvening ?? 0;

  if (resolved.activeSpecialPeriod) {
    if (resolved.activeSpecialPeriod.minMorningCoverage != null) {
      minMorning = resolved.activeSpecialPeriod.minMorningCoverage;
    }
    if (resolved.activeSpecialPeriod.minEveningCoverage != null) {
      minEvening = resolved.activeSpecialPeriod.minEveningCoverage;
    }
  }

  if (dayOfWeek === FRIDAY_DAY_OF_WEEK && !resolved.activeSpecialPeriod?.secondOpenTime) {
    const isRamadanPeriod = resolved.activeSpecialPeriod?.type === 'RAMADAN';
    if (!isRamadanPeriod) {
      minMorning = 0;
    }
  }

  return { minMorning, minEvening };
}

function operatingPeriodsFromConfig(
  resolved: ResolvedBoutiqueConfiguration,
  dayOfWeek: number
): OperatingPeriod[] {
  const { minMorning, minEvening } = coverageForDay(resolved, dayOfWeek);
  const templates = resolved.shiftTemplates.filter((t) => t.isActive);
  const morning = templates.find((t) => t.type === 'MORNING');
  const evening = templates.find((t) => t.type === 'EVENING');

  if (morning && evening) {
    return [
      { startTime: morning.startTime, endTime: morning.endTime, minCoverage: minMorning },
      { startTime: evening.startTime, endTime: evening.endTime, minCoverage: minEvening },
    ];
  }

  const { operatingHours } = resolved;
  if (operatingHours.secondOpenTime && operatingHours.secondCloseTime) {
    return [
      {
        startTime: operatingHours.openTime,
        endTime: operatingHours.secondOpenTime,
        minCoverage: minMorning,
      },
      {
        startTime: operatingHours.secondOpenTime,
        endTime: operatingHours.closeTime,
        minCoverage: minEvening,
      },
    ];
  }

  return [
    {
      startTime: operatingHours.openTime,
      endTime: operatingHours.closeTime,
      minCoverage: Math.max(minMorning, minEvening),
    },
  ];
}

function isRamadanForDate(
  resolved: ResolvedBoutiqueConfiguration,
  date: Date,
  ramadanRange: { start: string; end: string } | null
): boolean {
  if (resolved.activeSpecialPeriod?.type === 'RAMADAN') return true;
  return ramadanRange ? isDateInRamadanRange(date, ramadanRange) : false;
}

function fridayPmOnlyForDay(
  resolved: ResolvedBoutiqueConfiguration,
  dayOfWeek: number,
  isRamadanDay: boolean
): boolean {
  if (dayOfWeek !== FRIDAY_DAY_OF_WEEK) return false;
  if (isRamadanDay) return false;
  if (resolved.activeSpecialPeriod?.type === 'RAMADAN') return false;
  if (resolved.activeSpecialPeriod?.secondOpenTime) return false;
  return true;
}

function maxDailyHoursForDay(resolved: ResolvedBoutiqueConfiguration, isRamadanDay: boolean): number {
  const base = isRamadanDay ? RAMADAN_MAX_DAILY_HOURS : NORMAL_MAX_DAILY_HOURS;
  if (resolved.overtimePolicy.allow) {
    return base + resolved.overtimePolicy.maxHoursPerEmployeePerDay;
  }
  return base;
}

function externalSupportAllowed(resolved: ResolvedBoutiqueConfiguration): boolean {
  if (resolved.activeSpecialPeriod && !resolved.activeSpecialPeriod.allowExternalSupport) {
    return false;
  }
  return resolved.externalSupportPolicy.allow;
}

/**
 * Resolve editor policy for each day in a schedule week from Boutique Configuration.
 * Falls back to defaults inside getBoutiqueConfiguration when no row exists.
 */
export async function resolveEditorWeekPolicy(
  boutiqueId: string,
  weekDates: string[]
): Promise<EditorWeekPolicy> {
  const ramadanRange = getRamadanRange();
  const dayPolicies: EditorDayPolicy[] = [];
  let usingDefaults = false;
  let shiftTemplates: ShiftTemplateValues[] = [];
  let weekConfig: ResolvedBoutiqueConfiguration | null = null;

  for (const date of weekDates) {
    const when = new Date(date + 'T12:00:00Z');
    const dayOfWeek = when.getUTCDay();
    const resolved = await getBoutiqueConfiguration(boutiqueId, when);
    if (!weekConfig) weekConfig = resolved;
    if (resolved.usingDefaults) usingDefaults = true;
    if (!shiftTemplates.length) shiftTemplates = resolved.shiftTemplates;

    const isRamadanDay = isRamadanForDate(resolved, when, ramadanRange);
    const fridayPmOnly = fridayPmOnlyForDay(resolved, dayOfWeek, isRamadanDay);
    const { minMorning, minEvening } = coverageForDay(resolved, dayOfWeek);

    dayPolicies.push({
      date,
      dayOfWeek,
      isRamadan: isRamadanDay,
      fridayPmOnly,
      operatingPeriods: operatingPeriodsFromConfig(resolved, dayOfWeek),
      maxDailyHours: maxDailyHoursForDay(resolved, isRamadanDay),
      minMorning,
      minEvening,
      allowExternalSupport: externalSupportAllowed(resolved),
    });
  }

  const base = weekConfig ?? (await getBoutiqueConfiguration(boutiqueId, new Date(weekDates[0] + 'T12:00:00Z')));

  return {
    boutiqueId,
    usingDefaults,
    allowExternalSupport: dayPolicies.some((d) => d.allowExternalSupport) && base.externalSupportPolicy.allow,
    allowOvertime: base.overtimePolicy.allow,
    maxOvertimeHoursPerDay: base.overtimePolicy.maxHoursPerEmployeePerDay,
    allowBridgeShift: base.config.allowBridgeShift,
    maxBridgeDaysPerWeek: base.config.maxBridgeDaysPerEmployeePerWeek,
    weeklyOffPolicy: base.weeklyOffPolicy.policy,
    allowWeeklyOffDeferral: base.weeklyOffPolicy.allowDeferral,
    maxDeferredWeeklyOffPerWeek: base.weeklyOffPolicy.maxDeferredPerWeek,
    shiftTemplates: base.shiftTemplates,
    days: dayPolicies,
  };
}

/** Whether external (guest) coverage is allowed for a date under Boutique Configuration. */
export async function isExternalSupportAllowedForDate(
  boutiqueId: string,
  date: string
): Promise<boolean> {
  const resolved = await getBoutiqueConfiguration(boutiqueId, new Date(date + 'T12:00:00Z'));
  return externalSupportAllowed(resolved);
}

/** Lookup resolved coverage mins for a date (used by validation helpers). */
export async function resolveEditorDayCoverage(
  boutiqueId: string,
  date: string
): Promise<{ minMorning: number; minEvening: number; dayOfWeek: number }> {
  const when = new Date(date + 'T12:00:00Z');
  const resolved = await getBoutiqueConfiguration(boutiqueId, when);
  const dayOfWeek = when.getUTCDay();
  const { minMorning, minEvening } = coverageForDay(resolved, dayOfWeek);
  return { minMorning, minEvening, dayOfWeek };
}
