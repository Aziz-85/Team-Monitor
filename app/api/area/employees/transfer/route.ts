/**
 * POST /api/area/employees/transfer — Transfer employee to another boutique. AREA_MANAGER / SUPER_ADMIN only.
 * Body: { employeeId (empId), toBoutiqueId, reason? }
 * Creates EmployeeTransferAudit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertAreaManagerOrSuperAdmin } from '@/lib/rbac';

export async function POST(request: NextRequest) {
  let actorId: string;
  try {
    const user = await assertAreaManagerOrSuperAdmin();
    actorId = user.id;
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const employeeId = String(body.employeeId ?? body.empId ?? '').trim();
  const toBoutiqueId = String(body.toBoutiqueId ?? '').trim();
  const reason = body.reason != null ? String(body.reason).trim() : null;

  if (!employeeId || !toBoutiqueId) {
    return NextResponse.json({ error: 'employeeId and toBoutiqueId required' }, { status: 400 });
  }

  const [employee, toBoutique] = await Promise.all([
    prisma.employee.findUnique({
      where: { empId: employeeId },
      select: { empId: true, boutiqueId: true, active: true },
    }),
    prisma.boutique.findUnique({
      where: { id: toBoutiqueId },
      select: { id: true },
    }),
  ]);

  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }
  if (!toBoutique) {
    return NextResponse.json({ error: 'Target boutique not found' }, { status: 404 });
  }
  if (employee.boutiqueId === toBoutiqueId) {
    return NextResponse.json({ error: 'Employee already in target boutique' }, { status: 400 });
  }
  if (!employee.active) {
    return NextResponse.json({ error: 'Cannot transfer inactive employee' }, { status: 400 });
  }

  const fromBoutiqueId = employee.boutiqueId;

  await prisma.$transaction([
    prisma.employee.update({
      where: { empId: employeeId },
      data: { boutiqueId: toBoutiqueId },
    }),
    prisma.employeeTransferAudit.create({
      data: {
        actorUserId: actorId,
        employeeId,
        fromBoutiqueId,
        toBoutiqueId,
        reason: reason ?? undefined,
      },
    }),
    // Sync User.boutiqueId so "Working on" and schedule scope reflect the new branch on next request
    prisma.user.updateMany({
      where: { empId: employeeId },
      data: { boutiqueId: toBoutiqueId },
    }),
  ]);

  return NextResponse.json({ ok: true, employeeId, fromBoutiqueId, toBoutiqueId });
}
