/**
 * GET /api/admin/import-center/templates/simple-sales?boutiqueId=
 * Date / Email / Amount template for /api/admin/sales-import (simple mode).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { prisma } from '@/lib/db';
import { buildSimpleSalesImportTemplate } from '@/lib/import-center/buildSimpleSalesTemplate';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim() ?? '';
  if (!boutiqueId) {
    return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });
  }

  const b = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true, code: true, name: true },
  });
  if (!b) return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });

  const buf = buildSimpleSalesImportTemplate({
    boutiqueId: b.id,
    boutiqueCode: b.code,
    boutiqueName: b.name,
  });
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="SimpleSales_${boutiqueId.slice(0, 8)}.xlsx"`,
    },
  });
}
