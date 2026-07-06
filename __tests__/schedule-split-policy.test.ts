import {
  canProposeMorningToSplit,
  canProposeEveningToSplit,
  isSplitAssignmentAllowed,
  isCoverageCompliant,
  evaluateCoverage,
} from '@/lib/schedule/coveragePolicy';

describe('Split shift policy', () => {
  const sat = 6;

  it('editor always allows Split on non-Friday regardless of AM/PM buckets', () => {
    expect(isSplitAssignmentAllowed({ am: 1, pm: 2 }, 'MORNING', sat)).toBe(true);
    expect(isSplitAssignmentAllowed({ am: 2, pm: 2 }, 'MORNING', sat)).toBe(true);
    expect(isSplitAssignmentAllowed({ am: 1, pm: 2 }, 'EVENING', sat)).toBe(true);
  });

  it('blocks Split on Friday', () => {
    expect(isSplitAssignmentAllowed({ am: 0, pm: 2 }, 'EVENING', 5)).toBe(false);
  });

  it('allows AM→Split when AM meets minimum and PM needs +1 (planner advisory)', () => {
    expect(canProposeMorningToSplit({ am: 2, pm: 2 }, sat)).toBe(true);
  });

  it('allows PM→Split when AM is below minimum (planner advisory)', () => {
    expect(canProposeEveningToSplit({ am: 1, pm: 2 }, sat)).toBe(true);
  });

  it('AM=2 PM=2 is compliant (PM ≥ AM)', () => {
    expect(isCoverageCompliant({ am: 2, pm: 2 }, sat)).toBe(true);
    expect(evaluateCoverage({ am: 2, pm: 2 }, sat).some((i) => i.type === 'PM_NOT_ABOVE_AM')).toBe(false);
  });

  it('AM=3 PM=2 fails PM ≥ AM (advisory bucket warning only)', () => {
    expect(evaluateCoverage({ am: 3, pm: 2 }, sat).some((i) => i.type === 'PM_NOT_ABOVE_AM')).toBe(true);
  });
});
