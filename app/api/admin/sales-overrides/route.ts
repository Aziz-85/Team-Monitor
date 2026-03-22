/**
 * GET /api/admin/sales-overrides?boutiqueId=&month=YYYY-MM&limit=
 * ADMIN / SUPER_ADMIN. Visibility into SalesEntry sources and non-LEDGER rows (precedence outcomes).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getSalesOverrideSignals } from '@/lib/sales/salesOverrideSignals';
import { normalizeMonthKey } from '@/lib/time';

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ADMIN', 'SUPER_ADMIN']);
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code?: string }).code : '';
    if (code === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim();
  const monthRaw = request.nextUrl.searchParams.get('month')?.trim();
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '50') || 50;

  let monthKey: string | undefined;
  if (monthRaw) {
    monthKey = normalizeMonthKey(monthRaw);
    if (!MONTH_RE.test(monthKey)) {
      return NextResponse.json({ error: 'month must be YYYY-MM when provided' }, { status: 400 });
    }
  }

  const data = await getSalesOverrideSignals({
    boutiqueId: boutiqueId || undefined,
    monthKey,
    limit,
  });

  return NextResponse.json({
    overrides: data.nonLedgerRows,
    rejectedWrites: data.rejectedWrites,
    summary: {
      ...data.summary,
      note: data.note,
    },
  });
}
