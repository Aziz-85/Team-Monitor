/**
 * Performance Hub — employee roster for selector (current boutique, active only).
 * Sourced from Employee.boutiqueId; does not depend on SalesEntry.
 */

import { prisma } from '@/lib/db';

export type HubEmployeeOption = {
  userId: string;
  empId: string;
  name: string;
  boutiqueId: string;
  boutiqueName: string;
  active: boolean;
};

/** Active operational employees with linked user accounts in the given boutiques. */
export async function loadHubEmployeeRoster(boutiqueIds: string[]): Promise<HubEmployeeOption[]> {
  if (boutiqueIds.length === 0) return [];

  const rows = await prisma.employee.findMany({
    where: {
      boutiqueId: boutiqueIds.length === 1 ? boutiqueIds[0] : { in: boutiqueIds },
      active: true,
      isSystemOnly: false,
      user: { is: { disabled: false } },
    },
    select: {
      empId: true,
      name: true,
      boutiqueId: true,
      active: true,
      boutique: { select: { name: true } },
      user: { select: { id: true } },
    },
    orderBy: [{ name: 'asc' }, { empId: 'asc' }],
  });

  return rows
    .filter((e) => e.user?.id)
    .map((e) => ({
      userId: e.user!.id,
      empId: e.empId,
      name: e.name,
      boutiqueId: e.boutiqueId,
      boutiqueName: e.boutique.name,
      active: e.active,
    }));
}

export function filterHubEmployeeOptions(
  options: HubEmployeeOption[],
  boutiqueIds: string[]
): HubEmployeeOption[] {
  if (boutiqueIds.length === 0) return options;
  const allowed = new Set(boutiqueIds);
  return options.filter((o) => allowed.has(o.boutiqueId));
}
