import {
  canProposeMorningToSplit,
  canProposeEveningToSplit,
  isSplitAssignmentAllowed,
  shouldOfferSplitOption,
  isCoverageCompliant,
} from '@/lib/schedule/coveragePolicy';

describe('Split shift policy', () => {
  const sat = 6;

  it('blocks AM→Split when AM is already below minimum', () => {
    expect(canProposeMorningToSplit({ am: 1, pm: 2 }, sat)).toBe(false);
    expect(isSplitAssignmentAllowed({ am: 1, pm: 2 }, 'MORNING', sat)).toBe(false);
  });

  it('allows AM→Split when AM meets minimum and PM needs +1', () => {
    expect(canProposeMorningToSplit({ am: 2, pm: 2 }, sat)).toBe(true);
    expect(isSplitAssignmentAllowed({ am: 2, pm: 2 }, 'MORNING', sat)).toBe(true);
  });

  it('allows PM→Split when AM is below minimum', () => {
    expect(canProposeEveningToSplit({ am: 1, pm: 3 }, sat)).toBe(true);
    expect(isSplitAssignmentAllowed({ am: 1, pm: 3 }, 'EVENING', sat)).toBe(true);
  });

  it('does not offer Split when day is already compliant', () => {
    expect(isCoverageCompliant({ am: 2, pm: 3 }, sat)).toBe(true);
    expect(shouldOfferSplitOption({ am: 2, pm: 3 }, sat)).toBe(false);
  });
});
