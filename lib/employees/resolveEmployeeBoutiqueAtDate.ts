/**
 * Central employee ↔ boutique resolution at a calendar date.
 * Architecture Stabilization Phase 2 — single source for historical roster context.
 *
 * Priority for **historicalBoutiqueId** on dateKey:
 * 1. EmployeeAssignment covering the date (unique boutique)
 * 2. Employee.boutiqueId (current roster — used when no assignment row)
 * 3. User.boutiqueId (compatibility only when Employee.boutiqueId absent)
 * 4. UNRESOLVED
 *
 * UserPreference.operationalBoutiqueId is **never** used for financial ownership.
 */

import { prisma } from '@/lib/db';
import { formatDateRiyadh } from '@/lib/time';

export type EmployeeBoutiqueResolutionSource =
  | 'EMPLOYEE_ASSIGNMENT'
  | 'CURRENT_EMPLOYEE_BOUTIQUE'
  | 'USER_BOUTIQUE'
  | 'UNRESOLVED';

export type EmployeeBoutiqueResolution = {
  employeeId: string;
  dateKey: string;
  /** Employee.boutiqueId today (roster membership). */
  currentBoutiqueId: string | null;
  /** Boutique the employee belonged to on dateKey (assignment or fallback). */
  historicalBoutiqueId: string | null;
  historicalBoutiqueName: string | null;
  source: EmployeeBoutiqueResolutionSource;
  /** Number of EmployeeAssignment rows covering dateKey. */
  assignmentCount: number;
  active: boolean;
  isSystemOnly: boolean;
  hasUser: boolean;
  warnings: string[];
};

export type ResolveEmployeeBoutiqueAtDateInput = {
  employeeId: string;
  dateKey: string;
};

function dateFromKey(dateKey: string): Date {
  return new Date(dateKey + 'T00:00:00.000Z');
}

function normalizeDateKey(dateKey: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey.trim())) return dateKey.trim();
  return formatDateRiyadh(dateFromKey(dateKey));
}

/**
 * Resolve employee boutique state at a Riyadh calendar date.
 */
export async function resolveEmployeeBoutiqueAtDate(
  input: ResolveEmployeeBoutiqueAtDateInput
): Promise<EmployeeBoutiqueResolution> {
  const employeeId = input.employeeId.trim();
  const dateKey = normalizeDateKey(input.dateKey);
  const onDate = dateFromKey(dateKey);
  const warnings: string[] = [];

  const employee = await prisma.employee.findUnique({
    where: { empId: employeeId },
    select: {
      boutiqueId: true,
      active: true,
      isSystemOnly: true,
      boutique: { select: { id: true, name: true } },
      user: { select: { id: true, boutiqueId: true } },
    },
  });

  if (!employee) {
    return {
      employeeId,
      dateKey,
      currentBoutiqueId: null,
      historicalBoutiqueId: null,
      historicalBoutiqueName: null,
      source: 'UNRESOLVED',
      assignmentCount: 0,
      active: false,
      isSystemOnly: false,
      hasUser: false,
      warnings: ['Employee not found.'],
    };
  }

  const currentBoutiqueId = employee.boutiqueId ?? null;
  const hasUser = !!employee.user;

  if (!employee.active) {
    warnings.push('Employee is inactive.');
  }
  if (employee.isSystemOnly) {
    warnings.push('Employee is system-only.');
  }
  if (!hasUser) {
    warnings.push('Employee has no linked User account.');
  }

  const assignmentRows = await prisma.employeeAssignment.findMany({
    where: {
      empId: employeeId,
      fromDate: { lte: onDate },
      OR: [{ toDate: null }, { toDate: { gte: onDate } }],
    },
    select: {
      boutiqueId: true,
      boutique: { select: { id: true, name: true } },
    },
  });

  const assignmentCount = assignmentRows.length;

  if (assignmentCount > 0) {
    const uniqueIds = Array.from(new Set(assignmentRows.map((r) => r.boutiqueId)));
    if (uniqueIds.length > 1) {
      warnings.push(
        'Employee has overlapping assignments to multiple boutiques on this date; historical boutique is ambiguous.'
      );
      return {
        employeeId,
        dateKey,
        currentBoutiqueId,
        historicalBoutiqueId: null,
        historicalBoutiqueName: null,
        source: 'EMPLOYEE_ASSIGNMENT',
        assignmentCount,
        active: employee.active,
        isSystemOnly: employee.isSystemOnly,
        hasUser,
        warnings,
      };
    }

    const row = assignmentRows[0]!;
    return {
      employeeId,
      dateKey,
      currentBoutiqueId,
      historicalBoutiqueId: row.boutiqueId,
      historicalBoutiqueName: row.boutique?.name ?? null,
      source: 'EMPLOYEE_ASSIGNMENT',
      assignmentCount,
      active: employee.active,
      isSystemOnly: employee.isSystemOnly,
      hasUser,
      warnings,
    };
  }

  // No assignment row — fallback to current employee boutique
  if (currentBoutiqueId) {
    warnings.push('No EmployeeAssignment for this date; using current Employee.boutiqueId.');
    return {
      employeeId,
      dateKey,
      currentBoutiqueId,
      historicalBoutiqueId: currentBoutiqueId,
      historicalBoutiqueName: employee.boutique?.name ?? null,
      source: 'CURRENT_EMPLOYEE_BOUTIQUE',
      assignmentCount: 0,
      active: employee.active,
      isSystemOnly: employee.isSystemOnly,
      hasUser,
      warnings,
    };
  }

  // Compatibility: User.boutiqueId when employee row has no boutique
  const userBoutiqueId = employee.user?.boutiqueId ?? null;
  if (userBoutiqueId) {
    warnings.push('Employee.boutiqueId missing; using User.boutiqueId for compatibility.');
    const userBoutique = await prisma.boutique.findUnique({
      where: { id: userBoutiqueId },
      select: { name: true },
    });
    return {
      employeeId,
      dateKey,
      currentBoutiqueId: userBoutiqueId,
      historicalBoutiqueId: userBoutiqueId,
      historicalBoutiqueName: userBoutique?.name ?? null,
      source: 'USER_BOUTIQUE',
      assignmentCount: 0,
      active: employee.active,
      isSystemOnly: employee.isSystemOnly,
      hasUser,
      warnings,
    };
  }

  warnings.push('Could not resolve employee boutique for this date.');
  return {
    employeeId,
    dateKey,
    currentBoutiqueId: null,
    historicalBoutiqueId: null,
    historicalBoutiqueName: null,
    source: 'UNRESOLVED',
    assignmentCount: 0,
    active: employee.active,
    isSystemOnly: employee.isSystemOnly,
    hasUser,
    warnings,
  };
}

