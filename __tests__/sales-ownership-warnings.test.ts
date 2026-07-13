import {
  buildAssignmentWarnings,
  type EmployeeAssignmentAtDate,
} from '@/lib/sales/employeeAssignmentAtDate';

describe('sales ownership warnings', () => {
  const uploadedBoutiqueId = 'bout_dhhrn_001';

  it('warns when historical assignment boutique differs from upload boutique', () => {
    const assignment: EmployeeAssignmentAtDate = {
      historicalBoutiqueId: 'bout_rashid_001',
      historicalBoutiqueName: 'Al Rashid',
      assignmentCount: 1,
      source: 'assignment',
    };
    const warnings = buildAssignmentWarnings({
      uploadedBoutiqueId,
      assignment,
      currentBoutiqueId: 'bout_dhhrn_001',
      assignmentSource: 'assignment',
    });
    expect(warnings.some((w) => w.includes('assigned to another boutique'))).toBe(true);
    expect(warnings.some((w) => w.includes('remain under uploaded boutique'))).toBe(true);
  });

  it('warns on overlapping assignments same day', () => {
    const assignment: EmployeeAssignmentAtDate = {
      historicalBoutiqueId: null,
      historicalBoutiqueName: null,
      assignmentCount: 2,
      source: 'assignment',
    };
    const warnings = buildAssignmentWarnings({
      uploadedBoutiqueId,
      assignment,
      currentBoutiqueId: uploadedBoutiqueId,
      assignmentSource: 'assignment',
    });
    expect(warnings.some((w) => w.includes('more than one boutique'))).toBe(true);
  });

  it('warns when current employee boutique differs from upload boutique', () => {
    const assignment: EmployeeAssignmentAtDate = {
      historicalBoutiqueId: uploadedBoutiqueId,
      historicalBoutiqueName: 'Dhahran',
      assignmentCount: 1,
      source: 'assignment',
    };
    const warnings = buildAssignmentWarnings({
      uploadedBoutiqueId,
      assignment,
      currentBoutiqueId: 'bout_rashid_001',
      assignmentSource: 'assignment',
    });
    expect(warnings.some((w) => w.includes('current boutique differs'))).toBe(true);
  });

  it('does not block — warnings are informational strings only', () => {
    const assignment: EmployeeAssignmentAtDate = {
      historicalBoutiqueId: 'bout_other',
      historicalBoutiqueName: 'Other',
      assignmentCount: 1,
      source: 'assignment',
    };
    const warnings = buildAssignmentWarnings({
      uploadedBoutiqueId,
      assignment,
      currentBoutiqueId: 'bout_other',
      assignmentSource: 'assignment',
    });
    expect(Array.isArray(warnings)).toBe(true);
    expect(warnings.every((w) => typeof w === 'string')).toBe(true);
  });
});

jest.mock('@/lib/db', () => ({
  prisma: {
    employee: { findUnique: jest.fn() },
    salesEntry: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

describe('collectMultiBoutiqueSameDayWarning', () => {
  const uploadBoutique = 'bout_dhhrn_001';

  it('returns warning when other boutique sales exist same day', async () => {
    const { prisma } = require('@/lib/db');
    prisma.salesEntry.findMany.mockResolvedValueOnce([
      { boutiqueId: 'bout_rashid_001', amount: 5000 },
    ]);
    const { collectMultiBoutiqueSameDayWarning } = await import('@/lib/sales/salesOwnershipWarnings');
    const warnings = await collectMultiBoutiqueSameDayWarning('user_1', '2026-01-15', uploadBoutique);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('other boutique');
  });

  it('returns empty when no cross-boutique sales', async () => {
    const { prisma } = require('@/lib/db');
    prisma.salesEntry.findMany.mockResolvedValueOnce([]);
    const { collectMultiBoutiqueSameDayWarning } = await import('@/lib/sales/salesOwnershipWarnings');
    const warnings = await collectMultiBoutiqueSameDayWarning('user_1', '2026-01-15', uploadBoutique);
    expect(warnings).toEqual([]);
  });
});
