/**
 * Metrics cross-page smoke tests.
 * - Asserts getDashboardSalesMetrics(employeeOnly) MTD === getTargetMetrics MTD === getSalesMetrics(month).total.
 * - Asserts resolveMetricsScope uses Employee.boutiqueId for EMPLOYEE/ASSISTANT_MANAGER when session boutique differs (transfer scenario).
 * - API-level: GET /api/metrics/dashboard and GET /api/metrics/my-target return same MTD for same scope/month (employee branch).
 */

import { getMonthRange } from '@/lib/time';

/** Build a minimal NextRequest with optional search params. */
function nextRequest(url = 'http://localhost/', search?: Record<string, string>): import('next/server').NextRequest {
  const u = new URL(url);
  if (search) Object.entries(search).forEach(([k, v]) => u.searchParams.set(k, v));
  return { nextUrl: u } as unknown as import('next/server').NextRequest;
}

const BOUTIQUE_ID = 'boutique-B1';
const USER_ID = 'user-u1';
const MONTH_KEY = '2026-02';
/** MTD in halalas (API unit). Mock DB stores SAR, so raw amount in DB = FIXTURE_MTD_HALALAS / 100. */
const FIXTURE_MTD_HALALAS = 5000;
const FIXTURE_MTD_SAR = FIXTURE_MTD_HALALAS / 100; // 50 SAR

describe('metrics-crosspage: MTD consistency across aggregator outputs', () => {
  beforeAll(() => {
    jest.resetModules();
  });

  it('dashboard currentMonthActual === target mtdSales === sales netSalesTotal for same scope (mocked Prisma)', async () => {
    const prismaMock = {
      salesEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: FIXTURE_MTD_SAR }, _count: { id: 3 } }),
        groupBy: jest.fn().mockImplementation((args: { by: string[] }) => {
          if (args.by.includes('userId')) {
            return Promise.resolve([{ userId: USER_ID, _sum: { amount: FIXTURE_MTD_SAR } }]);
          }
          return Promise.resolve([
            { dateKey: '2026-02-01', _sum: { amount: 20 } },
            { dateKey: '2026-02-02', _sum: { amount: 30 } },
          ]);
        }),
        findMany: jest.fn().mockResolvedValue([{ amount: FIXTURE_MTD_SAR }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      employeeMonthlyTarget: { findFirst: jest.fn().mockResolvedValue({ amount: 100 }) }, // 100 SAR → 10000 halalas
      boutiqueMonthlyTarget: { findFirst: jest.fn().mockResolvedValue({ amount: 500 }) }, // 500 SAR → 50000 halalas
    };

    jest.doMock('@/lib/db', () => ({ prisma: prismaMock }));
    jest.doMock('@/lib/time', () => {
      const actual = jest.requireActual<typeof import('@/lib/time')>('@/lib/time');
      return {
        ...actual,
        getRiyadhNow: jest.fn().mockReturnValue(new Date(Date.UTC(2026, 1, 15, 12, 0, 0))),
      };
    });

    const { getDashboardSalesMetrics, getTargetMetrics, getSalesMetrics } = await import(
      '@/lib/metrics/aggregator'
    );
    const { start: monthStart, endExclusive: monthEndExclusive } = getMonthRange(MONTH_KEY);

    const [dashboard, target, sales] = await Promise.all([
      getDashboardSalesMetrics({
        boutiqueId: BOUTIQUE_ID,
        userId: USER_ID,
        monthKey: MONTH_KEY,
        employeeOnly: true,
      }),
      getTargetMetrics({ boutiqueId: BOUTIQUE_ID, userId: USER_ID, monthKey: MONTH_KEY }),
      getSalesMetrics({
        boutiqueId: BOUTIQUE_ID,
        userId: USER_ID,
        from: monthStart,
        toExclusive: monthEndExclusive,
      }),
    ]);

    expect(dashboard.currentMonthActual).toBe(FIXTURE_MTD_HALALAS);
    expect(target.mtdSales).toBe(FIXTURE_MTD_HALALAS);
    expect(sales.netSalesTotal).toBe(FIXTURE_MTD_HALALAS);
    expect(dashboard.currentMonthActual).toBe(target.mtdSales);
    expect(target.mtdSales).toBe(sales.netSalesTotal);
  });
});

