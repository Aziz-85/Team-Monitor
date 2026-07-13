/**
 * POST /api/sales/import/yearly/dry-run
 * Multipart: file (.xlsx / .xlsm)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireYearlySalesImport } from '@/lib/sales/yearlyImportAccess';
import {
  buildYearlyEmployeeSalesImportPlan,
  type YearlyImportDryRunResult,
} from '@/lib/sales/yearlyEmployeeSalesImport';
import {
  importFileFromFormData,
  importScopeKeyForBoutique,
  runImportPreview,
  YEARLY_SALES_UPLOAD,
} from '@/lib/imports';

export async function POST(request: NextRequest) {
  const auth = await requireYearlySalesImport(request);
  if ('res' in auth) return auth.res;
  const { boutiqueId, user } = auth.scope;

  const formData = await request.formData().catch(() => null);
  const previewResult = await runImportPreview<YearlyImportDryRunResult>({
    importType: 'YEARLY_SALES',
    scopeKey: importScopeKeyForBoutique(boutiqueId),
    boutiqueId,
    uploadedById: user.id,
    file: importFileFromFormData(formData),
    validate: YEARLY_SALES_UPLOAD,
    parse: async (upload) =>
      buildYearlyEmployeeSalesImportPlan({
        buffer: upload.buffer,
        boutiqueId,
        fileName: upload.fileName,
      }),
    canApply: (result) => result.canApply,
  });

  if (!previewResult.ok) {
    return NextResponse.json({ error: previewResult.error }, { status: previewResult.status });
  }

  return NextResponse.json(previewResult.result);
}
