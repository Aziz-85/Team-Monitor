/**
 * @deprecated Import from `@/lib/employees/resolveEmployeeBoutiqueAtDate` — thin backward-compat shim.
 * Resolve which boutique an employee was assigned to on a calendar date.
 */

import {
  resolveEmployeeBoutiqueAtDate,
  buildResolutionWarningsForUpload,
  type EmployeeBoutiqueResolution,
} from '@/lib/employees/resolveEmployeeBoutiqueAtDate';

export type EmployeeAssignmentAtDate = {
  historicalBoutiqueId: string | null;
  historicalBoutiqueName: string | null;
  assignmentCount: number;
  source: 'assignment' | 'employee_fallback' | 'none';
};

function mapSource(
  resolution: EmployeeBoutiqueResolution
): EmployeeAssignmentAtDate['source'] {
  if (resolution.source === 'UNRESOLVED') return 'none';
  if (resolution.source === 'EMPLOYEE_ASSIGNMENT') return 'assignment';
  return 'employee_fallback';
}

/** @deprecated Use `resolveEmployeeBoutiqueAtDate` from `lib/employees`. */
export async function resolveEmployeeAssignmentAtDate(
  empId: string,
  dateKey: string
): Promise<EmployeeAssignmentAtDate> {
  const resolution = await resolveEmployeeBoutiqueAtDate({ employeeId: empId, dateKey });
  return {
    historicalBoutiqueId: resolution.historicalBoutiqueId,
    historicalBoutiqueName: resolution.historicalBoutiqueName,
    assignmentCount: resolution.assignmentCount,
    source: mapSource(resolution),
  };
}

export function buildAssignmentWarnings(input: {
  uploadedBoutiqueId: string;
  assignment: EmployeeAssignmentAtDate;
  currentBoutiqueId: string | null;
  assignmentSource: EmployeeAssignmentAtDate['source'];
}): string[] {
  const resolution: EmployeeBoutiqueResolution = {
    employeeId: '',
    dateKey: '',
    currentBoutiqueId: input.currentBoutiqueId,
    historicalBoutiqueId: input.assignment.historicalBoutiqueId,
    historicalBoutiqueName: input.assignment.historicalBoutiqueName,
    source:
      input.assignmentSource === 'assignment'
        ? 'EMPLOYEE_ASSIGNMENT'
        : input.assignmentSource === 'employee_fallback'
          ? 'CURRENT_EMPLOYEE_BOUTIQUE'
          : 'UNRESOLVED',
    assignmentCount: input.assignment.assignmentCount,
    active: true,
    isSystemOnly: false,
    hasUser: true,
    warnings: [],
  };
  return buildResolutionWarningsForUpload(resolution, input.uploadedBoutiqueId);
}
