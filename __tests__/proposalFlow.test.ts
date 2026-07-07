/**
 * Proposed schedule review flow — generator, presenter, and regeneration.
 */

import { generateSchedule } from '@/lib/schedule/generateSchedule/engine';
import { operatingPeriodsForDay, FRIDAY_DOW } from '@/lib/schedule/generateSchedule/operatingPeriods';
import { countAmPmForDay } from '@/lib/schedule/plannerGuidedSolver';
import {
  DEFAULT_GENERATE_SETTINGS,
  type GenerateScheduleInput,
  type EmployeeDayAssignment,
} from '@/lib/schedule/generateSchedule/types';
import {
  buildProposalDayRows,
  buildProposalSummary,
  presentProposal,
} from '@/lib/schedule/proposalPresenter';
import { evaluateProposalQuality } from '@/lib/schedule/proposalQualityGate';
import { generateResultToPlanActions } from '@/lib/schedule/generateSchedule/toPlanActions';
import { createHash } from 'crypto';

function makeFourEmpOneLeaveInput(): GenerateScheduleInput {
  const weekStart = '2026-06-15';
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${weekStart}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const dayOfWeek = date.getUTCDay();
    return {
      date: iso,
      dayOfWeek,
      operatingPeriods: operatingPeriodsForDay(dayOfWeek, false),
      isRamadan: false,
    };
  });

  const regularEmployees = Array.from({ length: 4 }, (_, i) => ({
    empId: `emp-${i + 1}`,
    name: ['Abdulhadi', 'Hussain', 'Abdulaziz', 'Employee 4'][i],
    isExternalSupport: false,
    weeklyOffDay: 'NONE' as const,
  }));

  const unavailability = days.map((d) => ({
    empId: 'emp-1',
    date: d.date,
    kind: 'leave' as const,
  }));

  return {
    weekStart,
    days,
    regularEmployees,
    externalSupportEmployees: [],
    unavailability,
    settings: DEFAULT_GENERATE_SETTINGS,
    historicalStats: regularEmployees.map((e) => ({
      empId: e.empId,
      priorWeekHours: 40,
      priorWeekPmHours: 16,
      priorWeekFridayHours: 0,
      priorWeekSplitDays: 0,
    })),
    preserveExisting: false,
  };
}

function proposalIdFromAssignments(assignments: EmployeeDayAssignment[]): string {
  const parts = assignments
    .filter((a) => a.shiftKind !== 'Off' && a.shiftKind !== 'Leave')
    .map((a) => `${a.empId}|${a.date}|${a.shiftKind}`)
    .sort();
  return createHash('sha256').update(parts.join(';')).digest('hex').slice(0, 16);
}

function mockGridFromInput(input: GenerateScheduleInput) {
  return {
    weekStart: input.weekStart,
    days: input.days.map((d) => ({
      date: d.date,
      dayName: 'Day',
      dayOfWeek: d.dayOfWeek,
      minAm: 2,
      minPm: 2,
    })),
    rows: input.regularEmployees.map((e) => ({
      empId: e.empId,
      name: e.name,
      team: 'A',
      effectiveWeeklyOffDay: e.weeklyOffDay,
      cells: input.days.map((d) => ({
        date: d.date,
        availability: 'WORK' as const,
        effectiveShift: 'NONE' as const,
        overrideId: null,
        baseShift: 'NONE' as const,
      })),
    })),
    counts: [],
    dayCountContexts: [],
    timeCoverage: { valid: true, violations: [] },
    externalCoverageShifts: [],
  };
}

