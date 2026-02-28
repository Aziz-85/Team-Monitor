import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getMobileUserFromRequest } from '@/lib/mobileAuth';

/**
 * GET /api/mobile/push/prefs
 * Returns current notification preferences and registration status.
 */
export async function GET(request: NextRequest) {
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
      select: { id: true },
    }),
  ]);

  return NextResponse.json({
    scheduleEnabled: prefs?.scheduleEnabled ?? true,
    tasksEnabled: prefs?.tasksEnabled ?? true,
    quietHoursStart: prefs?.quietHoursStart ?? null,
    quietHoursEnd: prefs?.quietHoursEnd ?? null,
    registered: tokens.length > 0,
    tokenCount: tokens.length,
  });
}

/**
 * POST /api/mobile/push/prefs
 * Body: { scheduleEnabled?: boolean, tasksEnabled?: boolean, quietHoursStart?: string, quietHoursEnd?: string }
 */
export async function POST(request: NextRequest) {
  const mobileUser = await getMobileUserFromRequest(request);
  if (!mobileUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = mobileUser.userId;

  let body: {
    scheduleEnabled?: boolean;
    tasksEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const update: {
    scheduleEnabled?: boolean;
    tasksEnabled?: boolean;
    quietHoursStart?: string | null;
    quietHoursEnd?: string | null;
  } = {};
  if (body.scheduleEnabled !== undefined) update.scheduleEnabled = body.scheduleEnabled;
  if (body.tasksEnabled !== undefined) update.tasksEnabled = body.tasksEnabled;
  if (body.quietHoursStart !== undefined) update.quietHoursStart = body.quietHoursStart?.trim() || null;
  if (body.quietHoursEnd !== undefined) update.quietHoursEnd = body.quietHoursEnd?.trim() || null;

  await prisma.notificationPreference.upsert({
    where: { userId },
    create: {
      userId,
      scheduleEnabled: body.scheduleEnabled ?? true,
      tasksEnabled: body.tasksEnabled ?? true,
      quietHoursStart: body.quietHoursStart?.trim() || null,
      quietHoursEnd: body.quietHoursEnd?.trim() || null,
    },
    update: Object.keys(update).length ? update : {},
  });

  return NextResponse.json({ ok: true });
}
