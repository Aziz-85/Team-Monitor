import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logSalesTargetAudit } from '@/lib/sales-target-audit';
import type { Role } from '@prisma/client';

/** POST: Admin only. Delete all EmployeeMonthlyTarget for the given month (reset). */
export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireRole>>;
  try {
    user = await requireRole(['MANAGER', 'ADMIN'] as Role[]);
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { month?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const month = typeof body.month === 'string' ? body.month.trim() : '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const deleted = await prisma.employeeMonthlyTarget.deleteMany({
    where: { month },
  });

  await logSalesTargetAudit(month, 'RESET', user.id, { deletedCount: deleted.count });

  return NextResponse.json({ ok: true, deletedCount: deleted.count });
}
