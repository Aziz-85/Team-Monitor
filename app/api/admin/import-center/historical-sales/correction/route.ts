/**
 * POST /api/admin/import-center/historical-sales/correction
 * Multipart: file, boutiqueId, reason (required), dryRun (0|1), month (optional YYYY-MM)
 * ADMIN / SUPER_ADMIN. Updates existing non-MANUAL SalesEntry rows only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, handleAdminError } from '@/lib/admin/requireAdmin';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runHistoricalCorrectionImport } from '@/lib/historical-sales-import/applyHistoricalSalesImport';

const ALLOWED_EXT = /\.(xlsx|xlsm)$/i;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return handleAdminError(e);
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const boutiqueId = (formData.get('boutiqueId') as string)?.trim() ?? '';
  const reason = (formData.get('reason') as string) ?? '';
  const dryRun = (formData.get('dryRun') as string)?.trim() !== '0';
  const month = (formData.get('month') as string)?.trim() || null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (!boutiqueId) {
    return NextResponse.json({ error: 'boutiqueId required' }, { status: 400 });
  }
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM when provided' }, { status: 400 });
  }

  const name = (file.name || '').toLowerCase();
  if (!ALLOWED_EXT.test(name)) {
    return NextResponse.json({ error: 'Only .xlsx or .xlsm allowed' }, { status: 400 });
  }

  const b = await prisma.boutique.findUnique({ where: { id: boutiqueId }, select: { id: true } });
  if (!b) {
    return NextResponse.json({ error: 'Boutique not found' }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await runHistoricalCorrectionImport({
    buffer,
    boutiqueId,
    actorUserId: user.id,
    dryRun,
    monthFilter: month,
    reason,
  });

  return NextResponse.json(result);
}
