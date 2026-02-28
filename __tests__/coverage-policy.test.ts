/**
 * Effective Coverage Policy (PM-dominant): PM ≥ AM, PM ≥ 2 (Sat–Thu); Friday PM-only.
 * Tests validateCoverage outcomes for given roster counts and weekdays.
 */

const mockFindFirst = jest.fn();
jest.mock('@/lib/db', () => ({
  prisma: {
    coverageRule: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));
jest.mock('@/lib/services/roster');

import { validateCoverage, clearCoverageValidationCache } from '@/lib/services/coverageValidation';
import { rosterForDate } from '@/lib/services/roster';

const mockRosterForDate = rosterForDate as jest.MockedFunction<typeof rosterForDate>;

function roster(am: number, pm: number) {
  return {
    amEmployees: Array.from({ length: am }, (_, i) => ({ empId: `am-${i}`, name: `AM${i}` })),
    pmEmployees: Array.from({ length: pm }, (_, i) => ({ empId: `pm-${i}`, name: `PM${i}` })),
    offEmployees: [],
    leaveEmployees: [],
    warnings: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearCoverageValidationCache();
  mockFindFirst.mockResolvedValue({ minAM: 2, minPM: 2 });
});

describe('Effective Coverage Policy (PM ≥ AM, PM ≥ 2; Friday PM-only)', () => {
  it('Mon AM=1 PM=2 should pass (PM ≥ AM and PM ≥ 2)', async () => {
    const monday = new Date('2026-02-02T12:00:00Z'); // Monday = 1
    mockRosterForDate.mockResolvedValue(roster(1, 2));
    const results = await validateCoverage(monday);
    const types = results.map((r) => r.type);
    expect(types).not.toContain('AM_GT_PM');
    expect(types).not.toContain('MIN_PM');
    expect(results.length).toBe(0);
  });

  it('Mon AM=2 PM=1 should fail (AM > PM and PM < 2)', async () => {
    const monday = new Date('2026-02-02T12:00:00Z');
    mockRosterForDate.mockResolvedValue(roster(2, 1));
    const results = await validateCoverage(monday);
    const types = results.map((r) => r.type);
    expect(types).toContain('AM_GT_PM');
    expect(types).toContain('MIN_PM');
  });

  it('Mon PM=1 should fail (min PM 2)', async () => {
    const monday = new Date('2026-02-02T12:00:00Z');
    mockRosterForDate.mockResolvedValue(roster(1, 1));
    const results = await validateCoverage(monday);
    const types = results.map((r) => r.type);
    expect(types).toContain('MIN_PM');
  });

  it('Fri AM=0 PM=2 should pass', async () => {
    const friday = new Date('2026-02-06T12:00:00Z'); // Friday = 5
    mockRosterForDate.mockResolvedValue(roster(0, 2));
    mockFindFirst.mockResolvedValue({ minAM: 0, minPM: 2 });
    const results = await validateCoverage(friday);
    const types = results.map((r) => r.type);
    expect(types).not.toContain('AM_ON_FRIDAY');
    expect(results.length).toBe(0);
  });

  it('Fri AM=1 PM=2 should fail (Friday PM-only)', async () => {
    const friday = new Date('2026-02-06T12:00:00Z');
    mockRosterForDate.mockResolvedValue(roster(1, 2));
    mockFindFirst.mockResolvedValue({ minAM: 0, minPM: 2 });
    const results = await validateCoverage(friday);
    const types = results.map((r) => r.type);
    expect(types).toContain('AM_ON_FRIDAY');
  });
});
