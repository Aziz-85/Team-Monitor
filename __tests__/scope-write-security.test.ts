/**
 * Phase 7 — resolveWriteScope rejects client boutique IDOR attempts.
 */

jest.mock('@/lib/auth/index', () => ({
  requireAuthenticatedUser: jest.fn(),
}));
jest.mock('@/lib/scope/ssot', () => ({
  requireBoutiqueScope: jest.fn(),
}));
jest.mock('@/lib/permissions/boutiqueAccess', () => ({
  requireBoutiqueAccess: jest.fn(),
}));

import { resolveWriteScope } from '@/lib/scope/index';
import { requireAuthenticatedUser } from '@/lib/auth/index';
import { requireBoutiqueScope } from '@/lib/scope/ssot';
import { requireBoutiqueAccess } from '@/lib/permissions/boutiqueAccess';

const TRUSTED = 'boutique-trusted';
const FOREIGN = 'boutique-foreign';

describe('resolveWriteScope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({
      id: 'u1',
      role: 'MANAGER',
      boutiqueId: TRUSTED,
    });
    (requireBoutiqueScope as jest.Mock).mockResolvedValue({
      ok: true,
      scope: { boutiqueId: TRUSTED, boutiqueIds: [TRUSTED], label: 'Trusted' },
    });
    (requireBoutiqueAccess as jest.Mock).mockResolvedValue(undefined);
  });

  it('returns trusted boutique when client omits boutiqueId', async () => {
    const scope = await resolveWriteScope(null);
    expect(scope).toEqual({ boutiqueId: TRUSTED, userId: 'u1' });
    expect(requireBoutiqueAccess).toHaveBeenCalledWith(expect.anything(), TRUSTED);
  });

  it('accepts matching client boutiqueId', async () => {
    const scope = await resolveWriteScope(null, TRUSTED);
    expect(scope.boutiqueId).toBe(TRUSTED);
  });

  it('rejects mismatched client boutiqueId (IDOR)', async () => {
    await expect(resolveWriteScope(null, FOREIGN)).rejects.toThrow('FORBIDDEN');
    expect(requireBoutiqueAccess).not.toHaveBeenCalled();
  });

  it('propagates unauthorized scope resolution', async () => {
    (requireBoutiqueScope as jest.Mock).mockResolvedValue({
      ok: false,
      res: { status: 401 },
    });
    await expect(resolveWriteScope(null)).rejects.toThrow('UNAUTHORIZED');
  });
});
