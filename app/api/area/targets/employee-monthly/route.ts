/**
 * PUT /api/area/targets/employee-monthly — Set employee monthly target. AREA_MANAGER / SUPER_ADMIN only.
 * Body: { boutiqueId, employeeId (Employee.empId), month: "YYYY-MM", amount: number (SAR_INT), reason? }
 * Resolves employeeId (empId) to User.id for EmployeeMonthlyTarget.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertAreaManagerOrSuperAdmin } from '@/lib/rbac';
import { parseMonthKey, normalizeMonthKey } from '@/lib/time';
import { TargetAuditScope } from '@prisma/client';

function isSarInt(n: unknown): n is number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return false;
  if (n !== Math.trunc(n)) return false;
  return n >= 0;
}

export async function PUT(request: NextRequest) {
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
  const boutiqueId = String(body.boutiqueId ?? '').trim();
  const empId = body.employeeId != null ? String(body.employeeId).trim() : '';
  const monthParam = String(body.month ?? '').trim();
  const amount = body.amount;
  const reason = body.reason != null ? String(body.reason).trim() : null;

  if (!boutiqueId || !empId) {
    return NextResponse.json({ error: 'boutiqueId and employeeId (empId) required' }, { status: 400 });
  }
  const monthKey = normalizeMonthKey(monthParam);
  if (!parseMonthKey(monthKey)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  if (!isSarInt(amount)) {
    return NextResponse.json({ error: 'amount must be a non-negative integer (SAR)' }, { status: 400 });
  }
  const amountInt = Math.trunc(Number(amount));

  const employee = await prisma.employee.findUnique({
    where: { empId },
    select: { empId: true, user: { select: { id: true } } },
  });
  const userId = employee?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Employee not found or has no login account' }, { status: 404 });
  }

  const boutique = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true },
  });
  if (!boutique) {
    return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });
  }

  const existing = await prisma.employeeMonthlyTarget.findUnique({
    where: {
      boutiqueId_month_userId: { boutiqueId, month: monthKey, userId },
    },
    select: { id: true, amount: true },
  });

  const fromAmount = existing?.amount ?? 0;
  const toAmount = amountInt;

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.employeeMonthlyTarget.update({
        where: { id: existing.id },
        data: { amount: toAmount, updatedAt: new Date() },
      });
    } else {
      await tx.employeeMonthlyTarget.create({
        data: {
          boutiqueId,
          month: monthKey,
          userId,
          amount: toAmount,
        },
      });
    }
    await tx.targetChangeAudit.create({
      data: {
        actorUserId: actorId,
        boutiqueId,
        employeeId: userId,
        month: monthKey,
        scope: TargetAuditScope.EMPLOYEE_MONTHLY,
        fromAmount,
        toAmount,
        reason: reason ?? undefined,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    boutiqueId,
    employeeId: empId,
    month: monthKey,
    fromAmount,
    toAmount,
  });
}
