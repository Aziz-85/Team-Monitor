/**
 * Phase 5 — performance & target parity across canonical surfaces.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    boutiqueMonthlyTarget: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    employeeMonthlyTarget: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    salesEntry: {
      aggregate: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    user: { findFirst: jest.fn() },
  },
}));

import { getMonthRange } from '@/lib/time';

const BOUTIQUE_ID = 'boutique-b1';
const USER_ID = 'user-u1';
const MONTH = '2026-07';
const TARGET_SAR = 310_000;
const MTD_SAR = 125_000;

function mockSalesEntryAggregate(amount: number) {
  const { prisma } = require('@/lib/db');
  (prisma.salesEntry.aggregate as jest.Mock).mockResolvedValue({
    _sum: { amount },
    _count: { id: 1 },
  });
  (prisma.salesEntry.count as jest.Mock).mockResolvedValue(1);
  (prisma.salesEntry.groupBy as jest.Mock).mockImplementation((args: { by: string[] }) => {
    if (args.by.includes('userId')) {
      return Promise.resolve([{ userId: USER_ID, _sum: { amount } }]);
    }
    if (args.by.includes('dateKey')) {
      return Promise.resolve([{ dateKey: `${MONTH}-01`, _sum: { amount } }]);
    }
    return Promise.resolve([]);
  });
  (prisma.salesEntry.findMany as jest.Mock).mockResolvedValue([{ amount }]);
  (prisma.salesEntry.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
}

describe('central target resolvers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getBoutiqueTarget returns missing (not zero) when no row exists', async () => {
    jest.doMock('@/lib/db', () => ({
      prisma: {
        boutiqueMonthlyTarget: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    }));

    const { getBoutiqueTarget } = await import('@/lib/targets/getBoutiqueTarget');
    const result = await getBoutiqueTarget({
      boutiqueId: BOUTIQUE_ID,
      monthKey: MONTH,
      routeName: 'test',
    });

    expect(result.status).toBe('missing');
    expect(result.hasMonthlyTarget).toBe(false);
    expect(result.amountSar).toBeNull();
  });

  it('getBoutiqueTarget treats explicit zero as assigned', async () => {
    jest.doMock('@/lib/db', () => ({
      prisma: {
        boutiqueMonthlyTarget: { findFirst: jest.fn().mockResolvedValue({ amount: 0 }) },
      },
    }));

    const { getBoutiqueTarget } = await import('@/lib/targets/getBoutiqueTarget');
    const result = await getBoutiqueTarget({
      boutiqueId: BOUTIQUE_ID,
      monthKey: MONTH,
      routeName: 'test',
    });

    expect(result.status).toBe('assigned');
    expect(result.hasMonthlyTarget).toBe(true);
    expect(result.amountSar).toBe(0);
  });

  it('getEmployeeTarget returns missing when scoped row absent', async () => {
    jest.doMock('@/lib/db', () => ({
      prisma: {
        employeeMonthlyTarget: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    }));

    const { getEmployeeTarget } = await import('@/lib/targets/getEmployeeTarget');
    const result = await getEmployeeTarget({
      userId: USER_ID,
      boutiqueId: BOUTIQUE_ID,
      monthKey: MONTH,
      routeName: 'test',
    });

    expect(result.status).toBe('missing');
    expect(result.amountSar).toBeNull();
    expect(result.hasMonthlyTarget).toBe(false);
  });
});

describe('performance getters', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getBoutiquePerformance uses SalesEntry sales and null achievement when target missing', async () => {
    jest.doMock('@/lib/db', () => ({
      prisma: {
        boutiqueMonthlyTarget: { findFirst: jest.fn().mockResolvedValue(null) },
        salesEntry: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: MTD_SAR }, _count: { id: 1 } }),
        },
      },
    }));

    const { getBoutiquePerformance } = await import('@/lib/sales/getBoutiquePerformance');
    const { start, endExclusive } = getMonthRange(MONTH);
    const result = await getBoutiquePerformance({
      boutiqueId: BOUTIQUE_ID,
      fromDate: start,
      toDate: new Date(endExclusive.getTime() - 86400000),
      monthKey: MONTH,
    });

    expect(result.sales).toBe(MTD_SAR);
    expect(result.targetStatus).toBe('missing');
    expect(result.target).toBeNull();
    expect(result.achievement.percent).toBeNull();
  });

  it('getEmployeePerformance returns assigned target and achievement percent', async () => {
    jest.doMock('@/lib/db', () => ({
      prisma: {
        employeeMonthlyTarget: {
          findFirst: jest.fn().mockResolvedValue({
            amount: TARGET_SAR,
            leaveDaysInMonth: null,
            presenceFactor: null,
            scheduledDaysInMonth: null,
          }),
        },
        salesEntry: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: MTD_SAR }, _count: { id: 1 } }),
        },
      },
    }));

    const { getEmployeePerformance } = await import('@/lib/sales/getEmployeePerformance');
    const { start, endExclusive } = getMonthRange(MONTH);
    const result = await getEmployeePerformance({
      userId: USER_ID,
      boutiqueId: BOUTIQUE_ID,
      fromDate: start,
      toDate: new Date(endExclusive.getTime() - 86400000),
      monthKey: MONTH,
    });

    expect(result.targetStatus).toBe('assigned');
    expect(result.target).toBe(TARGET_SAR);
    expect(result.achievement.percent).toBeGreaterThan(0);
  });
});

describe('aggregator target parity', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.doMock('@/lib/time', () => {
      const actual = jest.requireActual<typeof import('@/lib/time')>('@/lib/time');
      return {
        ...actual,
        getRiyadhNow: jest.fn().mockReturnValue(new Date(`${MONTH}-15T12:00:00.000Z`)),
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getTargetMetrics exposes hasMonthlyTarget false and pctMonth null when employee target missing', async () => {
    jest.doMock('@/lib/db', () => ({
      prisma: {
        boutiqueMonthlyTarget: { findFirst: jest.fn().mockResolvedValue(null) },
        employeeMonthlyTarget: { findFirst: jest.fn().mockResolvedValue(null) },
        salesEntry: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: MTD_SAR }, _count: { id: 1 } }),
          count: jest.fn().mockResolvedValue(1),
        },
        user: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    }));

    const { getTargetMetrics } = await import('@/lib/metrics/aggregator');
    const metrics = await getTargetMetrics({
      boutiqueId: BOUTIQUE_ID,
      userId: USER_ID,
      monthKey: MONTH,
    });

    expect(metrics.hasMonthlyTarget).toBe(false);
    expect(metrics.monthTargetSar).toBeNull();
    expect(metrics.targetStatus).toBe('missing');
    expect(metrics.pctMonth).toBeNull();
    expect(metrics.mtdSales).toBe(MTD_SAR);
  });

  it('getDashboardSalesMetrics and getPerformanceSummary share boutique target for manager scope', async () => {
    jest.doMock('@/lib/db', () => ({
      prisma: {
        boutiqueMonthlyTarget: {
          findFirst: jest.fn().mockResolvedValue({ amount: TARGET_SAR }),
        },
        employeeMonthlyTarget: { findFirst: jest.fn(), findMany: jest.fn() },
        salesEntry: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: MTD_SAR }, _count: { id: 2 } }),
          count: jest.fn().mockResolvedValue(1),
          groupBy: jest.fn().mockImplementation((args: { by: string[] }) => {
            if (args.by.includes('userId')) {
              return Promise.resolve([{ userId: USER_ID, _sum: { amount: MTD_SAR } }]);
            }
            if (args.by.includes('dateKey')) {
              return Promise.resolve([{ dateKey: `${MONTH}-01`, _sum: { amount: MTD_SAR } }]);
            }
            return Promise.resolve([]);
          }),
        },
        user: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    }));

    const { getDashboardSalesMetrics, getPerformanceSummary } = await import('@/lib/metrics/aggregator');

    const [dashboard, summary] = await Promise.all([
      getDashboardSalesMetrics({
        boutiqueId: BOUTIQUE_ID,
        monthKey: MONTH,
        employeeOnly: false,
      }),
      getPerformanceSummary({
        boutiqueId: BOUTIQUE_ID,
        monthKey: MONTH,
        employeeOnly: false,
      }),
    ]);

    expect(dashboard.hasMonthlyTarget).toBe(true);
    expect(dashboard.currentMonthTarget).toBe(TARGET_SAR);
    expect(summary.hasMonthlyTarget).toBe(true);
    expect(summary.monthlyTargetSar).toBe(TARGET_SAR);
    expect(dashboard.currentMonthActual).toBe(MTD_SAR);
    expect(summary.monthly.sales).toBe(MTD_SAR);
  });
});

describe('executive monthly canonical revenue', () => {
  it('uses getBoutiqueTarget and aggregateSalesEntrySum for KPI revenue', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/executive/monthly/route.ts'),
      'utf-8'
    );
    expect(src).toContain('getBoutiqueTarget');
    expect(src).toContain('aggregateSalesEntrySum');
    expect(src).toContain('const revenue = salesEntryRevenue');
    expect(src).not.toMatch(/manualLinesTotal > 0 \? manualLinesTotal/);
  });
});
