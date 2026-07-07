import { buildWeekOperatingConfigs } from '@/lib/schedule/generateSchedule/operatingPeriods';
import {
  segmentFromPeriodEnd,
  segmentFromPeriodStart,
} from '@/lib/schedule/generateSchedule/timeSlots';
import type { OperatingPeriod, ShiftSegment } from '@/lib/schedule/generateSchedule/types';
import { segmentsAmPmContribution } from '@/lib/schedule/segmentCoverage';
import { getRamadanRange } from '@/lib/time/ramadan';
import type { GridRow } from '@/lib/services/scheduleGrid';
import { weekDateStringsFromStart } from '@/lib/services/swapWeeklyOffForWeek';
import { patternForDay } from './patternLibrary';
import type {
  DaySlotAssignment,
  ExternalSupportDraft,
  ScheduleNextDayConfig,
  ScheduleNextEmployee,
  ScheduleNextInput,
  SlotKind,
  WeeklyOffMove,
} from './types';
import {
  BRIDGE_COMPENSATION_HOURS,
  BRIDGE_SEGMENTS_NORMAL,
  BRIDGE_WORKING_HOURS,
  DAY_NAMES,
} from './types';
import type { WeekClassification } from './types';

export type AllocatorResult = {
  dayAssignments: Map<string, DaySlotAssignment[]>;
  weeklyOffMoves: WeeklyOffMove[];
  employeeStats: Map<
    string,
    {
      name: string;
      totalHours: number;
      bridgeCount: number;
      compensationHours: number;
      movedWeeklyOff: boolean;
    }
  >;
  lastBridgeByEmp: Map<string, string>;
};

export type AllocateOptions = {
  seed?: number;
};

function maxDailyHours(isRamadan: boolean): number {
  return isRamadan ? 6 : 8;
}

function segmentsForSlot(
  slotKind: SlotKind,
  periods: OperatingPeriod[],
  isRamadan: boolean,
  isFridayPmOnly: boolean
): ShiftSegment[] {
  const maxH = maxDailyHours(isRamadan);
  if (slotKind === 'BRIDGE') {
    if (periods.length >= 2) {
      return [
        segmentFromPeriodStart(periods[0], 0, maxH),
        segmentFromPeriodEnd(periods[1], 1, maxH),
      ];
    }
    return BRIDGE_SEGMENTS_NORMAL.map((s) => ({ ...s }));
  }
  if (slotKind === 'AM') {
    if (!periods.length) return [];
    return [segmentFromPeriodStart(periods[0], 0, maxH)];
  }
  if (isFridayPmOnly && periods.length === 1) {
    return [segmentFromPeriodEnd(periods[0], 0, maxH)];
  }
  const pmIdx = periods.length >= 2 ? 1 : 0;
  return [segmentFromPeriodEnd(periods[pmIdx], pmIdx, maxH)];
}

function personKind(slotKind: SlotKind): DaySlotAssignment['kind'] {
  if (slotKind === 'BRIDGE') return 'Bridge';
  if (slotKind === 'AM') return 'AM';
  return 'PM';
}

function slotHours(slotKind: SlotKind, isRamadan: boolean): number {
  if (slotKind === 'BRIDGE') return BRIDGE_WORKING_HOURS;
  return isRamadan ? 6 : 5;
}

function initStats(input: ScheduleNextInput): AllocatorResult['employeeStats'] {
  const stats = new Map<
    string,
    {
      name: string;
      totalHours: number;
      bridgeCount: number;
      compensationHours: number;
      movedWeeklyOff: boolean;
    }
  >();
  for (const emp of input.employees) {
    if (emp.onLeaveAllWeek) continue;
    stats.set(emp.empId, {
      name: emp.name,
      totalHours: 0,
      bridgeCount: 0,
      compensationHours: 0,
      movedWeeklyOff: false,
    });
  }
  return stats;
}

function effectiveOffDow(
  emp: ScheduleNextEmployee,
  moves: WeeklyOffMove[]
): number | 'NONE' {
  const move = moves.find((m) => m.empId === emp.empId);
  if (move) return move.toDayOfWeek;
  return emp.weeklyOffDay;
}

function isAvailable(
  emp: ScheduleNextEmployee,
  date: string,
  dayOfWeek: number,
  moves: WeeklyOffMove[]
): boolean {
  if (emp.onLeaveAllWeek || emp.unavailableDates.has(date)) return false;
  const off = effectiveOffDow(emp, moves);
  if (off !== 'NONE' && off === dayOfWeek) return false;
  return true;
}

