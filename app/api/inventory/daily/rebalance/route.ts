import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { monthlyRebalance } from '@/lib/services/inventoryDaily';
import type { Role } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    await requireRole(['MANAGER', 'ADMIN'] as Role[]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const scopeResult = await requireOperationalBoutique(request);
  if (!scopeResult.ok) return scopeResult.res;
  const { boutiqueId } = scopeResult;

  const body = await request.json().catch(() => ({}));
  const month = (body.month as string) || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }

  const result = await monthlyRebalance(boutiqueId, month);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
