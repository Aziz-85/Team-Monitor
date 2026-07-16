/**
 * POST /api/auth/trusted-devices/revoke-all — revoke all trusted devices for current user.
 * SUPER_ADMIN may also pass { userId } to revoke another user's devices ("Sign out all devices").
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireSession, AuthError, invalidateAllSessionsForUser } from '@/lib/auth';
import { validateCsrf } from '@/lib/csrf';
import { getRequestClientInfo } from '@/lib/requestClientInfo';
import { isTrustedDevicesEnabled } from '@/lib/auth/authFeatureFlags';
import {
  clearTrustedDeviceCookie,
  revokeAllTrustedDevicesForUser,
} from '@/lib/auth/trustedDevices';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const user = await requireSession();
    if (!isTrustedDevicesEnabled()) {
      return NextResponse.json({ error: 'Trusted devices disabled' }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const client = getRequestClientInfo(request.headers);
    let targetUserId = user.id;
    let alsoSessions = false;

    if (typeof body.userId === 'string' && body.userId.trim() && body.userId !== user.id) {
      if (user.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const target = await prisma.user.findUnique({
        where: { id: body.userId.trim() },
        select: { id: true },
      });
      if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      targetUserId = target.id;
      alsoSessions = Boolean(body.signOutSessions);
    } else if (body.signOutSessions) {
      alsoSessions = true;
    }

    const count = await revokeAllTrustedDevicesForUser(
      targetUserId,
      targetUserId === user.id ? 'USER_REVOKE_ALL' : 'SUPER_ADMIN_SIGN_OUT_ALL',
      client
    );

    if (alsoSessions) {
      await invalidateAllSessionsForUser(targetUserId);
    }

    if (targetUserId === user.id) {
      const cookieStore = await cookies();
      const isHttps = new URL(request.url).protocol === 'https:';
      cookieStore.set(clearTrustedDeviceCookie({ secure: isHttps }));
    }

    return NextResponse.json({ ok: true, revoked: count, sessionsCleared: alsoSessions });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[auth/trusted-devices/revoke-all]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
