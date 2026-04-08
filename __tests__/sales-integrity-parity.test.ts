/**
 * Sales integrity — parity contracts over canonical SalesEntry helpers.
 * Uses mocked Prisma / aggregator where needed (no DB required).
 */

describe('parityEngine: boutique month aggregate vs groupBy', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('PASS when aggregate sum equals sum of groupBy amounts', async () => {
    const prismaMock = {
      salesEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 100 } }),
        groupBy: jest.fn().mockResolvedValue([
          { userId: 'u1', _sum: { amount: 40 } },
          { userId: 'u2', _sum: { amount: 60 } },
        ]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    jest.doMock('@/lib/db', () => ({ prisma: prismaMock }));
    const { evaluateBoutiqueMonthAggregateVsGroupBy } = await import('@/lib/sales/parityEngine');
    const r = await evaluateBoutiqueMonthAggregateVsGroupBy('boutique-B1', '2026-02');
    expect(r.status).toBe('PASS');
    expect(r.delta).toBe(0);
  });

  it('FAIL when aggregate and groupBy sums diverge', async () => {
    const prismaMock = {
      salesEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 100 } }),
        groupBy: jest.fn().mockResolvedValue([{ userId: 'u1', _sum: { amount: 99 } }]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    jest.doMock('@/lib/db', () => ({ prisma: prismaMock }));
    const { evaluateBoutiqueMonthAggregateVsGroupBy } = await import('@/lib/sales/parityEngine');
    const r = await evaluateBoutiqueMonthAggregateVsGroupBy('boutique-B1', '2026-02');
    expect(r.status).toBe('FAIL');
    expect(r.delta).toBe(1);
  });
});

describe('parityEngine: boutique month vs dashboard actual', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('PASS when aggregate matches getDashboardSalesMetrics.currentMonthActual', async () => {
    const prismaMock = {
      salesEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 250 } }),
        groupBy: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    jest.doMock('@/lib/db', () => ({ prisma: prismaMock }));
    jest.doMock('@/lib/metrics/aggregator', () => ({
      getDashboardSalesMetrics: jest.fn().mockResolvedValue({
        currentMonthTarget: 300,
        currentMonthActual: 250,
        completionPct: 83,
        remainingGap: 50,
        byUserId: { u1: 250 },
      }),
      getTargetMetrics: jest.fn(),
    }));
    const { evaluateBoutiqueMonthVsDashboardActual } = await import('@/lib/sales/parityEngine');
    const r = await evaluateBoutiqueMonthVsDashboardActual('boutique-B1', '2026-02');
    expect(r.status).toBe('PASS');
  });
});

describe('parityEngine: employee MTD vs getTargetMetrics', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('PASS when MTD aggregate matches getTargetMetrics.mtdSales', async () => {
    const prismaMock = {
      salesEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 42 } }),
        groupBy: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      employeeMonthlyTarget: { findFirst: jest.fn().mockResolvedValue({ amount: 100 }) },
      boutiqueMonthlyTarget: { findFirst: jest.fn().mockResolvedValue({ amount: 500 }) },
    };
    jest.doMock('@/lib/db', () => ({ prisma: prismaMock }));
    jest.doMock('@/lib/time', () => {
      const actual = jest.requireActual<typeof import('@/lib/time')>('@/lib/time');
      return {
        ...actual,
        getRiyadhNow: jest.fn().mockReturnValue(new Date(Date.UTC(2026, 1, 15, 12, 0, 0))),
      };
    });
    jest.doMock('@/lib/metrics/aggregator', () => ({
      getDashboardSalesMetrics: jest.fn(),
      getTargetMetrics: jest.fn().mockResolvedValue({
        monthKey: '2026-02',
        monthTarget: 100,
        boutiqueTarget: 500,
        mtdSales: 42,
        todaySales: 10,
        weekSales: 20,
        dailyTarget: 3,
        weekTarget: 20,
        reportingDailyAllocationSar: 3,
        reportingWeeklyAllocationSar: 20,
        paceDailyRequiredSar: 3,
        paceWeeklyRequiredSar: 20,
        remainingMonthTargetSar: 58,
        remaining: 58,
        pctDaily: 0,
        pctWeek: 0,
        pctMonth: 0,
        todayStr: '2026-02-15',
        todayInSelectedMonth: true,
        dailyAchievementPending: false,
        monthlyTargetMet: false,
        weekRangeLabel: '',
        daysInMonth: 28,
        leaveDaysInMonth: null,
        presenceFactor: null,
        scheduledDaysInMonth: null,
      }),
    }));
    const { evaluateEmployeeMtdVsTargetMetrics } = await import('@/lib/sales/parityEngine');
    const r = await evaluateEmployeeMtdVsTargetMetrics({
      boutiqueId: 'boutique-B1',
      userId: 'user-u1',
      monthKey: '2026-02',
    });
    expect(r.status).toBe('PASS');
    expect(r.values.aggregateMtd).toBe(42);
    expect(r.values.getTargetMetricsMtdSales).toBe(42);
  });
});

