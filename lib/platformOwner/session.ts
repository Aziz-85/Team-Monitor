import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { clearSessionCookie, setSessionCookie, type SessionUser } from '@/lib/auth';
import { getSessionCookieName } from '@/lib/env';
import { SESSION_IDLE_MINUTES, SESSION_LAST_SEEN_THROTTLE_MINUTES } from '@/lib/sessionConfig';
import {
  getEffectiveAccessContext,
  resolveSessionActiveMode,
} from '@/lib/platformOwner/effectiveAccessContext';
import type { EffectiveAccessContext, PlatformActiveMode, SessionModeState } from '@/lib/platformOwner/types';

const IDLE_MS = SESSION_IDLE_MINUTES * 60 * 1000;
const THROTTLE_MS = SESSION_LAST_SEEN_THROTTLE_MINUTES * 60 * 1000;

export type AuthenticatedSession = {
  user: SessionUser & { isPlatformOwner: boolean };
  session: SessionModeState;
  access: EffectiveAccessContext;
};

async function safeSetCookie(args: ReturnType<typeof setSessionCookie> | ReturnType<typeof clearSessionCookie>): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.set(args);
  } catch {
    /* Server Component */
  }
}

async function loadSessionRow(token: string) {
  return prisma.session.findUnique({
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
}

/** Authenticated session with platform-owner mode resolution and idle enforcement. */
export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  if (!token) return null;

  const session = await loadSessionRow(token);
  if (!session) {
    await safeSetCookie(clearSessionCookie());
    return null;
  }

  const now = new Date();
  if (session.expiresAt < now || now.getTime() - session.lastSeenAt.getTime() > IDLE_MS) {
    await prisma.session.deleteMany({ where: { id: session.id } }).catch(() => {});
    await safeSetCookie(clearSessionCookie());
    return null;
  }

  const user = session.user;
  if (!user || user.disabled) return null;
  if (!user.boutiqueId && user.role !== 'SUPER_ADMIN' && user.role !== 'DEMO_VIEWER') {
    return null;
  }

  const sessionState: SessionModeState = {
    id: session.id,
    activeMode: resolveSessionActiveMode({
      id: session.id,
      activeMode: session.activeMode as PlatformActiveMode,
      platformModeLastActiveAt: session.platformModeLastActiveAt,
      lastSeenAt: session.lastSeenAt,
    }),
    platformModeLastActiveAt: session.platformModeLastActiveAt,
    lastSeenAt: session.lastSeenAt,
  };

  const updates: { lastSeenAt?: Date; activeMode?: PlatformActiveMode; platformModeLastActiveAt?: Date | null } = {};
  if (sessionState.activeMode !== session.activeMode) {
    updates.activeMode = 'BRANCH_MANAGER';
    updates.platformModeLastActiveAt = null;
    sessionState.activeMode = 'BRANCH_MANAGER';
  }

  const idleElapsed = now.getTime() - session.lastSeenAt.getTime();
  if (idleElapsed > THROTTLE_MS) {
    updates.lastSeenAt = now;
    sessionState.lastSeenAt = now;
    if (sessionState.activeMode === 'PLATFORM_ADMIN') {
      updates.platformModeLastActiveAt = now;
      sessionState.platformModeLastActiveAt = now;
    }
  } else if (sessionState.activeMode === 'PLATFORM_ADMIN') {
    updates.platformModeLastActiveAt = now;
    sessionState.platformModeLastActiveAt = now;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.session.update({ where: { id: session.id }, data: updates }).catch(() => {});
  }

  const sessionUser = user as SessionUser & { isPlatformOwner: boolean };
  sessionUser.isPlatformOwner = Boolean(user.isPlatformOwner);

  return {
    user: sessionUser,
    session: sessionState,
    access: getEffectiveAccessContext(sessionUser, sessionState),
  };
}

export async function setPlatformAdminMode(sessionId: string): Promise<void> {
  const now = new Date();
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      activeMode: 'PLATFORM_ADMIN',
      platformModeLastActiveAt: now,
      lastSeenAt: now,
    },
  });
}

export async function setBranchManagerMode(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      activeMode: 'BRANCH_MANAGER',
      platformModeLastActiveAt: null,
    },
  });
}
