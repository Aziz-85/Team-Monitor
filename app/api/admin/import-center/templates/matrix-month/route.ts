/**
 * GET /api/admin/import-center/templates/matrix-month?boutiqueId=&month=YYYY-MM
 * ADMIN: DATA_MATRIX with correct ScopeId = boutique code.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { buildMatrixMonthTemplateForBoutique } from '@/lib/import-center/buildMatrixMonthTemplate';
import { salesImportTemplateFilename } from '@/lib/import-center/boutiqueTemplateScope';
import { requireAdminImportTemplateBoutique } from '@/lib/import-center/resolveAdminImportTemplateBoutique';

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const month = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month (YYYY-MM) required' }, { status: 400 });
  }

  const paramBoutiqueId = request.nextUrl.searchParams.get('boutiqueId');
  const scopeResult = await requireAdminImportTemplateBoutique(user, paramBoutiqueId);
  if ('res' in scopeResult) return scopeResult.res;
  const { boutique } = scopeResult;

  try {
    const buf = await buildMatrixMonthTemplateForBoutique(boutique.id, month);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${salesImportTemplateFilename('matrix', boutique, month)}"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
