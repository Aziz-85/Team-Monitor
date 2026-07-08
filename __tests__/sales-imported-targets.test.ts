/**
 * Imported BoutiqueMonthlyTarget must surface in sales APIs (not treated as missing/zero).
 */

function nextRequest(url: string, search?: Record<string, string>): import('next/server').NextRequest {
  const u = new URL(url);
  if (search) Object.entries(search).forEach(([k, v]) => u.searchParams.set(k, v));
  return { nextUrl: u } as unknown as import('next/server').NextRequest;
}

const BOUTIQUE_ID = 'boutique-b1';
const MONTH = '2026-07';
const DATE = '2026-07-15';
const IMPORTED_TARGET_SAR = 310_000;

describe('lookupBoutiqueMonthlyTarget', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns hasTarget true and amount when BoutiqueMonthlyTarget row exists', async () => {
    jest.doMock('@/lib/db', () => ({
      prisma: {
        boutiqueMonthlyTarget: {
          findFirst: jest.fn().mockResolvedValue({ amount: IMPORTED_TARGET_SAR }),
        },
      },
    }));

    const { lookupBoutiqueMonthlyTarget } = await import('@/lib/targets/boutiqueMonthlyTargetLookup');
    const result = await lookupBoutiqueMonthlyTarget({
      boutiqueId: BOUTIQUE_ID,
      monthKey: MONTH,
      routeName: 'test',
    });

    expect(result.hasTarget).toBe(true);
    expect(result.amount).toBe(IMPORTED_TARGET_SAR);
    expect(result.month).toBe(MONTH);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('returns hasTarget false and logs when no row exists', async () => {
    jest.doMock('@/lib/db', () => ({
      prisma: {
        boutiqueMonthlyTarget: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      },
    }));

    const { lookupBoutiqueMonthlyTarget } = await import('@/lib/targets/boutiqueMonthlyTargetLookup');
    const result = await lookupBoutiqueMonthlyTarget({
      boutiqueId: BOUTIQUE_ID,
      monthKey: MONTH,
      routeName: '/api/target/boutique/daily',
    });

    expect(result.hasTarget).toBe(false);
    expect(result.amount).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[targets/sales] missing monthly target',
      expect.objectContaining({
        boutiqueId: BOUTIQUE_ID,
        month: MONTH,
        route: '/api/target/boutique/daily',
      })
    );
  });

  it('treats imported zero as a real target', async () => {
    jest.doMock('@/lib/db', () => ({
      prisma: {
        boutiqueMonthlyTarget: {
          findFirst: jest.fn().mockResolvedValue({ amount: 0 }),
        },
      },
    }));

    const { lookupBoutiqueMonthlyTarget } = await import('@/lib/targets/boutiqueMonthlyTargetLookup');
    const result = await lookupBoutiqueMonthlyTarget({
      boutiqueId: BOUTIQUE_ID,
      monthKey: MONTH,
      routeName: 'test',
    });

    expect(result.hasTarget).toBe(true);
    expect(result.amount).toBe(0);
  });
});

describe('GET /api/target/boutique/daily', () => {
  const scopeManager = {
    userId: 'u-m',
    role: 'MANAGER' as const,
    empId: 'M1',
    effectiveBoutiqueId: BOUTIQUE_ID,
    employeeOnly: false,
    label: 'B1',
  };

  function mockBoutiqueDailyDeps(targetRow: { amount: number } | null) {
    jest.doMock('@/lib/metrics/scope', () => ({
      resolveMetricsScope: jest.fn().mockResolvedValue(scopeManager),
    }));
    jest.doMock('@/lib/db', () => ({
      prisma: {
        boutiqueMonthlyTarget: {
          findFirst: jest.fn().mockResolvedValue(targetRow),
        },
        salesEntry: {
          count: jest.fn().mockResolvedValue(1),
        },
      },
    }));
    jest.doMock('@/lib/sales/readSalesAggregate', () => ({
      aggregateSalesEntrySum: jest.fn().mockResolvedValue(50_000),
      salesEntryWhereForBoutiqueMonth: jest.fn().mockReturnValue({ boutiqueId: BOUTIQUE_ID, month: MONTH }),
    }));
    jest.doMock('@/lib/time', () => {
      const actual = jest.requireActual<typeof import('@/lib/time')>('@/lib/time');
      return {
        ...actual,
        getRiyadhNow: jest.fn().mockReturnValue(new Date(`${DATE}T12:00:00.000Z`)),
      };
    });
  }

  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns monthTargetSar from imported BoutiqueMonthlyTarget for 2026-07', async () => {
    mockBoutiqueDailyDeps({ amount: IMPORTED_TARGET_SAR });
    const route = await import('@/app/api/target/boutique/daily/route');
    const res = await route.GET(
      nextRequest('http://localhost/api/target/boutique/daily', { month: MONTH, date: DATE })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasMonthlyTarget).toBe(true);
    expect(body.monthTargetSar).toBe(IMPORTED_TARGET_SAR);
    expect(body.dailyTargetSar).toBeGreaterThan(0);
    expect(body.mtdAchievementPct).not.toBeNull();
  });

  it('returns hasMonthlyTarget false when month has no imported target', async () => {
    mockBoutiqueDailyDeps(null);
    const route = await import('@/app/api/target/boutique/daily/route');
    const res = await route.GET(
      nextRequest('http://localhost/api/target/boutique/daily', { month: MONTH, date: DATE })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasMonthlyTarget).toBe(false);
    expect(body.monthTargetSar).toBeNull();
    expect(body.dailyTargetSar).toBeNull();
    expect(body.todayPct).toBeNull();
    expect(body.mtdAchievementPct).toBeNull();
  });
});

