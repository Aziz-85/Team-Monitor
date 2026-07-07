import type { Role } from '@prisma/client';
import {
  canAccessArchitectureConsole,
  canAccessRouteForContext,
  getEffectiveAccessContext,
  resolveSessionActiveMode,
} from '@/lib/platformOwner/effectiveAccessContext';
import type { SessionModeState } from '@/lib/platformOwner/types';

function managerUser(boutiqueId = 'boutique-1') {
  return {
    id: 'u1',
    empId: 'admin_rashid',
    role: 'MANAGER' as Role,
    passwordHash: 'x',
    mustChangePassword: false,
    disabled: false,
    canEditSchedule: true,
    isPlatformOwner: true,
    createdAt: new Date(),
    boutiqueId,
    lockedUntil: null,
    failedLoginAttempts: 0,
    totpSecretEncrypted: null,
    totpEnabled: false,
  };
}

function session(activeMode: 'BRANCH_MANAGER' | 'PLATFORM_ADMIN', lastSeenAt = new Date()): SessionModeState {
  return {
    id: 's1',
    activeMode,
    platformModeLastActiveAt: activeMode === 'PLATFORM_ADMIN' ? lastSeenAt : null,
    lastSeenAt,
  };
}

describe('platform owner dual-mode access', () => {
  it('defaults platform owner to Branch Manager mode on login context', () => {
    const ctx = getEffectiveAccessContext(managerUser(), session('BRANCH_MANAGER'));
    expect(ctx.activeMode).toBe('BRANCH_MANAGER');
    expect(ctx.effectiveRole).toBe('MANAGER');
    expect(ctx.globalScope).toBe(false);
    expect(ctx.scopeBoutiqueId).toBe('boutique-1');
  });

  it('denies Architecture Console in Branch Manager mode', () => {
    const ctx = getEffectiveAccessContext(managerUser(), session('BRANCH_MANAGER'));
    expect(canAccessArchitectureConsole(ctx)).toBe(false);
    expect(canAccessRouteForContext(ctx, '/architecture')).toBe(false);
    expect(canAccessRouteForContext(ctx, '/company')).toBe(false);
  });

  it('allows Architecture Console in Platform Admin mode after elevation', () => {
    const ctx = getEffectiveAccessContext(managerUser(), session('PLATFORM_ADMIN'));
    expect(ctx.activeMode).toBe('PLATFORM_ADMIN');
    expect(ctx.effectiveRole).toBe('SUPER_ADMIN');
    expect(ctx.globalScope).toBe(true);
    expect(canAccessArchitectureConsole(ctx)).toBe(true);
    expect(canAccessRouteForContext(ctx, '/architecture')).toBe(true);
    expect(canAccessRouteForContext(ctx, '/company')).toBe(true);
  });

  it('returns platform owner to Branch Manager mode context', () => {
    const elevated = getEffectiveAccessContext(managerUser(), session('PLATFORM_ADMIN'));
    const branch = getEffectiveAccessContext(managerUser(), session('BRANCH_MANAGER'));
    expect(elevated.globalScope).toBe(true);
    expect(branch.globalScope).toBe(false);
    expect(branch.effectiveRole).toBe('MANAGER');
  });

  it('does not grant platform mode to non-platform-owner users', () => {
    const user = { ...managerUser(), isPlatformOwner: false };
    const ctx = getEffectiveAccessContext(user, session('PLATFORM_ADMIN'));
    expect(ctx.isPlatformOwner).toBe(false);
    expect(ctx.effectiveRole).toBe('MANAGER');
    expect(ctx.globalScope).toBe(false);
  });

  it('keeps branch manager queries boutique scoped', () => {
    const ctx = getEffectiveAccessContext(managerUser('boutique-rashid'), session('BRANCH_MANAGER'));
    expect(ctx.scopeBoutiqueId).toBe('boutique-rashid');
    expect(ctx.globalScope).toBe(false);
  });

  it('uses global scope in Platform Admin mode', () => {
    const ctx = getEffectiveAccessContext(managerUser('boutique-rashid'), session('PLATFORM_ADMIN'));
    expect(ctx.scopeBoutiqueId).toBeNull();
    expect(ctx.globalScope).toBe(true);
  });

  it('expires Platform Admin mode after idle timeout', () => {
    const stale = new Date(Date.now() - 31 * 60 * 1000);
    const mode = resolveSessionActiveMode(
      {
        id: 's1',
        activeMode: 'PLATFORM_ADMIN',
        platformModeLastActiveAt: stale,
        lastSeenAt: stale,
      },
      new Date()
    );
    expect(mode).toBe('BRANCH_MANAGER');
  });
});
