/**
 * POST /api/targets/import/boutiques/preview — Dry run: parse file and return preview (no DB write).
 * Body: FormData with "file" (Excel).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTargetsImport } from '@/lib/targets/scope';
import { parseAndValidateBoutiques } from '@/lib/targets/importBoutiques';

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
  return NextResponse.json(preview);
}
