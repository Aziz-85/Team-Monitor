import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getMobileUserFromRequest } from '@/lib/mobileAuth';
import { sendExpoPush } from '@/lib/push/expoPush';

/**
 * POST /api/mobile/push/test
 * Sends a test push to current user's devices. Respects prefs; if both channels disabled returns ok: false.
 */
export async function POST(request: NextRequest) {
  const mobileUser = await getMobileUserFromRequest(request);
  if (!mobileUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = mobileUser.userId;

  const [prefs, tokens] = await Promise.all([
    prisma.notificationPreference.findUnique({
      where: { userId },
    }),
    prisma.mobileDevicePushToken.findMany({
      where: { userId, revokedAt: null },
      select: { expoPushToken: true },
    }),
  ]);

  const scheduleEnabled = prefs?.scheduleEnabled ?? true;
  const tasksEnabled = prefs?.tasksEnabled ?? true;
  if (!scheduleEnabled && !tasksEnabled) {
    return NextResponse.json({ ok: false, reason: 'All notification channels are disabled' }, { status: 200 });
  }
  if (tokens.length === 0) {
    return NextResponse.json(
      { ok: false, reason: 'No push token registered. Register with POST /api/mobile/push/register' },
      { status: 400 }
    );
  }

  const messages = tokens.map((t) => ({
    to: t.expoPushToken,
    title: 'Test notification',
    body: 'If you see this, push notifications are working.',
    data: { type: 'test', deepLink: '/(tabs)/schedule' },
  }));

  await sendExpoPush(messages);
  return NextResponse.json({ ok: true, sent: tokens.length });
}
