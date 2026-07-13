/**
 * Sales ownership warnings — employee boutique vs sale boutique (import + audit).
 */

import {
  resolveEmployeeBoutiqueAtDate,
  buildResolutionWarningsForUpload,
} from '@/lib/employees/resolveEmployeeBoutiqueAtDate';
import { prisma } from '@/lib/db';

export type CollectSalesOwnershipWarningsInput = {
  boutiqueId: string;
  empId: string;
  dateKey: string;
};

export async function collectSalesOwnershipWarnings(
  input: CollectSalesOwnershipWarningsInput
): Promise<string[]> {
  const resolution = await resolveEmployeeBoutiqueAtDate({
    employeeId: input.empId,
    dateKey: input.dateKey,
  });
  return buildResolutionWarningsForUpload(resolution, input.boutiqueId);
}

export async function collectMultiBoutiqueSameDayWarning(
  userId: string,
  dateKey: string,
  boutiqueId: string
): Promise<string[]> {
  const rows = await prisma.salesEntry.findMany({
    where: {
      userId,
      dateKey,
      amount: { gt: 0 },
      boutiqueId: { not: boutiqueId },
    },
    select: { boutiqueId: true, amount: true },
  });
  if (rows.length === 0) return [];
  const otherIds = Array.from(new Set(rows.map((r) => r.boutiqueId)));
  return [
    `Employee already has sales recorded in ${otherIds.length} other boutique(s) on ${dateKey}; new sale stays under uploaded boutique ${boutiqueId}.`,
  ];
}

export async function collectImportSalesWarnings(input: {
  boutiqueId: string;
  empId: string;
  dateKey: string;
  userId?: string | null;
}): Promise<string[]> {
  const resolution = await resolveEmployeeBoutiqueAtDate({
    employeeId: input.empId,
    dateKey: input.dateKey,
  });
  const warnings = buildResolutionWarningsForUpload(resolution, input.boutiqueId);
  if (input.userId) {
    const multi = await collectMultiBoutiqueSameDayWarning(input.userId, input.dateKey, input.boutiqueId);
    warnings.push(...multi);
  }
  return warnings;
}
