/**
 * GET /api/area/targets/summary — Target summaries for Area Manager UI. AREA_MANAGER / SUPER_ADMIN only.
 * Query: month=YYYY-MM, boutiqueId= (optional)
 * Returns list of boutiques with boutique monthly target; per-boutique employee targets can be fetched separately.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { assertAreaManagerOrSuperAdmin } from '@/lib/rbac';
import { parseMonthKey, normalizeMonthKey } from '@/lib/time';

export async function GET(request: NextRequest) {
  try {
    await assertAreaManagerOrSuperAdmin();
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const monthParam = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  const monthKey = normalizeMonthKey(monthParam);
  if (!parseMonthKey(monthKey)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim() ?? undefined;

  const boutiques = await prisma.boutique.findMany({
    where: { isActive: true, ...(boutiqueId ? { id: boutiqueId } : {}) },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });

  const boutiqueTargets = await prisma.boutiqueMonthlyTarget.findMany({
    where: { month: monthKey, boutiqueId: { in: boutiques.map((b) => b.id) } },
    select: { boutiqueId: true, amount: true },
  });
  const targetByBoutique = new Map(boutiqueTargets.map((t) => [t.boutiqueId, t.amount]));

  const list = boutiques.map((b) => ({
    boutiqueId: b.id,
    code: b.code,
    name: b.name,
    monthlyTargetAmount: targetByBoutique.get(b.id) ?? null,
  }));

  return NextResponse.json({ month: monthKey, boutiques: list });
}
