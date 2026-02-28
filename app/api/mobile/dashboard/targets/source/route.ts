import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getMobileUserFromRequest } from '@/lib/mobileAuth';
import { getDaysInMonth, normalizeDateOnlyRiyadh } from '@/lib/time';
import { getDailyTargetForDay } from '@/lib/targets/dailyTarget';
import { getDefaultDashboardDate } from '@/lib/dashboard/managerDashboard';

const ALLOWED_ROLES = ['MANAGER', 'ADMIN'] as const;

export type TargetSourceResponse = {
  date: string;
  boutiqueId: string;
  dailyTarget: number;
  source: {
    kind: 'daily_table' | 'computed_from_monthly' | 'web_helper' | 'other';
    table?: string;
    recordIds?: string[];
    notes?: string;
  };
  computed: {
    monthlyTarget?: number;
    workingDays?: number;
    calendarDays?: number;
    formula?: string;
  };
};

export async function GET(request: NextRequest) {
  const mobileUser = await getMobileUserFromRequest(request);
  if (!mobileUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = mobileUser.role as (typeof ALLOWED_ROLES)[number];
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const boutiqueId = mobileUser.boutiqueId;
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam.trim())
      ? dateParam.trim()
      : getDefaultDashboardDate();

  try {
    const dayStart = normalizeDateOnlyRiyadh(date);
    const monthKey = date.slice(0, 7);
    const calendarDays = getDaysInMonth(monthKey);
    const dayOfMonth1Based = dayStart.getUTCDate();

    const boutiqueTarget = await prisma.boutiqueMonthlyTarget.findUnique({
      where: { boutiqueId_month: { boutiqueId, month: monthKey } },
      select: { id: true, amount: true },
    });

    const monthlyTarget = boutiqueTarget?.amount ?? 0;
    const dailyTarget =
      calendarDays > 0
        ? getDailyTargetForDay(monthlyTarget, calendarDays, dayOfMonth1Based)
        : 0;

    const response: TargetSourceResponse = {
      date,
      boutiqueId,
      dailyTarget,
      source: {
        kind: 'computed_from_monthly',
        table: 'BoutiqueMonthlyTarget',
        recordIds: boutiqueTarget ? [boutiqueTarget.id] : [],
        notes:
          'Same as web: lib/targets/dailyTarget.getDailyTargetForDay. Used by /api/me/targets and manager dashboard.',
      },
      computed: {
        monthlyTarget,
        calendarDays,
        formula:
          'base = floor(monthlyTarget / calendarDays); remainder = monthlyTarget - base*calendarDays; dailyTarget = base + (dayOfMonth <= remainder ? 1 : 0)',
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[mobile/dashboard/targets/source]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
