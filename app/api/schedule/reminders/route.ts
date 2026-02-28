import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { validateCoverage } from '@/lib/services/coverageValidation';
import { rosterForDate } from '@/lib/services/roster';
import type { Role } from '@prisma/client';

/**
 * GET /api/schedule/reminders
 * Returns active reminders for the next 2 days and current week violations.
 * Manager/Admin only. No auto-email. Reminders disappear when issue is resolved.
 * Scoped to resolved boutiqueIds.
 */
export async function GET(request: NextRequest) {
  void request;
  try {
    await requireRole(['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope || scheduleScope.boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }
  const rosterOptions = { boutiqueIds: scheduleScope.boutiqueIds };
  const coverageOptions = { boutiqueIds: scheduleScope.boutiqueIds };

  const reminders: Array<{ type: string; message: string; date?: string; copyText: string }> = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const tomorrowRoster = await rosterForDate(tomorrow, rosterOptions);
  const minAmTomorrow = 2;
  if (tomorrowRoster.amEmployees.length < minAmTomorrow) {
    const msg = `Tomorrow (${tomorrow.toISOString().slice(0, 10)}) AM < MinAM (${tomorrowRoster.amEmployees.length} < ${minAmTomorrow})`;
    reminders.push({
      type: 'TOMORROW_AM_LOW',
      message: msg,
      date: tomorrow.toISOString().slice(0, 10),
      copyText: `⚠️ Schedule: ${msg}`,
    });
  }

  const tomorrowDay = tomorrow.getUTCDay();
  if (tomorrowDay === 5) {
    const pmCount = tomorrowRoster.pmEmployees.length;
    if (pmCount > 8) {
      const msg = `Friday ${tomorrow.toISOString().slice(0, 10)} PM overload (${pmCount})`;
      reminders.push({
        type: 'FRIDAY_PM_OVERLOAD',
        message: msg,
        date: tomorrow.toISOString().slice(0, 10),
        copyText: `⚠️ ${msg}`,
      });
    }
  }

  for (let i = 0; i < 3 && reminders.length < 10; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    const validations = await validateCoverage(d, coverageOptions);
    if (validations.length > 0) {
      const dateStr = d.toISOString().slice(0, 10);
      const summary = validations.map((v) => v.message).join('; ');
      reminders.push({
        type: 'UNRESOLVED_WARNING',
        message: `${dateStr}: ${summary}`,
        date: dateStr,
        copyText: `⚠️ Schedule ${dateStr}: ${summary}`,
      });
    }
  }

  return NextResponse.json({ reminders: reminders.slice(0, 10) });
}
