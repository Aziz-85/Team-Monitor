/**
 * GET /api/area/targets/audit — Target change audit history. AREA_MANAGER / SUPER_ADMIN only.
 * Query: month=YYYY-MM, boutiqueId=, employeeId= (all optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertAreaManagerOrSuperAdmin } from '@/lib/rbac';
import { parseMonthKey, normalizeMonthKey } from '@/lib/time';

export async function GET(request: NextRequest) {
  try {
    await assertAreaManagerOrSuperAdmin();
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const monthParam = request.nextUrl.searchParams.get('month')?.trim();
  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim();
  const employeeId = request.nextUrl.searchParams.get('employeeId')?.trim();
  const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10) || 50));

  const where: { month?: string; boutiqueId?: string; employeeId?: string | null } = {};
  if (monthParam) {
    const monthKey = normalizeMonthKey(monthParam);
    if (parseMonthKey(monthKey)) where.month = monthKey;
  }
  if (boutiqueId) where.boutiqueId = boutiqueId;
  if (employeeId) where.employeeId = employeeId;

  const audits = await prisma.targetChangeAudit.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      boutiqueId: true,
      employeeId: true,
      month: true,
      scope: true,
      fromAmount: true,
      toAmount: true,
      reason: true,
      createdAt: true,
      actor: { select: { empId: true } },
    },
  });

  const items = audits.map((a) => ({
    id: a.id,
    boutiqueId: a.boutiqueId,
    employeeId: a.employeeId,
    month: a.month,
    scope: a.scope,
    fromAmount: a.fromAmount,
    toAmount: a.toAmount,
    reason: a.reason,
    createdAt: a.createdAt,
    actorEmpId: a.actor.empId,
  }));

  return NextResponse.json({ items });
}
