/**
 * SSOT scope helpers: requireOperationalBoutiqueOnly, resolveBoutiqueIdsOptionalGlobal.
 * Unit tests with mocked dependencies.
 */

import { NextRequest } from 'next/server';
import {
  requireOperationalBoutiqueOnly,
  resolveOperationalBoutiqueOnly,
  resolveBoutiqueIdsOptionalGlobal,
} from '@/lib/scope/ssot';
import { whereBoutiqueStrict } from '@/lib/scope/whereStrict';

jest.mock('@/lib/scope/operationalScope', () => ({
  getOperationalScope: jest.fn(),
}));

jest.mock('@/lib/boutique/resolveOperationalBoutique', () => ({
  getEmployeeBoutiqueIdForUser: jest.fn(),
}));

jest.mock('@/lib/admin/audit', () => ({
  writeAdminAudit: jest.fn().mockResolvedValue(undefined),
}));

const mockBoutiqueFindMany = jest.fn();
jest.mock('@/lib/db', () => ({
  prisma: {
    boutique: { findMany: (...args: unknown[]) => mockBoutiqueFindMany(...args) },
  },
}));

const { getOperationalScope } = require('@/lib/scope/operationalScope');
const { getEmployeeBoutiqueIdForUser } = require('@/lib/boutique/resolveOperationalBoutique');

function mockRequest(search = ''): NextRequest {
  return { nextUrl: { searchParams: new URLSearchParams(search) } } as unknown as NextRequest;
}

describe('requireOperationalBoutiqueOnly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when user is null', async () => {
    const result = await requireOperationalBoutiqueOnly(mockRequest(), null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.res.status).toBe(401);
      return;
    }
  });

  it('returns single boutique when MANAGER has operational scope', async () => {
    (getOperationalScope as jest.Mock).mockResolvedValue({
      boutiqueId: 'boutique-1',
      boutiqueIds: ['boutique-1'],
      label: 'Boutique A',
    });
    (getEmployeeBoutiqueIdForUser as jest.Mock).mockResolvedValue(null);

    const user = { id: 'u1', role: 'MANAGER', boutiqueId: 'boutique-1', boutique: { name: 'Boutique A', code: 'BA' } };
    const result = await requireOperationalBoutiqueOnly(mockRequest(), user);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.boutiqueIds).toEqual(['boutique-1']);
    expect(result.boutiqueId).toBe('boutique-1');
    expect(result.boutiqueIds).toHaveLength(1);
  });

  it('returns single boutique when EMPLOYEE has employee boutique', async () => {
    (getEmployeeBoutiqueIdForUser as jest.Mock).mockResolvedValue('emp-boutique-1');

    const user = { id: 'u1', role: 'EMPLOYEE', boutiqueId: null, boutique: null };
    const result = await requireOperationalBoutiqueOnly(mockRequest(), user);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.boutiqueIds).toEqual(['emp-boutique-1']);
    expect(result.boutiqueIds).toHaveLength(1);
  });

  it('returns 403 when operational boutique missing', async () => {
    (getOperationalScope as jest.Mock).mockResolvedValue(null);
    (getEmployeeBoutiqueIdForUser as jest.Mock).mockResolvedValue(null);

    const user = { id: 'u1', role: 'MANAGER', boutiqueId: null, boutique: null };
    const result = await requireOperationalBoutiqueOnly(mockRequest(), user);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.res.status).toBe(403);
      return;
    }
  });
});

describe('resolveOperationalBoutiqueOnly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns scope with single boutique', async () => {
    (getOperationalScope as jest.Mock).mockResolvedValue({
      boutiqueId: 'boutique-1',
      boutiqueIds: ['boutique-1'],
      label: 'Boutique A',
    });

    const user = { id: 'u1', role: 'MANAGER', boutiqueId: 'boutique-1', boutique: { name: 'Boutique A', code: 'BA' } };
    const result = await resolveOperationalBoutiqueOnly(mockRequest(), user);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scope.boutiqueIds).toHaveLength(1);
    expect(result.scope.boutiqueId).toBe('boutique-1');
  });
});

describe('resolveBoutiqueIdsOptionalGlobal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns single boutique when allowGlobal=false', async () => {
    (getOperationalScope as jest.Mock).mockResolvedValue({
      boutiqueId: 'boutique-1',
      boutiqueIds: ['boutique-1'],
      label: 'Boutique A',
    });

    const user = { id: 'u1', role: 'ADMIN', boutiqueId: 'boutique-1', boutique: null };
    const result = await resolveBoutiqueIdsOptionalGlobal(
      mockRequest('global=true'),
      user,
      { allowGlobal: false }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.boutiqueIds).toEqual(['boutique-1']);
    expect(result.global).toBe(false);
  });

  it('honors global=true only for ADMIN', async () => {
    mockBoutiqueFindMany.mockResolvedValueOnce([{ id: 'b1' }, { id: 'b2' }]);

    const user = { id: 'u1', role: 'ADMIN', boutiqueId: 'boutique-1', boutique: null };
    const result = await resolveBoutiqueIdsOptionalGlobal(
      mockRequest('global=true'),
      user,
      { allowGlobal: true }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.boutiqueIds).toHaveLength(2);
    expect(result.global).toBe(true);
  });

  it('ignores global=true for MANAGER', async () => {
    (getOperationalScope as jest.Mock).mockResolvedValue({
      boutiqueId: 'boutique-1',
      boutiqueIds: ['boutique-1'],
      label: 'Boutique A',
    });

    const user = { id: 'u1', role: 'MANAGER', boutiqueId: 'boutique-1', boutique: null };
    const result = await resolveBoutiqueIdsOptionalGlobal(
      mockRequest('global=true'),
      user,
      { allowGlobal: true }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.boutiqueIds).toEqual(['boutique-1']);
    expect(result.global).toBe(false);
  });
});

describe('whereBoutiqueStrict', () => {
  it('returns boutiqueId in filter', () => {
    const filter = whereBoutiqueStrict(['b1', 'b2']);
    expect(filter).toEqual({ boutiqueId: { in: ['b1', 'b2'] } });
  });

  it('throws when boutiqueIds is empty', () => {
    expect(() => whereBoutiqueStrict([])).toThrow('boutiqueIds must not be empty');
  });

  it('filters out falsy values', () => {
    const filter = whereBoutiqueStrict(['b1', '', 'b2']);
    expect(filter).toEqual({ boutiqueId: { in: ['b1', 'b2'] } });
  });
});
