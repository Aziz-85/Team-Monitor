/**
 * GET /api/admin/import-center/templates/matrix-month?boutiqueId=&month=YYYY-MM
 * ADMIN: DATA_MATRIX with correct ScopeId = boutique code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { buildMatrixMonthTemplateForBoutique } from '@/lib/import-center/buildMatrixMonthTemplate';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim() ?? '';
  const month = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  if (!boutiqueId || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'boutiqueId and month (YYYY-MM) required' }, { status: 400 });
  }

  try {
    const buf = await buildMatrixMonthTemplateForBoutique(boutiqueId, month);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Matrix_${month}_${boutiqueId.slice(0, 8)}.xlsx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
