/**
 * PATCH /api/auth/trusted-devices/:id — rename a trusted device.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession, AuthError } from '@/lib/auth';
import { validateCsrf } from '@/lib/csrf';
import { isTrustedDevicesEnabled } from '@/lib/auth/authFeatureFlags';
import { renameTrustedDevice } from '@/lib/auth/trustedDevices';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!validateCsrf(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const user = await requireSession();
    if (!isTrustedDevicesEnabled()) {
      return NextResponse.json({ error: 'Trusted devices disabled' }, { status: 404 });
    }
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const deviceName = String(body.deviceName ?? body.name ?? '').trim();
    if (!deviceName) {
      return NextResponse.json({ error: 'deviceName required' }, { status: 400 });
    }
    const updated = await renameTrustedDevice({
      userId: user.id,
      deviceId: id,
      deviceName,
    });
    if (!updated) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      device: {
        id: updated.id,
        deviceName: updated.deviceName,
      },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[auth/trusted-devices PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
