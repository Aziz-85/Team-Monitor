/**
 * Shared handlers for target template download routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildBoutiqueTargetsImportTemplate, buildEmployeeTargetsImportTemplate, targetImportFilename } from './buildBoutiqueAwareTemplates';
import { currentMonthKey, resolveTargetsTemplateBoutique } from './templateScope';
import { requireTargetsImport } from './scope';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export async function downloadBoutiqueTargetsTemplate(request: NextRequest): Promise<NextResponse> {
  const scopeResult = await requireTargetsImport(request);
  if (scopeResult.res) return scopeResult.res;

  const month = request.nextUrl.searchParams.get('month')?.trim() || currentMonthKey();
  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const boutique = await resolveTargetsTemplateBoutique(request, scopeResult.scope);
  if (!boutique) {
    return NextResponse.json(
      { error: 'Select your operational boutique in the scope selector before downloading.' },
      { status: 403 }
    );
  }

  const buffer = await buildBoutiqueTargetsImportTemplate({
    boutique,
    startMonth: month,
    generatedBy: scopeResult.scope.userId,
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${targetImportFilename('boutique', boutique, month)}"`,
    },
  });
}

export async function downloadEmployeeTargetsTemplate(request: NextRequest): Promise<NextResponse> {
  const scopeResult = await requireTargetsImport(request);
  if (scopeResult.res) return scopeResult.res;

  const month = request.nextUrl.searchParams.get('month')?.trim() || currentMonthKey();
  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
  }

  const boutique = await resolveTargetsTemplateBoutique(request, scopeResult.scope);
  if (!boutique) {
    return NextResponse.json(
      { error: 'Select your operational boutique in the scope selector before downloading.' },
      { status: 403 }
    );
  }

  const buffer = await buildEmployeeTargetsImportTemplate({
    boutique,
    month,
    generatedBy: scopeResult.scope.userId,
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${targetImportFilename('employee', boutique, month)}"`,
    },
  });
}