function rotate<T>(arr: T[], offset: number): T[] {
  if (!arr.length) return [];
  const n = arr.length;
  const o = ((offset % n) + n) % n;
  return [...arr.slice(o), ...arr.slice(0, o)];
}

function tryWeeklyOffMove(
  input: ScheduleNextInput,
  day: ScheduleNextDayConfig,
  moves: WeeklyOffMove[],
  needed: number
): WeeklyOffMove | null {
  const active = input.employees.filter((e) => !e.onLeaveAllWeek);
  const available = active.filter((e) => isAvailable(e, day.date, day.dayOfWeek, moves));
  if (available.length >= needed) return null;

  const blocked = active.filter(
    (e) =>
      !e.unavailableDates.has(day.date) &&
      effectiveOffDow(e, moves) === day.dayOfWeek &&
      effectiveOffDow(e, moves) !== 'NONE'
  );
  if (!blocked.length) return null;

  const candidate = blocked[0];
  const fromDow = day.dayOfWeek;
  const friday = input.days.find((d) => d.isFriday);
  const targetDay =
    friday && friday.date !== day.date
      ? friday
      : input.days.find((d) => d.date !== day.date && d.dayOfWeek !== fromDow);
  if (!targetDay) return null;

  const fromOff = effectiveOffDow(candidate, moves);
  if (fromOff === 'NONE') return null;

  return {
    empId: candidate.empId,
    name: candidate.name,
    fromDayOfWeek: fromOff as number,
    toDayOfWeek: targetDay.dayOfWeek,
    fromDate: day.date,
    toDate: targetDay.date,
  };
}

function pickBridgeEmployee(
  pool: ScheduleNextEmployee[],
  lastBridgeByEmp: Map<string, string>,
  prevDate: string | null,
  stats: AllocatorResult['employeeStats']
): ScheduleNextEmployee | null {
  const sorted = [...pool].sort((a, b) => {
    const sa = stats.get(a.empId);
    const sb = stats.get(b.empId);
    const bc = (sa?.bridgeCount ?? 0) - (sb?.bridgeCount ?? 0);
    if (bc !== 0) return bc;
    return a.empId.localeCompare(b.empId);
  });
  for (const emp of sorted) {
    if (prevDate && lastBridgeByEmp.get(emp.empId) === prevDate) continue;
    return emp;
  }
  return sorted[0] ?? null;
}

export function buildScheduleNextInputFromGrid(
  weekStart: string,
  grid: { rows: GridRow[]; days: Array<{ date: string; dayName: string; dayOfWeek: number }> },
  externalSupport: ExternalSupportDraft[] = []
): ScheduleNextInput {
  const ramadanRange = getRamadanRange();
  const weekDates = weekDateStringsFromStart(weekStart);
  const opConfigs = buildWeekOperatingConfigs(weekDates, ramadanRange);
  const ramadanByDate = new Map(opConfigs.map((d) => [d.date, d.isRamadan]));

  const days: ScheduleNextDayConfig[] = grid.days.map((d) => ({
    date: d.date,
    dayName: d.dayName,
    dayOfWeek: d.dayOfWeek,
    isRamadan: ramadanByDate.get(d.date) ?? false,
    isFriday: d.dayOfWeek === 5,
  }));

  const employees: ScheduleNextEmployee[] = grid.rows
    .filter((r) => !r.isGuest)
    .map((row) => {
      const unavailableDates = new Set<string>();
      let leaveDays = 0;
      for (const cell of row.cells) {
        if (cell.availability === 'LEAVE' || cell.availability === 'ABSENT') {
          unavailableDates.add(cell.date);
          if (cell.availability === 'LEAVE') leaveDays++;
        }
        if (cell.availability === 'HOLIDAY') unavailableDates.add(cell.date);
      }
      return {
        empId: row.empId,
        name: row.name,
        weeklyOffDay: row.effectiveWeeklyOffDay,
        unavailableDates,
        onLeaveAllWeek: leaveDays >= 7,
      };
    });

  return {
    weekStart,
    days,
    employees,
    externalSupport,
    weeklyOffMoves: [],
  };
}

