/**
 * Role-weighted target distribution (MSR template).
 * Defaults: Manager 0.5, Assistant Manager 0.75, High Jewellery Expert 2.0,
 * Senior Sales Advisor 1.5, Sales Advisor 1.0. Weights can be overridden in DB (SalesTargetRoleWeight).
 */

import type { EmployeePosition } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

/** Matches Prisma enum SalesTargetRole – defined here so build works even if client is not yet generated. */
export type SalesTargetRole =
  | 'MANAGER'
  | 'ASSISTANT_MANAGER'
  | 'HIGH_JEWELLERY_EXPERT'
  | 'SENIOR_SALES_ADVISOR'
  | 'SALES_ADVISOR';

const DEFAULT_ROLE_WEIGHTS: Record<SalesTargetRole, number> = {
  MANAGER: 0.5,
  ASSISTANT_MANAGER: 0.75,
  HIGH_JEWELLERY_EXPERT: 2.0,
  SENIOR_SALES_ADVISOR: 1.5,
  SALES_ADVISOR: 1.0,
};

/** Default weights (used when DB not yet populated or on client). */
export const SALES_TARGET_ROLE_WEIGHTS: Record<SalesTargetRole, number> = { ...DEFAULT_ROLE_WEIGHTS };

export const SALES_TARGET_ROLE_LABELS: Record<SalesTargetRole, string> = {
  MANAGER: 'Manager',
  ASSISTANT_MANAGER: 'Assistant Manager',
  HIGH_JEWELLERY_EXPERT: 'High Jewellery Expert',
  SENIOR_SALES_ADVISOR: 'Senior Sales Advisor',
  SALES_ADVISOR: 'Sales Advisor',
};

/** Derive SalesTargetRole from Employee.position when salesTargetRole is not set. */
export function positionToSalesTargetRole(position: EmployeePosition | null): SalesTargetRole {
  if (!position) return 'SALES_ADVISOR';
  switch (position) {
    case 'BOUTIQUE_MANAGER':
      return 'MANAGER';
    case 'ASSISTANT_MANAGER':
      return 'ASSISTANT_MANAGER';
    case 'SENIOR_SALES':
      return 'SENIOR_SALES_ADVISOR';
    case 'SALES':
    default:
      return 'SALES_ADVISOR';
  }
}

/** Get weight for a role. If weights map is provided (e.g. from DB), use it; otherwise use default constants. */
export function getWeightForRole(role: SalesTargetRole, weights?: Record<SalesTargetRole, number>): number {
  const map = weights ?? SALES_TARGET_ROLE_WEIGHTS;
  const w = map[role];
  return typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : DEFAULT_ROLE_WEIGHTS[role];
}

/** Load role weights from DB. Seeds defaults if table is empty. */
export async function getRoleWeightsFromDb(prisma: PrismaClient): Promise<Record<SalesTargetRole, number>> {
  const rows = await prisma.salesTargetRoleWeight.findMany();
  if (rows.length === 0) {
    await prisma.salesTargetRoleWeight.createMany({
      data: (Object.entries(DEFAULT_ROLE_WEIGHTS) as [SalesTargetRole, number][]).map(([role, weight]) => ({
        role,
        weight,
      })),
    });
    return { ...DEFAULT_ROLE_WEIGHTS };
  }
  const map = { ...DEFAULT_ROLE_WEIGHTS } as Record<SalesTargetRole, number>;
  for (const r of rows) {
    if (r.role in map && typeof r.weight === 'number' && Number.isFinite(r.weight) && r.weight >= 0) {
      map[r.role as SalesTargetRole] = r.weight;
    }
  }
  return map;
}
