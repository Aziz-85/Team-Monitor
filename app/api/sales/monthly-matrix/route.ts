/**
 * GET /api/sales/monthly-matrix?month=YYYY-MM&includePreviousMonth=true|false&source=LEDGER|ALL
 * Specialized matrix endpoint; row/day values are built from **SalesEntry** via
 * `salesEntryWhereForBoutiqueMonths` in `lib/sales/readSalesAggregate.ts` (same canonical read layer as dashboard/metrics).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getSessionUser } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { normalizeMonthKey } from '@/lib/time';
import { getMonthlyMatrixPayload } from '@/lib/sales/monthlyMatrixPayload';

export const dynamic = 'force-dynamic';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    user = await requireRole(['ADMIN', 'MANAGER', 'ASSISTANT_MANAGER']);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = await requireOperationalBoutique(request);
  if (!scope.ok) return scope.res;

  const scopeId = scope.boutiqueId;
  const monthParam = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  const monthKey = normalizeMonthKey(monthParam);
  if (!MONTH_REGEX.test(monthKey)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }
  const includePreviousMonth =
    request.nextUrl.searchParams.get('includePreviousMonth') === 'true';

  const sourceParam = (request.nextUrl.searchParams.get('source') ?? 'ALL').toUpperCase();
  const ledgerOnly = sourceParam === 'LEDGER';

  const payload = await getMonthlyMatrixPayload({
    boutiqueId: scopeId,
    monthParam: monthKey,
    includePreviousMonth,
    ledgerOnly,
    includeUserIds: false,
  });
  if ('error' in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  const { employees, ...rest } = payload;
  return NextResponse.json({
    ...rest,
    employees: employees.map(({ userId, ...e }) => (void userId, e)),
  });
}