describe('getPerformanceSummary boutique monthly target', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes hasMonthlyTarget and monthlyTargetSar for manager boutique scope', async () => {
    jest.doMock('@/lib/db', () => ({
      prisma: {
        boutiqueMonthlyTarget: {
          findFirst: jest.fn().mockResolvedValue({ amount: IMPORTED_TARGET_SAR }),
        },
        salesEntry: {
          count: jest.fn().mockResolvedValue(1),
        },
      },
    }));
    jest.doMock('@/lib/sales/readSalesAggregate', () => ({
      ...jest.requireActual<typeof import('@/lib/sales/readSalesAggregate')>('@/lib/sales/readSalesAggregate'),
      aggregateSalesEntrySum: jest.fn().mockResolvedValue(100_000),
    }));
    jest.doMock('@/lib/time', () => {
      const actual = jest.requireActual<typeof import('@/lib/time')>('@/lib/time');
      return {
        ...actual,
        getRiyadhNow: jest.fn().mockReturnValue(new Date(`${DATE}T12:00:00.000Z`)),
      };
    });

    const { getPerformanceSummary } = await import('@/lib/metrics/aggregator');
    const summary = await getPerformanceSummary({
      boutiqueId: BOUTIQUE_ID,
      monthKey: MONTH,
      employeeOnly: false,
    });

    expect(summary.hasMonthlyTarget).toBe(true);
    expect(summary.monthlyTargetSar).toBe(IMPORTED_TARGET_SAR);
    expect(summary.monthly.target).toBe(IMPORTED_TARGET_SAR);
  });

  it('reports no monthly target when BoutiqueMonthlyTarget row is absent', async () => {
    jest.doMock('@/lib/db', () => ({
      prisma: {
        boutiqueMonthlyTarget: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        salesEntry: {
          count: jest.fn().mockResolvedValue(1),
        },
      },
    }));
    jest.doMock('@/lib/sales/readSalesAggregate', () => ({
      ...jest.requireActual<typeof import('@/lib/sales/readSalesAggregate')>('@/lib/sales/readSalesAggregate'),
      aggregateSalesEntrySum: jest.fn().mockResolvedValue(0),
    }));
    jest.doMock('@/lib/time', () => {
      const actual = jest.requireActual<typeof import('@/lib/time')>('@/lib/time');
      return {
        ...actual,
        getRiyadhNow: jest.fn().mockReturnValue(new Date(`${DATE}T12:00:00.000Z`)),
      };
    });

    const { getPerformanceSummary } = await import('@/lib/metrics/aggregator');
    const summary = await getPerformanceSummary({
      boutiqueId: BOUTIQUE_ID,
      monthKey: MONTH,
      employeeOnly: false,
    });

    expect(summary.hasMonthlyTarget).toBe(false);
    expect(summary.monthlyTargetSar).toBeNull();
    expect(summary.monthly.target).toBe(0);
  });
});

describe('sales daily UI target panel state', () => {
  it('shows no-target copy when hasMonthlyTarget is false', () => {
    const scopeDaily = { hasMonthlyTarget: false };
    const display = scopeDaily.hasMonthlyTarget ? '310,000 SAR' : 'No target set for this month';
    expect(display).toBe('No target set for this month');
  });

  it('shows monthly target when API returns imported value', () => {
    const scopeDaily = { hasMonthlyTarget: true, monthTargetSar: IMPORTED_TARGET_SAR };
    const display = scopeDaily.hasMonthlyTarget
      ? `${scopeDaily.monthTargetSar!.toLocaleString('en-US')} SAR`
      : 'No target set for this month';
    expect(display).toContain('310,000');
  });
});
