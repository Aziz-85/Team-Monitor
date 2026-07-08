/**
 * POST /api/targets/import/employees/apply — Apply dry-run plan (FormData: applyPlan JSON).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTargetsImport } from '@/lib/targets/scope';
import { parseEmployeeApplyPlan } from '@/lib/targets/applyImportPlan';
import { applyEmployeesImport } from '@/lib/targets/importEmployees';

export async function POST(request: NextRequest) {
  const scopeResult = await requireTargetsImport(request);
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope!;

  const formData = await request.formData().catch(() => null);
  const applyPlanRaw = formData?.get('applyPlan');
  if (!applyPlanRaw || typeof applyPlanRaw !== 'string') {
    return NextResponse.json({ error: 'Missing applyPlan from dry run preview' }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(applyPlanRaw);
  } catch {
    return NextResponse.json({ error: 'Invalid applyPlan JSON' }, { status: 400 });
  }

  const applyPlan = parseEmployeeApplyPlan(parsed, scope.allowedBoutiqueIds);
  if (!applyPlan) {
    return NextResponse.json({ error: 'Invalid or out-of-scope apply plan' }, { status: 400 });
  }

  const result = await applyEmployeesImport(applyPlan);
  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    updated: result.updated,
  });
}