describe('proposal flow', () => {
  it('4 employees, 1 leave all week — Sat-Thu AM>=2 PM>=2 with bridge where needed', () => {
    const input = makeFourEmpOneLeaveInput();
    const result = generateSchedule(input, { forcePartialSolve: true });
    expect(result.coverageValid).toBe(true);

    const grid = mockGridFromInput(input);
    const rows = buildProposalDayRows(
      input.days,
      result.assignments,
      grid as never,
      result.slotViolations,
      result.weeklyOffVariant
    );

    rows.forEach((row) => {
      const day = input.days.find((d) => d.date === row.date)!;
      if (day.dayOfWeek === FRIDAY_DOW) {
        expect(row.amCount).toBe(0);
        expect(row.pmCount).toBeGreaterThanOrEqual(2);
        return;
      }
      expect(row.amCount).toBeGreaterThanOrEqual(2);
      expect(row.pmCount).toBeGreaterThanOrEqual(2);
    });

    const bridgeRows = rows.filter(
      (r) => r.morning.some((p) => p.kind === 'Bridge') || r.afternoon.some((p) => p.kind === 'Bridge')
    );
    expect(bridgeRows.length).toBeGreaterThan(0);
  });

  it('bridge employee appears in both morning and afternoon columns', () => {
    const input = makeFourEmpOneLeaveInput();
    const result = generateSchedule(input, { forcePartialSolve: true });
    const grid = mockGridFromInput(input);
    const rows = buildProposalDayRows(input.days, result.assignments, grid as never, [], result.weeklyOffVariant);

    const bridgeDay = rows.find((r) =>
      r.morning.some((p) => p.kind === 'Bridge') && r.afternoon.some((p) => p.kind === 'Bridge')
    );
    expect(bridgeDay).toBeDefined();
    const name = bridgeDay!.morning.find((p) => p.kind === 'Bridge')!.name;
    expect(bridgeDay!.afternoon.some((p) => p.name === name && p.kind === 'Bridge')).toBe(true);
  });

  it('external support appears in external coverage column', () => {
    const input = makeFourEmpOneLeaveInput();
    const guestDate = input.days[0]!.date;
    const periods = input.days[0]!.operatingPeriods;
    const assignments = [
      {
        empId: 'guest-1',
        name: 'Guest Staff',
        date: guestDate,
        isExternalSupport: true,
        shiftKind: 'AM' as const,
        segments: [{ periodIndex: 0, startTime: periods[0]!.startTime, endTime: periods[0]!.endTime }],
        totalHours: 5,
        splitDay: false,
        reasons: ['External coverage'],
      },
    ];
    const grid = mockGridFromInput(input);
    const rows = buildProposalDayRows(input.days, assignments, grid as never, [], undefined);
    const dayRow = rows.find((r) => r.date === guestDate);
    expect(dayRow?.externalCoverage.some((p) => p.name === 'Guest Staff')).toBe(true);
  });

  it('regenerate with rotated seed yields a different proposal signature', () => {
    const input = makeFourEmpOneLeaveInput();
    const a = generateSchedule(input, { forcePartialSolve: true, scenarioRotation: 0, bridgeRotationOffset: 0 });
    const b = generateSchedule(input, { forcePartialSolve: true, scenarioRotation: 1, bridgeRotationOffset: 1 });
    const idA = proposalIdFromAssignments(a.assignments);
    const idB = proposalIdFromAssignments(b.assignments);
    expect(idA).not.toBe(idB);
  });

  it('presentProposal produces apply-ready plan actions', () => {
    const input = makeFourEmpOneLeaveInput();
    const result = generateSchedule(input, { forcePartialSolve: true });
    const grid = mockGridFromInput(input);
    const actions = generateResultToPlanActions(result, grid.rows);
    const summary = buildProposalSummary(result, grid as never);
    const quality = evaluateProposalQuality({
      rows: buildProposalDayRows(input.days, result.assignments, grid as never, result.slotViolations, result.weeklyOffVariant),
      days: input.days,
      slotViolations: result.slotViolations,
      summary,
    });
    const presented = presentProposal(result, actions, grid as never, input.days, {
      proposalId: 'test-1',
      proposalNumber: 1,
    }, quality);

    expect(presented.actions.length).toBeGreaterThan(0);
    expect(presented.summary.coverageValid).toBe(true);
    expect(presented.quality.status).toBe('ACCEPTABLE');
    expect(presented.rows).toHaveLength(7);
    expect(buildProposalSummary(result, grid as never).bridgeCount).toBeGreaterThanOrEqual(0);
  });

  it('Friday is PM only in proposal rows', () => {
    const input = makeFourEmpOneLeaveInput();
    const result = generateSchedule(input, { forcePartialSolve: true });
    const grid = mockGridFromInput(input);
    const rows = buildProposalDayRows(input.days, result.assignments, grid as never, [], result.weeklyOffVariant);
    const friday = rows.find((r) => input.days.find((d) => d.date === r.date)?.dayOfWeek === FRIDAY_DOW);
    expect(friday).toBeDefined();
    expect(friday!.amCount).toBe(0);
    expect(friday!.pmCount).toBeGreaterThanOrEqual(2);
  });
});
