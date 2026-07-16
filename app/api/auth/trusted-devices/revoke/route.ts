/**
 * POST /api/auth/trusted-devices/revoke — revoke one trusted device.
 * Body: { deviceId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireSession, AuthError } from '@/lib/auth';
import { validateCsrf } from '@/lib/csrf';
import { getRequestClientInfo } from '@/lib/requestClientInfo';
import { isTrustedDevicesEnabled } from '@/lib/auth/authFeatureFlags';
import {
  clearTrustedDeviceCookie,
  getTrustedDeviceCookieName,
  hashTrustedDeviceToken,
  revokeTrustedDevice,
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
    const deviceId = String(body.deviceId ?? '').trim();
    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId required' }, { status: 400 });
    }
    const client = getRequestClientInfo(request.headers);
    const ok = await revokeTrustedDevice({
      userId: user.id,
      deviceId,
      reason: 'USER_REVOKE',
      client,
    });
    if (!ok) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const cookieStore = await cookies();
    const raw = cookieStore.get(getTrustedDeviceCookieName())?.value;
    if (raw) {
      try {
        const hash = hashTrustedDeviceToken(raw);
        const row = await prisma.trustedAuthDevice.findUnique({
          where: { tokenHash: hash },
          select: { id: true, revokedAt: true },
        });
        if (!row || row.id === deviceId || row.revokedAt) {
          const isHttps = new URL(request.url).protocol === 'https:';
          cookieStore.set(clearTrustedDeviceCookie({ secure: isHttps }));
        }
      } catch {
        // ignore cookie clear failures
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[auth/trusted-devices/revoke]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
