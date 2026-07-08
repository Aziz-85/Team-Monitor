/**
 * GET /api/sales/import/yearly/template?year=YYYY
 * Download yearly employee sales template for current operational boutique.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildYearlySalesTemplateForBoutique } from '@/lib/import-center/buildYearlySalesTemplate';
import { salesImportTemplateFilename } from '@/lib/import-center/boutiqueTemplateScope';
import { requireYearlySalesImport } from '@/lib/sales/yearlyImportAccess';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireYearlySalesImport(request);
  if ('res' in auth) return auth.res;
  const { boutiqueId } = auth.scope;

  const year = request.nextUrl.searchParams.get('year')?.trim() ?? String(new Date().getFullYear());
  if (!/^\d{4}$/.test(year)) {
    return NextResponse.json({ error: 'year must be YYYY' }, { status: 400 });
  }

  const boutique = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true, code: true, name: true },
  });
  if (!boutique) {
    return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });
  }

  const buffer = await buildYearlySalesTemplateForBoutique(boutiqueId, year);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${salesImportTemplateFilename('yearly', boutique, year)}"`,
    },
  });
}
