/**
 * GET /api/targets/boutiques — List boutique monthly targets (filter: year, month, boutiqueId).
 * POST /api/targets/boutiques — Create one (body: month, boutiqueId, amount, source?, notes?).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTargetsView, requireTargetsEdit } from '@/lib/targets/scope';

export async function GET(request: NextRequest) {
  const scopeResult = await requireTargetsView(request);
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope!;

  const year = request.nextUrl.searchParams.get('year')?.trim();
  const month = request.nextUrl.searchParams.get('month')?.trim();
  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim();

  const where: {
    boutiqueId: { in: string[] };
    month?: string | { gte: string; lte: string };
  } = {
    boutiqueId: { in: scope.allowedBoutiqueIds },
  };
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    where.month = month;
  } else if (year && /^\d{4}$/.test(year)) {
    where.month = { gte: `${year}-01`, lte: `${year}-12` };
  }
  if (boutiqueId && scope.allowedBoutiqueIds.includes(boutiqueId)) {
    where.boutiqueId = { in: [boutiqueId] };
  }

  const list = await prisma.boutiqueMonthlyTarget.findMany({
    where,
    include: { boutique: { select: { id: true, code: true, name: true } }, createdBy: { select: { empId: true } } },
    orderBy: [{ month: 'desc' }, { boutiqueId: 'asc' }],
  });

  return NextResponse.json(list);
}

export async function POST(request: NextRequest) {
  const scopeResult = await requireTargetsEdit(request);
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope!;

  let body: { month?: string; boutiqueId?: string; amount?: number; source?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const month = typeof body.month === 'string' ? body.month.trim() : '';
  const boutiqueId = typeof body.boutiqueId === 'string' ? body.boutiqueId.trim() : '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  if (!scope.allowedBoutiqueIds.includes(boutiqueId)) {
    return NextResponse.json({ error: 'Boutique not in scope' }, { status: 403 });
  }

  const amount =
    typeof body.amount === 'number' && Number.isFinite(body.amount)
      ? Math.round(body.amount)
      : Number(body.amount);
  if (amount < 0 || !Number.isFinite(amount)) {
    return NextResponse.json({ error: 'amount must be a non-negative integer' }, { status: 400 });
  }

  const source = typeof body.source === 'string' ? body.source.trim() || null : null;
  const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;

  const created = await prisma.boutiqueMonthlyTarget.upsert({
    where: { boutiqueId_month: { boutiqueId, month } },
    create: {
      boutiqueId,
      month,
      amount,
      source,
      notes,
      createdById: scope.userId,
    },
    update: { amount, source, notes, updatedAt: new Date() },
    include: { boutique: { select: { id: true, code: true, name: true } } },
  });

  return NextResponse.json(created);
}
