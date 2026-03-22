/**
 * GET /api/admin/import-center/templates/boutique-targets?boutiqueId=
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { buildBoutiqueTargetsTemplateScoped } from '@/lib/import-center/targetTemplatesScoped';

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

  try {
    const buf = await buildBoutiqueTargetsTemplateScoped(boutiqueId);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="BoutiqueTargets_${boutiqueId.slice(0, 8)}.xlsx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
