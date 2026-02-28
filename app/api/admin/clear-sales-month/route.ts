/**
 * POST /api/admin/clear-sales-month — delete all sales entries for a month (manual clear).
 * Body: { month: "YYYY-MM" }. ADMIN + MANAGER only. Audit: CLEAR_SALES_MONTH.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logSalesTargetAudit } from '@/lib/sales-target-audit';

const ADMIN_ROLES = ['MANAGER', 'ADMIN'] as const;

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...ADMIN_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { month?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const month = typeof body.month === 'string' ? body.month.trim() : '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const result = await prisma.salesEntry.deleteMany({
    where: { month },
  });
  await logSalesTargetAudit(month, 'CLEAR_SALES_MONTH', user.id, {
    deletedCount: result.count,
  });
  return NextResponse.json({ ok: true, deletedCount: result.count });
}