export function allocateEmployeesToPattern(
  input: ScheduleNextInput,
  classification: WeekClassification,
  options: AllocateOptions = {}
): AllocatorResult {
  const seed = options.seed ?? 0;
  const weeklyOffMoves: WeeklyOffMove[] = [...input.weeklyOffMoves];
  const employeeStats = initStats(input);
  const dayAssignments = new Map<string, DaySlotAssignment[]>();
  const lastBridgeByEmp = new Map<string, string>();

  const ramadanRange = getRamadanRange();
  const opByDate = new Map(
    buildWeekOperatingConfigs(
      input.days.map((d) => d.date),
      ramadanRange
    ).map((d) => [d.date, d])
  );

  const active = input.employees.filter((e) => !e.onLeaveAllWeek);
  let prevDate: string | null = null;

  input.days.forEach((day, dayIndex) => {
    const op = opByDate.get(day.date);
    const periods = op?.operatingPeriods ?? [];
    const isFridayPmOnly = day.isFriday && !day.isRamadan;

    let available = active.filter((e) => isAvailable(e, day.date, day.dayOfWeek, weeklyOffMoves));
    const pattern = patternForDay(day, available.length, classification);
    const needed = pattern.slots.length;

    if (available.length < needed && needed > 0) {
      const move = tryWeeklyOffMove(input, day, weeklyOffMoves, needed);
      if (move) {
        weeklyOffMoves.push(move);
        const st = employeeStats.get(move.empId);
        if (st) st.movedWeeklyOff = true;
        available = active.filter((e) => isAvailable(e, day.date, day.dayOfWeek, weeklyOffMoves));
      }
    }

    const assignments: DaySlotAssignment[] = [];
    const used = new Set<string>();
    const pool = rotate(
      [...available].sort((a, b) => a.empId.localeCompare(b.empId)),
      seed + dayIndex
    );

    for (const slotKind of pattern.slots) {
      let emp: ScheduleNextEmployee | undefined;
      if (slotKind === 'BRIDGE') {
        const bridgeEmp = pickBridgeEmployee(
          pool.filter((e) => !used.has(e.empId)),
          lastBridgeByEmp,
          prevDate,
          employeeStats
        );
        emp = bridgeEmp ?? undefined;
      } else {
        emp = pool.find((e) => !used.has(e.empId));
      }
      if (!emp) continue;

      used.add(emp.empId);
      const segments = segmentsForSlot(slotKind, periods, day.isRamadan, isFridayPmOnly);
      const moved =
        weeklyOffMoves.some((m) => m.empId === emp!.empId && m.fromDate === day.date) ||
        weeklyOffMoves.some((m) => m.empId === emp!.empId);

      assignments.push({
        empId: emp.empId,
        name: emp.name,
        kind: personKind(slotKind),
        segments,
        movedWeeklyOff: moved && effectiveOffDow(emp, weeklyOffMoves) !== emp.weeklyOffDay,
        slotKind,
      });

      const st = employeeStats.get(emp.empId);
      if (st) {
        const hrs = slotHours(slotKind, day.isRamadan);
        st.totalHours += hrs;
        if (slotKind === 'BRIDGE') {
          st.bridgeCount++;
          st.compensationHours += BRIDGE_COMPENSATION_HOURS;
          lastBridgeByEmp.set(emp.empId, day.date);
        }
      }
    }

    dayAssignments.set(day.date, assignments);
    prevDate = day.date;
  });

  return { dayAssignments, weeklyOffMoves, employeeStats, lastBridgeByEmp };
}

export function countAmPmForAssignments(
  assignments: DaySlotAssignment[],
  periods: OperatingPeriod[],
  dayOfWeek: number,
  isRamadan: boolean
): { amCount: number; pmCount: number } {
  let amCount = 0;
  let pmCount = 0;
  for (const a of assignments) {
    const { am, pm } = segmentsAmPmContribution(a.segments, periods, dayOfWeek, isRamadan);
    if (am) amCount++;
    if (pm) pmCount++;
  }
  return { amCount, pmCount };
}

export function buildDayConfigsFromWeekStart(weekStart: string): ScheduleNextDayConfig[] {
  const dates = weekDateStringsFromStart(weekStart);
  const ramadanRange = getRamadanRange();
  const opConfigs = buildWeekOperatingConfigs(dates, ramadanRange);
  return opConfigs.map((d) => ({
    date: d.date,
    dayName: DAY_NAMES[d.dayOfWeek] ?? `Day ${d.dayOfWeek}`,
    dayOfWeek: d.dayOfWeek,
    isRamadan: d.isRamadan,
    isFriday: d.dayOfWeek === 5,
  }));
}
