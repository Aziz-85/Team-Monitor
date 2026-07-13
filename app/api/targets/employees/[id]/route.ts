/**
 * GET /api/targets/employees/[id]
 * PUT /api/targets/employees/[id]
 * DELETE /api/targets/employees/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTargetsView, requireTargetsEdit } from '@/lib/targets/scope';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scopeResult = await requireTargetsView(request);
  if (scopeResult.res) return scopeResult.res;
  const { id } = await params;

  const row = await prisma.employeeMonthlyTarget.findUnique({
    where: { id },
    include: {
      boutique: { select: { id: true, code: true, name: true } },
      user: {
        select: {
          id: true,
          empId: true,
          employee: { select: { name: true } },
        },
      },
    },
  });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!scopeResult.scope!.allowedBoutiqueIds.includes(row.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(row);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scopeResult = await requireTargetsEdit(request);
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope!;
  const { id } = await params;

  const existing = await prisma.employeeMonthlyTarget.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!scope.allowedBoutiqueIds.includes(existing.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { amount?: number; source?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const data: { amount?: number; source?: string | null; notes?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (typeof body.amount === 'number' && Number.isFinite(body.amount) && body.amount >= 0) {
    data.amount = Math.round(body.amount);
  }
  if (typeof body.source === 'string') data.source = body.source.trim() || null;
  if (typeof body.notes === 'string') data.notes = body.notes.trim() || null;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.employeeMonthlyTarget.update({
      where: { id },
      data,
      include: {
        boutique: { select: { id: true, code: true, name: true } },
        user: {
          select: {
            id: true,
            empId: true,
            employee: { select: { name: true } },
          },
        },
      },
    });
    if (data.amount != null && data.amount !== existing.amount) {
      await tx.targetChangeAudit.create({
        data: {
          actorUserId: scope.userId,
          boutiqueId: existing.boutiqueId,
          employeeId: existing.userId,
          month: existing.month,
          scope: 'EMPLOYEE_MONTHLY',
          fromAmount: existing.amount,
          toAmount: data.amount,
          reason: body.notes?.trim() || 'Employee target updated via API',
        },
      });
    }
    return row;
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scopeResult = await requireTargetsEdit(request);
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope!;
  const { id } = await params;

  const existing = await prisma.employeeMonthlyTarget.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!scope.allowedBoutiqueIds.includes(existing.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.targetChangeAudit.create({
      data: {
        actorUserId: scope.userId,
        boutiqueId: existing.boutiqueId,
        employeeId: existing.userId,
        month: existing.month,
        scope: 'EMPLOYEE_MONTHLY',
        fromAmount: existing.amount,
        toAmount: 0,
        reason: 'Employee target deleted via API',
      },
    });
    await tx.employeeMonthlyTarget.delete({ where: { id } });
  });
  return NextResponse.json({ ok: true, deleted: true });
}
