/**
 * Unified server authentication facade.
 *
 * New route handlers should import from this module. The legacy `lib/auth.ts`
 * remains the implementation to preserve existing imports.
 */

import {
  AuthError,
  getSessionUser,
  requireRole,
  requireSession,
  type SessionUser,
} from '@/lib/auth';
import type { Role } from '@prisma/client';

export {
  AuthError,
  getSessionUser,
  requireRole,
  requireSession,
  type SessionUser,
};

/** Require an enabled user backed by a valid server session. */
export async function requireAuthenticatedUser(): Promise<SessionUser> {
  return requireSession();
}

/** Require one of the supplied server-derived roles. */
export async function requireAuthenticatedRole(roles: Role[]): Promise<SessionUser> {
  return requireRole(roles);
}

/**
 * Require a user allowed to mutate data.
 * DEMO_VIEWER is rejected here even if middleware is bypassed.
 */
export async function requireMutableUser(): Promise<SessionUser> {
  const user = await requireAuthenticatedUser();
  if (user.role === 'DEMO_VIEWER') {
    throw new AuthError('FORBIDDEN');
  }
  return user;
}
