/**
 * Boutique-scoped import template helpers — employees and scope resolution.
 */

import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';
import { buildEmployeeWhereForOperational, employeeOrderByStable } from '@/lib/employee/employeeQuery';
import { resolveScopeForUser } from '@/lib/scope/resolveScope';

export type ImportTemplateBoutique = {
  id: string;
  code: string | null;
  name: string | null;
};

export type ImportTemplateEmployee = {
  empId: string;
  name: string;
};

/** Slug for Content-Disposition filenames (e.g. sales-import-template-matrix-dhahran). */
export function slugifyBoutiqueForFilename(boutique: Pick<ImportTemplateBoutique, 'code' | 'name'>): string {
  const raw = (boutique.code ?? boutique.name ?? 'boutique').trim().toLowerCase();
  const slug = raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'boutique';
}

export function salesImportTemplateFilename(
  kind: string,
  boutique: Pick<ImportTemplateBoutique, 'code' | 'name'>,
  suffix?: string
): string {
  const slug = slugifyBoutiqueForFilename(boutique);
  const parts = ['sales-import-template', kind, slug];
  if (suffix) parts.push(suffix);
  return `${parts.join('-')}.xlsx`;
}

/** Active operational employees for one boutique — no hardcoded lists. */
export async function loadImportTemplateEmployees(boutiqueId: string): Promise<ImportTemplateEmployee[]> {
  const rows = await prisma.employee.findMany({
    where: buildEmployeeWhereForOperational([boutiqueId]),
    select: { empId: true, name: true },
    orderBy: employeeOrderByStable,
  });
  return rows.map((e) => ({
    empId: (e.empId ?? '').trim(),
    name: (e.name ?? e.empId ?? '').trim(),
  }));
}

/**
 * Resolve boutique for admin import templates.
 * When scope resolves to a single boutique, that boutique wins (scope selector / session).
 * Otherwise the query param must be within allowed boutique IDs.
 */
export async function resolveImportTemplateBoutique(
  userId: string,
  userRole: Role,
  paramBoutiqueId?: string | null
): Promise<ImportTemplateBoutique | null> {
  const resolved = await resolveScopeForUser(userId, userRole, null);
  const allowed = new Set(resolved.boutiqueIds.filter(Boolean));
  const param = paramBoutiqueId?.trim() ?? '';

  let boutiqueId: string;
  if (allowed.size === 1) {
    boutiqueId = Array.from(allowed)[0];
  } else if (param && allowed.has(param)) {
    boutiqueId = param;
  } else if (param) {
    return null;
  } else if (resolved.boutiqueId && allowed.has(resolved.boutiqueId)) {
    boutiqueId = resolved.boutiqueId;
  } else {
    boutiqueId = Array.from(allowed)[0] ?? '';
  }

  if (!boutiqueId) {
    if (!param) return null;
    return prisma.boutique.findFirst({
      where: { id: param, isActive: true },
      select: { id: true, code: true, name: true },
    });
  }

  return prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true, code: true, name: true },
  });
}

/** Operational boutique from session / scope selector (non-admin sales import template). */
export async function resolveOperationalImportBoutique(
  boutiqueId: string
): Promise<ImportTemplateBoutique | null> {
  return prisma.boutique.findUnique({
    where: { id: boutiqueId },
    select: { id: true, code: true, name: true },
  });
}
