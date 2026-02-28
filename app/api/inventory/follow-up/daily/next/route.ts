import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { getDailyNextProjections } from '@/lib/services/inventoryFollowUp';
import type { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
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

  const from = request.nextUrl.searchParams.get('from');
  const daysParam = request.nextUrl.searchParams.get('days');
  if (!from) {
    return NextResponse.json({ error: 'from required (YYYY-MM-DD)' }, { status: 400 });
  }
  const fromDate = new Date(from + 'T12:00:00Z');
  if (Number.isNaN(fromDate.getTime())) {
    return NextResponse.json({ error: 'Invalid from' }, { status: 400 });
  }
  const days = Math.min(31, Math.max(1, parseInt(daysParam ?? '14', 10) || 14));

  const result = await getDailyNextProjections(boutiqueId, from, days);
  return NextResponse.json(result);
}
