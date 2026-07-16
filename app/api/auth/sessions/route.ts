/**
 * GET /api/auth/sessions — list active sessions for current user.
 * POST /api/auth/sessions/revoke-others — invalidate other sessions (keep current).
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireSession, AuthError, invalidateAllSessionsForUser, createSession, setSessionCookie } from '@/lib/auth';
import { getSessionCookieName } from '@/lib/env';
import { validateCsrf } from '@/lib/csrf';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const user = await requireSession();
    const cookieStore = await cookies();
    const currentToken = cookieStore.get(getSessionCookieName())?.value ?? null;
    const sessions = await prisma.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        token: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        isCurrent: Boolean(currentToken && s.token === currentToken),
      })),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const user = await requireSession();
    const body = await request.json().catch(() => ({}));
    if (body.action !== 'revoke-others' && body.action !== 'revoke-all') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await invalidateAllSessionsForUser(user.id);

    if (body.action === 'revoke-others') {
      const newToken = await createSession(user.id);
      const cookieStore = await cookies();
      const isHttps = new URL(request.url).protocol === 'https:';
      cookieStore.set(setSessionCookie(newToken, { secure: isHttps }));
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
