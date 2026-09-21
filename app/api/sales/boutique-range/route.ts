/** Read-only boutique sales for an inclusive date range, sourced from canonical SalesEntry. */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { requireOperationalBoutique } from '@/lib/scope/requireOperationalBoutique';
import { validateBoutiqueSalesRange } from '@/lib/sales/boutiqueDateRange';
import { loadBoutiqueRangeReport } from '@/lib/sales/boutiqueRangeReport';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ASSISTANT_MANAGER', 'MANAGER', 'AREA_MANAGER', 'ADMIN', 'SUPER_ADMIN']);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scope = await requireOperationalBoutique(request);
  if (!scope.ok) return scope.res;

  const from = request.nextUrl.searchParams.get('from')?.trim() ?? '';
  const to = request.nextUrl.searchParams.get('to')?.trim() ?? '';
  const validationError = validateBoutiqueSalesRange(from, to);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  return NextResponse.json(await loadBoutiqueRangeReport({
    boutiqueId: scope.boutiqueId,
    boutiqueLabel: scope.boutiqueLabel,
    from,
    to,
  }));
}
