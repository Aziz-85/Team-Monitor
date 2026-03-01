/**
 * GET /api/area/employees/transfer-history — Transfer history for an employee. AREA_MANAGER / SUPER_ADMIN only.
 * Query: employeeId= (required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertAreaManagerOrSuperAdmin } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  try {
    await assertAreaManagerOrSuperAdmin();
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const employeeId = request.nextUrl.searchParams.get('employeeId')?.trim();
  if (!employeeId) {
    return NextResponse.json({ error: 'employeeId required' }, { status: 400 });
  }

  const history = await prisma.employeeTransferAudit.findMany({
    where: { employeeId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      fromBoutiqueId: true,
      toBoutiqueId: true,
      reason: true,
      createdAt: true,
      actor: { select: { empId: true } },
    },
  });

  const boutiqueIds = Array.from(
    new Set(history.flatMap((h) => [h.fromBoutiqueId, h.toBoutiqueId]))
  );
  const boutiques =
    boutiqueIds.length > 0
      ? await prisma.boutique.findMany({
          where: { id: { in: boutiqueIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
  const byId = new Map(boutiques.map((b) => [b.id, b]));

  const items = history.map((h) => ({
    id: h.id,
    fromBoutiqueId: h.fromBoutiqueId,
    toBoutiqueId: h.toBoutiqueId,
    fromBoutique: byId.get(h.fromBoutiqueId) ?? null,
    toBoutique: byId.get(h.toBoutiqueId) ?? null,
    reason: h.reason,
    createdAt: h.createdAt,
    actorEmpId: h.actor.empId,
  }));

  return NextResponse.json({ items });
}
