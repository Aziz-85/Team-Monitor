import { NextRequest, NextResponse } from 'next/server';
import { emitTaskReminders } from '@/lib/notify/emitTaskReminders';

/**
 * POST /api/cron/task-reminders
 * Call from cron (e.g. daily). Sends task_due_soon (tomorrow) and task_overdue (today not done).
 * Requires Authorization: Bearer <CRON_SECRET> or header x-cron-secret: <CRON_SECRET>.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    const headerSecret = request.headers.get('x-cron-secret');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : headerSecret?.trim();
    if (token !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await emitTaskReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[cron/task-reminders]', e);
    return NextResponse.json({ error: 'Failed to emit reminders' }, { status: 500 });
  }
}