/**
 * Whether historical resolution places the employee at boutiqueId on dateKey.
 * Used by transaction import validation (warn-only when false).
 */
export async function isEmployeeAtBoutiqueOnDate(
  employeeId: string,
  boutiqueId: string,
  dateKey: string
): Promise<boolean> {
  const resolution = await resolveEmployeeBoutiqueAtDate({ employeeId, dateKey });
  if (!resolution.historicalBoutiqueId) return false;
  return resolution.historicalBoutiqueId === boutiqueId;
}

/**
 * Warnings when sale/upload boutique differs from employee historical/current boutique.
 * Does **not** block writes — callers enforce security separately.
 */
export function buildResolutionWarningsForUpload(
  resolution: EmployeeBoutiqueResolution,
  uploadedBoutiqueId: string
): string[] {
  const warnings = [...resolution.warnings];

  if (resolution.assignmentCount > 1) {
    warnings.push(
      'Employee appears assigned to more than one boutique on this date; sale will remain under uploaded boutique.'
    );
  } else if (
    resolution.source === 'EMPLOYEE_ASSIGNMENT' &&
    resolution.historicalBoutiqueId &&
    resolution.historicalBoutiqueId !== uploadedBoutiqueId
  ) {
    warnings.push(
      'Employee assigned to another boutique on this date; sale will remain under uploaded boutique.'
    );
  } else if (resolution.source === 'CURRENT_EMPLOYEE_BOUTIQUE' && resolution.assignmentCount === 0) {
    if (!warnings.some((w) => w.includes('No EmployeeAssignment'))) {
      warnings.push(
        'No historical assignment found; used current employee boutique for validation.'
      );
    }
  }

  if (
    resolution.currentBoutiqueId &&
    resolution.currentBoutiqueId !== uploadedBoutiqueId &&
    !warnings.some((w) => w.includes('assigned to another boutique'))
  ) {
    warnings.push(
      'Employee current boutique differs from uploaded boutique; sale will remain under uploaded boutique.'
    );
  }

  return warnings;
}

/** Batch resolve with in-memory cache (import preview loops). */
export async function resolveEmployeeBoutiqueAtDateCached(
  cache: Map<string, EmployeeBoutiqueResolution>,
  employeeId: string,
  dateKey: string
): Promise<EmployeeBoutiqueResolution> {
  const key = `${employeeId}|${normalizeDateKey(dateKey)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const resolution = await resolveEmployeeBoutiqueAtDate({ employeeId, dateKey });
  cache.set(key, resolution);
  return resolution;
}
