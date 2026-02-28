import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getMobileUserFromRequest } from '@/lib/mobileAuth';

/**
 * POST /api/mobile/push/register
 * Body: { expoPushToken: string, platform: "ios"|"android", deviceHint?: string, appVersion?: string }
 * Upsert by expoPushToken: set userId, platform, deviceHint, appVersion, lastSeenAt=now, revokedAt=null.
 * Ensures NotificationPreference exists for user.
 */
export async function POST(request: NextRequest) {
  const mobileUser = await getMobileUserFromRequest(request);
  if (!mobileUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = mobileUser.userId;

  let body: {
    expoPushToken?: string;
    platform?: string;
    deviceHint?: string;
    appVersion?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const expoPushToken = typeof body.expoPushToken === 'string' ? body.expoPushToken.trim() : '';
  if (!expoPushToken) {
    return NextResponse.json({ error: 'expoPushToken is required' }, { status: 400 });
  }
  if (!expoPushToken.startsWith('ExponentPushToken[') && !expoPushToken.startsWith('ExpoPushToken[')) {
    return NextResponse.json({ error: 'Invalid Expo push token format' }, { status: 400 });
  }

  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : 'android';
  const deviceHint = typeof body.deviceHint === 'string' ? body.deviceHint.trim() || null : null;
  const appVersion = typeof body.appVersion === 'string' ? body.appVersion.trim() || null : null;
  const now = new Date();

  await prisma.mobileDevicePushToken.upsert({
    where: { expoPushToken },
    create: {
      userId,
      expoPushToken,
      platform,
      deviceHint,
      appVersion,
      lastSeenAt: now,
    },
    update: {
      userId,
      platform,
      deviceHint: deviceHint ?? undefined,
      appVersion: appVersion ?? undefined,
      lastSeenAt: now,
      revokedAt: null,
    },
  });

  await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  return NextResponse.json({ ok: true });
}
