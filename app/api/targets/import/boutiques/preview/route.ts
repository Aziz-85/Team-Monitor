/**
 * POST /api/targets/import/boutiques/preview — Dry run: parse file and return preview (no DB write).
 * Body: FormData with "file" (Excel).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTargetsImport } from '@/lib/targets/scope';
import {
  parseAndValidateBoutiques,
  type BoutiquePreviewResult,
} from '@/lib/targets/importBoutiques';
import {
  importFileFromFormData,
  importScopeKeyForBoutiqueSet,
  runImportPreview,
  TARGETS_EXCEL_UPLOAD,
} from '@/lib/imports';

export async function POST(request: NextRequest) {
  const scopeResult = await requireTargetsImport(request);
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope!;

  const formData = await request.formData().catch(() => null);
  const previewResult = await runImportPreview<BoutiquePreviewResult>({
    importType: 'TARGETS_BOUTIQUE',
    scopeKey: importScopeKeyForBoutiqueSet(scope.allowedBoutiqueIds),
    uploadedById: scope.userId,
    file: importFileFromFormData(formData),
    validate: TARGETS_EXCEL_UPLOAD,
    parse: async (upload) =>
      parseAndValidateBoutiques(upload.buffer, scope.allowedBoutiqueIds),
    canApply: (preview) =>
      preview.invalidRows.length === 0 &&
      preview.inserts.length + preview.updates.length > 0,
  });

  if (!previewResult.ok) {
    return NextResponse.json({ error: previewResult.error }, { status: previewResult.status });
  }

  return NextResponse.json(previewResult.result);
}
