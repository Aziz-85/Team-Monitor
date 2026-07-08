/**
 * Resolve the operational boutique for target import template downloads.
 */

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';
import { getOperationalScope } from '@/lib/scope/operationalScope';
import { resolveScopeForUser } from '@/lib/scope/resolveScope';
import type { TargetsScopeResult } from './scope';

export type TargetsTemplateBoutique = {
  id: string;
  code: string | null;
  name: string | null;
};

export async function resolveTargetsTemplateBoutique(
  request: NextRequest | null,
  targetsScope: TargetsScopeResult
): Promise<TargetsTemplateBoutique | null> {
  const { allowedBoutiqueIds, userId, role } = targetsScope;
  if (!allowedBoutiqueIds.length) return null;

  const allowed = new Set(allowedBoutiqueIds);
  const op = await getOperationalScope(request ?? undefined);

  if (op?.boutiqueId && allowed.has(op.boutiqueId)) {
    return prisma.boutique.findUnique({
      where: { id: op.boutiqueId },
      select: { id: true, code: true, name: true },
    });
  }

  const resolved = await resolveScopeForUser(userId, role as Role, null);
  if (resolved.boutiqueIds.length === 1) {
    const id = resolved.boutiqueIds[0];
    if (allowed.has(id)) {
      return prisma.boutique.findUnique({
        where: { id },
        select: { id: true, code: true, name: true },
      });
    }
  }

  if (allowed.size === 1) {
    const id = Array.from(allowed)[0];
    return prisma.boutique.findUnique({
      where: { id },
      select: { id: true, code: true, name: true },
    });
  }

  return null;
}

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function slugifyBoutiqueForFilename(boutique: Pick<TargetsTemplateBoutique, 'code' | 'name'>): string {
  const raw = (boutique.code ?? boutique.name ?? 'boutique').trim().toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'boutique';
}
