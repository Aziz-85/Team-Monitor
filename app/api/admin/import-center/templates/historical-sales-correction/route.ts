/**
 * GET /api/admin/import-center/templates/historical-sales-correction?boutiqueId=&year=YYYY
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { buildYearlySalesTemplateForBoutique } from '@/lib/import-center/buildYearlySalesTemplate';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim() ?? '';
  const year =
    request.nextUrl.searchParams.get('year')?.trim() ?? String(new Date().getFullYear());
  if (!boutiqueId) {
    return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });
  }
  if (!/^\d{4}$/.test(year)) {
    return NextResponse.json({ error: 'year must be YYYY' }, { status: 400 });
  }

  try {
    const buf = await buildYearlySalesTemplateForBoutique(boutiqueId, year, {
      mode: 'historical_correction',
    });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="HistoricalCorrection_${boutiqueId.slice(0, 8)}_${year}.xlsx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
