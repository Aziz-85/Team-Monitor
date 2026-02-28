import { NextRequest, NextResponse } from 'next/server';
import { getMobileUserFromRequest } from '@/lib/mobileAuth';
import {
  getManagerDashboard,
  getDefaultDashboardDate,
} from '@/lib/dashboard/managerDashboard';

const ALLOWED_ROLES = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'] as const;

export async function GET(request: NextRequest) {
  const mobileUser = await getMobileUserFromRequest(request);
  if (!mobileUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!ALLOWED_ROLES.includes(mobileUser.role as (typeof ALLOWED_ROLES)[number])) {
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
    const result = await getManagerDashboard(boutiqueId, date);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[mobile/dashboard/manager]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
