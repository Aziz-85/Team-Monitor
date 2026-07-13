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
import {
  bestAchievableSlots,
  patternForDay,
  slotsForAllocationStage,
} from './patternLibrary';
import type {
  AllocationStage,
  DaySlotAssignment,
  ExternalSupportDraft,
  ScheduleNextDayConfig,
  ScheduleNextEmployee,
  ScheduleNextInput,
  SlotKind,
  WeeklyOffMove,
} from './types';
import {
  ALLOCATION_STAGE_ORDER,
  BRIDGE_COMPENSATION_HOURS,
  BRIDGE_SEGMENTS_NORMAL,
  BRIDGE_WORKING_HOURS,
  DAY_NAMES,
} from './types';
import type { WeekClassification } from './types';

// Re-export stage order for tests
export { ALLOCATION_STAGE_ORDER } from './types';

const STAGE_LABELS: Record<AllocationStage, string> = {
  NORMAL: 'Normal allocation',
  BRIDGE: 'Bridge allocation',
  WEEKLY_OFF_MOVE: 'Weekly-off move',
  WEEKLY_OFF_DEFERRAL: 'Weekly-off deferral',
  BEST_ACHIEVABLE: 'Best achievable',
};

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
  allocationLog: string[];
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

function isOnLeave(emp: ScheduleNextEmployee, date: string): boolean {
  return emp.onLeaveAllWeek || emp.unavailableDates.has(date);
}

function isAvailable(
  emp: ScheduleNextEmployee,
  date: string,
  dayOfWeek: number,
  moves: WeeklyOffMove[],
  ignoreWeeklyOff = false
): boolean {
  if (isOnLeave(emp, date)) return false;
  if (!ignoreWeeklyOff) {
    const off = effectiveOffDow(emp, moves);
    if (off !== 'NONE' && off === dayOfWeek) return false;
  }
  return true;
}

