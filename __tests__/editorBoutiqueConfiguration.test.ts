/**
 * Schedule Editor ↔ Boutique Configuration integration tests.
 * Verifies editor policy resolution and grid day-count contexts use boutique mins/hours.
 */

jest.mock('@/lib/boutique-config/getBoutiqueConfiguration');

import type { ResolvedBoutiqueConfiguration } from '@/lib/boutique-config/types';
import {
  DEFAULT_BOUTIQUE_CONFIGURATION,
  DEFAULT_SHIFT_TEMPLATES,
  defaultCoveragePolicy,
  FRIDAY_DAY_OF_WEEK,
} from '@/lib/boutique-config/defaults';
import { getBoutiqueConfiguration } from '@/lib/boutique-config/getBoutiqueConfiguration';
import {
  isExternalSupportAllowedForDate,
  resolveEditorWeekPolicy,
} from '@/lib/boutique-config/editorPolicy';
import { buildDayCountContextsFromEditorPolicy } from '@/lib/services/scheduleGrid';

const mockGet = getBoutiqueConfiguration as jest.MockedFunction<typeof getBoutiqueConfiguration>;

const WEEK_DATES = [
  '2026-07-11',
  '2026-07-12',
  '2026-07-13',
  '2026-07-14',
  '2026-07-15',
  '2026-07-16',
  '2026-07-17',
];

function baseResolved(overrides: Partial<ResolvedBoutiqueConfiguration> = {}): ResolvedBoutiqueConfiguration {
  return {
    boutiqueId: 'b1',
    usingDefaults: false,
    config: { ...DEFAULT_BOUTIQUE_CONFIGURATION },
    activeSpecialPeriod: null,
    operatingHours: {
      openTime: '09:30',
      closeTime: '22:00',
      secondOpenTime: '14:00',
      secondCloseTime: null,
      source: 'NORMAL',
    },
    shiftTemplates: DEFAULT_SHIFT_TEMPLATES,
    coveragePolicy: defaultCoveragePolicy(),
    weeklyOffPolicy: {
      policy: 'FLEXIBLE',
      preferredRecoveryDay: 'FRIDAY',
      allowDeferral: true,
      maxDeferredPerWeek: 1,
    },
    externalSupportPolicy: { allow: true, priority: 'AFTER_BRIDGE' },
    overtimePolicy: { allow: false, maxHoursPerEmployeePerDay: 2 },
    planningStrategy: 'MAXIMUM_COVERAGE',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockImplementation(async (_boutiqueId, when) => {
    const dayOfWeek = when.getUTCDay();
    const policy = defaultCoveragePolicy().map((p) =>
      p.dayOfWeek === 6 ? { ...p, minMorning: 5, minEvening: 3 } : p
    );
    return baseResolved({ coveragePolicy: policy, usingDefaults: dayOfWeek === 6 });
  });
});

describe('resolveEditorWeekPolicy', () => {
  it('maps coverage mins from Boutique Configuration without legacy floors', async () => {
    const policy = await resolveEditorWeekPolicy('b1', WEEK_DATES);
    const saturday = policy.days.find((d) => d.date === '2026-07-11');
    expect(saturday?.minMorning).toBe(5);
    expect(saturday?.minEvening).toBe(3);
    const friday = policy.days.find((d) => d.dayOfWeek === FRIDAY_DAY_OF_WEEK);
    expect(friday?.minMorning).toBe(0);
    expect(friday?.fridayPmOnly).toBe(true);
  });

  it('uses shift template times for operating periods', async () => {
    const policy = await resolveEditorWeekPolicy('b1', WEEK_DATES);
    const monday = policy.days.find((d) => d.date === '2026-07-13');
    expect(monday?.operatingPeriods).toEqual([
      { startTime: '09:30', endTime: '17:30', minCoverage: 2 },
      { startTime: '14:00', endTime: '22:00', minCoverage: 2 },
    ]);
  });

  it('reflects allowBridgeShift and external support from configuration', async () => {
    mockGet.mockResolvedValue(
      baseResolved({
        config: { ...DEFAULT_BOUTIQUE_CONFIGURATION, allowBridgeShift: false, allowExternalSupport: false },
        externalSupportPolicy: { allow: false, priority: 'LAST_RESORT' },
      })
    );
    const policy = await resolveEditorWeekPolicy('b1', WEEK_DATES);
    expect(policy.allowBridgeShift).toBe(false);
    expect(policy.allowExternalSupport).toBe(false);
  });
});

describe('buildDayCountContextsFromEditorPolicy', () => {
  it('projects editor policy into day count contexts for time-coverage validation', async () => {
    const policy = await resolveEditorWeekPolicy('b1', WEEK_DATES);
    const contexts = buildDayCountContextsFromEditorPolicy(policy);
    expect(contexts).toHaveLength(7);
    expect(contexts[0]?.operatingPeriods[0]?.startTime).toBe('09:30');
    expect(contexts[0]?.maxDailyHours).toBe(8);
  });
});

describe('isExternalSupportAllowedForDate', () => {
  it('returns false when boutique configuration disables external support', async () => {
    mockGet.mockResolvedValue(
      baseResolved({
        config: { ...DEFAULT_BOUTIQUE_CONFIGURATION, allowExternalSupport: false },
        externalSupportPolicy: { allow: false, priority: 'LAST_RESORT' },
      })
    );
    const allowed = await isExternalSupportAllowedForDate('b1', '2026-07-13');
    expect(allowed).toBe(false);
  });
});
