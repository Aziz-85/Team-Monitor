/**
 * POST /api/sales/import/yearly/apply
 * Multipart: applyPlan (JSON from dry-run)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireYearlySalesImport } from '@/lib/sales/yearlyImportAccess';
import { applyYearlyEmployeeSalesImportPlan } from '@/lib/sales/yearlyEmployeeSalesImport';
import {
  assertImportApplyAllowed,
  importScopeKeyForBoutique,
  markImportApplied,
} from '@/lib/imports';
import {
  formForceReprocess,
  parseApplyPlanFromFormData,
  yearlySalesApplyPlanSchema,
} from '@/lib/validation';

export async function POST(request: NextRequest) {
  const auth = await requireYearlySalesImport(request);
  if ('res' in auth) return auth.res;
  const { user, boutiqueId } = auth.scope;

  const formData = await request.formData().catch(() => null);
  const planResult = parseApplyPlanFromFormData(
    formData?.get('applyPlan'),
    yearlySalesApplyPlanSchema(boutiqueId)
  );
  if (!planResult.ok) return planResult.response;

  const plan = planResult.data;
  const forceReprocess = formForceReprocess(formData?.get('forceReprocess'));
  const scopeKey = importScopeKeyForBoutique(boutiqueId);

  const gate = await assertImportApplyAllowed({
    importType: 'YEARLY_SALES',
    scopeKey,
    fileSha256: plan.fileSha256,
    forceReprocess,
    actorUserId: user.id,
    actorRole: user.role,
    auditBoutiqueId: boutiqueId,
  });
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error: gate.message,
        reason: gate.reason,
        duplicateFile: gate.duplicate,
      },
      { status: gate.reason === 'DUPLICATE_FILE' ? 409 : 400 }
    );
  }

  const result = await applyYearlyEmployeeSalesImportPlan({
    plan,
    actorUserId: user.id,
  });

  await markImportApplied({
    importType: 'YEARLY_SALES',
    scopeKey,
    fileSha256: plan.fileSha256,
    batchId: result.batchId,
    batchEntityType: 'SalesEntryImportBatch',
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
