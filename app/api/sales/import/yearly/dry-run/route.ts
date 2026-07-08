/**
 * POST /api/sales/import/yearly/dry-run
 * Multipart: file (.xlsx / .xlsm)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireYearlySalesImport } from '@/lib/sales/yearlyImportAccess';
import { buildYearlyEmployeeSalesImportPlan } from '@/lib/sales/yearlyEmployeeSalesImport';

const ALLOWED_EXTENSIONS = ['.xlsx', '.xlsm'];

export async function POST(request: NextRequest) {
  const auth = await requireYearlySalesImport(request);
  if ('res' in auth) return auth.res;
  const { boutiqueId } = auth.scope;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }

  const fileName = (file.name || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
    return NextResponse.json({ error: 'Only .xlsx or .xlsm files are allowed.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await buildYearlyEmployeeSalesImportPlan({
    buffer,
    boutiqueId,
    fileName: file.name || 'import.xlsx',
  });

  return NextResponse.json(result);
}
