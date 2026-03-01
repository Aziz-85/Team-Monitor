/**
 * Metrics scope — single resolution for all KPI APIs so dashboard, sales/my, me/target use the same boutique + employee.
 * Delegates to SSOT requireOperationalBoutiqueOnly. No stored scope fallback.
 */

import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { requireOperationalBoutiqueOnly } from '@/lib/scope/ssot';
import type { Role } from '@prisma/client';

export type MetricsScopeResult = {
  userId: string;
  role: Role;
  empId: string | null;
  /** Single boutique for metrics (sales, targets). */
  effectiveBoutiqueId: string;
  /** When true, only this user's data is allowed (EMPLOYEE). */
  employeeOnly: boolean;
  label: string;
};

/**
 * Resolve scope for metrics APIs. Delegates to SSOT.
 * Use in dashboard, me/targets, me/sales, sales/summary so all show same numbers.
 */
export async function resolveMetricsScope(
  request?: NextRequest | null
): Promise<MetricsScopeResult | null> {
  const user = await getSessionUser();
  const result = await requireOperationalBoutiqueOnly(request ?? null, user);
  if (!result.ok) return null;

  return {
    userId: result.userId,
    role: result.role,
    empId: (user as { empId?: string } | null)?.empId ?? null,
    effectiveBoutiqueId: result.boutiqueId,
    employeeOnly: result.role === 'EMPLOYEE',
    label: result.label,
  };
}
