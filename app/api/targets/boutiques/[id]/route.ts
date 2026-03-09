/**
 * GET /api/targets/boutiques/[id] — Get one.
 * PUT /api/targets/boutiques/[id] — Update (body: amount?, source?, notes?).
 * DELETE /api/targets/boutiques/[id] — Delete.
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

  const row = await prisma.boutiqueMonthlyTarget.findUnique({
    where: { id },
    include: { boutique: { select: { id: true, code: true, name: true } }, createdBy: { select: { empId: true } } },
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

  const existing = await prisma.boutiqueMonthlyTarget.findUnique({ where: { id } });
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

  const updated = await prisma.boutiqueMonthlyTarget.update({
    where: { id },
    data,
    include: { boutique: { select: { id: true, code: true, name: true } } },
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

  const existing = await prisma.boutiqueMonthlyTarget.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!scope.allowedBoutiqueIds.includes(existing.boutiqueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.boutiqueMonthlyTarget.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: true });
}
