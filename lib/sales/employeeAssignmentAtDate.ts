/**
 * Resolve which boutique an employee was assigned to on a calendar date.
 * Used for yearly import validation warnings (not routing).
 */

import { prisma } from '@/lib/db';

export type EmployeeAssignmentAtDate = {
  historicalBoutiqueId: string | null;
  historicalBoutiqueName: string | null;
  assignmentCount: number;
  source: 'assignment' | 'employee_fallback' | 'none';
};

function dateFromKey(dateKey: string): Date {
  return new Date(dateKey + 'T00:00:00.000Z');
}

/** Active EmployeeAssignment rows covering dateKey (inclusive). */
export async function resolveEmployeeAssignmentAtDate(
  empId: string,
  dateKey: string
): Promise<EmployeeAssignmentAtDate> {
  const onDate = dateFromKey(dateKey);
  const rows = await prisma.employeeAssignment.findMany({
    where: {
      empId,
      fromDate: { lte: onDate },
      OR: [{ toDate: null }, { toDate: { gte: onDate } }],
    },
    select: {
      boutiqueId: true,
      boutique: { select: { id: true, name: true } },
    },
  });

  if (rows.length === 0) {
    const employee = await prisma.employee.findUnique({
      where: { empId },
      select: {
        boutiqueId: true,
        boutique: { select: { id: true, name: true } },
      },
    });
    if (!employee) {
      return {
        historicalBoutiqueId: null,
        historicalBoutiqueName: null,
        assignmentCount: 0,
        source: 'none',
      };
    }
    return {
      historicalBoutiqueId: employee.boutiqueId,
      historicalBoutiqueName: employee.boutique?.name ?? null,
      assignmentCount: 0,
      source: 'employee_fallback',
    };
  }

  if (rows.length === 1) {
    const row = rows[0]!;
    return {
      historicalBoutiqueId: row.boutiqueId,
      historicalBoutiqueName: row.boutique?.name ?? null,
      assignmentCount: 1,
      source: 'assignment',
    };
  }

  const uniqueIds = Array.from(new Set(rows.map((r) => r.boutiqueId)));
  const first = rows[0]!;
  return {
    historicalBoutiqueId: uniqueIds.length === 1 ? first.boutiqueId : null,
    historicalBoutiqueName: uniqueIds.length === 1 ? (first.boutique?.name ?? null) : null,
    assignmentCount: rows.length,
    source: 'assignment',
  };
}

export function buildAssignmentWarnings(input: {
  uploadedBoutiqueId: string;
  assignment: EmployeeAssignmentAtDate;
  currentBoutiqueId: string | null;
  assignmentSource: EmployeeAssignmentAtDate['source'];
}): string[] {
  const warnings: string[] = [];

  if (input.assignment.assignmentCount > 1) {
    warnings.push(
      'Employee appears assigned to more than one boutique on this date; sale will remain under uploaded boutique.'
    );
  } else if (
    input.assignmentSource === 'assignment' &&
    input.assignment.historicalBoutiqueId &&
    input.assignment.historicalBoutiqueId !== input.uploadedBoutiqueId
  ) {
    warnings.push(
      'Employee assigned to another boutique on this date; sale will remain under uploaded boutique.'
    );
  } else if (input.assignmentSource === 'employee_fallback') {
    warnings.push(
      'No historical assignment found; used current employee boutique for validation.'
    );
  }

  if (
    input.currentBoutiqueId &&
    input.currentBoutiqueId !== input.uploadedBoutiqueId &&
    !warnings.some((w) => w.includes('assigned to another boutique'))
  ) {
    warnings.push(
      'Employee current boutique differs from uploaded boutique; sale will remain under uploaded boutique.'
    );
  }

  return warnings;
}
