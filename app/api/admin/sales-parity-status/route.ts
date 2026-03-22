/**
 * GET /api/admin/sales-parity-status?boutiqueId=&month=YYYY-MM
 * ADMIN / SUPER_ADMIN. Lightweight parity summary (runs same checks as diagnostics; on-demand only).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { runParityDiagnosticsForBoutique } from '@/lib/sales/parityDiagnostics';
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
  if (!boutiqueId || !monthRaw) {
    return NextResponse.json(
      { error: 'boutiqueId and month (YYYY-MM) required', ok: null },
      { status: 400 }
    );
  }
  const monthKey = normalizeMonthKey(monthRaw);
  if (!MONTH_RE.test(monthKey)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const payload = await runParityDiagnosticsForBoutique({ boutiqueId, monthKey });
  return NextResponse.json({
    ok: payload.ok,
    failedContracts: payload.failedContracts.length,
    lastCheckedAt: payload.generatedAt,
    failedContractNames: payload.failedContracts,
  });
}
