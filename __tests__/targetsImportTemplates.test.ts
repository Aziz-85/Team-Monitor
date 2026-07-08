/**
 * Boutique-aware target import template tests.
 */

import * as XLSX from 'xlsx';

const db = {
  boutique: { findUnique: jest.fn(), findMany: jest.fn() },
  employee: { findMany: jest.fn() },
  boutiqueMonthlyTarget: { findMany: jest.fn() },
};
jest.mock('@/lib/db', () => ({ prisma: db }));

jest.mock('@/lib/scope/operationalScope', () => ({
  getOperationalScope: jest.fn(),
}));
jest.mock('@/lib/scope/resolveScope', () => ({
  resolveScopeForUser: jest.fn(),
}));
jest.mock('@/lib/auth', () => ({
  getSessionUser: jest.fn(),
}));

import { getOperationalScope } from '@/lib/scope/operationalScope';
import { resolveScopeForUser } from '@/lib/scope/resolveScope';
import { getSessionUser } from '@/lib/auth';
import {
  buildBoutiqueTargetsImportTemplate,
  buildEmployeeTargetsImportTemplate,
} from '@/lib/targets/buildBoutiqueAwareTemplates';
import { BOUTIQUE_HEADERS, BOUTIQUE_SHEET, EMPLOYEE_HEADERS, EMPLOYEE_SHEET } from '@/lib/targets/templates';
import { resolveTargetsTemplateBoutique } from '@/lib/targets/templateScope';
import { downloadEmployeeTargetsTemplate } from '@/lib/targets/templateDownload';
import { NextRequest } from 'next/server';

const mockGetOperationalScope = getOperationalScope as jest.MockedFunction<typeof getOperationalScope>;
const mockResolveScopeForUser = resolveScopeForUser as jest.MockedFunction<typeof resolveScopeForUser>;
const mockGetSessionUser = getSessionUser as jest.MockedFunction<typeof getSessionUser>;

const DHAHRAN = { id: 'b-dhahran', code: '03', name: 'Dhahran' };
const RASHID = { id: 'b-rashid', code: '01', name: 'Rashid' };

beforeEach(() => {
  jest.clearAllMocks();
  db.boutiqueMonthlyTarget.findMany.mockResolvedValue([]);
  db.employee.findMany.mockResolvedValue([
    { empId: 'D001', name: 'Sara', position: 'SENIOR_SALES' },
    { empId: 'D002', name: 'Omar', position: 'SALES' },
  ]);
});

describe('buildBoutiqueTargetsImportTemplate', () => {
  it('contains current boutique metadata and 12 month rows', async () => {
    const buf = await buildBoutiqueTargetsImportTemplate({
      boutique: DHAHRAN,
      startMonth: '2026-07',
      generatedBy: 'user-1',
    });
    const wb = XLSX.read(buf, { type: 'buffer' });
    expect(wb.SheetNames).toContain(BOUTIQUE_SHEET);
    expect(wb.SheetNames).toContain('README');
    expect(wb.SheetNames).toContain('_METADATA');

    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[BOUTIQUE_SHEET], {
      header: BOUTIQUE_HEADERS,
      range: 0,
      defval: '',
    });
    const rows = data.filter((r) => String(r.Month) !== 'Month' && String(r.Month) !== '');
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ Month: '2026-07', ScopeId: '03', BoutiqueName: 'Dhahran' });
    expect(rows.every((r) => r.ScopeId === '03')).toBe(true);
  });
});

describe('buildEmployeeTargetsImportTemplate', () => {
  it('includes only boutique employees with empId, name, and target column', async () => {
    const buf = await buildEmployeeTargetsImportTemplate({
      boutique: DHAHRAN,
      month: '2026-07',
      generatedBy: 'user-1',
    });
    const wb = XLSX.read(buf, { type: 'buffer' });
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[EMPLOYEE_SHEET], {
      header: EMPLOYEE_HEADERS,
      range: 0,
      defval: '',
    });
    const rows = data.filter((r) => String(r.Month) === '2026-07');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      Month: '2026-07',
      ScopeId: '03',
      EmployeeCode: 'D001',
      EmployeeName: 'Sara',
    });
    expect(rows[0]).toHaveProperty('Target');
    expect(db.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          isSystemOnly: false,
          boutiqueId: { in: ['b-dhahran'] },
        }),
      })
    );
  });

  it('excludes inactive employees via operational employee query', async () => {
    db.employee.findMany.mockResolvedValue([{ empId: 'D001', name: 'Sara', position: 'SALES' }]);
    await buildEmployeeTargetsImportTemplate({
      boutique: DHAHRAN,
      month: '2026-07',
      generatedBy: 'user-1',
    });
    const where = db.employee.findMany.mock.calls[0][0].where;
    expect(where.active).toBe(true);
    expect(where.isSystemOnly).toBe(false);
  });
});

