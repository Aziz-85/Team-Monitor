import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { getOrCreateDailyRun } from '@/lib/services/inventoryDaily';
import { getSLACutoffMs, computeInventoryStatus } from '@/lib/inventorySla';
import type { Role, InventoryDailyRunSkipReason, LeaveType } from '@prisma/client';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type SkipCategory = 'SHORT' | 'LONG';

function toDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function classifySkip(
  empId: string,
  dateStr: string,
  skipReason: InventoryDailyRunSkipReason
): Promise<{ category: SkipCategory; expectedReturnDate: string | null }> {
  const d = toDateOnly(new Date(dateStr + 'T00:00:00Z'));

  // Default: SHORT (queue-eligible style)
  let category: SkipCategory = 'SHORT';
  let expectedReturnDate: string | null = null;

  if (skipReason === 'LEAVE') {
    const leave = await prisma.leave.findFirst({
      where: {
        empId,
        status: 'APPROVED',
        startDate: { lte: d },
        endDate: { gte: d },
      },
      select: { type: true, startDate: true, endDate: true },
    });
    if (leave) {
      const start = toDateOnly(leave.startDate);
      const end = toDateOnly(leave.endDate);
      const days = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      const isAnnual = leave.type === ('ANNUAL' as LeaveType);
      if (isAnnual || days > 1) {
        category = 'LONG';
      }
      expectedReturnDate = end.toISOString().slice(0, 10);
    }
  } else if (skipReason === 'INACTIVE') {
    // Inactive employees are effectively long-term out of rotation.
    category = 'LONG';
  } else {
    // OFF / ABSENT / EXCLUDED / EXCLUDED_TODAY treated as SHORT
    category = 'SHORT';
  }

  return { category, expectedReturnDate };
}

async function enrichSkips(
  boutiqueId: string,
  dateStr: string,
  skips: Array<{ empId: string; skipReason: InventoryDailyRunSkipReason }>
) {
  if (skips.length === 0) return [];

  const empIds = Array.from(new Set(skips.map((s) => s.empId)));
  const employees = await prisma.employee.findMany({
    where: { boutiqueId, empId: { in: empIds } },
    select: { empId: true, name: true },
  });
  const nameByEmp = new Map(employees.map((e) => [e.empId, e.name]));

  const enriched = [];
  for (const s of skips) {
    const { category, expectedReturnDate } = await classifySkip(s.empId, dateStr, s.skipReason);
    enriched.push({
      empId: s.empId,
      employeeName: nameByEmp.get(s.empId) ?? s.empId,
      skipReason: s.skipReason,
      skipCategory: category,
      expectedReturnDate,
    });
  }
  return enriched;
}

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireRole>>;
  try {
    user = await requireRole(['EMPLOYEE', 'MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const { boutiqueId } = scopeResult;

  const dateParam = request.nextUrl.searchParams.get('date');
  if (!dateParam) {
    return NextResponse.json({ error: 'date required (YYYY-MM-DD)' }, { status: 400 });
  }
  const date = new Date(dateParam + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  const run = await getOrCreateDailyRun(boutiqueId, date);
  const assigneeName =
    run.assignedEmpId != null
      ? (
          await prisma.employee.findFirst({
            where: { boutiqueId, empId: run.assignedEmpId },
            select: { name: true },
          })
        )?.name ?? null
      : null;

  const isManagerOrAdmin = user.role === 'MANAGER' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const isAssignedUser = user.empId === run.assignedEmpId;
  const cutoffMs = getSLACutoffMs(run.date as string);
  const effectiveStatus = computeInventoryStatus({
    baseStatus: run.status,
    completedAt: run.completedAt,
    cutoffTimeMs: cutoffMs,
  });

  const payload: Record<string, unknown> = {
    date: run.date,
    assignedEmpId: run.assignedEmpId,
    assigneeName,
    status: run.status,
    effectiveStatus,
    reason: run.reason,
    completedByEmpId: run.completedByEmpId,
    completedAt: run.completedAt,
    isMe: isAssignedUser,
    canMarkComplete: (run.assignedEmpId != null && isAssignedUser) || isManagerOrAdmin,
    isManagerOrAdmin,
    assignmentSource: run.assignmentSource,
    decisionExplanation: run.decisionExplanation,
  };

  if (isManagerOrAdmin) {
    payload.skips = await enrichSkips(boutiqueId, run.date as string, run.skips ?? []);

    // Waiting queue snapshot (short skips only; long absences not queued)
    const queue = await prisma.inventoryDailyWaitingQueue.findMany({
      where: { boutiqueId, expiresAt: { gt: new Date() } },
      orderBy: { queuedAt: 'asc' },
      select: {
        empId: true,
        reason: true,
        queuedAt: true,
        expiresAt: true,
        lastSkippedDate: true,
        employee: { select: { name: true } },
      },
    });
    payload.waitingQueue = queue.map((q) => ({
      empId: q.empId,
      employeeName: q.employee?.name ?? q.empId,
      reason: q.reason,
      queuedAt: q.queuedAt.toISOString(),
      expiresAt: q.expiresAt.toISOString(),
      lastSkippedDate: q.lastSkippedDate.toISOString().slice(0, 10),
    }));
  }

  return NextResponse.json(payload);
}
