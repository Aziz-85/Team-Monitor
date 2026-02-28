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
  if (!user.boutiqueId) return NextResponse.json({ error: 'Account not assigned to a boutique' }, { status: 403 });
  const boutiqueId = user.boutiqueId;

  let body: { month?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const month = typeof body.month === 'string' ? body.month.trim() : '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  const amount =
    typeof body.amount === 'number' && Number.isFinite(body.amount)
      ? Math.round(body.amount)
      : Number(body.amount);
  if (amount < 0 || !Number.isFinite(amount)) {
    return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 });
  }

  const existing = await prisma.boutiqueMonthlyTarget.findFirst({
    where: { month, boutiqueId },
  });
  const target = await prisma.boutiqueMonthlyTarget.upsert({
    where: { boutiqueId_month: { boutiqueId, month } },
    create: { boutiqueId, month, amount, createdById: user.id },
    update: { amount, updatedAt: new Date() },
  });
  await logSalesTargetAudit(month, 'SET_BOUTIQUE_TARGET', user.id, {
    amount: target.amount,
    previousAmount: existing?.amount ?? null,
  }, { boutiqueId });
  return NextResponse.json(target);
}

/** DELETE: remove boutique target for the given month (clear manually set target). */
export async function DELETE(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole([...ADMIN_ROLES]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.boutiqueId) return NextResponse.json({ error: 'Account not assigned to a boutique' }, { status: 403 });
  const boutiqueId = user.boutiqueId;

  const month = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const existing = await prisma.boutiqueMonthlyTarget.findFirst({
    where: { month, boutiqueId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.boutiqueMonthlyTarget.delete({
    where: { boutiqueId_month: { boutiqueId, month } },
  });
  await logSalesTargetAudit(month, 'CLEAR_BOUTIQUE_TARGET', user.id, {
    previousAmount: existing.amount,
  }, { boutiqueId: existing.boutiqueId });
  return NextResponse.json({ ok: true, deleted: true });
}
