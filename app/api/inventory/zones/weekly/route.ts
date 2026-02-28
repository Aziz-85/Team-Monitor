import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { getWeeklyRunsGrouped } from '@/lib/services/inventoryZones';
import { getSLACutoffMs, computeInventoryStatus } from '@/lib/inventorySla';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

function fridayOfWeek(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'EMPLOYEE'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const { boutiqueId } = scopeResult;

  const weekStart = request.nextUrl.searchParams.get('weekStart');
  if (!weekStart) {
    return NextResponse.json({ error: 'weekStart required (YYYY-MM-DD, Saturday)' }, { status: 400 });
  }
  const sessionEmpId = user?.empId ?? null;
  const isManagerOrAdmin = user?.role === 'MANAGER' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const { byEmployee, myZones } = await getWeeklyRunsGrouped(boutiqueId, weekStart, sessionEmpId);
  const weekCutoffMs = getSLACutoffMs(fridayOfWeek(weekStart));

  const addEffective = (z: { status: string; completedAt: Date | null }) => ({
    ...z,
    effectiveStatus: computeInventoryStatus({
      baseStatus: z.status,
      completedAt: z.completedAt,
      cutoffTimeMs: weekCutoffMs,
    }),
  });

  return NextResponse.json({
    weekStart,
    byEmployee: byEmployee.map((e) => ({
      ...e,
      zones: e.zones.map(addEffective),
    })),
    myZones: myZones.map(addEffective),
    isManagerOrAdmin,
  });
}
