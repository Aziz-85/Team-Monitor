/**
 * Workforce Planning Engine (Resource Planner) tests.
 */

import { operatingPeriodsForDay } from '@/lib/schedule/generateSchedule/operatingPeriods';
import { planWeeklyResources } from '@/lib/schedule/resourcePlanner';
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
    isRamadan?: boolean;
  } = {}
): GenerateScheduleInput {
  const weekStart = options.weekStart ?? '2026-06-15';
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${weekStart}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const dayOfWeek = date.getUTCDay();
    const isRamadan = options.isRamadan ?? false;
    return {
      date: iso,
      dayOfWeek,
      operatingPeriods: operatingPeriodsForDay(dayOfWeek, isRamadan),
      isRamadan,
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

describe('planWeeklyResources', () => {
  it('computes employee resources for 3 employees', () => {
    const input = makeWeekInput(3, { weeklyOffDay: 'NONE' });
    const plan = planWeeklyResources(input);

    expect(plan.employeeResources).toHaveLength(3);
    plan.employeeResources.forEach((r) => {
      expect(r.availableDays).toBeGreaterThan(0);
      expect(r.maxWeeklyHours).toBeGreaterThan(0);
      expect(r.maxWeeklyHours).toBeLessThanOrEqual(48);
      expect(r.availableWeeklyHours).toBeLessThanOrEqual(r.maxWeeklyHours);
      expect(r.flexibilityScore).toBeGreaterThanOrEqual(0);
      expect(r.flexibilityScore).toBeLessThanOrEqual(100);
    });
  });

  it('computes daily workload with required hours for 4 employees', () => {
    const input = makeWeekInput(4, { weeklyOffDay: 'NONE' });
    const plan = planWeeklyResources(input);

    expect(plan.dailyPlans).toHaveLength(7);
    plan.dailyPlans.forEach((d) => {
      expect(d.requiredHours).toBeGreaterThanOrEqual(0);
      expect(d.shortageHours).toBe(Math.max(0, Math.round((d.requiredHours - d.availableHours) * 10) / 10));
    });
    // Aggregate budget is consistent with per-day sums.
    const sumRequired = plan.dailyPlans.reduce((s, d) => s + d.requiredHours, 0);
    expect(plan.workforceBudget.totalRequiredHours).toBeCloseTo(Math.round(sumRequired * 10) / 10, 1);
  });

  it('reflects annual leave by lowering available days', () => {
    const withLeave = makeWeekInput(3, {
      weeklyOffDay: 'NONE',
      unavailability: [
        { empId: 'emp-1', date: '2026-06-15', kind: 'leave' },
        { empId: 'emp-1', date: '2026-06-16', kind: 'leave' },
      ],
    });
    const baseline = makeWeekInput(3, { weeklyOffDay: 'NONE' });

    const leaveRes = planWeeklyResources(withLeave).employeeResources.find(
      (r) => r.employeeId === 'emp-1'
    )!;
    const baseRes = planWeeklyResources(baseline).employeeResources.find(
      (r) => r.employeeId === 'emp-1'
    )!;

    expect(leaveRes.annualLeaveDays).toBe(2);
    expect(leaveRes.availableDays).toBe(baseRes.availableDays - 2);
  });

  it('handles Ramadan mode with adjusted daily hours', () => {
    const input = makeWeekInput(3, { weeklyOffDay: 'NONE', isRamadan: true });
    const plan = planWeeklyResources(input);

    expect(plan.mode).toBe('ramadan');
    expect(plan.dailyPlans.every((d) => d.isRamadan)).toBe(true);
    expect(plan.employeeResources[0].maxDailyHours).toBe(
      DEFAULT_GENERATE_SETTINGS.ramadanMode.maxDailyHours
    );
  });

  it('produces a Friday plan (PM-only) without crashing', () => {
    const input = makeWeekInput(4, { weeklyOffDay: 'NONE' });
    const friday = input.days.find((d) => d.dayOfWeek === 5)!;
    const plan = planWeeklyResources(input);
    const fridayPlan = plan.dailyPlans.find((d) => d.date === friday.date)!;

    expect(fridayPlan).toBeDefined();
    expect(fridayPlan.requiredHours).toBeGreaterThanOrEqual(0);
  });

  it('does NOT require a bridge when staff is plentiful', () => {
    const input = makeWeekInput(8, { weeklyOffDay: 'NONE' });
    const plan = planWeeklyResources(input);

    expect(plan.bridgeAssignments).toHaveLength(0);
    expect(plan.workforceBudget.bridgeRequiredDays).toBe(0);
  });

  it('requires a bridge and tracks compensation when staff is scarce', () => {
    // Only 2 employees for multi-period days → both AM & PM fall below combined min.
    const input = makeWeekInput(2, { weeklyOffDay: 'NONE' });
    const plan = planWeeklyResources(input);

    const multiPeriodDays = input.days.filter((d) => d.operatingPeriods.length >= 2);
    if (multiPeriodDays.length > 0) {
      expect(plan.bridgeAssignments.length).toBeGreaterThan(0);
      // Bridge shifts should surface in the compensation ledger.
      const owed = plan.compensationLedger.reduce((s, e) => s + e.compensationOwedHours, 0);
      expect(owed).toBeGreaterThan(0);
    }
  });

  it('recommends external support LAST when shortage exceeds bridge/overtime capacity', () => {
    const input = makeWeekInput(1, { weeklyOffDay: 'NONE' });
    const plan = planWeeklyResources(input);

    expect(plan.workforceBudget.shortageHours).toBeGreaterThan(0);
    expect(plan.workforceBudget.externalSupportRequired).toBe(true);

    const external = plan.recommendations.find((r) => r.type === 'NEED_EXTERNAL_SUPPORT');
    expect(external).toBeDefined();
    // External support is the lowest-priority (highest rank number) actionable rec.
    const ranks = plan.recommendations.map((r) => r.rank);
    expect(external!.rank).toBe(Math.max(...ranks));
  });

  it('returns a balanced decision and non-generic recommendations shape', () => {
    const input = makeWeekInput(6, { weeklyOffDay: 'NONE' });
    const plan = planWeeklyResources(input);

    expect(plan.plannerDecision).toBeTruthy();
    plan.recommendations.forEach((r) => {
      expect(r.title).toBeTruthy();
      expect(r.reason).toBeTruthy();
      expect(['high', 'medium', 'low']).toContain(r.impact);
    });
  });
});
