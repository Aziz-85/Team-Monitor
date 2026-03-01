/**
 * PUT /api/area/targets/boutique-monthly — Set boutique monthly target. AREA_MANAGER / SUPER_ADMIN only.
 * Body: { boutiqueId, month: "YYYY-MM", amount: number (SAR_INT), reason? }
 * Writes TargetChangeAudit (BOUTIQUE_MONTHLY).
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
  const monthParam = String(body.month ?? '').trim();
  const amount = body.amount;
  const reason = body.reason != null ? String(body.reason).trim() : null;

  if (!boutiqueId) {
    return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });
  }
  const monthKey = normalizeMonthKey(monthParam);
  if (!parseMonthKey(monthKey)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  if (!isSarInt(amount)) {
    return NextResponse.json({ error: 'amount must be a non-negative integer (SAR)' }, { status: 400 });
  }
  const amountInt = Math.trunc(Number(amount));

  const boutique = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true },
  });
  if (!boutique) {
    return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });
  }

  const existing = await prisma.boutiqueMonthlyTarget.findUnique({
    where: { boutiqueId_month: { boutiqueId, month: monthKey } },
    select: { id: true, amount: true, createdById: true },
  });

  const fromAmount = existing?.amount ?? 0;
  const toAmount = amountInt;

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.boutiqueMonthlyTarget.update({
        where: { id: existing.id },
        data: { amount: toAmount, updatedAt: new Date() },
      });
    } else {
      await tx.boutiqueMonthlyTarget.create({
        data: {
          boutiqueId,
          month: monthKey,
          amount: toAmount,
          createdById: actorId,
        },
      });
    }
    await tx.targetChangeAudit.create({
      data: {
        actorUserId: actorId,
        boutiqueId,
        employeeId: null,
        month: monthKey,
        scope: TargetAuditScope.BOUTIQUE_MONTHLY,
        fromAmount,
        toAmount,
        reason: reason ?? undefined,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    boutiqueId,
    month: monthKey,
    fromAmount,
    toAmount,
  });
}
