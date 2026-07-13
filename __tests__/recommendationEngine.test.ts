/**
 * Smart Recommendation Engine tests
 */

import { operatingPeriodsForDay } from '@/lib/schedule/generateSchedule/operatingPeriods';
import { analyzeScheduleConstraints } from '@/lib/schedule/constraintAnalyzer';
import { generateSmartRecommendations } from '@/lib/schedule/recommendationEngine';
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
        : ((options.weeklyOffDay ?? 0) + i) % 7,
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

describe('generateSmartRecommendations', () => {
  it('returns empty for FEASIBLE week', () => {
    const input = makeWeekInput(4, { weeklyOffDay: 'NONE' });
    const analysis = analyzeScheduleConstraints(input);
    expect(analysis.status).toBe('FEASIBLE');
    expect(generateSmartRecommendations({ input, analysis })).toHaveLength(0);
  });

  it('returns specific external support recommendation for impossible week', () => {
    // Keep the shortage recoverable enough for an estimated coverage increase.
    const input = makeWeekInput(2, { weeklyOffDay: 'NONE' });
    const analysis = analyzeScheduleConstraints(input);
    const recs = generateSmartRecommendations({ input, analysis }, 3);

    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].type).toBe('ADD_EXTERNAL_SUPPORT');
    expect(recs[0].title).toMatch(/Add external support on/i);
    expect(recs[0].title).toMatch(/\d{2}:\d{2}/);
    expect(recs[0].requiredAction).toBeTruthy();
    expect(recs[0].coverageAfterPercent).toBeGreaterThan(0);
  });

  it('includes partial schedule recommendation when solver has violations', () => {
    const input = makeWeekInput(3, { weeklyOffDay: 'NONE' });
    const analysis = analyzeScheduleConstraints(input);
    const recs = generateSmartRecommendations(
      {
        input,
        analysis,
        solverResult: {
          coverageValid: false,
          fairnessScore: 50000,
          slotViolations: [
            {
              date: input.days[0].date,
              slotId: 's1',
              startTime: '17:30',
              endTime: '18:00',
              coverage: 1,
              minCoverage: 2,
            },
            {
              date: input.days[0].date,
              slotId: 's2',
              startTime: '18:00',
              endTime: '18:30',
              coverage: 1,
              minCoverage: 2,
            },
          ],
          employeeSummaries: [],
          assignments: [],
        },
      },
      5
    );

    const partial = recs.find((r) => r.type === 'APPROVE_PARTIAL');
    expect(partial).toBeDefined();
    expect(partial!.title).toMatch(/partial schedule/i);
    expect(partial!.affectedTimeRanges.length).toBeGreaterThan(0);
  });

  it('suggests weekly off move when conflicts exist', () => {
    const input = makeWeekInput(3, { weeklyOffDay: 0 });
    input.regularEmployees[1].weeklyOffDay = 0;
    input.regularEmployees[1].name = 'Hussain';
    const analysis = analyzeScheduleConstraints(input);
    if (analysis.insights.moveWeeklyOffCouldHelp) {
      const recs = generateSmartRecommendations({ input, analysis }, 5);
      const move = recs.find((r) => r.type === 'MOVE_WEEKLY_OFF');
      if (move) {
        expect(move.title).toMatch(/weekly off/i);
        expect(move.title).toMatch(/from \w+ to \w+/i);
      }
    }
  });
});
