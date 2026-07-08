/**
 * GET /api/admin/import-center/templates/simple-sales?boutiqueId=
 * Date / Email / Amount template for /api/admin/sales-import (simple mode).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { buildSimpleSalesImportTemplate } from '@/lib/import-center/buildSimpleSalesTemplate';
import { salesImportTemplateFilename } from '@/lib/import-center/boutiqueTemplateScope';
import { requireAdminImportTemplateBoutique } from '@/lib/import-center/resolveAdminImportTemplateBoutique';

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const paramBoutiqueId = request.nextUrl.searchParams.get('boutiqueId');
  const scopeResult = await requireAdminImportTemplateBoutique(user, paramBoutiqueId);
  if ('res' in scopeResult) return scopeResult.res;
  const { boutique } = scopeResult;

  const buf = buildSimpleSalesImportTemplate({
    boutiqueId: boutique.id,
    boutiqueCode: boutique.code,
    boutiqueName: boutique.name,
  });
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${salesImportTemplateFilename('simple', boutique)}"`,
    },
  });
}
