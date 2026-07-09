/**
 * Performance Hub — employee selector roster and employee-mode payload.
 */

const db = {
  employee: { findMany: jest.fn() },
  salesEntry: { groupBy: jest.fn() },
  boutiqueMonthlyTarget: { findMany: jest.fn() },
  employeeMonthlyTarget: { findMany: jest.fn() },
};
jest.mock('@/lib/db', () => ({ prisma: db }));

import {
  filterHubEmployeeOptions,
  loadHubEmployeeRoster,
} from '@/lib/performance/hubEmployeeOptions';
import { buildPerformanceHubPayload } from '@/lib/performance/hubEngine';
import type { PerformanceHubContext } from '@/lib/performance/hubScope';

const BOUTIQUE_A = 'boutique-a';
const BOUTIQUE_B = 'boutique-b';
const USER_1 = 'user-1';
const USER_2 = 'user-2';

const baseCtx: PerformanceHubContext = {
  userId: 'manager-1',
  role: 'MANAGER',
  allowedBoutiqueIds: [BOUTIQUE_A],
  boutiques: [{ id: BOUTIQUE_A, code: '03', name: 'Dhahran', regionId: null }],
  regions: [],
  canCompareBoutiques: false,
  canCompareRegions: false,
  defaultBoutiqueIds: [BOUTIQUE_A],
};

beforeEach(() => {
  jest.clearAllMocks();
  db.employee.findMany.mockResolvedValue([
    {
      empId: '1101',
      name: 'Sara',
      boutiqueId: BOUTIQUE_A,
      active: true,
      boutique: { name: 'Dhahran' },
      user: { id: USER_1 },
    },
    {
      empId: '2011',
      name: 'Omar',
      boutiqueId: BOUTIQUE_A,
      active: true,
      boutique: { name: 'Dhahran' },
      user: { id: USER_2 },
    },
  ]);
  db.salesEntry.groupBy.mockResolvedValue([]);
  db.employeeMonthlyTarget.findMany.mockResolvedValue([]);
});

describe('loadHubEmployeeRoster', () => {
  it('returns active employees for boutique from Employee.boutiqueId', async () => {
    const roster = await loadHubEmployeeRoster([BOUTIQUE_A]);

    expect(db.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          boutiqueId: BOUTIQUE_A,
          active: true,
          isSystemOnly: false,
        }),
      })
    );
    expect(roster).toHaveLength(2);
    expect(roster[0]).toMatchObject({
      userId: USER_1,
      empId: '1101',
      name: 'Sara',
      boutiqueId: BOUTIQUE_A,
      boutiqueName: 'Dhahran',
      active: true,
    });
  });
});

describe('filterHubEmployeeOptions', () => {
  const options = [
    {
      userId: USER_1,
      empId: '1101',
      name: 'Sara',
      boutiqueId: BOUTIQUE_A,
      boutiqueName: 'Dhahran',
      active: true,
    },
    {
      userId: USER_2,
      empId: '2011',
      name: 'Omar',
      boutiqueId: BOUTIQUE_B,
      boutiqueName: 'Riyadh',
      active: true,
    },
  ];

  it('filters options to selected boutique', () => {
    const filtered = filterHubEmployeeOptions(options, [BOUTIQUE_A]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.empId).toBe('1101');
  });
});

describe('buildPerformanceHubPayload employee mode', () => {
  it('includes employees with zero sales and zero target', async () => {
    const payload = await buildPerformanceHubPayload({
      ctx: baseCtx,
      entity: 'employees',
      period: 'month',
      anchorDateKey: '2026-01-15',
      compareMode: 'none',
      boutiqueIds: [BOUTIQUE_A],
      regionIds: [],
      employeeUserId: null,
    });

    expect(payload.employees).toHaveLength(2);
    expect(payload.employees.every((e) => e.actualSales === 0 && e.targetSales === 0)).toBe(true);
  });

  it('filters rows when employeeUserId is set', async () => {
    const payload = await buildPerformanceHubPayload({
      ctx: baseCtx,
      entity: 'employees',
      period: 'month',
      anchorDateKey: '2026-01-15',
      compareMode: 'none',
      boutiqueIds: [BOUTIQUE_A],
      regionIds: [],
      employeeUserId: USER_1,
    });

    expect(payload.employees).toHaveLength(1);
    expect(payload.employees[0]?.userId).toBe(USER_1);
    expect(payload.employees[0]?.empId).toBe('1101');
  });

  it('calculates sales, target, and achievement from reporting data', async () => {
    db.salesEntry.groupBy.mockResolvedValue([
      { userId: USER_1, _sum: { amount: 5000, invoiceCount: 10, pieceCount: 20 } },
    ]);
    db.employeeMonthlyTarget.findMany.mockResolvedValue([{ month: '2026-01', amount: 10000 }]);

    const payload = await buildPerformanceHubPayload({
      ctx: baseCtx,
      entity: 'employees',
      period: 'month',
      anchorDateKey: '2026-01-15',
      compareMode: 'none',
      boutiqueIds: [BOUTIQUE_A],
      regionIds: [],
      employeeUserId: null,
    });

    const sara = payload.employees.find((e) => e.userId === USER_1);
    expect(sara?.actualSales).toBe(5000);
    expect(sara?.targetSales).toBeGreaterThan(0);
    expect(sara?.achievementPct).toBeGreaterThan(0);
    expect(sara?.gapSales).toBeGreaterThanOrEqual(0);
  });
});
