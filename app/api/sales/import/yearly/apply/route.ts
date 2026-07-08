/**
 * POST /api/sales/import/yearly/apply
 * Multipart: applyPlan (JSON from dry-run)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireYearlySalesImport } from '@/lib/sales/yearlyImportAccess';
import {
  applyYearlyEmployeeSalesImportPlan,
  parseYearlySalesApplyPlan,
} from '@/lib/sales/yearlyEmployeeSalesImport';

export async function POST(request: NextRequest) {
  const auth = await requireYearlySalesImport(request);
  if ('res' in auth) return auth.res;
  const { user, boutiqueId } = auth.scope;

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

  const plan = parseYearlySalesApplyPlan(parsed, boutiqueId);
  if (!plan) {
    return NextResponse.json({ error: 'Invalid or out-of-scope apply plan' }, { status: 400 });
  }

  const result = await applyYearlyEmployeeSalesImportPlan({
    plan,
    actorUserId: user.id,
  });

  return NextResponse.json({
    ok: true,
    batchId: result.batchId,
    inserted: result.inserted,
    updated: result.updated,
    noChange: result.noChange,
    rejected: result.rejected,
  });
}
