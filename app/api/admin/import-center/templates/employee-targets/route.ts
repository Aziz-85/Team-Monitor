/**
 * GET /api/admin/import-center/templates/employee-targets?boutiqueId=&month=YYYY-MM
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { normalizeMonthKey } from '@/lib/time';
import { buildEmployeeTargetsTemplateScoped } from '@/lib/import-center/targetTemplatesScoped';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const boutiqueId = request.nextUrl.searchParams.get('boutiqueId')?.trim() ?? '';
  const monthRaw = request.nextUrl.searchParams.get('month')?.trim() ?? '';
  if (!boutiqueId || !monthRaw) {
    return NextResponse.json({ error: 'boutiqueId and month (YYYY-MM) required' }, { status: 400 });
  }
  const month = normalizeMonthKey(monthRaw);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'invalid month' }, { status: 400 });
  }

  try {
    const buf = await buildEmployeeTargetsTemplateScoped(boutiqueId, month);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="EmployeeTargets_${month}_${boutiqueId.slice(0, 8)}.xlsx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
