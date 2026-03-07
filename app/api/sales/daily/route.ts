/**
 * GET /api/sales/daily?date=YYYY-MM-DD
 * Returns daily sales summaries for boutiques in scope (status, totals, linesTotal, diff).
 * RBAC: MANAGER, ASSISTANT_MANAGER, ADMIN, SUPER_ADMIN only. EMPLOYEE must use /sales/my.
 * No cache so ledger writes reflect immediately.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { assertOperationalBoutiqueId } from '@/lib/guards/assertOperationalBoutique';
import { parseDateRiyadh } from '@/lib/sales/normalizeDateRiyadh';
import { computeLinesTotal, computeDiff } from '@/lib/sales/reconcile';
import type { Role } from '@prisma/client';

const DAILY_SALES_VIEW_ROLES: Role[] = ['MANAGER', 'ASSISTANT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

export async function GET(request: NextRequest) {
  try {
    await requireRole(DAILY_SALES_VIEW_ROLES);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(
      { error: 'Daily sales view is for managers and above. Use My Sales for your own data.' },
      { status: 403 }
    );
  }

  const scope = await getOperationalScope(request);
  assertOperationalBoutiqueId(scope?.boutiqueId);
  if (!scope?.boutiqueId) {
    return NextResponse.json({ error: 'No operational boutique available' }, { status: 403 });
  }
  const resolved = { boutiqueIds: scope.boutiqueIds, label: scope.label };

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date') ?? '';
  const date = parseDateRiyadh(dateParam);

  const boutiques = await prisma.boutique.findMany({
    where: { id: { in: resolved.boutiqueIds } },
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });

  const summaries = await prisma.boutiqueSalesSummary.findMany({
    where: { boutiqueId: { in: resolved.boutiqueIds }, date },
    include: {
      boutique: { select: { id: true, code: true, name: true } },
      lines: { select: { id: true, employeeId: true, amountSar: true, source: true } },
      enteredBy: { select: { empId: true } },
      lockedBy: { select: { empId: true } },
    },
  });

  const summaryByBoutique = new Map(summaries.map((s) => [s.boutiqueId, s]));

  const result = await Promise.all(
    boutiques.map(async (boutique) => {
      const s = summaryByBoutique.get(boutique.id);
      if (!s) {
        return {
          id: null,
          boutiqueId: boutique.id,
          boutique,
          date: date.toISOString().slice(0, 10),
          totalSar: 0,
          status: 'DRAFT' as const,
          linesTotal: 0,
          diff: 0,
          canLock: false,
          enteredBy: null,
          lockedBy: null,
          lockedAt: null,
          lines: [] as { id: string; employeeId: string; amountSar: number; source: string }[],
        };
      }
      const linesTotal = await computeLinesTotal(s.id);
      const diff = computeDiff(s.totalSar, linesTotal);
      return {
        id: s.id,
        boutiqueId: s.boutiqueId,
        boutique: s.boutique,
        date: s.date.toISOString().slice(0, 10),
        totalSar: s.totalSar,
        status: s.status,
        linesTotal,
        diff,
        canLock: s.status === 'DRAFT' && diff === 0,
        enteredBy: s.enteredBy?.empId ?? null,
        lockedBy: s.lockedBy?.empId ?? null,
        lockedAt: s.lockedAt?.toISOString() ?? null,
        lines: s.lines,
      };
    })
  );

  return NextResponse.json({
    date: date.toISOString().slice(0, 10),
    scope: { boutiqueIds: resolved.boutiqueIds, label: resolved.label },
    summaries: result,
  });
}
