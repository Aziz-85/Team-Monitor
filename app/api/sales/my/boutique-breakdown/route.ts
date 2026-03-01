/**
 * GET /api/sales/my/boutique-breakdown?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Employee sales total across all boutiques + breakdown by boutique (sale location).
 * SAR_INT only. RBAC: own data only (EMPLOYEE and above).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { sumEmployeeSales, sumEmployeeSalesByBoutique } from '@/lib/sales/attribution';
import { normalizeDateOnlyRiyadh } from '@/lib/time';
import { prisma } from '@/lib/db';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fromParam = request.nextUrl.searchParams.get('from')?.trim() ?? '';
  const toParam = request.nextUrl.searchParams.get('to')?.trim() ?? '';
  if (!DATE_REGEX.test(fromParam) || !DATE_REGEX.test(toParam)) {
    return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 });
  }

  const fromDate = normalizeDateOnlyRiyadh(new Date(fromParam + 'T12:00:00.000Z'));
  const toDate = normalizeDateOnlyRiyadh(new Date(toParam + 'T12:00:00.000Z'));
  if (fromDate.getTime() > toDate.getTime()) {
    return NextResponse.json({ error: 'from must be <= to' }, { status: 400 });
  }

  const [totalSar, byBoutiqueRows] = await Promise.all([
    sumEmployeeSales({ userId: user.id, fromDate, toDate }),
    sumEmployeeSalesByBoutique({ userId: user.id, fromDate, toDate }),
  ]);

  const boutiqueIds = byBoutiqueRows.map((r) => r.boutiqueId).filter(Boolean);
  const boutiques =
    boutiqueIds.length > 0
      ? await prisma.boutique.findMany({
          where: { id: { in: boutiqueIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
  const byId = new Map(boutiques.map((b) => [b.id, b]));

  const byBoutique = byBoutiqueRows.map((r) => {
    const b = byId.get(r.boutiqueId);
    return {
      boutiqueId: r.boutiqueId,
      boutiqueCode: b?.code ?? r.boutiqueId,
      boutiqueName: b?.name ?? null,
      amountSar: r.amount,
    };
  });

  return NextResponse.json({
    from: fromParam,
    to: toParam,
    totalSar,
    byBoutique,
  });
}