function availablePool(
  active: ScheduleNextEmployee[],
  date: string,
  dayOfWeek: number,
  moves: WeeklyOffMove[],
  ignoreWeeklyOff = false
): ScheduleNextEmployee[] {
  return active.filter((e) => isAvailable(e, date, dayOfWeek, moves, ignoreWeeklyOff));
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
  const available = availablePool(active, day.date, day.dayOfWeek, moves);
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

function fillPatternSlots(
  day: ScheduleNextDayConfig,
  slotKinds: SlotKind[],
  pool: ScheduleNextEmployee[],
  periods: OperatingPeriod[],
  isFridayPmOnly: boolean,
  weeklyOffMoves: WeeklyOffMove[],
  lastBridgeByEmp: Map<string, string>,
  prevDate: string | null,
  employeeStats: AllocatorResult['employeeStats'],
  seed: number,
  dayIndex: number,
  options: { markWeeklyOffDeferral?: boolean } = {}
): DaySlotAssignment[] {
  if (!slotKinds.length || !pool.length) return [];

  const assignments: DaySlotAssignment[] = [];
  const used = new Set<string>();
  const rotated = rotate(
    [...pool].sort((a, b) => a.empId.localeCompare(b.empId)),
    seed + dayIndex
  );

  for (const slotKind of slotKinds) {
    let emp: ScheduleNextEmployee | undefined;
    if (slotKind === 'BRIDGE') {
      emp = pickBridgeEmployee(
        rotated.filter((e) => !used.has(e.empId)),
        lastBridgeByEmp,
        prevDate,
        employeeStats
      ) ?? undefined;
    } else {
      emp = rotated.find((e) => !used.has(e.empId));
    }
    if (!emp) continue;

    used.add(emp.empId);
    const segments = segmentsForSlot(slotKind, periods, day.isRamadan, isFridayPmOnly);
    const moved =
      weeklyOffMoves.some((m) => m.empId === emp!.empId && m.fromDate === day.date) ||
      weeklyOffMoves.some((m) => m.empId === emp!.empId);
    const onWeeklyOff =
      emp.weeklyOffDay !== 'NONE' &&
      effectiveOffDow(emp, weeklyOffMoves) === day.dayOfWeek;
    const compensationRequired = Boolean(options.markWeeklyOffDeferral && onWeeklyOff && !moved);

    assignments.push({
      empId: emp.empId,
      name: emp.name,
      kind: personKind(slotKind),
      segments,
      movedWeeklyOff: moved && effectiveOffDow(emp, weeklyOffMoves) !== emp.weeklyOffDay,
      compensationRequired,
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
      if (compensationRequired) {
        st.compensationHours += BRIDGE_COMPENSATION_HOURS;
      }
    }
  }

  return assignments;
}

function cloneEmployeeStats(stats: AllocatorResult['employeeStats']): AllocatorResult['employeeStats'] {
  return new Map(Array.from(stats.entries()).map(([k, v]) => [k, { ...v }]));
}

function restoreEmployeeStats(
  target: AllocatorResult['employeeStats'],
  snapshot: AllocatorResult['employeeStats']
): void {
  for (const [k, v] of Array.from(snapshot.entries())) {
    target.set(k, { ...v });
  }
}

function cloneBridgeMap(map: Map<string, string>): Map<string, string> {
  return new Map(map);
}

function restoreBridgeMap(target: Map<string, string>, snapshot: Map<string, string>): void {
  target.clear();
  for (const [k, v] of Array.from(snapshot.entries())) target.set(k, v);
}

function logStageFailure(
  allocationLog: string[],
  date: string,
  stage: AllocationStage,
  availableCount: number,
  slotCount: number
): void {
  // slots=0 means the stage intentionally deferred (e.g. NORMAL with 2 staff) — not a real fill failure.
  const deferred = slotCount === 0;
  const msg = deferred
    ? `[schedule-next] ${date}: ${STAGE_LABELS[stage]} deferred (available=${availableCount}, slots=0)`
    : `[schedule-next] ${date}: ${STAGE_LABELS[stage]} failed (available=${availableCount}, slots=${slotCount})`;
  allocationLog.push(msg);
  // Keep expected NORMAL→BRIDGE cascades out of PM2 warn noise; only warn on real fill failures.
  if (!deferred && process.env.NODE_ENV !== 'test') {
    console.warn(msg);
  }
}

function assertNonEmptyDay(
  day: ScheduleNextDayConfig,
  availableCount: number,
  assignments: DaySlotAssignment[],
  failedStages: AllocationStage[],
  allocationLog: string[]
): void {
  if (availableCount === 0 || assignments.length > 0) return;

  const reason = `date=${day.date}, availableEmployees=${availableCount}, assignedEmployees=0, failedStages=${failedStages.map((s) => STAGE_LABELS[s]).join(' → ')}`;
  allocationLog.push(`[schedule-next] EMPTY_DAY_BLOCKED: ${reason}`);

  if (process.env.NODE_ENV === 'development') {
    throw new Error(`Schedule Next planner error: empty day with available staff. ${reason}`);
  }

  console.error(`[schedule-next] empty day blocked in production; ${reason}`);
}

type DayAllocationOutcome = {
  assignments: DaySlotAssignment[];
  moves: WeeklyOffMove[];
  stageUsed: AllocationStage | null;
  failedStages: AllocationStage[];
};

function allocateSingleDay(
  input: ScheduleNextInput,
  day: ScheduleNextDayConfig,
  dayIndex: number,
  classification: WeekClassification,
  weeklyOffMoves: WeeklyOffMove[],
  periods: OperatingPeriod[],
  isFridayPmOnly: boolean,
  active: ScheduleNextEmployee[],
  lastBridgeByEmp: Map<string, string>,
  prevDate: string | null,
  employeeStats: AllocatorResult['employeeStats'],
  seed: number,
  allocationLog: string[]
): DayAllocationOutcome {
  const leaveOnlyPool = availablePool(active, day.date, day.dayOfWeek, weeklyOffMoves, true);
  const availableCount = leaveOnlyPool.length;

  if (availableCount === 0) {
    return { assignments: [], moves: [], stageUsed: null, failedStages: [] };
  }

  const failedStages: AllocationStage[] = [];
  let dayMoves: WeeklyOffMove[] = [...weeklyOffMoves];
  let result: DaySlotAssignment[] = [];
  let stageUsed: AllocationStage | null = null;
  let movesAddedThisDay: WeeklyOffMove[] = [];

  for (const stage of ALLOCATION_STAGE_ORDER) {
    const statsSnapshot = cloneEmployeeStats(employeeStats);
    const bridgeSnapshot = cloneBridgeMap(lastBridgeByEmp);
    const movesForStage = [...dayMoves];
    movesAddedThisDay = [];

    if (stage === 'WEEKLY_OFF_MOVE') {
      const pattern = patternForDay(
        day,
        availablePool(active, day.date, day.dayOfWeek, movesForStage).length,
        classification
      );
      const needed = pattern.slots.length || bestAchievableSlots(day, availableCount, classification).length;
      const move = tryWeeklyOffMove(input, day, movesForStage, needed);
      if (move) {
        movesAddedThisDay = [move];
        dayMoves = [...movesForStage, move];
      }
    }

    const ignoreWeeklyOff = stage === 'WEEKLY_OFF_DEFERRAL' || stage === 'BEST_ACHIEVABLE';
    const pool = availablePool(active, day.date, day.dayOfWeek, dayMoves, ignoreWeeklyOff);
    const poolCount = pool.length;
    const slots = slotsForAllocationStage(stage, day, poolCount, classification);

    result = fillPatternSlots(
      day,
      slots,
      pool,
      periods,
      isFridayPmOnly,
      dayMoves,
      lastBridgeByEmp,
      prevDate,
      employeeStats,
      seed,
      dayIndex,
      { markWeeklyOffDeferral: stage === 'WEEKLY_OFF_DEFERRAL' }
    );

    if (result.length > 0) {
      stageUsed = stage;
      for (const move of movesAddedThisDay) {
        const st = employeeStats.get(move.empId);
        if (st) st.movedWeeklyOff = true;
      }
      if (failedStages.length) {
        const recovery = `[schedule-next] ${day.date}: recovered via ${STAGE_LABELS[stage]} after failing ${failedStages.map((s) => STAGE_LABELS[s]).join(', ')}`;
        allocationLog.push(recovery);
        // Allocation log still carries the trail for the proposal UI; avoid spamming PM2
        // (buildScheduleNextProposal may retry up to 10 seeds for the same week).
      }
      break;
    }

    restoreEmployeeStats(employeeStats, statsSnapshot);
    restoreBridgeMap(lastBridgeByEmp, bridgeSnapshot);
    if (movesAddedThisDay.length) {
      dayMoves = movesForStage;
    }

    failedStages.push(stage);
    logStageFailure(allocationLog, day.date, stage, poolCount, slots.length);
  }

  if (result.length === 0) {
    const statsSnapshot = cloneEmployeeStats(employeeStats);
    const bridgeSnapshot = cloneBridgeMap(lastBridgeByEmp);
    const emergencyPool = availablePool(active, day.date, day.dayOfWeek, dayMoves, true);
    const emergencySlots = bestAchievableSlots(day, emergencyPool.length, classification);
    result = fillPatternSlots(
      day,
      emergencySlots,
      emergencyPool,
      periods,
      isFridayPmOnly,
      dayMoves,
      lastBridgeByEmp,
      prevDate,
      employeeStats,
      seed,
      dayIndex,
      { markWeeklyOffDeferral: true }
    );
    if (result.length > 0) {
      stageUsed = 'BEST_ACHIEVABLE';
      allocationLog.push(`[schedule-next] ${day.date}: emergency best-achievable fallback applied`);
    } else {
      restoreEmployeeStats(employeeStats, statsSnapshot);
      restoreBridgeMap(lastBridgeByEmp, bridgeSnapshot);
    }
  }

  assertNonEmptyDay(day, availableCount, result, failedStages, allocationLog);

  return {
    assignments: result,
    moves: dayMoves.slice(weeklyOffMoves.length),
    stageUsed,
    failedStages,
  };
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
  const allocationLog: string[] = [];

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

    const outcome = allocateSingleDay(
      input,
      day,
      dayIndex,
      classification,
      weeklyOffMoves,
      periods,
      isFridayPmOnly,
      active,
      lastBridgeByEmp,
      prevDate,
      employeeStats,
      seed,
      allocationLog
    );

    for (const move of outcome.moves) {
      weeklyOffMoves.push(move);
    }

    dayAssignments.set(day.date, outcome.assignments);
    prevDate = day.date;
  });

  return { dayAssignments, weeklyOffMoves, employeeStats, lastBridgeByEmp, allocationLog };
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
