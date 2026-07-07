/**
 * Proposal quality gate — operational minimums for proposed schedule review.
 */

import { operatingPeriodsForDay, FRIDAY_DOW } from '@/lib/schedule/generateSchedule/operatingPeriods';
import { countAmPmForDay } from '@/lib/schedule/plannerGuidedSolver';
import type { DayOperatingConfig, ShiftSegment } from '@/lib/schedule/generateSchedule/types';
import type { ProposalDayRow } from '@/lib/schedule/proposalPresenter';
import {
  compareProposalQualityCandidates,
  evaluateProposalQuality,
  issuePillsForProposalRow,
  type ProposalQualityInput,
} from '@/lib/schedule/proposalQualityGate';
import {
  getIncompleteProposalBanner,
  getProposalReviewTitle,
  showIncompleteProposalBanner,
} from '@/lib/schedule/proposalReviewDisplay';
import { buildProposalDayRows } from '@/lib/schedule/proposalPresenter';
import { createHash } from 'crypto';

function weekDays(weekStart = '2026-06-15'): DayOperatingConfig[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${weekStart}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const dayOfWeek = date.getUTCDay();
    return {
      date: iso,
      dayOfWeek,
      isRamadan: false,
      operatingPeriods: operatingPeriodsForDay(dayOfWeek, false),
    };
  });
}

function row(
  date: string,
  dayName: string,
  amCount: number,
  pmCount: number
): ProposalDayRow {
  return {
    date,
    dayName,
    morning: [],
    afternoon: [],
    externalCoverage: [],
    amCount,
    pmCount,
    coverageValid: true,
  };
}

function proposalInput(rows: ProposalDayRow[], days: DayOperatingConfig[]): ProposalQualityInput {
  return {
    rows,
    days,
    slotViolations: [],
    summary: {
      coverageValid: true,
      bridgeCount: 0,
      overtimeHours: 0,
      compensationHours: 0,
      weeklyOffMoves: 0,
      externalSupportHours: 0,
    },
  };
}

