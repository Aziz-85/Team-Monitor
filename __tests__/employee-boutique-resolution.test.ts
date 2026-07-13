/**
 * Phase 2 — central employee boutique resolution at date.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    employee: { findUnique: jest.fn() },
    employeeAssignment: { findMany: jest.fn() },
    boutique: { findUnique: jest.fn() },
  },
}));

import {
  resolveEmployeeBoutiqueAtDate,
  isEmployeeAtBoutiqueOnDate,
  buildResolutionWarningsForUpload,
} from '@/lib/employees/resolveEmployeeBoutiqueAtDate';

const { prisma } = require('@/lib/db');

const EMP_A = 'emp_a';
const BOUT_DHA = 'bout_dhhrn_001';
const BOUT_RAS = 'bout_rashid_001';
const DATE = '2026-03-15';

function mockEmployee(overrides: Record<string, unknown> = {}) {
  (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
    boutiqueId: BOUT_DHA,
    active: true,
    isSystemOnly: false,
    boutique: { id: BOUT_DHA, name: 'Dhahran' },
    user: { id: 'user_a', boutiqueId: BOUT_DHA },
    ...overrides,
  });
}

describe('resolveEmployeeBoutiqueAtDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.employeeAssignment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.boutique.findUnique as jest.Mock).mockResolvedValue({ name: 'Dhahran' });
  });

  it('employee who did not transfer — uses assignment when present', async () => {
    mockEmployee();
    (prisma.employeeAssignment.findMany as jest.Mock).mockResolvedValue([
      { boutiqueId: BOUT_DHA, boutique: { id: BOUT_DHA, name: 'Dhahran' } },
    ]);

    const r = await resolveEmployeeBoutiqueAtDate({ employeeId: EMP_A, dateKey: DATE });
    expect(r.source).toBe('EMPLOYEE_ASSIGNMENT');
    expect(r.historicalBoutiqueId).toBe(BOUT_DHA);
    expect(r.currentBoutiqueId).toBe(BOUT_DHA);
  });

  it('employee transferred — historical assignment on date differs from current', async () => {
    mockEmployee({ boutiqueId: BOUT_RAS });
    (prisma.employeeAssignment.findMany as jest.Mock).mockResolvedValue([
      { boutiqueId: BOUT_DHA, boutique: { id: BOUT_DHA, name: 'Dhahran' } },
    ]);

    const r = await resolveEmployeeBoutiqueAtDate({ employeeId: EMP_A, dateKey: DATE });
    expect(r.source).toBe('EMPLOYEE_ASSIGNMENT');
    expect(r.historicalBoutiqueId).toBe(BOUT_DHA);
    expect(r.currentBoutiqueId).toBe(BOUT_RAS);
  });

  it('overlapping assignments — ambiguous historical boutique', async () => {
    mockEmployee();
    (prisma.employeeAssignment.findMany as jest.Mock).mockResolvedValue([
      { boutiqueId: BOUT_DHA, boutique: { id: BOUT_DHA, name: 'Dhahran' } },
      { boutiqueId: BOUT_RAS, boutique: { id: BOUT_RAS, name: 'Rashid' } },
    ]);

    const r = await resolveEmployeeBoutiqueAtDate({ employeeId: EMP_A, dateKey: DATE });
    expect(r.historicalBoutiqueId).toBeNull();
    expect(r.assignmentCount).toBe(2);
    expect(r.warnings.some((w) => w.includes('multiple boutiques'))).toBe(true);
  });

  it('employee without assignment — falls back to Employee.boutiqueId', async () => {
    mockEmployee();
    (prisma.employeeAssignment.findMany as jest.Mock).mockResolvedValue([]);

    const r = await resolveEmployeeBoutiqueAtDate({ employeeId: EMP_A, dateKey: DATE });
    expect(r.source).toBe('CURRENT_EMPLOYEE_BOUTIQUE');
    expect(r.historicalBoutiqueId).toBe(BOUT_DHA);
    expect(r.warnings.some((w) => w.includes('No EmployeeAssignment'))).toBe(true);
  });

  it('inactive employee — warning included', async () => {
    mockEmployee({ active: false });
    const r = await resolveEmployeeBoutiqueAtDate({ employeeId: EMP_A, dateKey: DATE });
    expect(r.active).toBe(false);
    expect(r.warnings.some((w) => w.includes('inactive'))).toBe(true);
  });

  it('system-only employee — warning included', async () => {
    mockEmployee({ isSystemOnly: true });
    const r = await resolveEmployeeBoutiqueAtDate({ employeeId: EMP_A, dateKey: DATE });
    expect(r.isSystemOnly).toBe(true);
    expect(r.warnings.some((w) => w.includes('system-only'))).toBe(true);
  });

  it('employee without User — hasUser false and warning', async () => {
    mockEmployee({ user: null });
    const r = await resolveEmployeeBoutiqueAtDate({ employeeId: EMP_A, dateKey: DATE });
    expect(r.hasUser).toBe(false);
    expect(r.warnings.some((w) => w.includes('no linked User'))).toBe(true);
  });

  it('unknown employee — UNRESOLVED', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(null);
    const r = await resolveEmployeeBoutiqueAtDate({ employeeId: 'missing', dateKey: DATE });
    expect(r.source).toBe('UNRESOLVED');
    expect(r.historicalBoutiqueId).toBeNull();
  });

  it('USER_BOUTIQUE compatibility when Employee.boutiqueId missing', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      boutiqueId: '',
      active: true,
      isSystemOnly: false,
      boutique: null,
      user: { id: 'user_a', boutiqueId: BOUT_DHA },
    });
    (prisma.boutique.findUnique as jest.Mock).mockResolvedValue({ name: 'Dhahran' });

    const r = await resolveEmployeeBoutiqueAtDate({ employeeId: EMP_A, dateKey: DATE });
    expect(r.source).toBe('USER_BOUTIQUE');
    expect(r.historicalBoutiqueId).toBe(BOUT_DHA);
  });
});

describe('isEmployeeAtBoutiqueOnDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEmployee();
    (prisma.employeeAssignment.findMany as jest.Mock).mockResolvedValue([
      { boutiqueId: BOUT_DHA, boutique: { id: BOUT_DHA, name: 'Dhahran' } },
    ]);
  });

  it('returns true when historical boutique matches', async () => {
    expect(await isEmployeeAtBoutiqueOnDate(EMP_A, BOUT_DHA, DATE)).toBe(true);
  });

  it('returns false when historical boutique differs', async () => {
    expect(await isEmployeeAtBoutiqueOnDate(EMP_A, BOUT_RAS, DATE)).toBe(false);
  });
});

describe('buildResolutionWarningsForUpload', () => {
  it('warns when historical boutique differs from upload boutique', () => {
    const warnings = buildResolutionWarningsForUpload(
      {
        employeeId: EMP_A,
        dateKey: DATE,
        currentBoutiqueId: BOUT_DHA,
        historicalBoutiqueId: BOUT_RAS,
        historicalBoutiqueName: 'Rashid',
        source: 'EMPLOYEE_ASSIGNMENT',
        assignmentCount: 1,
        active: true,
        isSystemOnly: false,
        hasUser: true,
        warnings: [],
      },
      BOUT_DHA
    );
    expect(warnings.some((w) => w.includes('assigned to another boutique'))).toBe(true);
  });
});
