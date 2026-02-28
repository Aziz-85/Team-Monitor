import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import type { User, Role } from '@prisma/client';
import { SESSION_IDLE_MINUTES, SESSION_MAX_HOURS, SESSION_LAST_SEEN_THROTTLE_MINUTES } from '@/lib/sessionConfig';
import { randomBytes } from 'crypto';

const SESSION_COOKIE = 'dt_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * SESSION_MAX_HOURS,
};

export type SessionUser = User & {
  boutiqueId: string;
  employee?: { name: string; language: string; position?: import('@prisma/client').EmployeePosition | null } | null;
  boutique?: { id: string; name: string; code: string } | null;
};

const IDLE_MS = SESSION_IDLE_MINUTES * 60 * 1000;
const THROTTLE_MS = SESSION_LAST_SEEN_THROTTLE_MINUTES * 60 * 1000;

/** Set cookie only when allowed (Route Handler / Server Action). Avoids throw in Server Components. */
function safeSetCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  args: ReturnType<typeof setSessionCookie> | ReturnType<typeof clearSessionCookie>
): void {
  try {
    cookieStore.set(args);
  } catch {
    // Cookies can only be modified in a Server Action or Route Handler; ignore in Server Components.
  }
}

/**
 * Resolve session token from cookie; enforce expiresAt and idle timeout.
 * Updates lastSeenAt only if older than throttle (2 min) to avoid write storms.
 * Invalidates session and clears cookie if expired or idle.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    let session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            employee: { select: { name: true, language: true, position: true } },
            boutique: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!session) {
      const userById = await prisma.user.findFirst({
        where: { id: token, disabled: false },
        include: {
          employee: { select: { name: true, language: true, position: true } },
          boutique: { select: { id: true, name: true, code: true } },
        },
      });
      if (userById && (userById as { boutiqueId?: string }).boutiqueId) {
        const newToken = await createSession(userById.id);
        safeSetCookie(cookieStore, setSessionCookie(newToken));
        session = await prisma.session.findUnique({
          where: { token: newToken },
          include: {
            user: {
              include: {
                employee: { select: { name: true, language: true, position: true } },
                boutique: { select: { id: true, name: true, code: true } },
              },
            },
          },
        });
      }
      if (!session) {
        safeSetCookie(cookieStore, clearSessionCookie());
        return null;
      }
    }

    const now = new Date();

    if (session.expiresAt < now) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      safeSetCookie(cookieStore, clearSessionCookie());
      return null;
    }

    const idleElapsed = now.getTime() - session.lastSeenAt.getTime();
    if (idleElapsed > IDLE_MS) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      safeSetCookie(cookieStore, clearSessionCookie());
      return null;
    }

    if (idleElapsed > THROTTLE_MS) {
      await prisma.session
        .update({
          where: { id: session.id },
          data: { lastSeenAt: now },
        })
        .catch(() => {});
    }

    const user = session.user;
    if (!user || user.disabled) return null;

    const raw = user as { boutiqueId?: string; role?: string };
    if (!raw.boutiqueId || raw.boutiqueId === '') {
      if (raw.role !== 'SUPER_ADMIN') return null;
    }

    return user as SessionUser;
  } catch (e) {
    const err = e as Error;
    // In Server Components we cannot set/clear cookies; avoid logging this expected case.
    if (err?.message?.includes('Cookies can only be modified')) return null;
    console.error('[getSessionUser]', e);
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthError('UNAUTHORIZED');
  }
  return user;
}

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!roles.includes(user.role)) {
    throw new AuthError('FORBIDDEN');
  }
  return user;
}

/** Create a new session for the user; returns token. Caller sets cookie. */
export async function createSession(userId: string): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_HOURS * 60 * 60 * 1000);
  const token = randomBytes(24).toString('base64url');

  await prisma.session.create({
    data: {
      token,
      userId,
      lastSeenAt: now,
      createdAt: now,
      expiresAt,
    },
  });

  return token;
}

/** Invalidate session by token (e.g. on logout). */
export async function invalidateSessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } }).catch(() => {});
}

/** Invalidate all sessions for a user (e.g. on password change). */
export async function invalidateAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } }).catch(() => {});
}

export function setSessionCookie(sessionToken: string) {
  return {
    name: SESSION_COOKIE,
    value: sessionToken,
    ...COOKIE_OPTIONS,
  };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: '',
    ...COOKIE_OPTIONS,
    maxAge: 0,
  };
}

export class AuthError extends Error {
  constructor(public code: 'UNAUTHORIZED' | 'FORBIDDEN') {
    super(code);
    this.name = 'AuthError';
  }
}
