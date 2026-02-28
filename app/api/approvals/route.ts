import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

const APPROVER_ROLES: Role[] = ['MANAGER', 'ADMIN'];

/**
 * GET /api/approvals
 * List PENDING approval requests. MANAGER/ADMIN only.
 * Query: module, weekStart, effectiveDate (optional filters).
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(APPROVER_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const moduleFilter = request.nextUrl.searchParams.get('module') ?? '';
  const weekStart = request.nextUrl.searchParams.get('weekStart') ?? '';
  const effectiveDate = request.nextUrl.searchParams.get('effectiveDate') ?? '';

  const where: { status: string; module?: string; weekStart?: Date; effectiveDate?: Date } = {
    status: 'PENDING',
  };
  if (moduleFilter && ['SCHEDULE', 'TEAM', 'INVENTORY', 'SALES'].includes(moduleFilter)) {
    where.module = moduleFilter;
  }
  if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    where.weekStart = new Date(weekStart + 'T00:00:00Z');
  }
  if (effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    where.effectiveDate = new Date(effectiveDate + 'T00:00:00Z');
  }

  const list = await prisma.approvalRequest.findMany({
    where,
    orderBy: { requestedAt: 'desc' },
    include: {
      requestedByUser: {
        select: {
          id: true,
          empId: true,
          role: true,
          employee: { select: { name: true } },
        },
      },
    },
  });

  const items = list.map((r) => ({
    id: r.id,
    module: r.module,
    actionType: r.actionType,
    payload: r.payload,
    status: r.status,
    requestedAt: r.requestedAt.toISOString(),
    effectiveDate: r.effectiveDate ? r.effectiveDate.toISOString().slice(0, 10) : null,
    weekStart: r.weekStart ? r.weekStart.toISOString().slice(0, 10) : null,
    requestedBy: r.requestedByUser
      ? {
          userId: r.requestedByUser.id,
          empId: r.requestedByUser.empId,
          role: r.requestedByUser.role,
          name: r.requestedByUser.employee?.name ?? r.requestedByUser.empId,
        }
      : null,
  }));

  return NextResponse.json({ items });
}
