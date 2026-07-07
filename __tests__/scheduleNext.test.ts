import { FRIDAY_DOW } from '@/lib/schedule/policyEngine';
import {
  buildDayConfigsFromWeekStart,
  buildScheduleNextProposal,
  checkProposalCoverage,
} from '@/lib/schedule-next';
import type { ExternalSupportDraft, ScheduleNextEmployee, ScheduleNextInput } from '@/lib/schedule-next/types';

const WEEK = '2026-04-04';

function employee(
  empId: string,
  name: string,
  weeklyOffDay: number | 'NONE' = 'NONE',
  leaveDates: string[] = [],
  onLeaveAllWeek = false
): ScheduleNextEmployee {
  return {
    empId,
    name,
    weeklyOffDay,
    unavailableDates: new Set(leaveDates),
    onLeaveAllWeek,
  };
}

function baseInput(
  employees: ScheduleNextEmployee[],
  externalSupport: ExternalSupportDraft[] = []
): ScheduleNextInput {
  return {
    weekStart: WEEK,
    days: buildDayConfigsFromWeekStart(WEEK),
    employees,
    externalSupport,
    weeklyOffMoves: [],
  };
}

function weekdayRows(proposal: ReturnType<typeof buildScheduleNextProposal>) {
  return proposal.rows.filter((r) => r.dayOfWeek !== FRIDAY_DOW);
}

function fridayRow(proposal: ReturnType<typeof buildScheduleNextProposal>) {
  return proposal.rows.find((r) => r.dayOfWeek === FRIDAY_DOW)!;
}

describe('schedule next generator', () => {
  it('4 employees no leave: Sat-Thu AM>=2 PM>=2, Friday PM>=2', () => {
    const input = baseInput([
      employee('e1', 'A'),
      employee('e2', 'B'),
      employee('e3', 'C'),
      employee('e4', 'D'),
    ]);
    const proposal = buildScheduleNextProposal(input);
    expect(proposal.status).toBe('ACCEPTABLE');

    for (const row of weekdayRows(proposal)) {
      expect(row.amCount).toBeGreaterThanOrEqual(2);
      expect(row.pmCount).toBeGreaterThanOrEqual(2);
    }

    const friday = fridayRow(proposal);
    expect(friday.amCount).toBe(0);
    expect(friday.pmCount).toBeGreaterThanOrEqual(2);
    expect(checkProposalCoverage(proposal.rows, false).valid).toBe(true);
  });

  it('4 employees with 1 leave all week: bridge pattern passes coverage where possible', () => {
    const input = baseInput([
      employee('e1', 'A'),
      employee('e2', 'B'),
      employee('e3', 'C'),
      employee('e4', 'D', 'NONE', [], true),
    ]);
    const proposal = buildScheduleNextProposal(input);
    expect(proposal.summary.bridgeCount).toBeGreaterThan(0);

    for (const row of weekdayRows(proposal)) {
      expect(row.amCount).toBeGreaterThanOrEqual(2);
      expect(row.pmCount).toBeGreaterThanOrEqual(2);
    }
    expect(fridayRow(proposal).pmCount).toBeGreaterThanOrEqual(2);
  });

  it('Friday: AM can be 0, PM must be 2', () => {
    const input = baseInput([
      employee('e1', 'A'),
      employee('e2', 'B'),
      employee('e3', 'C'),
      employee('e4', 'D'),
    ]);
    const proposal = buildScheduleNextProposal(input);
    const friday = fridayRow(proposal);
    expect(friday.amCount).toBe(0);
    expect(friday.pmCount).toBeGreaterThanOrEqual(2);
  });

  it('Bridge counts in AM and PM', () => {
    const input = baseInput([
      employee('e1', 'A'),
      employee('e2', 'B'),
      employee('e3', 'C'),
      employee('e4', 'D', 'NONE', [], true),
    ]);
    const proposal = buildScheduleNextProposal(input);
    const bridgeDay = proposal.rows.find(
      (r) => r.morning.some((p) => p.kind === 'Bridge') && r.afternoon.some((p) => p.kind === 'Bridge')
    );
    expect(bridgeDay).toBeDefined();
    if (bridgeDay) {
      expect(bridgeDay.amCount).toBeGreaterThanOrEqual(1);
      expect(bridgeDay.pmCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('Regenerate: different bridge rotation from previous proposal', () => {
    const input = baseInput([
      employee('e1', 'A'),
      employee('e2', 'B'),
      employee('e3', 'C'),
      employee('e4', 'D', 'NONE', [], true),
    ]);
    const first = buildScheduleNextProposal(input, { seed: 0 });
    const second = buildScheduleNextProposal(input, {
      seed: 1,
      rejectedProposalIds: [first.proposalId],
    });
    expect(second.proposalId).not.toBe(first.proposalId);

    const bridgeEmpFirst = first.rows
      .flatMap((r) => [...r.morning, ...r.afternoon])
      .filter((p) => p.kind === 'Bridge')
      .map((p) => p.empId);
    const bridgeEmpSecond = second.rows
      .flatMap((r) => [...r.morning, ...r.afternoon])
      .filter((p) => p.kind === 'Bridge')
      .map((p) => p.empId);
    expect(bridgeEmpSecond.join(',')).not.toBe(bridgeEmpFirst.join(','));
  });

  it('External support used only when internal staff cannot cover', () => {
    const days = buildDayConfigsFromWeekStart(WEEK);
    const understaffed = baseInput([employee('e1', 'A'), employee('e2', 'B')]);
    const without = buildScheduleNextProposal(understaffed);
    expect(without.status).toBe('NEEDS_SUPPORT');
    expect(without.rows.every((r) => r.externalCoverage.length === 0)).toBe(true);

    const sunday = days.find((d) => d.dayOfWeek === 0)!;
    const withSupport = buildScheduleNextProposal(
      baseInput([employee('e1', 'A'), employee('e2', 'B')], [
        {
          empId: 'ext1',
          employeeName: 'Guest',
          date: sunday.date,
          shift: 'EVENING',
        },
        {
          empId: 'ext2',
          employeeName: 'Guest2',
          date: sunday.date,
          shift: 'MORNING',
        },
      ])
    );
    expect(withSupport.rows.some((r) => r.externalCoverage.length > 0)).toBe(true);
    expect(withSupport.summary.externalSupportHours).toBeGreaterThan(0);
  });

  it('No proposal with Sunday PM=0 can be ACCEPTABLE', () => {
    const input = baseInput([employee('e1', 'A')]);
    const proposal = buildScheduleNextProposal(input);
    const sunday = proposal.rows.find((r) => r.dayOfWeek === 0);
    if (sunday && sunday.pmCount === 0) {
      expect(proposal.status).not.toBe('ACCEPTABLE');
    }
  });
});
