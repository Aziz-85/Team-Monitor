import { FRIDAY_DOW } from '@/lib/schedule/policyEngine';
import type { ScheduleNextInput, WeekClassification, ScheduleNextWeekType } from './types';

function activeEmployees(input: ScheduleNextInput) {
  return input.employees.filter((e) => !e.onLeaveAllWeek);
}

function availableOnDay(
  input: ScheduleNextInput,
  date: string,
  dayOfWeek: number,
  weeklyOffOverrides: Map<string, number>
): number {
  return activeEmployees(input).filter((emp) => {
    if (emp.unavailableDates.has(date)) return false;
    const offDow = weeklyOffOverrides.get(emp.empId) ?? emp.weeklyOffDay;
    if (offDow !== 'NONE' && offDow === dayOfWeek) return false;
    return true;
  }).length;
}

export function classifyScheduleWeek(input: ScheduleNextInput): WeekClassification {
  const weeklyOffOverrides = new Map(
    input.weeklyOffMoves.map((m) => [m.empId, m.toDayOfWeek])
  );
  const active = activeEmployees(input);
  const leaveCount = input.employees.filter((e) => e.onLeaveAllWeek).length;
  const hasExternalSupport = input.externalSupport.length > 0;
  const isRamadan = input.days.some((d) => d.isRamadan);
  const isNormalWeek = !isRamadan;

  const dailyAvailable = input.days.map((d) =>
    availableOnDay(input, d.date, d.dayOfWeek, weeklyOffOverrides)
  );
  const minDailyAvailable = dailyAvailable.length ? Math.min(...dailyAvailable) : 0;
  const availableEmployeeCount = active.length;

  let weekType: ScheduleNextWeekType;
  if (hasExternalSupport) {
    weekType = 'WITH_EXTERNAL_SUPPORT';
  } else if (isRamadan) {
    weekType = 'RAMADAN';
  } else if (minDailyAvailable <= 2) {
    weekType = 'IMPOSSIBLE_WITHOUT_SUPPORT';
  } else if (minDailyAvailable === 3) {
    weekType = 'CRITICAL_3_AVAILABLE';
  } else if (availableEmployeeCount >= 5) {
    weekType = 'NORMAL_5_PLUS';
  } else if (leaveCount > 0) {
    weekType = 'NORMAL_4_WITH_LEAVE';
  } else {
    weekType = 'NORMAL_4';
  }

  const fridayMode = isRamadan ? 'full_day' : 'pm_only';

  return {
    weekType,
    availableEmployeeCount,
    leaveCount,
    hasExternalSupport,
    isRamadan,
    isNormalWeek,
    fridayMode,
    minDailyAvailable,
  };
}

export function isFridayDay(dayOfWeek: number): boolean {
  return dayOfWeek === FRIDAY_DOW;
}
