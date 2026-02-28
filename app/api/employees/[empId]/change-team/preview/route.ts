import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getScheduleGridForWeek } from '@/lib/services/scheduleGrid';
import { getWeekStart } from '@/lib/services/scheduleLock';
import type { Role } from '@prisma/client';

const ALLOWED_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN'];

/**
 * GET /api/employees/[empId]/change-team/preview?effectiveFrom=YYYY-MM-DD&newTeam=A
 * Returns simulated team counts for the week containing effectiveFrom, before and after the change.
 * Used to show imbalance warning in Change Team modal.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ empId: string }> }
) {
  try {
    await requireRole(ALLOWED_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { empId } = await params;
  if (!empId) return NextResponse.json({ error: 'empId required' }, { status: 400 });

  const effectiveFromStr = request.nextUrl.searchParams.get('effectiveFrom')?.trim() ?? '';
  const newTeam = (request.nextUrl.searchParams.get('newTeam') ?? '').toUpperCase();
  if (!effectiveFromStr || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFromStr)) {
    return NextResponse.json({ error: 'effectiveFrom (YYYY-MM-DD) required' }, { status: 400 });
  }
  if (newTeam !== 'A' && newTeam !== 'B') {
    return NextResponse.json({ error: 'newTeam must be A or B' }, { status: 400 });
  }

  const effectiveFrom = new Date(effectiveFromStr + 'T00:00:00Z');
  const weekStart = getWeekStart(effectiveFrom);

  const emp = await prisma.employee.findUnique({
    where: { empId },
    select: { boutiqueId: true },
  });
  const boutiqueIds = emp?.boutiqueId ? [emp.boutiqueId] : undefined;

  const grid = await getScheduleGridForWeek(weekStart, { boutiqueIds });
  let teamACount = 0;
  let teamBCount = 0;
  for (const row of grid.rows) {
    if (row.team === 'A') teamACount++;
    else if (row.team === 'B') teamBCount++;
  }

  let afterTeamACount = teamACount;
  let afterTeamBCount = teamBCount;
  const currentRow = grid.rows.find((r) => r.empId === empId);
  if (currentRow) {
    if (currentRow.team === 'A') {
      afterTeamACount--;
      afterTeamBCount++;
    } else if (currentRow.team === 'B') {
      afterTeamBCount--;
      afterTeamACount++;
    }
  }

  const imbalance = Math.abs(afterTeamACount - afterTeamBCount) > 2;

  return NextResponse.json({
    weekStart,
    teamACount,
    teamBCount,
    afterTeamACount,
    afterTeamBCount,
    imbalance,
  });
}
