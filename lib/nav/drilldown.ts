import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { getEffectiveAccess } from '@/lib/rbac/effectiveAccess';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { getNavGroupsForUser, type NavGroup } from '@/lib/navConfig';
import type { Role } from '@prisma/client';

export type DrilldownSectionKey = 'TEAM' | 'OPERATIONS' | 'ANALYTICS' | 'SYSTEM';

export type DrilldownCard = {
  href: string;
  titleKey: string;
  hintKey: string;
};

export async function getDrilldownUser() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.boutiqueId && user.role !== 'SUPER_ADMIN' && user.role !== 'DEMO_VIEWER') {
    redirect('/login?error=no_boutique');
  }

  const scope = await getOperationalScope();
  const boutiqueId = scope?.boutiqueId ?? user.boutiqueId ?? '';
  const access = boutiqueId
    ? await getEffectiveAccess(
        { id: user.id, role: user.role as Role, canEditSchedule: user.canEditSchedule },
        boutiqueId
      )
    : null;

  const navRole =
    user.role === 'SUPER_ADMIN'
      ? 'SUPER_ADMIN'
      : user.role === 'DEMO_VIEWER'
        ? 'DEMO_VIEWER'
        : ((access?.effectiveRole ?? user.role) as Role);
  const canEditSchedule = user.role === 'SUPER_ADMIN' ? true : user.role === 'DEMO_VIEWER' ? false : (access?.effectiveFlags.canEditSchedule ?? false);
  const canApproveWeek = user.role === 'SUPER_ADMIN' ? true : user.role === 'DEMO_VIEWER' ? false : (access?.effectiveFlags.canApproveWeek ?? false);

  return {
    navRole,
    canEditSchedule,
    canApproveWeek,
    groups: getNavGroupsForUser({ role: navRole, canEditSchedule, canApproveWeek }),
  };
}

const SECTION_GROUPS: Record<DrilldownSectionKey, string[]> = {
  TEAM: ['DASHBOARD', 'TEAM'],
  OPERATIONS: ['TASKS', 'INVENTORY'],
  ANALYTICS: ['SALES', 'REPORTS', 'COMPANY'],
  SYSTEM: ['ORGANIZATION', 'RULES_TEMPLATES', 'INTEGRATIONS', 'DATA_IMPORTS', 'SYSTEM_ADMIN', 'HELP', 'AREA_MANAGER'],
};

export function groupsForSection(allGroups: Array<NavGroup & { items: { href: string; key: string }[] }>, section: DrilldownSectionKey) {
  const keys = new Set(SECTION_GROUPS[section]);
  return allGroups.filter((g) => keys.has(g.key));
}

export function hrefSetFromGroups(groups: Array<NavGroup & { items: { href: string; key: string }[] }>) {
  return new Set(groups.flatMap((g) => g.items.map((i) => i.href)));
}

export function filterCardsByAllowed(cards: DrilldownCard[], allowedHrefs: Set<string>) {
  return cards.filter((card) => allowedHrefs.has(card.href));
}
