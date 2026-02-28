/**
 * GET /api/executive/yoy?month=YYYY-MM&daysPassed=N
 * Read-only. YoY reference from Excel (data/historical-excel/{branchCode}/{YYYY-MM}.xlsx).
 * Auth: same as other executive endpoints. Scope: active boutique only.
 * Returns 200 with lyMtdHalalas, lyEomHalalas, etc. or 204 if file missing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { loadYoYFromExcel } from '@/lib/yoy/loadYoYFromExcel';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = user.role as Role;
  if (role !== 'MANAGER' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await getOperationalScope(request);
  if (!scope?.boutiqueId) {
    return NextResponse.json({ error: 'No operational boutique available' }, { status: 403 });
  }

  const boutique = await prisma.boutique.findUnique({
    where: { id: scope.boutiqueId },
    select: { code: true },
  });
  if (!boutique?.code) {
    return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });
  }

  const monthParam = request.nextUrl.searchParams.get('month');
  const daysPassedParam = request.nextUrl.searchParams.get('daysPassed');

  const now = new Date();
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const daysPassed = daysPassedParam != null
    ? Math.max(0, parseInt(String(daysPassedParam), 10))
    : Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());

  const [y, m] = month.split('-').map(Number);
  const lyYear = y - 1;
  const lyMonth = `${lyYear}-${String(m).padStart(2, '0')}`;

  const daily = await loadYoYFromExcel({
    branchCode: boutique.code,
    month: lyMonth,
    year: lyYear,
  });

  if (!daily || daily.size === 0) {
    return new NextResponse(null, { status: 204 });
  }

  const sortedDates = Array.from(daily.keys()).filter((d) => d.startsWith(lyMonth)).sort();

  let lyMtdHalalas = 0;
  let lyEomHalalas = 0;
  let lyInvoicesMtd = 0;
  let lyInvoicesEom = 0;
  let lyPiecesMtd = 0;
  let lyPiecesEom = 0;

  for (const dateStr of sortedDates) {
    const dayNum = parseInt(dateStr.slice(8, 10), 10);
    const row = daily.get(dateStr)!;
    lyEomHalalas += row.netSalesHalalas;
    lyInvoicesEom += row.invoices;
    lyPiecesEom += row.pieces;
    if (dayNum >= 1 && dayNum <= daysPassed) {
      lyMtdHalalas += row.netSalesHalalas;
      lyInvoicesMtd += row.invoices;
      lyPiecesMtd += row.pieces;
    }
  }

  return NextResponse.json({
    month,
    daysPassed,
    lyMtdHalalas,
    lyEomHalalas,
    lyInvoicesMtd,
    lyInvoicesEom,
    lyPiecesMtd,
    lyPiecesEom,
  });
}