describe('resolveTargetsTemplateBoutique', () => {
  it('uses operational boutique when in scope', async () => {
    mockGetOperationalScope.mockResolvedValue({
      userId: 'u1',
      role: 'MANAGER',
      empId: null,
      boutiqueId: 'b-dhahran',
      boutiqueIds: ['b-dhahran'],
      label: 'Dhahran',
    });
    mockResolveScopeForUser.mockResolvedValue({
      scope: 'BOUTIQUE',
      boutiqueId: 'b-dhahran',
      boutiqueIds: ['b-dhahran'],
      label: 'Dhahran',
    });
    db.boutique.findUnique.mockResolvedValue(DHAHRAN);

    const boutique = await resolveTargetsTemplateBoutique(null, {
      userId: 'u1',
      role: 'MANAGER',
      allowedBoutiqueIds: ['b-dhahran'],
      canView: true,
      canEdit: true,
      canImport: true,
    });
    expect(boutique?.id).toBe('b-dhahran');
  });

  it('does not return another boutique outside operational scope', async () => {
    mockGetOperationalScope.mockResolvedValue({
      userId: 'u1',
      role: 'MANAGER',
      empId: null,
      boutiqueId: 'b-dhahran',
      boutiqueIds: ['b-dhahran'],
      label: 'Dhahran',
    });
    mockResolveScopeForUser.mockResolvedValue({
      scope: 'BOUTIQUE',
      boutiqueId: 'b-dhahran',
      boutiqueIds: ['b-dhahran'],
      label: 'Dhahran',
    });
    db.boutique.findUnique.mockResolvedValue(DHAHRAN);

    const boutique = await resolveTargetsTemplateBoutique(null, {
      userId: 'u1',
      role: 'MANAGER',
      allowedBoutiqueIds: ['b-dhahran'],
      canView: true,
      canEdit: true,
      canImport: true,
    });
    expect(boutique?.id).not.toBe('b-rashid');
  });
});

describe('downloadEmployeeTargetsTemplate authorization', () => {
  it('rejects users without import permission', async () => {
    mockGetSessionUser.mockResolvedValue({
      id: 'u1',
      role: 'ASSISTANT_MANAGER',
      boutiqueId: 'b-dhahran',
    } as never);
    mockGetOperationalScope.mockResolvedValue({
      userId: 'u1',
      role: 'ASSISTANT_MANAGER',
      empId: null,
      boutiqueId: 'b-dhahran',
      boutiqueIds: ['b-dhahran'],
      label: 'Dhahran',
    });

    const req = new NextRequest('http://localhost/api/targets/template/employee?month=2026-07');
    const res = await downloadEmployeeTargetsTemplate(req);
    expect(res.status).toBe(403);
  });

  it('rejects download when operational boutique cannot be resolved', async () => {
    db.boutique.findMany.mockResolvedValue([{ id: 'b-dhahran' }, { id: 'b-rashid' }]);
    mockGetSessionUser.mockResolvedValue({
      id: 'u1',
      role: 'SUPER_ADMIN',
      boutiqueId: null,
    } as never);
    mockGetOperationalScope.mockResolvedValue(null);
    mockResolveScopeForUser.mockResolvedValue({
      scope: 'SELECTION',
      boutiqueId: 'b-dhahran',
      boutiqueIds: ['b-dhahran', 'b-rashid'],
      label: '2 boutiques',
    });

    const req = new NextRequest('http://localhost/api/targets/template/employee?month=2026-07');
    const res = await downloadEmployeeTargetsTemplate(req);
    expect(res.status).toBe(403);
  });
});
