/**
 * Phase 3 regression suite: boutique isolation and server-side permissions.
 */

const db = {
  boutique: { findUnique: jest.fn() },
  userBoutiqueMembership: { findUnique: jest.fn() },
  salesEntryImportBatch: { findUnique: jest.fn() },
};

jest.mock('@/lib/db', () => ({ prisma: db }));

import {
  checkBoutiqueAccess,
  checkBoutiquePermission,
  hasCrossBoutiqueAdminBypass,
  hasExplicitPlatformAccess,
  requireBoutiqueAccess,
  BoutiqueAuthorizationError,
} from '@/lib/permissions/boutiqueAccess';
import { checkSalesEntryImportBatchAccess } from '@/lib/permissions/resourceAccess';
import type { BoutiqueAccessUser } from '@/lib/permissions/boutiqueAccess';

const DHAHRAN = 'boutique-dhahran';
const RASHID = 'boutique-rashid';

const manager: BoutiqueAccessUser = {
  id: 'manager-1',
  role: 'MANAGER',
  boutiqueId: DHAHRAN,
  disabled: false,
};

describe('boutique access isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.boutique.findUnique.mockResolvedValue({ isActive: true });
    db.userBoutiqueMembership.findUnique.mockResolvedValue(null);
  });

  it('rejects a Dhahran user reading Al Rashid data', async () => {
    const result = await checkBoutiqueAccess(manager, RASHID);
    expect(result).toEqual({ allowed: false, reason: 'NO_ACCESS' });
  });

  it('membership with canAccess=false overrides session compatibility', async () => {
    db.userBoutiqueMembership.findUnique.mockResolvedValue({
      canAccess: false,
    });
    const result = await checkBoutiqueAccess(manager, DHAHRAN);
    expect(result).toEqual({ allowed: false, reason: 'NO_ACCESS' });
  });

  it('rejects disabled users before membership evaluation', async () => {
    const result = await checkBoutiqueAccess(
      { ...manager, disabled: true },
      DHAHRAN
    );
    expect(result).toEqual({ allowed: false, reason: 'DISABLED' });
  });

  it('rejects inactive boutiques even for ADMIN', async () => {
    db.boutique.findUnique.mockResolvedValue({ isActive: false });
    const result = await checkBoutiqueAccess(
      { id: 'admin-1', role: 'ADMIN' },
      RASHID
    );
    expect(result).toEqual({ allowed: false, reason: 'BOUTIQUE_INACTIVE' });
  });

  it('ADMIN platform access is explicit for active boutiques', async () => {
    const result = await checkBoutiqueAccess(
      { id: 'admin-1', role: 'ADMIN' },
      RASHID
    );
    expect(result).toEqual({ allowed: true, source: 'ADMIN' });
  });

  it('allows SESSION_COMPAT when membership row is absent', async () => {
    db.userBoutiqueMembership.findUnique.mockResolvedValue(null);
    const result = await checkBoutiqueAccess(manager, DHAHRAN);
    expect(result).toEqual({ allowed: true, source: 'SESSION_COMPAT' });
  });

  it('requireBoutiqueAccess throws BoutiqueAuthorizationError on denial', async () => {
    await expect(requireBoutiqueAccess(manager, RASHID)).rejects.toBeInstanceOf(
      BoutiqueAuthorizationError
    );
  });
});

describe('platform access helpers', () => {
  it('hasExplicitPlatformAccess is true for ADMIN and platform owner', () => {
    expect(hasExplicitPlatformAccess({ id: 'a', role: 'ADMIN' })).toBe(true);
    expect(
      hasExplicitPlatformAccess({ id: 'a', role: 'MANAGER', isPlatformOwner: true })
    ).toBe(true);
    expect(hasExplicitPlatformAccess({ id: 'a', role: 'MANAGER' })).toBe(false);
  });

  it('hasCrossBoutiqueAdminBypass covers ADMIN and SUPER_ADMIN only', () => {
    expect(hasCrossBoutiqueAdminBypass('ADMIN')).toBe(true);
    expect(hasCrossBoutiqueAdminBypass('SUPER_ADMIN')).toBe(true);
    expect(hasCrossBoutiqueAdminBypass('MANAGER')).toBe(false);
  });
});

describe('boutique mutation permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.boutique.findUnique.mockResolvedValue({ isActive: true });
  });

  it('rejects Manager without canManageSales', async () => {
    db.userBoutiqueMembership.findUnique
      .mockResolvedValueOnce({ canAccess: true })
      .mockResolvedValueOnce({
        canAccess: true,
        canManageTasks: false,
        canManageLeaves: false,
        canManageSales: false,
        canManageInventory: false,
      });

    const result = await checkBoutiquePermission(
      manager,
      DHAHRAN,
      'canManageSales'
    );
    expect(result).toEqual({ allowed: false, reason: 'MISSING_PERMISSION' });
  });

  it('allows Manager only with canAccess and canManageSales', async () => {
    db.userBoutiqueMembership.findUnique
      .mockResolvedValueOnce({ canAccess: true })
      .mockResolvedValueOnce({
        canAccess: true,
        canManageTasks: false,
        canManageLeaves: false,
        canManageSales: true,
        canManageInventory: false,
      });

    const result = await checkBoutiquePermission(
      manager,
      DHAHRAN,
      'canManageSales'
    );
    expect(result).toEqual({ allowed: true, source: 'MEMBERSHIP' });
  });

  it('DEMO_VIEWER cannot obtain a write permission', async () => {
    db.userBoutiqueMembership.findUnique.mockResolvedValue({
      canAccess: true,
    });
    const result = await checkBoutiquePermission(
      { id: 'demo-1', role: 'DEMO_VIEWER', boutiqueId: DHAHRAN },
      DHAHRAN,
      'canManageSales'
    );
    expect(result).toEqual({ allowed: false, reason: 'MISSING_PERMISSION' });
  });
});

describe('import batch IDOR protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.boutique.findUnique.mockResolvedValue({ isActive: true });
  });

  it('rejects a batch owned by another boutique', async () => {
    db.salesEntryImportBatch.findUnique.mockResolvedValue({
      id: 'batch-rashid',
      lines: [{ boutiqueId: RASHID }],
    });
    db.userBoutiqueMembership.findUnique.mockResolvedValue(null);

    const result = await checkSalesEntryImportBatchAccess(
      manager,
      'batch-rashid'
    );
    expect(result).toEqual({ allowed: false, reason: 'CROSS_BOUTIQUE' });
  });

  it('rejects rollback when Manager lacks canManageSales', async () => {
    db.salesEntryImportBatch.findUnique.mockResolvedValue({
      id: 'batch-dhahran',
      lines: [{ boutiqueId: DHAHRAN }],
    });
    db.userBoutiqueMembership.findUnique
      .mockResolvedValueOnce({ canAccess: true })
      .mockResolvedValueOnce({
        canAccess: true,
        canManageTasks: false,
        canManageLeaves: false,
        canManageSales: false,
        canManageInventory: false,
      });

    const result = await checkSalesEntryImportBatchAccess(
      manager,
      'batch-dhahran',
      { requireManageSales: true }
    );
    expect(result).toEqual({ allowed: false, reason: 'MISSING_PERMISSION' });
  });
});
