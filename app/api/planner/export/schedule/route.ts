import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { schedulePlannerRows } from '@/lib/services/planner';
import { plannerRowsToCSV } from '@/lib/services/planner';
import { getWeekStart } from '@/lib/services/scheduleLock';
import { getScheduleScope } from '@/lib/scope/scheduleScope';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

/**
 * POST /api/planner/export/schedule
 * Body: { from: YYYY-MM-DD, to: YYYY-MM-DD, boutiqueOnly?: boolean, rashidOnly?: boolean, format?: 'json' | 'csv' }
 * Returns schedule-based Planner rows (preview as JSON or download as CSV). Manager/Admin only.
 * F6: Export includes governance metadata (week status, locked by, exported by, timestamp).
 */
export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden. Export is allowed for Manager and Admin only.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const fromStr = String(body.from ?? '').trim();
  const toStr = String(body.to ?? '').trim();
  const format = body.format === 'csv' ? 'csv' : 'json';

  if (!fromStr || !toStr) {
    return NextResponse.json({ error: 'from and to required (YYYY-MM-DD)' }, { status: 400 });
  }

  const from = new Date(fromStr + 'T00:00:00Z');
  const to = new Date(toStr + 'T00:00:00Z');
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must be before or equal to to' }, { status: 400 });
  }

  const scheduleScope = await getScheduleScope(request);
  if (!scheduleScope?.boutiqueId) {
    return NextResponse.json({ error: 'No schedule scope' }, { status: 403 });
  }

  const filters = {
    boutiqueOnly: Boolean(body.boutiqueOnly),
    rashidOnly: Boolean(body.rashidOnly),
  };

  const rows = await schedulePlannerRows(from, to, filters, scheduleScope.boutiqueId);

  const weekStarts = new Set<string>();
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (cur <= end) {
    weekStarts.add(getWeekStart(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const exportedByRole = user?.role ?? '';
  const exportedByName = user?.employee?.name ?? user?.empId ?? '';
  const exportedBy = `${exportedByName} (${exportedByRole})`;

  const weeksGovernance: Array<{
    weekStart: string;
    status: string;
    lockStatus: string;
    lockedByName: string | null;
    lockedByRole: string | null;
    lockedAt: string | null;
    approvedByName: string | null;
    approvedByRole: string | null;
    approvedAt: string | null;
  }> = [];
  for (const ws of Array.from(weekStarts)) {
    const statusRow = await prisma.scheduleWeekStatus.findFirst({ where: { weekStart: ws } });
    const lockRow = await prisma.scheduleLock.findFirst({
      where: { scopeType: 'WEEK', scopeValue: ws, isActive: true },
    });
    const locked = !!lockRow;
    let lockedByName: string | null = null;
    let lockedByRole: string | null = null;
    if (lockRow) {
      const u = await prisma.user.findUnique({
        where: { id: lockRow.lockedByUserId },
        select: { role: true, employee: { select: { name: true } }, empId: true },
      });
      lockedByName = u?.employee?.name ?? u?.empId ?? null;
      lockedByRole = u?.role ?? null;
    }
    let approvedByName: string | null = null;
    let approvedByRole: string | null = null;
    if (statusRow?.approvedByUserId) {
      const u = await prisma.user.findUnique({
        where: { id: statusRow.approvedByUserId },
        select: { role: true, employee: { select: { name: true } }, empId: true },
      });
      approvedByName = u?.employee?.name ?? u?.empId ?? null;
      approvedByRole = u?.role ?? null;
    }
    weeksGovernance.push({
      weekStart: ws,
      status: statusRow?.status ?? 'DRAFT',
      lockStatus: locked ? 'LOCKED' : 'UNLOCKED',
      lockedByName,
      lockedByRole,
      lockedAt: lockRow?.lockedAt.toISOString() ?? null,
      approvedByName,
      approvedByRole,
      approvedAt: statusRow?.approvedAt?.toISOString() ?? null,
    });
  }

  const exportTimestamp = new Date().toISOString();
  const governance = {
    exportedBy,
    exportedByName,
    exportedByRole,
    exportedAt: exportTimestamp,
    exportTimestampLocal: new Date().toLocaleString(),
    weeks: weeksGovernance,
  };

  if (format === 'csv') {
    const csvBody = plannerRowsToCSV(rows);
    const escape = (s: string) => (/[",\n\r]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
    const meta = [
      'Schedule Export — Governance',
      `Exported by,${escape(exportedBy)}`,
      `Export timestamp (ISO),${escape(exportTimestamp)}`,
      `Export timestamp (local),${escape(governance.exportTimestampLocal)}`,
      '',
      'Week Start,Week Status,Lock Status,Locked By,Locked At,Approved By,Approved At',
      ...weeksGovernance.map((w) =>
        [
          w.weekStart,
          w.status,
          w.lockStatus,
          w.lockedByName && w.lockedByRole ? `${w.lockedByName} (${w.lockedByRole})` : w.lockedByName ?? '',
          w.lockedAt ?? '',
          w.approvedByName && w.approvedByRole ? `${w.approvedByName} (${w.approvedByRole})` : w.approvedByName ?? '',
          w.approvedAt ?? '',
        ].map((x) => escape(String(x))).join(',')
      ),
    ].join('\r\n');
    const csv = meta + '\r\n\r\n' + csvBody;
    const filename = `planner-schedule-${fromStr}-${toStr}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({ from: fromStr, to: toStr, rows, governance });
}
