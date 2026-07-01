import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  assertStoreReportAccess,
  buildStoreReport,
  StoreReportError,
} from '@/lib/reports/storeReportService';
import {
  buildStoreReportPdfBytes,
  storeReportPdfFilename,
} from '@/lib/reports/buildStoreReportPdf';
import { getCurrentMonthKeyRiyadh, normalizeMonthKey } from '@/lib/time';
import type { Role } from '@prisma/client';

const ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER'] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boutiqueId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ROLES.includes(user.role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { boutiqueId } = await params;
  const monthParam = request.nextUrl.searchParams.get('month');
  const monthKey =
    typeof monthParam === 'string' && monthParam.trim()
      ? normalizeMonthKey(monthParam.trim())
      : getCurrentMonthKeyRiyadh();

  try {
    await assertStoreReportAccess(user.role as Role, boutiqueId);
    const data = await buildStoreReport(boutiqueId, monthKey);
    const pdfBytes = await buildStoreReportPdfBytes(data);
    const filename = storeReportPdfFilename(data.meta);

    return new NextResponse(new Blob([pdfBytes as BlobPart]), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    if (e instanceof StoreReportError) {
      if (e.code === 'NOT_FOUND') {
        return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });
      }
      if (e.code === 'FORBIDDEN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
