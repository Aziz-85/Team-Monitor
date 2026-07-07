import type { Role } from '@prisma/client';
import { canAccessRoute } from '@/lib/routeMatrix';
import type { SessionUser } from '@/lib/auth';
import type {
  EffectiveAccessContext,
  PlatformActiveMode,
  SessionModeState,
} from '@/lib/platformOwner/types';
import { PLATFORM_ACTIVE_MODES, PLATFORM_ADMIN_IDLE_MINUTES } from '@/lib/platformOwner/types';

type UserWithPlatformFlag = SessionUser & { isPlatformOwner?: boolean };

function normalizeMode(value: string | null | undefined): PlatformActiveMode {
  if (value === 'PLATFORM_ADMIN') return 'PLATFORM_ADMIN';
  return 'BRANCH_MANAGER';
}

export function isPlatformAdminMode(mode: PlatformActiveMode): boolean {
  return mode === 'PLATFORM_ADMIN';
}

/** Downgrade expired platform-admin elevation to branch manager mode. */
export function resolveSessionActiveMode(session: SessionModeState, now = new Date()): PlatformActiveMode {
  const mode = normalizeMode(session.activeMode);
  if (mode !== 'PLATFORM_ADMIN') return 'BRANCH_MANAGER';
  const anchor = session.platformModeLastActiveAt ?? session.lastSeenAt;
  const idleMs = now.getTime() - anchor.getTime();
  if (idleMs > PLATFORM_ADMIN_IDLE_MINUTES * 60 * 1000) {
    return 'BRANCH_MANAGER';
  }
  return 'PLATFORM_ADMIN';
}

export function getEffectiveAccessContext(
  user: UserWithPlatformFlag,
  session: SessionModeState
): EffectiveAccessContext {
  const primaryRole = user.role as Role;
  const isPlatformOwner = Boolean(user.isPlatformOwner);
  const activeMode = isPlatformOwner ? resolveSessionActiveMode(session) : 'BRANCH_MANAGER';
  const primaryBoutiqueId = user.boutiqueId ?? '';
  const globalScope = isPlatformOwner && activeMode === 'PLATFORM_ADMIN';

  let effectiveRole = primaryRole;
  if (globalScope) {
    effectiveRole = 'SUPER_ADMIN';
  }

  const scopeBoutiqueId = globalScope ? null : primaryBoutiqueId || null;

  return {
    userId: user.id,
    primaryRole,
    effectiveRole,
    isPlatformOwner,
    activeMode,
    primaryBoutiqueId,
    scopeBoutiqueId,
    globalScope,
  };
}

export function canAccessRouteForContext(ctx: EffectiveAccessContext, pathname: string): boolean {
  return canAccessRoute(ctx.effectiveRole, pathname);
}

export function canAccessArchitectureConsole(ctx: EffectiveAccessContext): boolean {
  if (ctx.primaryRole === 'SUPER_ADMIN' || ctx.primaryRole === 'ADMIN') return true;
  return ctx.isPlatformOwner && ctx.activeMode === 'PLATFORM_ADMIN';
}

export function assertValidPlatformMode(value: unknown): PlatformActiveMode | null {
  if (typeof value !== 'string') return null;
  return PLATFORM_ACTIVE_MODES.includes(value as PlatformActiveMode) ? (value as PlatformActiveMode) : null;
}
