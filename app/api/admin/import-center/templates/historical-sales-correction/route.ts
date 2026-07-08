/**
 * GET /api/admin/import-center/templates/historical-sales-correction?boutiqueId=&year=YYYY
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { buildYearlySalesTemplateForBoutique } from '@/lib/import-center/buildYearlySalesTemplate';
import { salesImportTemplateFilename } from '@/lib/import-center/boutiqueTemplateScope';
import { requireAdminImportTemplateBoutique } from '@/lib/import-center/resolveAdminImportTemplateBoutique';

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const year =
    request.nextUrl.searchParams.get('year')?.trim() ?? String(new Date().getFullYear());
  if (!/^\d{4}$/.test(year)) {
    return NextResponse.json({ error: 'year must be YYYY' }, { status: 400 });
  }

  const paramBoutiqueId = request.nextUrl.searchParams.get('boutiqueId');
  const scopeResult = await requireAdminImportTemplateBoutique(user, paramBoutiqueId);
  if ('res' in scopeResult) return scopeResult.res;
  const { boutique } = scopeResult;

  try {
    const buf = await buildYearlySalesTemplateForBoutique(boutique.id, year, {
      mode: 'historical_correction',
    });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${salesImportTemplateFilename('historical-correction', boutique, year)}"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
