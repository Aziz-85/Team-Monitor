/**
 * Scenario Simulator (Workforce AI) tests.
 *
 * Verifies scenario generation, simulation-only cloning (no DB / input mutation),
 * scoring, and safety caps.
 */

import { operatingPeriodsForDay } from '@/lib/schedule/generateSchedule/operatingPeriods';
import { simulateScheduleScenarios } from '@/lib/schedule/scenarioSimulator';
import { scoreScenario } from '@/lib/schedule/scenarioScoring';
import {
  DEFAULT_GENERATE_SETTINGS,
  type GenerateScheduleInput,
} from '@/lib/schedule/generateSchedule/types';

function makeWeekInput(
  employeeCount: number,
  options: {
    weekStart?: string;
    weeklyOffDay?: number | 'NONE';
    unavailability?: GenerateScheduleInput['unavailability'];
  } = {}
): GenerateScheduleInput {
  const weekStart = options.weekStart ?? '2026-06-15';
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

  const regularEmployees = Array.from({ length: employeeCount }, (_, i) => ({
    empId: `emp-${i + 1}`,
    name: i === 0 ? 'Abdulaziz Alnasser' : i === 1 ? 'Hussain' : `Employee ${i + 1}`,
    isExternalSupport: false,
    weeklyOffDay:
      options.weeklyOffDay === 'NONE'
        ? ('NONE' as const)
        : (((options.weeklyOffDay ?? 0) + i) % 7),
  }));

  return {
    weekStart,
    days,
    regularEmployees,
    externalSupportEmployees: [],
    unavailability: options.unavailability ?? [],
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

/** Controllable input: single period per day at a chosen minCoverage. */
function makeSimpleInput(
  employeeCount: number,
  minCoverage: number,
  dayCount = 2
): GenerateScheduleInput {
  const weekStart = '2026-06-15';
  const days = Array.from({ length: dayCount }, (_, i) => {
    const date = new Date(`${weekStart}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    return {
      date: iso,
      dayOfWeek: date.getUTCDay(),
      operatingPeriods: [{ startTime: '09:00', endTime: '17:00', minCoverage }],
      isRamadan: false,
    };
  });
  const regularEmployees = Array.from({ length: employeeCount }, (_, i) => ({
    empId: `emp-${i + 1}`,
    name: `Employee ${i + 1}`,
    isExternalSupport: false,
    weeklyOffDay: 'NONE' as const,
  }));
  return {
    weekStart,
    days,
    regularEmployees,
    externalSupportEmployees: [],
    unavailability: [],
    settings: DEFAULT_GENERATE_SETTINGS,
    historicalStats: regularEmployees.map((e) => ({
      empId: e.empId,
      priorWeekHours: 0,
      priorWeekPmHours: 0,
      priorWeekFridayHours: 0,
      priorWeekSplitDays: 0,
    })),
    preserveExisting: false,
  };
}

describe('simulateScheduleScenarios', () => {
  it('1. produces a baseline that is impossible for a 1-employee week', () => {
    const input = makeWeekInput(1, { weeklyOffDay: 'NONE' });
    const out = simulateScheduleScenarios(input);

    const baseline = out.scenarios.find((s) => s.type === 'BASELINE');
    expect(baseline).toBeDefined();
    expect(baseline!.simulationResult.coverageValid).toBe(false);
    expect(baseline!.simulationResult.analysisStatus).not.toBe('FEASIBLE');
    expect(out.scenarios.length).toBeGreaterThan(1);
  });

  it('2. bridge scenario improves (or maintains) coverage vs baseline', () => {
    const input = makeWeekInput(2, { weeklyOffDay: 'NONE' });
    const out = simulateScheduleScenarios(input);

    const baseline = out.scenarios.find((s) => s.type === 'BASELINE')!;
    const bridge = out.scenarios.find((s) => s.type === 'BRIDGE');
    if (bridge) {
      expect(bridge.simulationResult.slotViolations).toBeLessThanOrEqual(
        baseline.simulationResult.slotViolations
      );
      expect(bridge.actions.length).toBeGreaterThan(0);
    }
  });

  it('3. overtime scenario improves (or maintains) coverage vs baseline', () => {
    const input = makeWeekInput(2, { weeklyOffDay: 'NONE' });
    const out = simulateScheduleScenarios(input);

    const baseline = out.scenarios.find((s) => s.type === 'BASELINE')!;
    const overtime = out.scenarios.find((s) => s.type === 'OVERTIME');
    expect(overtime).toBeDefined();
    expect(overtime!.simulationResult.slotViolations).toBeLessThanOrEqual(
      baseline.simulationResult.slotViolations
    );
  });

  it('4. external support scenario improves a controllable shortage', () => {
    // One-day shortage: 1 employee + 1 scoped guest can cover minCoverage 2
    // without introducing cross-day solver constraints.
    const input = makeSimpleInput(1, 2, 1);
    const out = simulateScheduleScenarios(input);

    const baseline = out.scenarios.find((s) => s.type === 'BASELINE')!;
    const external = out.scenarios.find((s) => s.type === 'EXTERNAL_SUPPORT');

    expect(baseline.simulationResult.coverageValid).toBe(false);
    expect(external).toBeDefined();
    expect(external!.simulationResult.slotViolations).toBeLessThan(
      baseline.simulationResult.slotViolations
    );
    expect(external!.simulationResult.externalSupportHours).toBeGreaterThan(0);
  });

  it('5. weekly-off move is simulated WITHOUT mutating the input (no DB side effects)', () => {
    const input = makeWeekInput(3, { weeklyOffDay: 0 });
    const snapshot = JSON.stringify(input);

    const out = simulateScheduleScenarios(input);

    // Original input must be byte-for-byte unchanged.
    expect(JSON.stringify(input)).toBe(snapshot);

    const move = out.scenarios.find((s) => s.type === 'MOVE_WEEKLY_OFF');
    if (move) {
      expect(move.simulationResult.weeklyOffMoves).toBe(1);
      expect(move.actions[0].label).toMatch(/weekly off/i);
    }
  });

  it('6. scoring ranks a valid low-fatigue solution above invalid / high-fatigue ones', () => {
    const cleanValid = scoreScenario({
      coverageValid: true,
      slotViolations: 0,
      missingHours: 0,
      overtimeHours: 0,
      bridgeCount: 0,
      externalSupportHours: 0,
      weeklyOffMoves: 0,
      fairnessHealth: 95,
      actionCount: 1,
    });
    const overtimeHeavy = scoreScenario({
      coverageValid: true,
      slotViolations: 0,
      missingHours: 0,
      overtimeHours: 12,
      bridgeCount: 3,
      externalSupportHours: 0,
      weeklyOffMoves: 0,
      fairnessHealth: 80,
      actionCount: 4,
      maxBridgesPerEmployee: 3,
    });
    const invalid = scoreScenario({
      coverageValid: false,
      slotViolations: 20,
      missingHours: 10,
      overtimeHours: 0,
      bridgeCount: 0,
      externalSupportHours: 0,
      weeklyOffMoves: 0,
      fairnessHealth: 60,
      actionCount: 1,
    });

    expect(cleanValid.total).toBeGreaterThan(overtimeHeavy.total);
    expect(overtimeHeavy.total).toBeGreaterThan(invalid.total);
    expect(cleanValid.total).toBeLessThanOrEqual(100);
    expect(invalid.total).toBeGreaterThanOrEqual(0);
  });

  it('7. hybrid scenario combines minimal fixes (bridge + overtime + limited support)', () => {
    const input = makeWeekInput(2, { weeklyOffDay: 'NONE' });
    const out = simulateScheduleScenarios(input);

    const hybrid = out.scenarios.find((s) => s.type === 'HYBRID');
    expect(hybrid).toBeDefined();
    const kinds = hybrid!.actions.map((a) => a.kind);
    expect(kinds).toContain('BRIDGE');
    expect(kinds).toContain('OVERTIME');
    expect(kinds).toContain('EXTERNAL_SUPPORT');
  });

  it('8. safety caps prevent long execution', () => {
    const input = makeWeekInput(2, { weeklyOffDay: 'NONE' });

    const capped = simulateScheduleScenarios(input, { maxScenarios: 2 });
    expect(capped.scenarios.length).toBeLessThanOrEqual(2);
    expect(capped.performance.solves).toBeLessThanOrEqual(10);

    // A zero time budget still runs the baseline, but nothing else.
    const budgetZero = simulateScheduleScenarios(input, { maxScenarioSolveMs: 0 });
    expect(budgetZero.scenarios.length).toBe(1);
    expect(budgetZero.scenarios[0].type).toBe('BASELINE');
    expect(budgetZero.performance.capped).toBe(true);
  });

  it('always returns a bestScenarioId that exists in the ranked list', () => {
    const input = makeWeekInput(3, { weeklyOffDay: 0 });
    const out = simulateScheduleScenarios(input);
    expect(out.scenarios.some((s) => s.id === out.bestScenarioId)).toBe(true);
    expect(out.summary.totalScenarios).toBe(out.scenarios.length);
  });
});
