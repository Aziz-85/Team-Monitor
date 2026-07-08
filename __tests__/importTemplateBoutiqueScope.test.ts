/**
 * Boutique-scoped import template helpers tests.
 */

const db = {
  employee: { findMany: jest.fn() },
  boutique: { findUnique: jest.fn(), findFirst: jest.fn() },
};
jest.mock('@/lib/db', () => ({ prisma: db }));

jest.mock('@/lib/scope/resolveScope', () => ({
  resolveScopeForUser: jest.fn(),
}));

import { resolveScopeForUser } from '@/lib/scope/resolveScope';
import {
  loadImportTemplateEmployees,
  resolveImportTemplateBoutique,
  salesImportTemplateFilename,
  slugifyBoutiqueForFilename,
} from '@/lib/import-center/boutiqueTemplateScope';

const mockResolveScope = resolveScopeForUser as jest.MockedFunction<typeof resolveScopeForUser>;

beforeEach(() => {
  jest.clearAllMocks();
  db.employee.findMany.mockResolvedValue([
    { empId: 'D001', name: 'Sara' },
    { empId: 'D002', name: 'Omar' },
  ]);
  db.boutique.findUnique.mockResolvedValue({ id: 'b-dhahran', code: '03', name: 'Dhahran' });
});

describe('slugifyBoutiqueForFilename', () => {
  it('uses boutique code for filename slug', () => {
    expect(slugifyBoutiqueForFilename({ code: '03', name: 'Dhahran' })).toBe('03');
    expect(salesImportTemplateFilename('simple', { code: 'DH', name: 'Dhahran' })).toBe(
      'sales-import-template-simple-dh.xlsx'
    );
  });
});

describe('loadImportTemplateEmployees', () => {
  it('queries active operational employees for one boutique', async () => {
    const employees = await loadImportTemplateEmployees('b-dhahran');
    expect(employees).toEqual([
      { empId: 'D001', name: 'Sara' },
      { empId: 'D002', name: 'Omar' },
    ]);
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
});

describe('resolveImportTemplateBoutique', () => {
  it('forces single-boutique scope over mismatched query param', async () => {
    mockResolveScope.mockResolvedValue({
      scope: 'BOUTIQUE',
      boutiqueId: 'b-dhahran',
      boutiqueIds: ['b-dhahran'],
      label: 'Dhahran (03)',
    });

    const boutique = await resolveImportTemplateBoutique('u1', 'ADMIN', 'b-rashid');
    expect(boutique?.id).toBe('b-dhahran');
    expect(db.boutique.findUnique).toHaveBeenCalledWith({
      where: { id: 'b-dhahran' },
      select: { id: true, code: true, name: true },
    });
  });

  it('accepts query param when user has multi-boutique scope', async () => {
    mockResolveScope.mockResolvedValue({
      scope: 'SELECTION',
      boutiqueId: 'b-dhahran',
      boutiqueIds: ['b-dhahran', 'b-rashid'],
      label: '2 boutiques',
    });
    db.boutique.findUnique.mockResolvedValue({ id: 'b-rashid', code: '01', name: 'Rashid' });

    const boutique = await resolveImportTemplateBoutique('u1', 'SUPER_ADMIN', 'b-rashid');
    expect(boutique?.id).toBe('b-rashid');
  });
});
