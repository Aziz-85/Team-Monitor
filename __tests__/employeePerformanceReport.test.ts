/**
 * Employee performance report — totals, boutique breakdown, cross-boutique warnings.
 */

const db = {
  salesEntry: { findMany: jest.fn() },
  employeeMonthlyTarget: { findMany: jest.fn() },
  boutique: { findMany: jest.fn() },
};
jest.mock('@/lib/db', () => ({ prisma: db }));

import { buildEmployeePerformanceReport } from '@/lib/sales/employeePerformanceReport';

const BOUTIQUE_A = 'boutique-a';
const BOUTIQUE_B = 'boutique-b';
const USER_1 = 'user-1';

beforeEach(() => {
  jest.clearAllMocks();
  db.employeeMonthlyTarget.findMany.mockResolvedValue([{ userId: USER_1, amount: 10000 }]);
  db.boutique.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.map((id) => ({
      id,
      name: id === BOUTIQUE_A ? 'Dhahran' : 'Riyadh',
    }))
  );
});

describe('buildEmployeePerformanceReport', () => {
  it('shows employee total sales and breakdown by boutique', async () => {
    db.salesEntry.findMany
      .mockResolvedValueOnce([{ userId: USER_1 }])
      .mockResolvedValueOnce([
        {
          userId: USER_1,
          boutiqueId: BOUTIQUE_A,
          dateKey: '2026-01-10',
          amount: 3000,
          user: { empId: '1101', employee: { name: 'Sara' } },
        },
        {
          userId: USER_1,
          boutiqueId: BOUTIQUE_B,
          dateKey: '2026-01-20',
          amount: 2000,
          user: { empId: '1101', employee: { name: 'Sara' } },
        },
      ]);

    const rows = await buildEmployeePerformanceReport({
      fromDateKey: '2026-01-01',
      toDateKey: '2026-01-31',
      boutiqueIds: [BOUTIQUE_A],
    });

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.employeeId).toBe('1101');
    expect(row.achievedAmount).toBe(5000);
    expect(row.targetAmount).toBe(10000);
    expect(row.achievementPct).toBe(50);
    expect(row.boutiqueBreakdown).toHaveLength(2);
    expect(row.boutiqueBreakdown[0]).toMatchObject({
      boutiqueName: 'Dhahran',
      salesAmount: 3000,
      percentageOfEmployeeTotal: 60,
    });
    expect(row.boutiqueBreakdown[1]).toMatchObject({
      boutiqueName: 'Riyadh',
      salesAmount: 2000,
      percentageOfEmployeeTotal: 40,
    });
  });

  it('surfaces conflict warning when employee has sales in two boutiques same date', async () => {
    db.salesEntry.findMany
      .mockResolvedValueOnce([{ userId: USER_1 }])
      .mockResolvedValueOnce([
        {
          userId: USER_1,
          boutiqueId: BOUTIQUE_A,
          dateKey: '2026-01-15',
          amount: 1000,
          user: { empId: '1101', employee: { name: 'Sara' } },
        },
        {
          userId: USER_1,
          boutiqueId: BOUTIQUE_B,
          dateKey: '2026-01-15',
          amount: 500,
          user: { empId: '1101', employee: { name: 'Sara' } },
        },
      ]);

    const rows = await buildEmployeePerformanceReport({
      fromDateKey: '2026-01-01',
      toDateKey: '2026-01-31',
      boutiqueIds: [BOUTIQUE_A],
    });

    expect(rows[0]?.warnings.some((w) => w.includes('2026-01-15'))).toBe(true);
    expect(rows[0]?.warnings.some((w) => w.includes('2 boutiques'))).toBe(true);
  });
});
