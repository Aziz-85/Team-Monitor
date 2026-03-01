import { NextRequest, NextResponse } from 'next/server';
import { emitTaskReminders } from '@/lib/notify/emitTaskReminders';

/**
 * POST /api/cron/task-reminders
 * Call from cron (e.g. daily). Sends task_due_soon (tomorrow) and task_overdue (today not done).
 * Requires CRON_SECRET env and Authorization: Bearer <CRON_SECRET> or header x-cron-secret: <CRON_SECRET>.
 * Fail-closed: if CRON_SECRET missing, returns 500 and does not execute.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.trim() === '') {
    console.error('[cron/task-reminders] CRON_SECRET not configured');
    return NextResponse.json(
      { error: 'Cron secret not configured' },
      { status: 500 }
    );
  }
  const auth = request.headers.get('authorization');
  const headerSecret = request.headers.get('x-cron-secret');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : headerSecret?.trim();
  if (token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await emitTaskReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[cron/task-reminders]', e);
    return NextResponse.json({ error: 'Failed to emit reminders' }, { status: 500 });
  }
}
