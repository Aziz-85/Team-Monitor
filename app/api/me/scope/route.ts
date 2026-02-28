/**
 * GET /api/me/scope — return current resolved scope (from stored preference).
 * POST /api/me/scope — set scope preference (validated by role policy).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  resolveScopeForUser,
  getStoredScopePreference,
} from '@/lib/scope/resolveScope';
import type { ScopeSelectionJson } from '@/lib/scope/types';
import type { Role } from '@prisma/client';

const BOUTIQUE_ONLY_ROLES: Role[] = ['ASSISTANT_MANAGER', 'EMPLOYEE'];

function parseScopeBody(body: unknown): ScopeSelectionJson | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const scope = o.scope as string | undefined;
  if (
    !scope ||
    !['BOUTIQUE', 'REGION', 'GROUP', 'SELECTION'].includes(scope)
  ) {
    return null;
  }
  const result: ScopeSelectionJson = {
    scope: scope as ScopeSelectionJson['scope'],
  };
  if (typeof o.boutiqueId === 'string' && o.boutiqueId) result.boutiqueId = o.boutiqueId;
  if (typeof o.regionId === 'string' && o.regionId) result.regionId = o.regionId;
  if (typeof o.groupId === 'string' && o.groupId) result.groupId = o.groupId;
  if (Array.isArray(o.boutiqueIds))
    result.boutiqueIds = o.boutiqueIds.filter((x): x is string => typeof x === 'string');
  return result;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const stored = await getStoredScopePreference(user.id);
  const resolved = await resolveScopeForUser(user.id, user.role as Role, null);

  return NextResponse.json({
    stored: stored,
    resolved: {
      scope: resolved.scope,
      boutiqueId: resolved.boutiqueId,
      boutiqueIds: resolved.boutiqueIds,
      label: resolved.label,
    },
    role: user.role,
    canSelectRegionGroup: !BOUTIQUE_ONLY_ROLES.includes(user.role as Role),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const selection = parseScopeBody(body);
  if (!selection) {
    return NextResponse.json(
      { error: 'Invalid body: scope required (BOUTIQUE | REGION | GROUP | SELECTION)' },
      { status: 400 }
    );
  }

  const role = user.role as Role;
  if (BOUTIQUE_ONLY_ROLES.includes(role)) {
    if (selection.scope !== 'BOUTIQUE') {
      return NextResponse.json(
        { error: 'Your role can only use BOUTIQUE scope' },
        { status: 403 }
      );
    }
  }

  let resolved;
  try {
    resolved = await resolveScopeForUser(user.id, role, selection);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to resolve scope';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (resolved.boutiqueIds.length === 0) {
    return NextResponse.json(
      { error: 'No accessible boutiques for this scope' },
      { status: 403 }
    );
  }

  try {
    await prisma.userPreference.upsert({
      where: { userId: user.id },
      update: { scopeJson: JSON.stringify(selection) },
      create: {
        userId: user.id,
        scopeJson: JSON.stringify(selection),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to save scope preference';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    stored: selection,
    resolved: {
      scope: resolved.scope,
      boutiqueIds: resolved.boutiqueIds,
      label: resolved.label,
    },
  });
}
