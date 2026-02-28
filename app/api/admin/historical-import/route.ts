/**
 * POST /api/admin/historical-import
 * ADMIN only. Multipart: file (Excel .xlsx/.xlsm or CSV), boutiqueId, month (YYYY-MM).
 * Parses file, builds HistoricalSnapshot, writes atomically to data/historical-snapshots/{boutiqueId}/{YYYY-MM}.json.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { prisma } from '@/lib/db';
import { writeSnapshot } from '@/lib/historical-snapshots/storage';
import { parseExcelBuffer, parseCsvText } from '@/lib/historical-snapshots/parse';

const ALLOWED_EXCEL = /\.(xlsx|xlsm|xls)$/i;
const ALLOWED_CSV = /\.(csv|txt)$/i;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const boutiqueId = (formData.get('boutiqueId') as string)?.trim() ?? '';
  const month = (formData.get('month') as string)?.trim() ?? '';
  const previewOnly = formData.get('previewOnly') === 'true';

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (!boutiqueId) {
    return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }

  const boutique = await prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true },
  });
  if (!boutique) {
    return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });
  }

  const fileName = (file.name || '').toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  let snapshot: Awaited<ReturnType<typeof parseExcelBuffer>>;
  if (ALLOWED_EXCEL.test(fileName)) {
    snapshot = parseExcelBuffer(buffer, month, boutiqueId);
  } else if (ALLOWED_CSV.test(fileName)) {
    const text = buffer.toString('utf8');
    snapshot = parseCsvText(text, month, boutiqueId);
  } else {
    return NextResponse.json(
      { error: 'File must be .xlsx, .xlsm, .xls or .csv' },
      { status: 400 }
    );
  }

  if ('error' in snapshot) {
    return NextResponse.json({ error: snapshot.error }, { status: 400 });
  }

  if (previewOnly) {
    const dailyPreview = snapshot.daily.slice(0, 10);
    const staffRows: { date: string; empId: string; name: string; netSales: number; invoices: number; pieces: number; achievementPct: number }[] = [];
    for (const d of snapshot.daily) {
      for (const e of d.employees) {
        staffRows.push({
          date: d.date,
          empId: e.empId,
          name: e.name,
          netSales: e.netSales,
          invoices: e.invoices,
          pieces: e.pieces,
          achievementPct: e.achievementPct,
        });
      }
    }
    const staffPreview = staffRows.slice(0, 10);
    return NextResponse.json({
      preview: true,
      daily: dailyPreview,
      staff: staffPreview,
      dailyTotal: snapshot.daily.length,
      staffTotal: staffRows.length,
    });
  }

  try {
    await writeSnapshot(snapshot);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[historical-import] write failed:', msg);
    return NextResponse.json(
      { error: 'Failed to save snapshot. Check server logs.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    month: snapshot.month,
    boutiqueId: snapshot.boutiqueId,
    dailyCount: snapshot.daily.length,
    totals: snapshot.totals,
  });
}
