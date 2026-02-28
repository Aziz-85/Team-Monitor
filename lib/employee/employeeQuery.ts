/**
 * OPERATIONAL EMPLOYEE QUERY — Single source for filtering + stable ordering
 * -------------------------------------------------------------------------
 * Employee.boutiqueId is the ONLY source of truth for "which boutique this employee belongs to".
 * Use for ALL operational pages: schedule, inventory, tasks, leaves, sales.
 */

import type { Prisma } from '@prisma/client';
import { notDisabledUserWhere } from '@/lib/employeeWhere';

/** Prisma orderBy: empId then name for deterministic employee lists (no shuffle between refreshes). */
export const employeeOrderByStable: Prisma.EmployeeOrderByWithRelationInput[] = [
  { empId: 'asc' },
  { name: 'asc' },
];

export type BuildEmployeeWhereOptions = {
  /** Optional search query: filters by name/empId (case-insensitive contains). */
  q?: string;
  /** Exclude system-only employees (default true for operational). */
  excludeSystemOnly?: boolean;
};

/**
 * Build where clause for operational employee queries.
 * MUST include boutiqueId filter for operational pages.
 */
export function buildEmployeeWhereForOperational(
  boutiqueIds: string[],
  options: BuildEmployeeWhereOptions = {}
): Prisma.EmployeeWhereInput {
  const { q, excludeSystemOnly = true } = options;
  const where: Prisma.EmployeeWhereInput = {
    active: true,
    ...(excludeSystemOnly ? { isSystemOnly: false } : {}),
    ...notDisabledUserWhere,
  };

  if (boutiqueIds.length > 0) {
    where.boutiqueId = { in: boutiqueIds };
  }

  if (q && q.trim()) {
    const search = q.trim();
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { empId: { contains: search, mode: 'insensitive' } },
    ];
  }

  return where;
}
