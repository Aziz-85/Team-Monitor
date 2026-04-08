/**
 * Employee target APIs should pass the same cross-boutique flag for the same logical scope
 * (/api/me/targets vs /api/metrics/my-target).
 */

function nextRequest(url: string, search?: Record<string, string>): import('next/server').NextRequest {
  const u = new URL(url);
  if (search) Object.entries(search).forEach(([k, v]) => u.searchParams.set(k, v));
  return { nextUrl: u } as unknown as import('next/server').NextRequest;
}

const minimalMetrics = {
  monthKey: '2026-02',
  monthTarget: 0,
  boutiqueTarget: 0,
  todaySales: 0,
  weekSales: 0,
  mtdSales: 0,
  dailyTarget: 0,
  weekTarget: 0,
  reportingDailyAllocationSar: 0,
  reportingWeeklyAllocationSar: 0,
  paceDailyRequiredSar: 0,
  paceWeeklyRequiredSar: 0,
  remainingMonthTargetSar: 0,
  remaining: 0,
  pctDaily: 0,
  pctWeek: 0,
  pctMonth: 0,
  daysInMonth: 28,
  todayStr: '2026-02-15',
  todayInSelectedMonth: true,
  dailyAchievementPending: false,
  monthlyTargetMet: false,
  weekRangeLabel: '',
  leaveDaysInMonth: null as number | null,
  presenceFactor: null as number | null,
  scheduledDaysInMonth: null as number | null,
};

describe('targets API parity: employeeCrossBoutique', () => {
  it('EMPLOYEE: both GET /api/me/targets and GET /api/metrics/my-target call getTargetMetrics with employeeCrossBoutique true', async () => {
    jest.resetModules();
    const getTargetMetrics = jest.fn().mockResolvedValue(minimalMetrics);
    const scopeEmployee = {
      userId: 'u1',
      role: 'EMPLOYEE' as const,
      empId: 'E1',
      effectiveBoutiqueId: 'B1',
      employeeOnly: true,
      label: 'B1',
    };
    jest.doMock('@/lib/metrics/aggregator', () => ({ getTargetMetrics }));
    jest.doMock('@/lib/metrics/scope', () => ({
      resolveMetricsScope: jest.fn().mockResolvedValue(scopeEmployee),
    }));
    jest.doMock('@/lib/auth', () => ({
      getSessionUser: jest.fn().mockResolvedValue({ id: 'u1' }),
    }));
    jest.doMock('@/lib/time', () => ({
      ...jest.requireActual<typeof import('@/lib/time')>('@/lib/time'),
      formatMonthKey: jest.fn().mockReturnValue('2026-02'),
      normalizeMonthKey: jest.fn((s: string) => s),
    }));

    const meTargetsRoute = await import('@/app/api/me/targets/route');
    const myTargetRoute = await import('@/app/api/metrics/my-target/route');

    const r1 = await meTargetsRoute.GET(nextRequest('http://localhost/api/me/targets', { month: '2026-02' }));
    const r2 = await myTargetRoute.GET(nextRequest('http://localhost/api/metrics/my-target', { month: '2026-02' }));

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(getTargetMetrics).toHaveBeenCalledTimes(2);
    expect(getTargetMetrics.mock.calls[0][0].employeeCrossBoutique).toBe(true);
    expect(getTargetMetrics.mock.calls[1][0].employeeCrossBoutique).toBe(true);
  });

  it('MANAGER: both APIs call getTargetMetrics with employeeCrossBoutique false', async () => {
    jest.resetModules();
    const getTargetMetrics = jest.fn().mockResolvedValue(minimalMetrics);
    const scopeManager = {
      userId: 'u-m',
      role: 'MANAGER' as const,
      empId: 'M1',
      effectiveBoutiqueId: 'B1',
      employeeOnly: false,
      label: 'B1',
    };
    jest.doMock('@/lib/metrics/aggregator', () => ({ getTargetMetrics }));
    jest.doMock('@/lib/metrics/scope', () => ({
      resolveMetricsScope: jest.fn().mockResolvedValue(scopeManager),
    }));
    jest.doMock('@/lib/auth', () => ({
      getSessionUser: jest.fn().mockResolvedValue({ id: 'u-m' }),
    }));
    jest.doMock('@/lib/time', () => ({
      ...jest.requireActual<typeof import('@/lib/time')>('@/lib/time'),
      formatMonthKey: jest.fn().mockReturnValue('2026-02'),
      normalizeMonthKey: jest.fn((s: string) => s),
      getRiyadhNow: jest.fn().mockReturnValue(new Date(Date.UTC(2026, 1, 15, 12, 0, 0))),
    }));

    const meTargetsRoute = await import('@/app/api/me/targets/route');
    const myTargetRoute = await import('@/app/api/metrics/my-target/route');

    await meTargetsRoute.GET(nextRequest('http://localhost/api/me/targets', { month: '2026-02' }));
    await myTargetRoute.GET(nextRequest('http://localhost/api/metrics/my-target', { month: '2026-02' }));

    expect(getTargetMetrics.mock.calls[0][0].employeeCrossBoutique).toBe(false);
    expect(getTargetMetrics.mock.calls[1][0].employeeCrossBoutique).toBe(false);
  });
});
