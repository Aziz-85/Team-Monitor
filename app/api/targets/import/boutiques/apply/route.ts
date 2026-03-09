/**
 * POST /api/targets/import/boutiques/apply — Re-validate file and apply (FormData with "file").
 * Run dry-run validation first; only apply if no invalid rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTargetsImport } from '@/lib/targets/scope';
import { parseAndValidateBoutiques, applyBoutiquesImport } from '@/lib/targets/importBoutiques';

export async function POST(request: NextRequest) {
  const scopeResult = await requireTargetsImport(request);
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope!;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing file in FormData' }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const preview = await parseAndValidateBoutiques(buffer, scope.allowedBoutiqueIds);

  if (preview.invalidRows.length > 0) {
    return NextResponse.json(
      { error: 'Cannot apply: file has invalid rows', invalidRows: preview.invalidRows },
      { status: 400 }
    );
  }

  const result = await applyBoutiquesImport(preview, scope.userId);
  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    updated: result.updated,
  });
}
