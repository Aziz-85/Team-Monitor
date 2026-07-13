/**
 * POST /api/targets/import/employees/apply — Apply dry-run plan (FormData: applyPlan JSON).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTargetsImport } from '@/lib/targets/scope';
import { applyEmployeesImport } from '@/lib/targets/importEmployees';
import {
  assertImportApplyAllowed,
  importScopeKeyForBoutiqueSet,
  markImportApplied,
} from '@/lib/imports';
import {
  employeeApplyPlanSchema,
  formForceReprocess,
  optionalFormSha256,
  parseApplyPlanFromFormData,
} from '@/lib/validation';

export async function POST(request: NextRequest) {
  const scopeResult = await requireTargetsImport(request);
  if (scopeResult.res) return scopeResult.res;
  const scope = scopeResult.scope!;

  const formData = await request.formData().catch(() => null);
  const planResult = parseApplyPlanFromFormData(
    formData?.get('applyPlan'),
    employeeApplyPlanSchema(scope.allowedBoutiqueIds)
  );
  if (!planResult.ok) return planResult.response;

  const fileSha256 = optionalFormSha256(formData?.get('fileSha256'));
  const forceReprocess = formForceReprocess(formData?.get('forceReprocess'));
  const scopeKey = importScopeKeyForBoutiqueSet(scope.allowedBoutiqueIds);

  const gate = await assertImportApplyAllowed({
    importType: 'TARGETS_EMPLOYEE',
    scopeKey,
    fileSha256,
    forceReprocess,
    actorUserId: scope.userId,
    actorRole: scope.role,
    auditBoutiqueId: scope.allowedBoutiqueIds[0] ?? null,
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

  const result = await applyEmployeesImport(planResult.data);

  if (fileSha256) {
    await markImportApplied({
      importType: 'TARGETS_EMPLOYEE',
      scopeKey,
      fileSha256,
    });
  }

  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    updated: result.updated,
  });
}
