/**
 * GET /api/admin/import-center/templates/historical-snapshot?boutiqueId=&month=YYYY-MM
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { buildHistoricalSnapshotTemplateForBoutique } from '@/lib/import-center/buildHistoricalSnapshotTemplate';

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
    const buf = await buildHistoricalSnapshotTemplateForBoutique(boutiqueId, month);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="HistoricalSnapshot_${month}_${boutiqueId.slice(0, 8)}.xlsx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