describe('metrics-crosspage: resolveMetricsScope uses Employee.boutiqueId for EMPLOYEE when session differs', () => {
  const EMPLOYEE_BOUTIQUE = 'employee-boutique-id';
  const SESSION_BOUTIQUE = 'session-boutique-id';

  it('EMPLOYEE: effectiveBoutiqueId is Employee.boutiqueId not session boutique', async () => {
    jest.resetModules();
    const getSessionUser = jest.fn().mockResolvedValue({
      id: 'user-1',
      role: 'EMPLOYEE',
      empId: 'E1',
      boutiqueId: SESSION_BOUTIQUE,
      boutique: { name: 'Session Boutique', code: 'S' },
    });
    const getEmployeeBoutiqueIdForUser = jest.fn().mockResolvedValue(EMPLOYEE_BOUTIQUE);

    jest.doMock('@/lib/auth', () => ({ getSessionUser }));
    jest.doMock('@/lib/boutique/resolveOperationalBoutique', () => ({
      getEmployeeBoutiqueIdForUser,
    }));
    jest.doMock('@/lib/scope/operationalScope', () => ({ getOperationalScope: jest.fn() }));

    const { resolveMetricsScope } = await import('@/lib/metrics/scope');
    const scope = await resolveMetricsScope(null as unknown as import('next/server').NextRequest);

    expect(scope).not.toBeNull();
    expect(scope?.effectiveBoutiqueId).toBe(EMPLOYEE_BOUTIQUE);
    expect(scope?.effectiveBoutiqueId).not.toBe(SESSION_BOUTIQUE);
    expect(scope?.employeeOnly).toBe(true);
    expect(getEmployeeBoutiqueIdForUser).toHaveBeenCalledWith('user-1');
  });

  it('ASSISTANT_MANAGER: effectiveBoutiqueId is Employee.boutiqueId not session boutique', async () => {
    jest.resetModules();
    const getSessionUser = jest.fn().mockResolvedValue({
      id: 'user-2',
      role: 'ASSISTANT_MANAGER',
      empId: 'E2',
      boutiqueId: SESSION_BOUTIQUE,
      boutique: { name: 'Session Boutique', code: 'S' },
    });
    const getEmployeeBoutiqueIdForUser = jest.fn().mockResolvedValue(EMPLOYEE_BOUTIQUE);

    jest.doMock('@/lib/auth', () => ({ getSessionUser }));
    jest.doMock('@/lib/boutique/resolveOperationalBoutique', () => ({
      getEmployeeBoutiqueIdForUser,
    }));
    jest.doMock('@/lib/scope/operationalScope', () => ({ getOperationalScope: jest.fn() }));

    const { resolveMetricsScope } = await import('@/lib/metrics/scope');
    const scope = await resolveMetricsScope(null as unknown as import('next/server').NextRequest);

    expect(scope).not.toBeNull();
    expect(scope?.effectiveBoutiqueId).toBe(EMPLOYEE_BOUTIQUE);
    expect(scope?.effectiveBoutiqueId).not.toBe(SESSION_BOUTIQUE);
    expect(getEmployeeBoutiqueIdForUser).toHaveBeenCalledWith('user-2');
  });
});

describe('metrics-crosspage: API same-month MTD equality (employee branch)', () => {
  const FIXTURE_MTD_HALALAS = 5000;
  const MONTH_KEY = '2026-02';

  it('GET /api/metrics/dashboard and GET /api/metrics/my-target return same MTD for same scope and month', async () => {
    jest.resetModules();
    const scope = {
      userId: 'u1',
      role: 'EMPLOYEE' as const,
      empId: 'E1',
      effectiveBoutiqueId: 'B1',
      employeeOnly: true,
      label: 'Boutique 1',
    };
    jest.doMock('@/lib/metrics/scope', () => ({
      resolveMetricsScope: jest.fn().mockResolvedValue(scope),
    }));
    jest.doMock('@/lib/metrics/aggregator', () => ({
      getDashboardSalesMetrics: jest.fn().mockResolvedValue({
        currentMonthTarget: 10000, // halalas
        currentMonthActual: FIXTURE_MTD_HALALAS,
        completionPct: 50,
        remainingGap: 5000,
        byUserId: { u1: FIXTURE_MTD_HALALAS },
      }),
      getTargetMetrics: jest.fn().mockResolvedValue({
        monthKey: MONTH_KEY,
        monthTarget: 10000, // halalas
        boutiqueTarget: 50000, // halalas
        mtdSales: FIXTURE_MTD_HALALAS,
        todaySales: 0,
        weekSales: 0,
        dailyTarget: 357,
        weekTarget: 2500,
        remaining: 5000,
        pctDaily: 0,
        pctWeek: 0,
        pctMonth: 50,
        todayStr: '2026-02-15',
        todayInSelectedMonth: true,
        weekRangeLabel: '2026-02-14 – 2026-02-20',
        daysInMonth: 28,
        leaveDaysInMonth: null,
        presenceFactor: null,
        scheduledDaysInMonth: null,
      }),
    }));
    jest.doMock('@/lib/time', () => ({
      ...jest.requireActual('@/lib/time'),
      getRiyadhNow: jest.fn().mockReturnValue(new Date(Date.UTC(2026, 1, 15, 12, 0, 0))),
    }));

    const dashboardRoute = await import('@/app/api/metrics/dashboard/route');
    const myTargetRoute = await import('@/app/api/metrics/my-target/route');

    const dashboardRes = await dashboardRoute.GET(nextRequest('http://localhost/api/metrics/dashboard'));
    const myTargetRes = await myTargetRoute.GET(nextRequest('http://localhost/api/metrics/my-target', { month: MONTH_KEY }));

    expect(dashboardRes.status).toBe(200);
    expect(myTargetRes.status).toBe(200);

    const dashboardBody = await dashboardRes.json();
    const myTargetBody = await myTargetRes.json();

    expect(dashboardBody.sales?.currentMonthActual).toBe(FIXTURE_MTD_HALALAS);
    expect(myTargetBody.mtdSales).toBe(FIXTURE_MTD_HALALAS);
    expect(dashboardBody.sales?.currentMonthActual).toBe(myTargetBody.mtdSales);
  });
});
