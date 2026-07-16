/**
 * GET /api/auth/trusted-devices — list active trusted devices for current user.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireSession, AuthError } from '@/lib/auth';
import { isTrustedDevicesEnabled } from '@/lib/auth/authFeatureFlags';
import {
  getTrustedDeviceCookieName,
  hashTrustedDeviceToken,
  listTrustedDevicesForUser,
} from '@/lib/auth/trustedDevices';

export async function GET() {
  try {
    const user = await requireSession();
    if (!isTrustedDevicesEnabled()) {
      return NextResponse.json({ enabled: false, devices: [] });
    }
    const cookieStore = await cookies();
    const raw = cookieStore.get(getTrustedDeviceCookieName())?.value;
    let currentHash: string | null = null;
    if (raw) {
      try {
        currentHash = hashTrustedDeviceToken(raw);
      } catch {
        currentHash = null;
      }
    }
    const devices = await listTrustedDevicesForUser(user.id, currentHash);
    return NextResponse.json({ enabled: true, devices });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[auth/trusted-devices GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
