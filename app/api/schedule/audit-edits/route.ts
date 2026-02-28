import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { canApproveWeek } from '@/lib/rbac/schedulePermissions';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canApproveWeek(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope || scheduleScope.boutiqueIds.length === 0) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const weekStart = params.get('weekStart') ?? '';
  const editorId = params.get('editorId') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const where: {
    weekStart?: Date | { gte: Date; lte: Date };
    editorId?: string;
    OR?: Array<{ boutiqueId: { in: string[] } } | { boutiqueId: null }>;
  } = {
    OR: [
      { boutiqueId: { in: scheduleScope.boutiqueIds } },
      { boutiqueId: null },
    ],
  };
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    where.weekStart = {
      gte: new Date(from + 'T00:00:00Z'),
      lte: new Date(to + 'T23:59:59.999Z'),
    };
  } else if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    where.weekStart = new Date(weekStart + 'T00:00:00Z');
  }
  if (editorId) where.editorId = editorId;

  const rows = await prisma.scheduleEditAudit.findMany({
    where,
    orderBy: { editedAt: 'desc' },
    take: 200,
    include: {
      editor: {
        select: {
          empId: true,
          employee: { select: { name: true } },
        },
      },
    },
  });

  const list = rows.map((r) => ({
    id: r.id,
    weekStart: r.weekStart instanceof Date ? r.weekStart.toISOString().slice(0, 10) : String(r.weekStart).slice(0, 10),
    editorId: r.editorId,
    editorName: r.editor.employee?.name ?? r.editor.empId,
    editedAt: r.editedAt.toISOString(),
    changesJson: r.changesJson,
    changedCells: (r.changesJson as { counts?: { changedCells?: number } })?.counts?.changedCells ?? 0,
  }));

  return NextResponse.json({ list });
}