describe('parityEngine: month column vs date range', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('PASS when both aggregates return the same total', async () => {
    const prismaMock = {
      salesEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 77 } }),
        groupBy: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    jest.doMock('@/lib/db', () => ({ prisma: prismaMock }));
    const { evaluateBoutiqueMonthColumnVsDateRange } = await import('@/lib/sales/parityEngine');
    const r = await evaluateBoutiqueMonthColumnVsDateRange('boutique-B1', '2026-02');
    expect(r.status).toBe('PASS');
    expect(prismaMock.salesEntry.aggregate).toHaveBeenCalledTimes(2);
  });
});

describe('parityEngine: matrix scope vs aggregate (empId coverage)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('PASS when all rows have empId and sums match aggregate', async () => {
    const prismaMock = {
      salesEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 30 } }),
        groupBy: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { amount: 10, user: { empId: 'E1' } },
          { amount: 20, user: { empId: 'E2' } },
        ]),
      },
    };
    jest.doMock('@/lib/db', () => ({ prisma: prismaMock }));
    const { evaluateMatrixScopeVsAggregate } = await import('@/lib/sales/parityEngine');
    const r = await evaluateMatrixScopeVsAggregate('boutique-B1', '2026-02', false);
    expect(r.status).toBe('PASS');
    expect(r.delta).toBe(0);
  });

  it('FAIL when aggregate includes orphan rows (no empId)', async () => {
    const prismaMock = {
      salesEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 100 } }),
        groupBy: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { amount: 40, user: { empId: 'E1' } },
          { amount: 60, user: { empId: null } },
        ]),
      },
    };
    jest.doMock('@/lib/db', () => ({ prisma: prismaMock }));
    const { evaluateMatrixScopeVsAggregate } = await import('@/lib/sales/parityEngine');
    const r = await evaluateMatrixScopeVsAggregate('boutique-B1', '2026-02', false);
    expect(r.status).toBe('FAIL');
    expect(r.delta).toBe(60);
  });
});

describe('parityDiagnostics: formatParityDiagnostics', () => {
  it('marks ok false when any check fails', async () => {
    const { formatParityDiagnostics } = await import('@/lib/sales/parityDiagnostics');
    const payload = formatParityDiagnostics([
      {
        contractName: 'A',
        status: 'PASS',
        delta: 0,
        context: {},
        values: { x: 1, y: 1 },
      },
      {
        contractName: 'B',
        status: 'FAIL',
        delta: 5,
        context: {},
        values: { x: 10, y: 15 },
        message: 'drift',
      },
    ]);
    expect(payload.ok).toBe(false);
    expect(payload.failedContracts).toEqual(['B']);
    expect(payload.checks[1].summary).toContain('FAIL');
    expect(payload.reconciliationPolicy.id).toBe('POLICY_A');
  });
});