describe('proposalQualityGate', () => {
  const days = weekDays();
  const sunday = days[0]!;

  it('rejects proposal with Sunday AM=1 PM=0', () => {
    const rows = days.map((d) =>
      d.date === sunday.date ? row(d.date, 'Sunday', 1, 0) : row(d.date, 'Day', 2, 2)
    );
    const result = evaluateProposalQuality(proposalInput(rows, days));
    expect(result.acceptable).toBe(false);
    expect(result.status).toBe('REJECTED');
    expect(result.blockingIssues.some((i) => i.date === sunday.date)).toBe(true);
    const pills = issuePillsForProposalRow(rows[0]!, result.blockingIssues);
    expect(pills).toContain('Needs PM');
  });

  it('accepts Sat–Thu AM>=2 PM>=2 and Friday PM>=2', () => {
    const rows = days.map((d) => {
      if (d.dayOfWeek === FRIDAY_DOW) return row(d.date, 'Friday', 0, 2);
      return row(d.date, 'Weekday', 2, 2);
    });
    const result = evaluateProposalQuality(proposalInput(rows, days));
    expect(result.acceptable).toBe(true);
    expect(result.status).toBe('ACCEPTABLE');
    expect(result.blockingIssues).toHaveLength(0);
  });

  it('counts bridge in both AM and PM columns', () => {
    const periods = operatingPeriodsForDay(1, false);
    const segments: ShiftSegment[] = [
      { periodIndex: 0, startTime: periods[0]!.startTime, endTime: periods[0]!.endTime },
      { periodIndex: 1, startTime: periods[1]!.startTime, endTime: periods[1]!.endTime },
    ];
    const dayShifts = [
      {
        empId: 'bridge-1',
        name: 'Bridge Staff',
        date: days[1]!.date,
        isExternalSupport: false,
        segments,
        reasons: [],
      },
      { empId: 'am-1', name: 'AM', date: days[1]!.date, isExternalSupport: false, segments: [segments[0]!], reasons: [] },
      { empId: 'pm-1', name: 'PM', date: days[1]!.date, isExternalSupport: false, segments: [segments[1]!], reasons: [] },
    ];
    const { am, pm } = countAmPmForDay(dayShifts, periods, days[1]!.dayOfWeek, false);
    expect(am).toBeGreaterThanOrEqual(2);
    expect(pm).toBeGreaterThanOrEqual(2);

    const grid = { rows: [] } as never;
    const assignments = dayShifts.map((s) => ({
      empId: s.empId,
      name: s.name,
      date: s.date,
      isExternalSupport: false,
      shiftKind: 'Bridge' as const,
      segments: s.segments,
      totalHours: 8,
      splitDay: false,
      reasons: s.reasons,
    }));
    const built = buildProposalDayRows(days, assignments, grid, [], undefined);
    const monday = built.find((r) => r.date === days[1]!.date)!;
    expect(monday.morning.some((p) => p.kind === 'Bridge')).toBe(true);
    expect(monday.afternoon.some((p) => p.kind === 'Bridge')).toBe(true);
    expect(monday.amCount).toBeGreaterThanOrEqual(2);
    expect(monday.pmCount).toBeGreaterThanOrEqual(2);
  });

  it('accepts Friday AM=0 PM=2', () => {
    const rows = days.map((d) =>
      d.dayOfWeek === FRIDAY_DOW ? row(d.date, 'Friday', 0, 2) : row(d.date, 'Weekday', 2, 2)
    );
    const result = evaluateProposalQuality(proposalInput(rows, days));
    expect(result.acceptable).toBe(true);
    expect(result.status).toBe('ACCEPTABLE');
  });

  it('labels failed proposals INCOMPLETE when returned as best achievable', () => {
    const rows = days.map((d) =>
      d.date === sunday.date ? row(d.date, 'Sunday', 1, 0) : row(d.date, 'Day', 2, 2)
    );
    const rejected = evaluateProposalQuality(proposalInput(rows, days));
    const incomplete = evaluateProposalQuality(proposalInput(rows, days), {}, { labelAsIncomplete: true });
    expect(rejected.status).toBe('REJECTED');
    expect(incomplete.status).toBe('INCOMPLETE');
    expect(incomplete.acceptable).toBe(false);
  });

  it('prefers fewer blocking issues when comparing candidates', () => {
    const better = evaluateProposalQuality(
      proposalInput(
        days.map((d) => (d.date === sunday.date ? row(d.date, 'Sunday', 1, 1) : row(d.date, 'Day', 2, 2))),
        days
      )
    );
    const worse = evaluateProposalQuality(
      proposalInput(
        days.map((d) => (d.date === sunday.date ? row(d.date, 'Sunday', 1, 0) : row(d.date, 'Day', 2, 2))),
        days
      )
    );
    expect(
      compareProposalQualityCandidates(
        { quality: better, summary: { bridgeCount: 1, overtimeHours: 0 } as never },
        { quality: worse, summary: { bridgeCount: 0, overtimeHours: 0 } as never }
      )
    ).toBeLessThan(0);
  });
});

describe('proposalReviewDisplay', () => {
  const t = (key: string) =>
    ({
      'schedule.proposal.titleIncomplete': 'Best Achievable Schedule',
      'schedule.proposal.title': 'Proposed Schedule Review',
      'schedule.proposal.incompleteBanner':
        'This schedule does not fully meet coverage requirements.',
    })[key] ?? '';

  it('shows incomplete proposal warning copy', () => {
    expect(showIncompleteProposalBanner('INCOMPLETE')).toBe(true);
    expect(showIncompleteProposalBanner('ACCEPTABLE')).toBe(false);
    expect(getIncompleteProposalBanner(t)).toContain('does not fully meet coverage');
    expect(getProposalReviewTitle('INCOMPLETE', t)).toBe('Best Achievable Schedule');
    expect(getProposalReviewTitle('ACCEPTABLE', t)).toBe('Proposed Schedule Review');
  });
});

describe('proposal regenerate identity', () => {
  it('avoids identical rejected proposal signature', () => {
    const partsA = ['emp-1|2026-06-15|AM', 'emp-2|2026-06-15|PM'].sort();
    const partsB = ['emp-1|2026-06-15|PM', 'emp-2|2026-06-15|AM'].sort();
    const idA = createHash('sha256').update(partsA.join(';')).digest('hex').slice(0, 16);
    const idB = createHash('sha256').update(partsB.join(';')).digest('hex').slice(0, 16);
    const rejected = new Set([idA]);
    expect(rejected.has(idA)).toBe(true);
    expect(rejected.has(idB)).toBe(false);
  });
});
